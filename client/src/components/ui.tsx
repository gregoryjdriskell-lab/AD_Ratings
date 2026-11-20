import { AlertOctagon, AlertTriangle, CheckCircle2, Play, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Severity } from '../../../shared/types';
import { fmtTime, scoreTone, severityLabel, severityTone, toneHex, toneText, type ScoreTone } from '../lib/format';
import { usePlayer, usePlayerTime } from '../lib/player';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx('rounded-xl border border-line bg-surface', className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md border border-line bg-surface-2 p-1.5 text-ink-2">
          <Icon size={15} />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

const toneIcon: Record<ScoreTone, LucideIcon> = { good: CheckCircle2, warn: AlertTriangle, crit: AlertOctagon };

/** Status is never color-alone: icon + label + color. */
export function SeverityBadge({ severity, compact }: { severity: Severity; compact?: boolean }) {
  const tone = severityTone[severity];
  const Icon = toneIcon[tone];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface-2 font-medium',
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        toneText[tone],
      )}
    >
      <Icon size={compact ? 11 : 12} />
      {severityLabel[severity]}
    </span>
  );
}

export function ToneIcon({ tone, size = 14 }: { tone: ScoreTone; size?: number }) {
  const Icon = toneIcon[tone];
  return <Icon size={size} className={toneText[tone]} />;
}

export function LevelPill({ label, level }: { label: string; level: 'Low' | 'Medium' | 'High' }) {
  const filled = level === 'Low' ? 1 : level === 'Medium' ? 2 : 3;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
      {label}
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('h-2.5 w-1 rounded-full', i <= filled ? 'bg-ink-2' : 'bg-surface-3')} />
        ))}
      </span>
      <span className="font-medium text-ink-2">{level}</span>
    </span>
  );
}

/** Clickable timestamp that seeks the synced video player. */
export function TimestampChip({ seconds, end, className }: { seconds: number; end?: number | null; className?: string }) {
  const { seek } = usePlayer();
  const now = usePlayerTime();
  const active = now >= seconds - 0.05 && now < (end ?? seconds + 1);
  return (
    <button
      type="button"
      onClick={() => seek(seconds, true)}
      title={`Jump to ${fmtTime(seconds)}`}
      className={cx(
        'tabular inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition-colors',
        active
          ? 'border-accent/60 bg-accent/20 text-ink'
          : 'border-line-strong bg-surface-2 text-ink-2 hover:border-accent/50 hover:bg-accent/10 hover:text-ink',
        className,
      )}
    >
      <Play size={9} className="fill-current" />
      {fmtTime(seconds)}
      {end != null && <span className="text-ink-3">–{fmtTime(end)}</span>}
    </button>
  );
}

export function ScoreRing({ score, size = 132, stroke = 10 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`Score ${score} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneHex[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-4xl font-semibold tracking-tight text-ink">{score}</span>
        <span className="text-[11px] uppercase tracking-wider text-ink-3">/ 100</span>
      </div>
    </div>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full rounded-full"
        style={{ width: `${score}%`, background: toneHex[tone], transition: 'width 800ms cubic-bezier(.2,.7,.2,1)' }}
      />
    </div>
  );
}
