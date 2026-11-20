import type { Level, Severity, Verdict } from '../../../shared/types';

/** 3.5 → "0:03.5", 12 → "0:12" */
export function fmtTime(seconds: number, precise = true): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const frac = Math.round((rest - whole) * 10);
  const base = `${m}:${String(whole).padStart(2, '0')}`;
  return precise && frac > 0 && frac < 10 ? `${base}.${frac}` : base;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type ScoreTone = 'good' | 'warn' | 'crit';
export function scoreTone(score: number): ScoreTone {
  if (score >= 70) return 'good';
  if (score >= 50) return 'warn';
  return 'crit';
}

export const toneText: Record<ScoreTone, string> = {
  good: 'text-good-ink',
  warn: 'text-warn',
  crit: 'text-crit-ink',
};
export const toneBg: Record<ScoreTone, string> = {
  good: 'bg-good',
  warn: 'bg-warn',
  crit: 'bg-crit',
};
export const toneHex: Record<ScoreTone, string> = {
  good: '#0ca30c',
  warn: '#fab219',
  crit: '#d03b3b',
};

export const severityTone: Record<Severity, ScoreTone> = { positive: 'good', warning: 'warn', critical: 'crit' };
export const severityLabel: Record<Severity, string> = { positive: 'Working', warning: 'Warning', critical: 'Critical' };

export const verdictTone: Record<Verdict, ScoreTone> = {
  'Scale Ready': 'good',
  'Needs Hook Iteration': 'warn',
  'Reshoot Recommended': 'crit',
};

export const levelRank: Record<Level, number> = { Low: 0, Medium: 1, High: 2 };
