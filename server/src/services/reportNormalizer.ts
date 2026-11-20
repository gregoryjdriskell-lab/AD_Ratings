import { randomUUID } from 'node:crypto';
import {
  LEVELS,
  MARKER_CATEGORIES,
  SEVERITIES,
  type AdAuditReport,
  type AuditContext,
  type Level,
  type MarkerCategory,
  type Persona,
  type PillarKey,
  type PillarScore,
  type PrimaryGoal,
  type RetentionPoint,
  type Severity,
  type Verdict,
} from '../../../shared/types.js';
import type { RawAuditOutput } from './auditSchema.js';

export class ReportValidationError extends Error {}

/** Pillar weights per campaign goal. Mirrored in the agent's system instruction. */
export const PILLAR_WEIGHTS: Record<PrimaryGoal, Record<PillarKey, number>> = {
  'Direct Response / ROAS': { hook: 0.3, creative: 0.15, commercial: 0.35, audioPacing: 0.2 },
  'Brand Awareness': { hook: 0.35, creative: 0.3, commercial: 0.15, audioPacing: 0.2 },
  'App Installs': { hook: 0.3, creative: 0.2, commercial: 0.3, audioPacing: 0.2 },
};

/** Deterministic verdict rules. Mirrored in the agent's system instruction. */
export function deriveVerdict(overall: number, pillars: Record<PillarKey, PillarScore>): Verdict {
  const body = (pillars.creative.score + pillars.commercial.score) / 2;
  if (overall >= 75 && pillars.hook.score >= 65) return 'Scale Ready';
  if (overall >= 50 && body >= 55) return 'Needs Hook Iteration';
  return 'Reshoot Recommended';
}

const clamp = (n: unknown, lo: number, hi: number, fallback = lo): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const nullableText = (v: unknown): string | null => {
  const t = text(v);
  return t.length ? t : null;
};
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function normalizePillar(raw: unknown, duration: number, key: PillarKey): PillarScore {
  if (!raw || typeof raw !== 'object') throw new ReportValidationError(`Missing pillar "${key}" in AI output`);
  const p = raw as Partial<PillarScore>;
  return {
    score: Math.round(clamp(p.score, 0, 100, 0)),
    rationale: text(p.rationale),
    strengths: list<string>(p.strengths).map((s) => text(s)).filter(Boolean),
    weaknesses: list<string>(p.weaknesses).map((s) => text(s)).filter(Boolean),
    evidence: list<{ timestamp: number; note: string }>(p.evidence)
      .map((e) => ({ timestamp: round1(clamp(e?.timestamp, 0, duration, 0)), note: text(e?.note) }))
      .filter((e) => e.note)
      .sort((a, b) => a.timestamp - b.timestamp),
  };
}

/**
 * Produce one point per whole second 0..ceil(duration), linearly interpolating gaps,
 * forcing 100% at 0:00 and a monotonically non-increasing curve.
 */
function normalizeRetention(raw: RetentionPoint[], duration: number): RetentionPoint[] {
  const last = Math.max(1, Math.ceil(duration));
  const known = new Map<number, number>();
  for (const p of raw) {
    const s = Math.round(clamp(p?.second, 0, last, -1));
    if (s < 0) continue;
    known.set(s, clamp(p?.retention, 0, 100, 0));
  }
  known.set(0, 100);
  const keys = [...known.keys()].sort((a, b) => a - b);
  if (keys.length < 2) throw new ReportValidationError('AI output did not include a usable retention curve');

  const out: RetentionPoint[] = [];
  let prev = 100;
  for (let s = 0; s <= last; s++) {
    let v: number;
    if (known.has(s)) v = known.get(s)!;
    else {
      const lo = [...keys].reverse().find((k) => k < s);
      const hi = keys.find((k) => k > s);
      if (lo === undefined) v = 100;
      else if (hi === undefined) v = known.get(lo)!;
      else v = known.get(lo)! + ((known.get(hi)! - known.get(lo)!) * (s - lo)) / (hi - lo);
    }
    v = Math.min(prev, v);
    prev = v;
    out.push({ second: s, retention: round1(v) });
  }
  return out;
}

export interface NormalizeInput {
  raw: unknown;
  context: AuditContext;
  model: string;
  video: { fileName: string; mimeType: string; sizeBytes: number; durationSeconds: number | null };
}

