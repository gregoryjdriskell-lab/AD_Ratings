# AdPulse AI

AI video ad auditing & creative intelligence for short-form ads (TikTok, Instagram/Meta Reels, YouTube Shorts).
Upload an ad (≤60s, ≤50MB) and Gemini watches **and listens** to it natively, then returns a structured audit:
overall viability score and verdict, four pillar scores, a second-by-second simulated retention curve,
a 4-persona simulated focus group, a prioritized fix list and 3 alternative hook rewrites, all tied to
clickable timestamps on a synced video player.

## Quick start

```bash
npm install
cp .env.example .env        # then put your key in GEMINI_API_KEY=
npm run dev                 # API on :8787, UI on http://localhost:5173
```

Production (single server, serves the built UI):

```bash
npm run build
npm start                   # http://localhost:8787
```

## Architecture

```
shared/types.ts                     AdAuditReport interface + stream event types (used by both sides)
server/src/
  index.ts                          Express app, security headers, serves client/dist in production
  routes/audit.ts                   POST /api/audit — multer upload → ffprobe duration check → NDJSON progress stream
  services/adAuditorAgent.ts        System prompt, Gemini File API upload/poll, streamed structured generation, cleanup
  services/auditSchema.ts           Gemini responseSchema (strict JSON contract)
  services/reportNormalizer.ts      Clamps/validates output, fills the retention curve, works out the overall score and verdict from fixed rules
  lib/videoProbe.ts                 Optional ffprobe duration measurement
client/src/
  App.tsx                           Intake → progress → dashboard state machine
  components/UploadPanel.tsx        Drag & drop, preview, campaign context form
  components/ProgressStages.tsx     Uploading → Extracting → Simulating → Generating
  components/Dashboard.tsx          Split view, sticky synced player, export menu
  components/SyncedPlayer.tsx       Video + clickable critique marker track & list
  components/RetentionChart.tsx     Recharts retention curve with drop-off markers (click to seek)
  components/ReportSections.tsx     Scorecard, pillars, focus group, fix list, hook rewrites
  lib/exportReport.ts               Markdown / JSON export
```

### Pipeline
1. Browser uploads the file (XHR with real upload progress) to `POST /api/audit`.
2. Server validates type/size/duration (ffprobe if installed, else browser-measured duration), writes to OS temp.
3. File goes to the Gemini File API, server polls until `ACTIVE`.
4. `generateContentStream` runs with the Creative Director system instruction and `responseSchema`
   (`responseMimeType: application/json`), sampling video at `GEMINI_VIDEO_FPS` (default 2fps) for better cut detection.
5. Output is normalized: scores clamped, timestamps bounded to the real duration, one retention point per
   second, curve forced to never rise, fixes re-ranked. The **overall score** is the goal-weighted average of the
   four pillar scores, and the **verdict** follows fixed rules (the same weights and rules are in the prompt):
   - Scale Ready: overall ≥ 75 and hook ≥ 65
   - Needs Hook Iteration: overall ≥ 50 and avg(creative, commercial) ≥ 55
   - Reshoot Recommended: otherwise
6. The local temp file **and** the remote Gemini file are deleted in `finally`, including on error or client cancel.

### Configuration (`.env`)
| Var | Default | |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required** |
| `GEMINI_MODEL` | `gemini-2.5-pro` | `gemini-2.5-flash` is ~3× faster |
| `GEMINI_VIDEO_FPS` | `2` | 0 = Gemini default (1fps) |
| `PORT` | `8787` | |
| `MAX_CONCURRENT_AUDITS` | `3` | returns 429 when exceeded |
| `GEMINI_FILE_TIMEOUT_MS` | `180000` | max wait for Gemini video processing |
| `CORS_ORIGIN` | — | only if UI is hosted on another origin |

Shortcuts on the dashboard: **J / L** step ±1s, **K** play/pause. Exported JSON reports can be reopened via "Open JSON report".
