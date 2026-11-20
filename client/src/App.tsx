import { Activity, AlertTriangle, KeyRound, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdAuditReport, AuditContext, AuditStage } from '../../shared/types';
import { Dashboard } from './components/Dashboard';
import { ProgressStages } from './components/ProgressStages';
import { UploadPanel, type SelectedVideo } from './components/UploadPanel';
import { fetchHealth, runAudit } from './lib/api';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; stage: AuditStage; upload: number; detail?: string; startedAt: number }
  | { kind: 'error'; message: string }
  | { kind: 'done'; report: AdAuditReport };

const DEFAULT_CONTEXT: AuditContext = { platform: 'TikTok', primaryGoal: 'Direct Response / ROAS', category: '', targetAudience: '' };

export default function App() {
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [context, setContext] = useState<AuditContext>(DEFAULT_CONTEXT);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [now, setNow] = useState(Date.now());
  const [health, setHealth] = useState<Awaited<ReturnType<typeof fetchHealth>> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  useEffect(() => {
    if (phase.kind !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase.kind]);

  const run = useCallback(async () => {
    if (!video) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: 'running', stage: 'uploading', upload: 0, detail: 'Uploading to AdPulse server', startedAt: Date.now() });
    try {
      const report = await runAudit(
        video.file,
        { ...context, category: context.category?.trim() || undefined, targetAudience: context.targetAudience?.trim() || undefined },
        video.duration,
        {
          onUploadProgress: (f) => setPhase((p) => (p.kind === 'running' && p.stage === 'uploading' ? { ...p, upload: f } : p)),
          onStage: (stage, detail) => setPhase((p) => (p.kind === 'running' ? { ...p, stage, detail, upload: 1 } : p)),
        },
        ac.signal,
      );
      setPhase({ kind: 'done', report });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if ((err as Error).name === 'AbortError') setPhase({ kind: 'idle' });
      else setPhase({ kind: 'error', message: (err as Error).message });
    } finally {
      abortRef.current = null;
    }
  }, [video, context]);

  const reset = () => {
    setPhase({ kind: 'idle' });
    window.scrollTo({ top: 0 });
  };

  const importReport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const r = JSON.parse(await file.text()) as AdAuditReport;
      if (!r?.pillars || !Array.isArray(r.retentionCurve) || typeof r.overallScore !== 'number') throw new Error('Not an AdPulse report');
      setPhase({ kind: 'done', report: r });
    } catch {
      setPhase({ kind: 'error', message: 'That file is not a valid AdPulse JSON report.' });
    }
  };

  const running = phase.kind === 'running';
  const showDashboard = phase.kind === 'done';
  const dashboardVideoUrl = showDashboard && video && phase.report.video.fileName === video.file.name ? video.url : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 h-14 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1500px] items-center justify-between px-4 sm:px-6">
          <button type="button" onClick={showDashboard ? reset : undefined} className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-[0_4px_16px_-4px_rgba(124,108,255,0.7)]">
              <Activity size={16} strokeWidth={2.5} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              AdPulse <span className="text-accent-strong">AI</span>
            </span>
          </button>
          <div className="flex items-center gap-3 text-xs text-ink-3">
            {health && (
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className={`h-1.5 w-1.5 rounded-full ${health.apiKeyConfigured ? 'bg-good' : 'bg-warn'}`} />
                {health.model}
              </span>
            )}
            {!showDashboard && (
              <>
                <button type="button" onClick={() => importRef.current?.click()} className="inline-flex items-center gap-1.5 hover:text-ink">
                  <Upload size={13} /> Open JSON report
                </button>
                <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void importReport(e.target.files?.[0]); e.target.value = ''; }} />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pt-0 sm:px-6">
        {showDashboard ? (
          <Dashboard report={phase.report} videoUrl={dashboardVideoUrl} onReset={reset} />
        ) : (
          <div className="mx-auto max-w-6xl py-10">
            <div className="mb-8 max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Creative intelligence for short-form video ads
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Audit your ad before you spend on it.</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                AdPulse watches and listens to your TikTok, Reels or Shorts ad the way a performance creative director would — scoring the hook,
                craft, conversion power and audio, simulating retention and real viewer reactions, and handing you a prioritized edit list.
              </p>
            </div>

            {health && !health.apiKeyConfigured && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink-2">
                <KeyRound size={16} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  <span className="font-medium text-ink">GEMINI_API_KEY is not configured.</span> Copy <code className="font-mono text-xs">.env.example</code> to{' '}
                  <code className="font-mono text-xs">.env</code>, add your key, and restart the server.
                </span>
              </div>
            )}
            {health === null && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-crit/40 bg-crit/10 px-4 py-3 text-sm text-ink-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-crit-ink" />
                <span>Can’t reach the AdPulse API. Start it with <code className="font-mono text-xs">npm run dev</code> from the project root.</span>
              </div>
            )}

            <UploadPanel video={video} onVideo={setVideo} context={context} onContext={setContext} onRun={run} running={running}>
              {phase.kind === 'running' && (
                <ProgressStages
                  stage={phase.stage}
                  uploadFraction={phase.upload}
                  detail={phase.detail}
                  elapsedMs={now - phase.startedAt}
                  onCancel={() => abortRef.current?.abort()}
                />
              )}
              {phase.kind === 'error' && (
                <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-crit/40 bg-crit/10 px-3 py-2.5 text-sm text-crit-ink">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{phase.message}</span>
                </div>
              )}
            </UploadPanel>
          </div>
        )}
      </main>
    </div>
  );
}