export function normalizeReport({ raw, context, model, video }: NormalizeInput): AdAuditReport {
  if (!raw || typeof raw !== 'object') throw new ReportValidationError('AI returned an empty or non-object response');
  const r = raw as Partial<RawAuditOutput>;

  const duration = round1(
    video.durationSeconds && video.durationSeconds > 0
      ? video.durationSeconds
      : clamp(r.estimatedDurationSeconds, 1, 600, 30),
  );

  const rawPillars = (r.pillars ?? {}) as Partial<Record<PillarKey, unknown>>;
  const pillars: Record<PillarKey, PillarScore> = {
    hook: normalizePillar(rawPillars.hook, duration, 'hook'),
    creative: normalizePillar(rawPillars.creative, duration, 'creative'),
    commercial: normalizePillar(rawPillars.commercial, duration, 'commercial'),
    audioPacing: normalizePillar(rawPillars.audioPacing, duration, 'audioPacing'),
  };

  const weights = PILLAR_WEIGHTS[context.primaryGoal];
  const overallScore = Math.round(
    (Object.keys(weights) as PillarKey[]).reduce((sum, k) => sum + pillars[k].score * weights[k], 0),
  );

  const ts = (v: unknown) => round1(clamp(v, 0, duration, 0));
  const nullableTs = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : ts(v));
  const d = (r.detected ?? {}) as Partial<RawAuditOutput['detected']>;

  const personas: Persona[] = list<Persona>(r.personas)
    .slice(0, 4)
    .map((p) => ({
      name: text(p?.name, 'Viewer'),
      age: Math.round(clamp(p?.age, 13, 99, 30)),
      descriptor: text(p?.descriptor),
      segment: text(p?.segment),
      resonanceScore: Math.round(clamp(p?.resonanceScore, 1, 100, 50)),
      reaction: text(p?.reaction),
      primaryObjection: text(p?.primaryObjection),
      purchaseTrigger: text(p?.purchaseTrigger),
      likelyAction: oneOf(
        p?.likelyAction,
        ['Scroll past', 'Watch, no action', 'Engage (like/comment/share)', 'Click through', 'Convert'] as const,
        'Watch, no action',
      ),
    }));
  if (personas.length === 0) throw new ReportValidationError('AI output did not include audience personas');

  const levelRank: Record<Level, number> = { Low: 0, Medium: 1, High: 2 };

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    model,
    context,
    video: { fileName: video.fileName, mimeType: video.mimeType, sizeBytes: video.sizeBytes, durationSeconds: duration },

    adSummary: text(r.adSummary),
    overallScore,
    verdict: deriveVerdict(overallScore, pillars),
    verdictRationale: text(r.verdictRationale),
    executiveSummary: text(r.executiveSummary),

    pillars,
    detected: {
      firstSpokenLine: nullableText(d.firstSpokenLine),
      firstOnScreenText: nullableText(d.firstOnScreenText),
      ctaText: nullableText(d.ctaText),
      hasVoiceover: Boolean(d.hasVoiceover),
      hasMusic: Boolean(d.hasMusic),
      hasCaptions: Boolean(d.hasCaptions),
      brandFirstAppearsAt: nullableTs(d.brandFirstAppearsAt),
      productFirstAppearsAt: nullableTs(d.productFirstAppearsAt),
      estimatedCutCount: Math.round(clamp(d.estimatedCutCount, 0, 1000, 0)),
      averageShotLengthSeconds: round1(clamp(d.averageShotLengthSeconds, 0, duration, 0)),
    },
    timelineMarkers: list<RawAuditOutput['timelineMarkers'][number]>(r.timelineMarkers)
      .map((m) => {
        const start = ts(m?.timestamp);
        const end = nullableTs(m?.endTimestamp);
        return {
          timestamp: start,
          endTimestamp: end !== null && end > start ? end : null,
          category: oneOf<MarkerCategory>(m?.category, MARKER_CATEGORIES, 'visual'),
          severity: oneOf<Severity>(m?.severity, SEVERITIES, 'warning'),
          title: text(m?.title, 'Note'),
          note: text(m?.note),
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp),
    retentionCurve: normalizeRetention(list<RetentionPoint>(r.retentionCurve), duration),
    dropOffRisks: list<RawAuditOutput['dropOffRisks'][number]>(r.dropOffRisks)
      .map((x) => ({
        timestamp: ts(x?.timestamp),
        severity: oneOf<Severity>(x?.severity, SEVERITIES, 'warning'),
        reason: text(x?.reason),
        estimatedDrop: round1(clamp(x?.estimatedDrop, 0, 100, 0)),
      }))
      .filter((x) => x.reason)
      .sort((a, b) => a.timestamp - b.timestamp),
    personas,
    fixes: list<RawAuditOutput['fixes'][number]>(r.fixes)
      .map((f) => ({
        priority: Math.round(clamp(f?.priority, 1, 99, 99)),
        title: text(f?.title),
        description: text(f?.description),
        timestamp: nullableTs(f?.timestamp),
        category: oneOf<MarkerCategory>(f?.category, MARKER_CATEGORIES, 'visual'),
        effort: oneOf<Level>(f?.effort, LEVELS, 'Medium'),
        expectedLift: oneOf<Level>(f?.expectedLift, LEVELS, 'Medium'),
        liftRationale: text(f?.liftRationale),
      }))
      .filter((f) => f.title)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          levelRank[b.expectedLift] - levelRank[a.expectedLift] ||
          levelRank[a.effort] - levelRank[b.effort],
      )
      .map((f, i) => ({ ...f, priority: i + 1 })),
    hookRewrites: list<RawAuditOutput['hookRewrites'][number]>(r.hookRewrites)
      .slice(0, 3)
      .map((h) => ({
        title: text(h?.title, 'Alternative hook'),
        angle: text(h?.angle),
        visual: text(h?.visual),
        script: text(h?.script),
        onScreenText: text(h?.onScreenText),
        whyItWorks: text(h?.whyItWorks),
      })),
  };
}
