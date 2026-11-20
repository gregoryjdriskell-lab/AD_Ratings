import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { auditRouter } from './routes/audit.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (config.corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: config.geminiModel, apiKeyConfigured: Boolean(config.geminiApiKey) });
});

app.use('/api', auditRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// In production, serve the built client from the same origin.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = [path.resolve(here, '../../../../client/dist'), path.resolve(process.cwd(), '../client/dist'), path.resolve(process.cwd(), 'client/dist')].find((p) =>
  existsSync(path.join(p, 'index.html')),
);
if (clientDist) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] unhandled error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  console.log(`\n  AdPulse AI API  →  http://localhost:${config.port}`);
  console.log(`  Model: ${config.geminiModel}   API key: ${config.geminiApiKey ? 'configured ✓' : 'MISSING ✗ (set GEMINI_API_KEY in .env)'}`);
  if (clientDist) console.log(`  Serving client from ${clientDist}`);
  console.log('');
});
// Long-running video analysis: don't let Node time out the request.
server.requestTimeout = 10 * 60_000;
server.headersTimeout = 10 * 60_000 + 1000;

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
