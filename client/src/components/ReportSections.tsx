import {
  AudioLines,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Gauge,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageSquareQuote,
  Mic,
  Music,
  Scissors,
  ShieldAlert,
  Sparkles,
  Subtitles,
  Target,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { PILLAR_META, type AdAuditReport, type FixItem, type PillarKey } from '../../../shared/types';
import { levelRank, scoreTone, toneText, verdictTone } from '../lib/format';
import { Card, cx, LevelPill, ScoreBar, ScoreRing, SectionHeader, TimestampChip, ToneIcon } from './ui';

/* ------------------------------------------------------------------ Scorecard */

export function ScoreHero({ report }: { report: AdAuditReport }) {
  const tone = verdictTone[report.verdict];
  const d = report.detected;
  return (
    <Card id="overview" className="overflow-hidden">
      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
        <ScoreRing score={report.overallScore} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Overall viability score</p>
          <div
            className={cx(
              'mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold',
              tone === 'good' && 'border-good/50 bg-good/15',
              tone === 'warn' && 'border-warn/50 bg-warn/10',
              tone === 'crit' && 'border-crit/50 bg-crit/15',
              toneText[tone],
            )}
          >
            <ToneIcon tone={tone} size={15} />
            {report.verdict}
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-ink">{report.executiveSummary}</p>
          {report.verdictRationale && <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{report.verdictRationale}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        <Fact icon={Mic} label="Voiceover" value={d.hasVoiceover ? 'Yes' : 'None'} />
        <Fact icon={Music} label="Music bed" value={d.hasMusic ? 'Yes' : 'None'} />
        <Fact icon={Subtitles} label="Captions" value={d.hasCaptions ? 'Yes' : 'None'} />
        <Fact icon={Scissors} label="Cuts · avg shot" value={`${d.estimatedCutCount} · ${d.averageShotLengthSeconds}s`} />
        <Fact icon={Target} label="Product first seen" value={d.productFirstAppearsAt} />
        <Fact icon={Sparkles} label="Brand first seen" value={d.brandFirstAppearsAt} />
        <Fact icon={MessageSquareQuote} label="Opening line" value={d.firstSpokenLine ?? d.firstOnScreenText ?? 'None'} wide />
        <Fact icon={Megaphone} label="Call to action" value={d.ctaText ?? 'None detected'} full />
      </div>
      <details className="group border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-[13px] text-ink-2 hover:text-ink">
          What the AI saw in the ad
          <ChevronDown size={15} className="transition group-open:rotate-180" />
        </summary>
        <p className="px-5 pb-4 text-[13px] leading-relaxed text-ink-2">{report.adSummary}</p>
      </details>
    </Card>
  );
}

function Fact({ icon: Icon, label, value, wide, full }: { icon: typeof Mic; label: string; value: string | number | null; wide?: boolean; full?: boolean }) {
  return (
    <div className={cx('bg-surface px-4 py-3', wide && 'col-span-2', full && 'col-span-2 sm:col-span-4')}>
      <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
        <Icon size={12} />
        {label}
      </p>
      <div className="mt-1 text-[13px] font-medium text-ink">
        {typeof value === 'number' ? <TimestampChip seconds={value} /> : value === null ? <span className="text-ink-3">Never</span> : <span className="line-clamp-2">{value}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Pillars */

const PILLAR_ICONS: Record<PillarKey, typeof Zap> = { hook: Zap, creative: Clapperboard, commercial: Target, audioPacing: AudioLines };

export function PillarGrid({ report }: { report: AdAuditReport }) {
  return (
    <Card id="pillars">
      <SectionHeader icon={Gauge} title="Core pillar breakdown" subtitle="Each pillar scored 0–100. 50 is an average paid-social ad; 80+ is top decile." />
      <div className="grid gap-px bg-line md:grid-cols-2">
        {(Object.keys(PILLAR_META) as PillarKey[]).map((k) => (
          <PillarCard key={k} pillarKey={k} report={report} />
        ))}
      </div>
    </Card>
  );
}

function PillarCard({ pillarKey, report }: { pillarKey: PillarKey; report: AdAuditReport }) {
  const p = report.pillars[pillarKey];
  const meta = PILLAR_META[pillarKey];
  const Icon = PILLAR_ICONS[pillarKey];
  const [open, setOpen] = useState(false);
  const tone = scoreTone(p.score);
  return (
    <div className="flex flex-col bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-ink-2" />
          <h3 className="text-[14px] font-semibold text-ink">{meta.label}</h3>
        </div>
        <span className="flex items-center gap-1.5">
          <ToneIcon tone={tone} size={13} />
          <span className="tabular text-2xl font-semibold text-ink">{p.score}</span>
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">{meta.blurb}</p>
      <div className="mt-3">
        <ScoreBar score={p.score} />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{p.rationale}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-accent-strong hover:text-ink"
      >
        {open ? 'Hide' : 'Show'} evidence
        <ChevronDown size={13} className={cx('transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-[13px]">
          {p.strengths.length > 0 && (
            <BulletList title="Strengths" tone="good" items={p.strengths} />
          )}
          {p.weaknesses.length > 0 && <BulletList title="Weaknesses" tone="crit" items={p.weaknesses} />}
          {p.evidence.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">Timestamped evidence</p>
              <ul className="space-y-2">
                {p.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <TimestampChip seconds={e.timestamp} />
                    <span className="leading-relaxed text-ink-2">{e.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BulletList({ title, tone, items }: { title: string; tone: 'good' | 'crit'; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        <ToneIcon tone={tone} size={12} />
        {title}
      </p>
      <ul className="space-y-1 pl-5">
        {items.map((s, i) => (
          <li key={i} className="list-disc leading-relaxed text-ink-2 marker:text-ink-3">
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Focus group */

const AVATAR_BG = ['#3987e5', '#d95926', '#199e70', '#9085e9'];

export function FocusGroup({ report }: { report: AdAuditReport }) {
  const avg = Math.round(report.personas.reduce((s, p) => s + p.resonanceScore, 0) / Math.max(1, report.personas.length));
  return (
    <Card id="personas">
      <SectionHeader
        icon={Users}
        title="Simulated audience focus group"
        subtitle="AI-simulated viewers drawn from your target audience."
        right={
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-ink-3">Avg resonance</p>
            <p className="tabular text-lg font-semibold text-ink">{avg}</p>
          </div>
        }
      />
      <div className="grid gap-px bg-line md:grid-cols-2">
        {report.personas.map((p, i) => {
          const tone = scoreTone(p.resonanceScore);
          return (
            <article key={i} className="flex flex-col bg-surface p-5">
              <header className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: AVATAR_BG[i % AVATAR_BG.length] }}
                  aria-hidden
                >
                  {p.name
                    .split(/\s+/)
                    .map((x) => x[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    {p.name}, {p.age}
                  </p>
                  <p className="truncate text-xs text-ink-3">{p.segment}</p>
                </div>
                <div className="text-right">
                  <p className="tabular flex items-center justify-end gap-1 text-lg font-semibold text-ink">
                    <ToneIcon tone={tone} size={13} />
                    {p.resonanceScore}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-ink-3">resonance</p>
                </div>
              </header>
              <div className="mt-3">
                <ScoreBar score={p.resonanceScore} />
              </div>
              <p className="mt-3 text-xs text-ink-3">{p.descriptor}</p>
              <blockquote className="mt-3 rounded-lg border-l-2 border-accent/60 bg-surface-2 px-3 py-2.5 text-[13px] italic leading-relaxed text-ink">
                “{p.reaction}”
              </blockquote>
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex gap-2">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0 text-crit-ink" />
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Objection</dt>
                    <dd className="leading-relaxed text-ink-2">{p.primaryObjection}</dd>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Zap size={14} className="mt-0.5 shrink-0 text-good-ink" />
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Purchase trigger</dt>
                    <dd className="leading-relaxed text-ink-2">{p.purchaseTrigger}</dd>
                  </div>
                </div>
              </dl>
              <p className="mt-auto pt-3 text-xs text-ink-3">
                Likely action: <span className="font-medium text-ink-2">{p.likelyAction}</span>
              </p>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Fix list */

type SortMode = 'priority' | 'quickwins';

export function FixList({ report }: { report: AdAuditReport }) {
  const [sort, setSort] = useState<SortMode>('priority');
  const fixes = useMemo(() => {
    const list = [...report.fixes];
    if (sort === 'quickwins') {
      const score = (f: FixItem) => levelRank[f.expectedLift] * 2 - levelRank[f.effort];
      list.sort((a, b) => score(b) - score(a) || a.priority - b.priority);
    }
    return list;
  }, [report.fixes, sort]);

  return (
    <Card id="fixes">
      <SectionHeader
        icon={ListChecks}
        title="Actionable fix list"
        subtitle="High-impact edits ranked by expected lift vs. effort."
        right={
          <div className="flex rounded-lg border border-line-strong bg-surface-2 p-0.5 text-xs">
            {(['priority', 'quickwins'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSort(m)}
                className={cx('rounded-md px-2.5 py-1 font-medium transition', sort === m ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2')}
              >
                {m === 'priority' ? 'Priority' : 'Quick wins'}
              </button>
            ))}
          </div>
        }
      />
      <ol className="divide-y divide-line">
        {fixes.map((f) => (
          <li key={f.priority} className="flex gap-4 px-5 py-4">
            <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-xs font-semibold text-ink-2">
              {f.priority}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-semibold text-ink">{f.title}</h3>
                {f.timestamp !== null && <TimestampChip seconds={f.timestamp} />}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{f.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <LevelPill label="Effort" level={f.effort} />
                <LevelPill label="Lift" level={f.expectedLift} />
                <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">{f.category}</span>
              </div>
              {f.liftRationale && <p className="mt-2 text-xs leading-relaxed text-ink-3">{f.liftRationale}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ Hook rewrites */

export function HookRewrites({ report }: { report: AdAuditReport }) {
  return (
    <Card id="hooks">
      <SectionHeader icon={Lightbulb} title="Alternative hook rewrites" subtitle="Three replacement openings for 0:00–0:03, each from a different angle." />
      <div className="grid gap-px bg-line">
        {report.hookRewrites.map((h, i) => (
          <HookCard key={i} index={i} hook={h} />
        ))}
      </div>
    </Card>
  );
}

function HookCard({ index, hook }: { index: number; hook: AdAuditReport['hookRewrites'][number] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const txt = `HOOK ${index + 1}: ${hook.title} (${hook.angle})\nVisual: ${hook.visual}\nScript: "${hook.script}"\nOn-screen text: "${hook.onScreenText}"`;
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-accent-strong">
            Hook {index + 1} · {hook.angle}
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-ink">{hook.title}</h3>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-2 py-1 text-xs text-ink-2 transition hover:text-ink"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <HookField label="Visual (0:00–0:03)" icon={<Clapperboard size={12} />}>
          {hook.visual}
        </HookField>
        <HookField label="Spoken script" icon={<Mic size={12} />}>
          <span className="text-ink">“{hook.script}”</span>
        </HookField>
        <HookField label="On-screen text" icon={<Subtitles size={12} />}>
          <span className="font-semibold text-ink">{hook.onScreenText}</span>
        </HookField>
      </div>
      <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-ink-3">
        <Wrench size={13} className="mt-0.5 shrink-0" />
        {hook.whyItWorks}
      </p>
    </div>
  );
}

function HookField({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-3">
        {icon}
        {label}
      </p>
      <div className="text-[13px] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

