/**
 * AdPulse AI — shared contract between the server (Gemini agent) and the client (dashboard).
 * Every field here is produced by the AI agent via a strict `responseSchema`, then
 * normalized server-side (see server/src/services/reportNormalizer.ts) before it reaches the UI.
 */

export const PLATFORMS = ['Meta Reels', 'TikTok', 'YouTube Shorts', 'Instagram Reels'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const GOALS = ['Direct Response / ROAS', 'Brand Awareness', 'App Installs'] as const;
export type PrimaryGoal = (typeof GOALS)[number];

export const VERDICTS = ['Scale Ready', 'Needs Hook Iteration', 'Reshoot Recommended'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const SEVERITIES = ['critical', 'warning', 'positive'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const MARKER_CATEGORIES = ['hook', 'visual', 'audio', 'text', 'pacing', 'offer', 'cta', 'brand'] as const;
export type MarkerCategory = (typeof MARKER_CATEGORIES)[number];

export const LEVELS = ['Low', 'Medium', 'High'] as const;
export type Level = (typeof LEVELS)[number];

export type PillarKey = 'hook' | 'creative' | 'commercial' | 'audioPacing';

export interface AuditContext {
  platform: Platform;
  category?: string;
  targetAudience?: string;
  primaryGoal: PrimaryGoal;
}

export interface TimestampedNote {
  /** Seconds from start of video (decimals allowed, e.g. 1.5). */
  timestamp: number;
  note: string;
}

export interface PillarScore {
  score: number; // 0–100
  rationale: string;
  strengths: string[];
  weaknesses: string[];
  evidence: TimestampedNote[];
}

export interface TimelineMarker {
  timestamp: number;
  endTimestamp: number | null;
  category: MarkerCategory;
  severity: Severity;
  title: string;
  note: string;
}

export interface RetentionPoint {
  second: number;
  retention: number; // % of viewers still watching, 0–100
}

export interface DropOffRisk {
  timestamp: number;
  severity: Severity;
  reason: string;
  /** Estimated percentage-point drop attributable to this moment. */
  estimatedDrop: number;
}

export interface Persona {
  name: string;
  age: number;
  descriptor: string; // e.g. "Budget-conscious nursing student, scrolls TikTok on breaks"
  segment: string; // e.g. "Core buyer", "Skeptic", "Adjacent / lookalike"
  resonanceScore: number; // 1–100
  reaction: string; // first-person quote
  primaryObjection: string;
  purchaseTrigger: string;
  likelyAction: 'Scroll past' | 'Watch, no action' | 'Engage (like/comment/share)' | 'Click through' | 'Convert';
}

export interface FixItem {
  priority: number; // 1 = do first
  title: string;
  description: string;
  timestamp: number | null;
  category: MarkerCategory;
  effort: Level;
  expectedLift: Level;
  liftRationale: string;
}

export interface HookRewrite {
  title: string;
  angle: string; // e.g. "Problem-agitation", "Pattern interrupt", "Social proof"
  visual: string; // shot-by-shot direction for 0:00–0:03
  script: string; // spoken line(s)
  onScreenText: string;
  whyItWorks: string;
}

export interface DetectedElements {
  firstSpokenLine: string | null;
  firstOnScreenText: string | null;
  ctaText: string | null;
  hasVoiceover: boolean;
  hasMusic: boolean;
  hasCaptions: boolean;
  brandFirstAppearsAt: number | null;
  productFirstAppearsAt: number | null;
  estimatedCutCount: number;
  averageShotLengthSeconds: number;
}

export interface AdAuditReport {
  id: string;
  createdAt: string; // ISO
  model: string;
  context: AuditContext;
  video: { fileName: string; durationSeconds: number; mimeType: string; sizeBytes: number };

  adSummary: string;
  overallScore: number; // 0–100 (weighted from pillars by goal)
  verdict: Verdict;
  verdictRationale: string;
  executiveSummary: string;

  pillars: Record<PillarKey, PillarScore>;
  detected: DetectedElements;
  timelineMarkers: TimelineMarker[];
  retentionCurve: RetentionPoint[];
  dropOffRisks: DropOffRisk[];
  personas: Persona[];
  fixes: FixItem[];
  hookRewrites: HookRewrite[];
}

/** Stages streamed from POST /api/audit (NDJSON). */
export type AuditStage = 'uploading' | 'extracting' | 'simulating' | 'generating';

export type AuditStreamEvent =
  | { type: 'stage'; stage: AuditStage; message?: string }
  | { type: 'heartbeat'; elapsedMs: number }
  | { type: 'result'; report: AdAuditReport }
  | { type: 'error'; message: string; code?: string };

export const PILLAR_META: Record<PillarKey, { label: string; blurb: string }> = {
  hook: { label: '3-Second Hook Strength', blurb: 'Pattern interrupt, opening audio/text hook, scroll-stop power' },
  creative: { label: 'Creative Originality & Craft', blurb: 'Pacing, edit rhythm, visual storytelling, native feel' },
  commercial: { label: 'Commercial Viability & Conversion', blurb: 'Value prop clarity, emotion, CTA strength, offer framing' },
  audioPacing: { label: 'Audio & Pacing Dynamics', blurb: 'VO clarity, music energy, dead air, caption readability' },
};

export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
