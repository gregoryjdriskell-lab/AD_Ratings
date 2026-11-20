import { useMemo, useState, type RefObject } from 'react';
import type { Severity, TimelineMarker } from '../../../shared/types';
import { fmtTime, severityLabel, severityTone, toneHex } from '../lib/format';
import { usePlayer } from '../lib/player';
import { cx, SeverityBadge, TimestampChip } from './ui';

const FILTERS: ('all' | Severity)[] = ['all', 'critical', 'warning', 'positive'];

export function SyncedPlayer({
  videoRef,
  src,
  duration,
  currentTime,
  markers,
  onTime,
  onDuration,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string | null;
  duration: number;
  currentTime: number;
  markers: TimelineMarker[];
  onTime: (t: number) => void;
  onDuration: (d: number) => void;
}) {
  const { seek } = usePlayer();
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [hover, setHover] = useState<TimelineMarker | null>(null);
  const visible = useMemo(() => markers.filter((m) => filter === 'all' || m.severity === filter), [markers, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: markers.length, critical: 0, warning: 0, positive: 0 };
    markers.forEach((m) => c[m.severity]++);
    return c;
  }, [markers]);

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / Math.max(duration, 0.1)) * 100))}%`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-line bg-black">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            className="mx-auto max-h-[52vh] w-auto max-w-full"
            onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
            onSeeked={(e) => onTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && onDuration(e.currentTarget.duration)}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-ink-3">
            Video preview unavailable for imported reports.
          </div>
        )}
      </div>

      {/* Marker track */}
      <div className="rounded-xl border border-line bg-surface px-4 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
          <span className="font-medium uppercase tracking-wider">AI critique timeline</span>
          <span className="tabular font-mono">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>
        <div
          className="relative h-9 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - rect.left) / rect.width) * duration);
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
          <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/50" style={{ width: pct(currentTime) }} />
          {/* hook zone */}
          <div
            className="absolute top-1/2 h-4 -translate-y-1/2 rounded border border-dashed border-accent/40"
            style={{ left: 0, width: pct(Math.min(3, duration)) }}
            title="3-second hook window"
          />
          {markers.map((m, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${severityLabel[m.severity]} at ${fmtTime(m.timestamp)}: ${m.title}`}
              onClick={(e) => {
                e.stopPropagation();
                seek(m.timestamp, true);
              }}
              onMouseEnter={() => setHover(m)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(m)}
              onBlur={() => setHover(null)}
              className="absolute top-1/2 flex h-7 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: pct(m.timestamp) }}
            >
              <span
                className={cx(
                  'block h-3 w-3 ring-2 ring-surface transition-transform hover:scale-125',
                  m.severity === 'critical' ? 'rotate-45 rounded-[2px]' : m.severity === 'warning' ? 'rounded-[2px]' : 'rounded-full',
                )}
                style={{ background: toneHex[severityTone[m.severity]] }}
              />
            </button>
          ))}
          <div className="pointer-events-none absolute top-0 h-full w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: pct(currentTime) }} />
          {hover && (
            <div
              className="pointer-events-none absolute bottom-full z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-xs shadow-xl"
              style={{ left: `clamp(7rem, ${pct(hover.timestamp)}, calc(100% - 7rem))` }}
            >
              <div className="flex items-center gap-2">
                <span className="tabular font-mono text-ink-2">{fmtTime(hover.timestamp)}</span>
                <SeverityBadge severity={hover.severity} compact />
              </div>
              <p className="mt-1 font-medium text-ink">{hover.title}</p>
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-3">
          <Legend shape="diamond" color={toneHex.crit} label="Critical" />
          <Legend shape="square" color={toneHex.warn} label="Warning" />
          <Legend shape="circle" color={toneHex.good} label="Working" />
          <span className="ml-auto flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-dashed border-accent/50" /> Hook window
          </span>
        </div>
      </div>

      {/* Marker list */}
      <div className="flex min-h-0 flex-col rounded-xl border border-line bg-surface">
        <div className="flex gap-1 border-b border-line p-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cx(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition',
                filter === f ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              {f === 'all' ? 'All' : severityLabel[f]} <span className="tabular text-ink-3">{counts[f]}</span>
            </button>
          ))}
        </div>
        <ul className="max-h-[30vh] divide-y divide-line overflow-y-auto">
          {visible.map((m, i) => {
            const active = currentTime >= m.timestamp && currentTime < (m.endTimestamp ?? m.timestamp + 1.5);
            return (
              <li key={i} className={cx('flex gap-3 px-3 py-2.5 transition-colors', active && 'bg-accent/10')}>
                <TimestampChip seconds={m.timestamp} end={m.endTimestamp} className="h-fit" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-ink">{m.title}</span>
                    <SeverityBadge severity={m.severity} compact />
                    <span className="text-[11px] uppercase tracking-wide text-ink-3">{m.category}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{m.note}</p>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">No markers in this filter.</li>}
        </ul>
      </div>
    </div>
  );
}

function Legend({ shape, color, label }: { shape: 'diamond' | 'square' | 'circle'; color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cx('h-2 w-2', shape === 'diamond' ? 'rotate-45 rounded-[1px]' : shape === 'square' ? 'rounded-[1px]' : 'rounded-full')}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
