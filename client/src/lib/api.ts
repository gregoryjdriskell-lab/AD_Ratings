import type { AdAuditReport, AuditContext, AuditStage, AuditStreamEvent } from '../../../shared/types';

export interface AuditCallbacks {
  onUploadProgress: (fraction: number) => void;
  onStage: (stage: AuditStage, message?: string) => void;
}

export class AuditRequestError extends Error {}

/**
 * POST the video + context to /api/audit and consume the NDJSON event stream.
 * Uses XHR (not fetch) so we get real upload progress for the first stage.
 */
export function runAudit(
  file: File,
  context: AuditContext,
  clientDuration: number | null,
  cb: AuditCallbacks,
  signal: AbortSignal,
): Promise<AdAuditReport> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('platform', context.platform);
    form.append('primaryGoal', context.primaryGoal);
    if (context.category) form.append('category', context.category);
    if (context.targetAudience) form.append('targetAudience', context.targetAudience);
    if (clientDuration) form.append('clientDuration', String(clientDuration));
    form.append('video', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/audit');
    let cursor = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const consume = () => {
      if (xhr.status !== 200) return;
      const text = xhr.responseText;
      let nl: number;
      while ((nl = text.indexOf('\n', cursor)) !== -1) {
        const line = text.slice(cursor, nl).trim();
        cursor = nl + 1;
        if (!line) continue;
        let event: AuditStreamEvent;
        try {
          event = JSON.parse(line) as AuditStreamEvent;
        } catch {
          continue;
        }
        if (event.type === 'stage') cb.onStage(event.stage, event.message);
        else if (event.type === 'result') finish(() => resolve(event.report));
        else if (event.type === 'error') finish(() => reject(new AuditRequestError(event.message)));
      }
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) cb.onUploadProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => cb.onUploadProgress(1);
    xhr.onprogress = consume;
    xhr.onload = () => {
      if (xhr.status !== 200) {
        let message = `Request failed (${xhr.status})`;
        try {
          message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
        } catch {
          /* non-JSON body */
        }
        return finish(() => reject(new AuditRequestError(message)));
      }
      consume();
      finish(() => reject(new AuditRequestError('The server closed the connection before the report was ready.')));
    };
    xhr.onerror = () => finish(() => reject(new AuditRequestError('Network error — is the API server running on port 8787?')));
    xhr.onabort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(form);
  });
}

export async function fetchHealth(): Promise<{ ok: boolean; model: string; apiKeyConfigured: boolean } | null> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
