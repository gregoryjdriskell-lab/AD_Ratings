import { Check, Loader2 } from 'lucide-react';
import type { AuditStage } from '../../../shared/types';
import { cx } from './ui';

const STAGES: { key: AuditStage; label: string }[] = [
  { key: 'uploading', label: 'Uploading media' },
  { key: 'extracting', label: 'Extracting visual & audio cues' },
  { key: 'simulating', label: 'Simulating audience segments' },
  { key: 'generating', label: 'Generating report' },
];

export function ProgressStages({
  stage,
  uploadFraction,
  detail,
  elapsedMs,
  onCancel,
}: {
  stage: AuditStage;
  uploadFraction: number;
  detail?: string;
  elapsedMs: number;
  onCancel: () => void;
}) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="mb-4 rounded-lg border border-line bg-surface-2 p-4" aria-live="polite">
      <ol className="space-y-2.5">
        {STAGES.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={cx(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                  done && 'border-good/60 bg-good/20 text-good-ink',
                  active && 'border-accent/70 bg-accent/20 text-accent-strong',
                  !done && !active && 'border-line-strong text-ink-3',
                )}
              >
                {done ? <Check size={11} strokeWidth={3} /> : active ? <Loader2 size={11} className="animate-spin" /> : i + 1}
              </span>
              <span className={cx('flex-1 text-sm', active ? 'font-medium text-ink' : done ? 'text-ink-2' : 'text-ink-3')}>
                {s.label}
                {active && s.key === 'uploading' && uploadFraction < 1 && (
                  <span className="tabular ml-2 text-ink-3">{Math.round(uploadFraction * 100)}%</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700"
          style={{ width: `${((idx + (stage === 'uploading' ? uploadFraction * 0.9 : 0.5)) / STAGES.length) * 100}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-xs text-ink-3">
        <span className="truncate">{detail ?? 'Working…'}</span>
        <span className="flex items-center gap-3">
          <span className="tabular">{Math.floor(elapsedMs / 1000)}s</span>
          <button type="button" onClick={onCancel} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}
