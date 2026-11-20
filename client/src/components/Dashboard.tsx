import { Download, FileJson, FileText, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdAuditReport } from '../../../shared/types';
import { exportJson, exportMarkdown } from '../lib/exportReport';
import { fmtBytes, fmtTime } from '../lib/format';
import { PlayerControlsContext, PlayerTimeContext } from '../lib/player';
import { RetentionChart } from './RetentionChart';
import { FixList, FocusGroup, HookRewrites, PillarGrid, ScoreHero } from './ReportSections';
import { SyncedPlayer } from './SyncedPlayer';
import { cx } from './ui';

const NAV = [
  ['overview', 'Scorecard'],
  ['pillars', 'Pillars'],
  ['retention', 'Retention'],
  ['personas', 'Focus group'],
  ['fixes', 'Fixes'],
  ['hooks', 'Hooks'],
] as const;

export function Dashboard({ report, videoUrl, onReset }: { report: AdAuditReport; videoUrl: string | null; onReset: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(report.video.durationSeconds);
  const [exportOpen, setExportOpen] = useState(false);

  const seek = useCallback(
    (seconds: number, play = false) => {
      const v = videoRef.current;
      const t = Math.max(0, Math.min(seconds, (v?.duration && Number.isFinite(v.duration) ? v.duration : duration) - 0.05));
      setTime(t);
      if (!v) return;
      v.currentTime = t;
      if (play) void v.play().catch(() => undefined);
      if (window.matchMedia('(max-width: 1023px)').matches) v.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [duration],
  );
  const controls = useMemo(() => ({ seek }), [seek]);

  useEffect(() => {
    if (!exportOpen) return;
    const close = () => setExportOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [exportOpen]);

  // Keyboard: J/L = ±1s, K = play/pause (when not typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || (e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'j') seek(v.currentTime - 1);
      else if (e.key === 'l') seek(v.currentTime + 1);
      else if (e.key === 'k') void (v.paused ? v.play() : v.pause());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek]);

  return (
    <PlayerControlsContext.Provider value={controls}>
      <PlayerTimeContext.Provider value={time}>
        {/* Sub-header */}
        <div className="sticky top-14 z-30 -mx-4 mb-5 border-b border-line bg-canvas/85 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{report.video.fileName}</p>
              <p className="tabular truncate text-xs text-ink-3">
                {report.context.platform} · {report.context.primaryGoal} · {fmtTime(report.video.durationSeconds)} · {fmtBytes(report.video.sizeBytes)}
              </p>
            </div>
            <nav className="hidden items-center gap-0.5 xl:flex">
              {NAV.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1 text-xs text-ink-3 transition hover:bg-surface-2 hover:text-ink">
                  {label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:text-ink"
              >
                <RotateCcw size={13} /> New audit
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportOpen((o) => !o);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#8b7dff]"
                >
                  <Download size={13} /> Export report
                </button>
                <div
                  className={cx(
                    'absolute right-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-lg border border-line-strong bg-surface-2 shadow-2xl',
                    !exportOpen && 'hidden',
                  )}
                >
                  <button type="button" onClick={() => exportMarkdown(report)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-3">
                    <FileText size={15} className="mt-0.5 text-ink-2" />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">Markdown brief</span>
                      <span className="block text-[11px] text-ink-3">For Notion, Slack, Docs</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => exportJson(report)} className="flex w-full items-start gap-2.5 border-t border-line px-3 py-2.5 text-left hover:bg-surface-3">
                    <FileJson size={15} className="mt-0.5 text-ink-2" />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">JSON report</span>
                      <span className="block text-[11px] text-ink-3">Full structured AdAuditReport</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
          <aside className="lg:sticky lg:top-[7.5rem] lg:h-fit lg:max-h-[calc(100vh-8.5rem)] lg:overflow-y-auto">
            <SyncedPlayer
              videoRef={videoRef}
              src={videoUrl}
              duration={duration}
              currentTime={time}
              markers={report.timelineMarkers}
              onTime={setTime}
              onDuration={setDuration}
            />
          </aside>
          <div className="flex min-w-0 flex-col gap-5 pb-16 [&>section]:scroll-mt-32">
            <ScoreHero report={report} />
            <PillarGrid report={report} />
            <RetentionChart report={report} />
            <FocusGroup report={report} />
            <FixList report={report} />
            <HookRewrites report={report} />
            <p className="text-center text-[11px] text-ink-3">
              Generated {new Date(report.createdAt).toLocaleString()} by {report.model} · Shortcuts: J / K / L to scrub & play
            </p>
          </div>
        </div>
      </PlayerTimeContext.Provider>
    </PlayerControlsContext.Provider>
  );
}
