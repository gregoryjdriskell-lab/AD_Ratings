import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  GOALS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  PLATFORMS,
  type AuditContext,
  type AuditStreamEvent,
  type Platform,
  type PrimaryGoal,
} from '../../../shared/types.js';
import { config } from '../config.js';
import { probeDurationSeconds } from '../lib/videoProbe.js';
import { AuditError, runAdAudit } from '../services/adAuditorAgent.js';

/** Extension → MIME type accepted by the Gemini File API. */
const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/mov',
  '.webm': 'video/webm',
};
const ALLOWED_INCOMING_MIME = new Set(['video/mp4', 'video/quicktime', 'video/mov', 'video/webm', 'application/octet-stream', '']);
/** Small allowance for container rounding (a "60s" export is often 60.03s). */
const DURATION_TOLERANCE = 1.5;

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `adpulse-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 10, fieldSize: 4096 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!VIDEO_TYPES[ext] || !ALLOWED_INCOMING_MIME.has(file.mimetype)) {
      return cb(new HttpError(415, 'Unsupported file type. Upload an .mp4, .mov or .webm video.'));
    }
    cb(null, true);
  },
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let activeAudits = 0;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseContext(body: Record<string, unknown>): AuditContext {
  const platform = PLATFORMS.includes(body.platform as Platform) ? (body.platform as Platform) : 'TikTok';
  const primaryGoal = GOALS.includes(body.primaryGoal as PrimaryGoal) ? (body.primaryGoal as PrimaryGoal) : 'Direct Response / ROAS';
  return {
    platform,
    primaryGoal,
    category: clip(body.category, 200) || undefined,
    targetAudience: clip(body.targetAudience, 500) || undefined,
  };
}

export const auditRouter = Router();

auditRouter.post(
  '/audit',
  (req: Request, res: Response, next: NextFunction) => {
    if (activeAudits >= config.maxConcurrentAudits) {
      res.status(429).json({ error: 'The server is busy running other audits. Try again in a minute.' });
      return;
    }
    upload.single('video')(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Video exceeds the 50MB limit.' : err.message;
        res.status(413).json({ error: msg });
        return;
      }
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    });
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No video uploaded. Attach a file in the "video" field.' });
      return;
    }

    const cleanup = () => unlink(file.path).catch(() => undefined);
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = VIDEO_TYPES[ext]!;

    // Duration: prefer server-side ffprobe, fall back to what the browser measured.
    const probed = await probeDurationSeconds(file.path);
    const clientDuration = Number(req.body?.clientDuration);
    const duration = probed ?? (Number.isFinite(clientDuration) && clientDuration > 0 ? clientDuration : null);
    if (duration !== null && duration > MAX_VIDEO_SECONDS + DURATION_TOLERANCE) {
      await cleanup();
      res.status(422).json({ error: `Video is ${duration.toFixed(1)}s long. The maximum is ${MAX_VIDEO_SECONDS} seconds.` });
      return;
    }

    if (!config.geminiApiKey) {
      await cleanup();
      res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server. Add it to .env and restart.' });
      return;
    }

    activeAudits++;
    const abort = new AbortController();
    let finished = false;
    res.on('close', () => {
      if (!finished) abort.abort();
    });

    // Stream NDJSON progress events back to the client.
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: AuditStreamEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
    };
    const started = Date.now();
    const heartbeat = setInterval(() => send({ type: 'heartbeat', elapsedMs: Date.now() - started }), 5000);

    try {
      const report = await runAdAudit({
        filePath: file.path,
        fileName: file.originalname,
        mimeType,
        sizeBytes: file.size,
        durationSeconds: duration,
        context: parseContext(req.body ?? {}),
        signal: abort.signal,
        onStage: (stage, message) => send({ type: 'stage', stage, message }),
      });
      send({ type: 'result', report });
      console.log(`[audit] ${file.originalname} → ${report.overallScore} (${report.verdict}) in ${Date.now() - started}ms`);
    } catch (err) {
      const code = err instanceof AuditError ? err.code : 'INTERNAL';
      const message = err instanceof AuditError ? err.message : 'Unexpected server error while auditing the video.';
      if (code !== 'ABORTED') console.error('[audit] failed:', err);
      send({ type: 'error', message, code });
    } finally {
      finished = true;
      clearInterval(heartbeat);
      activeAudits--;
      await cleanup();
      res.end();
    }
  },
);
