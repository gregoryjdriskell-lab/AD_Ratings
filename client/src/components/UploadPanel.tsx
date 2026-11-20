import { Film, Loader2, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { GOALS, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, PLATFORMS, type AuditContext } from '../../../shared/types';
import { fmtBytes, fmtTime } from '../lib/format';
import { cx } from './ui';

export interface SelectedVideo {
  file: File;
  url: string;
  duration: number | null;
}

const ACCEPT_EXT = ['.mp4', '.mov', '.webm'];
const DURATION_TOLERANCE = 1.5;

/** Read duration from the browser's decoder. Some .mov codecs can't be decoded in-browser → null. */
function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (d: number | null) => {
      v.removeAttribute('src');
      v.load();
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

export function UploadPanel({
  video,
  onVideo,
  context,
  onContext,
  onRun,
  running,
  children,
}: {
  video: SelectedVideo | null;
  onVideo: (v: SelectedVideo | null) => void;
  context: AuditContext;
  onContext: (c: AuditContext) => void;
  onRun: () => void;
  running: boolean;
  children?: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    async (file: File | undefined) => {
      setError(null);
      if (!file) return;
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!ACCEPT_EXT.includes(ext)) return setError('Unsupported format. Use .mp4, .mov or .webm.');
      if (file.size > MAX_VIDEO_BYTES) return setError(`File is ${fmtBytes(file.size)}. The limit is 50 MB.`);
      setChecking(true);
      const url = URL.createObjectURL(file);
      const duration = await readDuration(url);
      setChecking(false);
      if (duration !== null && duration > MAX_VIDEO_SECONDS + DURATION_TOLERANCE) {
        URL.revokeObjectURL(url);
        return setError(`Video is ${fmtTime(duration)} long. Short-form audits support up to ${MAX_VIDEO_SECONDS} seconds.`);
      }
      if (video) URL.revokeObjectURL(video.url);
      onVideo({ file, url, duration });
    },
    [onVideo, video],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!running) void accept(e.dataTransfer.files?.[0]);
  };

  const field = 'w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-60';
  const label = 'mb-1.5 block text-xs font-medium text-ink-2';

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Media */}
      <div className="rounded-xl border border-line bg-surface p-4">
        {!video ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              'flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-6 text-center transition-colors',
              dragging ? 'border-accent bg-accent/10' : 'border-line-strong hover:border-accent/50 hover:bg-surface-2',
            )}
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-accent/30 animate-pulse-ring" />
              <div className="relative rounded-full border border-accent/40 bg-accent/15 p-4 text-accent-strong">
                {checking ? <Loader2 className="animate-spin" size={26} /> : <UploadCloud size={26} />}
              </div>
            </div>
            <div>
              <p className="text-[15px] font-medium text-ink">Drop your video ad here</p>
              <p className="mt-1 text-sm text-ink-3">or click to browse · MP4, MOV, WebM · up to 60s / 50 MB</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex justify-center overflow-hidden rounded-lg bg-black">
              <video src={video.url} controls playsInline className="max-h-[460px] w-auto max-w-full" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Film size={16} className="shrink-0 text-ink-3" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{video.file.name}</p>
                  <p className="tabular text-xs text-ink-3">
                    {fmtBytes(video.file.size)}
                    {video.duration !== null && ` · ${fmtTime(video.duration)}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={running}
                onClick={() => {
                  URL.revokeObjectURL(video.url);
                  onVideo(null);
                }}
                className="rounded-md p-1.5 text-ink-3 transition hover:bg-surface-3 hover:text-ink disabled:opacity-40"
                aria-label="Remove video"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit-ink">
            <X size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Context */}
      <div className="flex flex-col rounded-xl border border-line bg-surface p-5">
        <h2 className="text-[15px] font-semibold tracking-tight">Campaign context</h2>
        <p className="mt-1 text-[13px] text-ink-3">Optional, but it sharpens the persona simulation and scoring weights.</p>

        <div className="mt-5 space-y-4">
          <div>
            <span className={label}>Target platform</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={running}
                  onClick={() => onContext({ ...context, platform: p })}
                  className={cx(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition',
                    context.platform === p
                      ? 'border-accent/70 bg-accent/15 text-ink'
                      : 'border-line-strong bg-surface-2 text-ink-2 hover:border-line-strong hover:bg-surface-3',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={label} htmlFor="goal">
              Primary goal
            </label>
            <select
              id="goal"
              disabled={running}
              value={context.primaryGoal}
              onChange={(e) => onContext({ ...context, primaryGoal: e.target.value as AuditContext['primaryGoal'] })}
              className={field}
            >
              {GOALS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="category">
              Product / brand category
            </label>
            <input
              id="category"
              disabled={running}
              maxLength={200}
              value={context.category ?? ''}
              onChange={(e) => onContext({ ...context, category: e.target.value })}
              placeholder="e.g. Skincare serum, DTC · $45 AOV"
              className={field}
            />
          </div>

          <div>
            <label className={label} htmlFor="audience">
              Target audience
            </label>
            <textarea
              id="audience"
              disabled={running}
              maxLength={500}
              rows={3}
              value={context.targetAudience ?? ''}
              onChange={(e) => onContext({ ...context, targetAudience: e.target.value })}
              placeholder="e.g. Women 25–40, acne-prone skin, tried drugstore products, value clean ingredients"
              className={cx(field, 'resize-none')}
            />
          </div>
        </div>

        <div className="mt-auto pt-6">
          {children}
          <button
            type="button"
            onClick={onRun}
            disabled={!video || running}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_24px_-8px_rgba(124,108,255,0.6)] transition hover:bg-[#8b7dff] disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {running ? 'Auditing…' : 'Run AI Audit'}
          </button>
        </div>
      </div>
    </div>
  );
}
