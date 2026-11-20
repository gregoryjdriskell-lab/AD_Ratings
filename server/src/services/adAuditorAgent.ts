import { FileState, GoogleGenAI, type File as GeminiFile, type Part } from '@google/genai';
import type { AdAuditReport, AuditContext, AuditStage } from '../../../shared/types.js';
import { config } from '../config.js';
import { auditResponseSchema } from './auditSchema.js';
import { normalizeReport, PILLAR_WEIGHTS, ReportValidationError } from './reportNormalizer.js';

/* -------------------------------------------------------------------------------------------------
 * System instruction — the "ruthless Performance Creative Director" persona.
 * ------------------------------------------------------------------------------------------------- */

const weightsText = Object.entries(PILLAR_WEIGHTS)
  .map(
    ([goal, w]) =>
      `  - ${goal}: Hook ${w.hook * 100}%, Creative ${w.creative * 100}%, Commercial ${w.commercial * 100}%, Audio/Pacing ${w.audioPacing * 100}%`,
  )
  .join('\n');

export const AD_AUDITOR_SYSTEM_INSTRUCTION = `
You are AdPulse, a ruthless, data-driven Performance Creative Director who has audited more than 20,000
short-form paid social ads (TikTok, Instagram/Meta Reels, YouTube Shorts) and owns the creative testing
roadmap for 8-figure DTC and app-install accounts. You are paid to find what is costing money, not to
make the team feel good.

HOW YOU WATCH
- You receive the full video with both frames AND audio. Watch it end to end, then re-scrub the first
  3 seconds frame by frame. Listen to the voiceover, music, and sound design.
- Every claim you make must be anchored to something you actually observed: a timestamp (in seconds,
  decimals allowed), a verbatim spoken line, or verbatim on-screen text. Never invent dialogue,
  products, logos, or text that is not in the video. If something is absent (no VO, no CTA, no
  captions), say so explicitly — absence is a finding.
- Timestamps must fall within the real video duration.

WHAT YOU PENALIZE HARD
- Slow intros: logo cards, establishing shots, "Hey guys", throat-clearing, fade-ins, or anything
  where nothing changes in 0:00–0:01.5.
- Buried value propositions: the viewer cannot tell what is being sold and why it matters by ~0:05.
- Cluttered, tiny, low-contrast, or off-safe-zone text overlays (platform UI covers the bottom ~20%
  and right edge on TikTok/Reels).
- Generic stock-style openings, polished-TV aesthetics that feel like "an ad" instead of native
  content, and fatigued tropes (unboxing with no twist, fake "POV" with no payoff, stock B-roll + music).
- Dead air, music energy that fights the message, mumbled or uncaptioned VO, mismatched audio levels.
- Weak or missing CTAs and vague offers ("Check it out!") when the goal is conversion.

WHAT YOU REWARD
- Immediate pattern interrupts (motion, a face, a bold claim, an unexpected visual) in the first second.
- Problem → agitation → solution clarity, specific proof (numbers, demos, UGC testimony), and
  an explicit, frictionless CTA with offer framing.
- Native, lo-fi-feeling craft with tight edit rhythm (typically a cut every 1–2.5s for TikTok/Reels).

SCORING (be calibrated, not generous)
- 0–100 per pillar. 50 = average paid social ad. 70 = good, would test. 80+ = top-decile, rare.
  Below 40 = actively wasting spend.
- modelOverallScore is the weighted average of the four pillars using these goal weights:
${weightsText}
- verdict rules (apply exactly):
  - "Scale Ready": overall >= 75 AND hook >= 65.
  - "Needs Hook Iteration": otherwise, if overall >= 50 AND the average of Creative and Commercial >= 55
    (the body of the ad is salvageable; a new opening is the fastest lift).
  - "Reshoot Recommended": everything else.

AUDIENCE SIMULATION
- The retention curve is a prediction of the % of in-feed impressions still watching at each whole
  second. Second 0 = 100. Typical short-form ads lose 30–60% of viewers by second 3; strong hooks
  keep 55–75% at second 3. The curve must be non-increasing and its steepest drops must line up with
  the dropOffRisks you list.
- Personas must be realistic people drawn from the stated target audience (or the audience the ad
  clearly targets if none was given), with distinct attitudes — include at least one skeptic.
  Reactions are first-person, conversational, and reference specific moments of the ad.

FIXES
- Fixes must be concrete edits an editor can execute today (e.g. "Cut 0:00–0:01.5 to start
  mid-action", "Add bold white captions with black stroke at 0:04, top-third safe zone"), ranked by
  expected lift relative to effort for the stated primary goal.
- Hook rewrites must each use a different strategic angle, specify exact visuals for 0:00–0:03,
  exact spoken words, and exact on-screen text. Prefer rewrites achievable with existing footage.

Output strictly valid JSON matching the provided response schema. No markdown, no commentary.
`.trim();

function buildUserPrompt(ctx: AuditContext, durationSeconds: number | null): string {
  return `
Audit this short-form video ad.

CAMPAIGN CONTEXT
- Target platform: ${ctx.platform}
- Product / brand category: ${ctx.category?.trim() || 'Not provided — infer from the video'}
- Target audience: ${ctx.targetAudience?.trim() || 'Not provided — infer the most likely buyer from the video'}
- Primary goal: ${ctx.primaryGoal}
- Measured video duration: ${durationSeconds ? `${durationSeconds.toFixed(2)} seconds` : 'unknown — measure it yourself'}

Judge it against what wins on ${ctx.platform} right now for a ${ctx.primaryGoal} objective.
Produce the retention curve with one point per whole second from 0 through ${
    durationSeconds ? Math.ceil(durationSeconds) : 'the final second'
  }.
`.trim();
}

/* -------------------------------------------------------------------------------------------------
 * Agent
 * ------------------------------------------------------------------------------------------------- */

export class AuditError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFIG' | 'UPLOAD' | 'PROCESSING' | 'MODEL' | 'PARSE' | 'ABORTED',
  ) {
    super(message);
  }
}

export interface RunAuditParams {
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  context: AuditContext;
  signal: AbortSignal;
  onStage: (stage: AuditStage, message?: string) => void;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!config.geminiApiKey) {
    throw new AuditError('GEMINI_API_KEY is not set. Add it to .env at the project root and restart the server.', 'CONFIG');
  }
  client ??= new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new AuditError('Audit cancelled', 'ABORTED'));
    }, { once: true });
  });

async function waitUntilActive(ai: GoogleGenAI, file: GeminiFile, signal: AbortSignal): Promise<GeminiFile> {
  const deadline = Date.now() + config.fileProcessingTimeoutMs;
  let current = file;
  while (current.state === FileState.PROCESSING || current.state === FileState.STATE_UNSPECIFIED || !current.state) {
    if (Date.now() > deadline) throw new AuditError('Gemini took too long to process the video. Try again.', 'PROCESSING');
    await sleep(2000, signal);
    current = await ai.files.get({ name: file.name!, config: { abortSignal: signal } });
  }
  if (current.state === FileState.FAILED) {
    throw new AuditError(
      `Gemini could not process this video${current.error?.message ? `: ${current.error.message}` : ''}. Try re-encoding it as H.264 MP4.`,
      'PROCESSING',
    );
  }
  return current;
}

/** The SDK surfaces API errors as raw JSON strings — pull out the human-readable message. */
function geminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'))) as { error?: { message?: string; status?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* not JSON */
  }
  return raw;
}

function extractJson(textOut: string): unknown {
  const trimmed = textOut.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AuditError('The AI returned malformed JSON. Please run the audit again.', 'PARSE');
  }
}

/**
 * Full pipeline: upload to Gemini File API → wait for processing → stream structured
 * generation → normalize. The remote Gemini file is always deleted afterwards.
 */
export async function runAdAudit(p: RunAuditParams): Promise<AdAuditReport> {
  const ai = getClient();
  let uploaded: GeminiFile | null = null;

  try {
    // 1. Upload media to the Gemini File API
    p.onStage('uploading', 'Sending video to Gemini File API');
    try {
      uploaded = await ai.files.upload({
        file: p.filePath,
        config: { mimeType: p.mimeType, displayName: `adpulse-${Date.now()}`, abortSignal: p.signal },
      });
    } catch (err) {
      if (p.signal.aborted) throw new AuditError('Audit cancelled', 'ABORTED');
      throw new AuditError(`Upload to Gemini failed: ${geminiErrorMessage(err)}`, 'UPLOAD');
    }

    // 2. Wait for Gemini to finish decoding frames + audio
    p.onStage('extracting', 'Decoding frames, cuts, voiceover and music');
    const active = await waitUntilActive(ai, uploaded, p.signal);

    // 3. Run the agent (stream so we can report when the model starts writing the report)
    p.onStage('simulating', 'Simulating audience segments and retention');
    const videoPart: Part = {
      fileData: { fileUri: active.uri!, mimeType: active.mimeType ?? p.mimeType },
      ...(config.videoFps ? { videoMetadata: { fps: config.videoFps } } : {}),
    };

    let output = '';
    let announcedGenerating = false;
    try {
      const stream = await ai.models.generateContentStream({
        model: config.geminiModel,
        contents: [{ role: 'user', parts: [videoPart, { text: buildUserPrompt(p.context, p.durationSeconds) }] }],
        config: {
          systemInstruction: AD_AUDITOR_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: auditResponseSchema,
          temperature: 0.4,
          maxOutputTokens: 32768,
          abortSignal: p.signal,
        },
      });
      for await (const chunk of stream) {
        const t = chunk.text;
        if (t) {
          if (!announcedGenerating) {
            announcedGenerating = true;
            p.onStage('generating', 'Writing the audit report');
          }
          output += t;
        }
        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason && reason !== 'STOP' && reason !== 'FINISH_REASON_UNSPECIFIED') {
          if (reason === 'MAX_TOKENS') throw new AuditError('The AI response was cut off (token limit). Try again.', 'MODEL');
          throw new AuditError(`The AI stopped early (${reason}).`, 'MODEL');
        }
      }
    } catch (err) {
      if (err instanceof AuditError) throw err;
      if (p.signal.aborted) throw new AuditError('Audit cancelled', 'ABORTED');
      throw new AuditError(`Gemini analysis failed: ${geminiErrorMessage(err)}`, 'MODEL');
    }

    if (!output.trim()) throw new AuditError('The AI returned an empty response. Please try again.', 'MODEL');
    if (!announcedGenerating) p.onStage('generating', 'Writing the audit report');

    try {
      return normalizeReport({
        raw: extractJson(output),
        context: p.context,
        model: config.geminiModel,
        video: {
          fileName: p.fileName,
          mimeType: p.mimeType,
          sizeBytes: p.sizeBytes,
          durationSeconds: p.durationSeconds,
        },
      });
    } catch (err) {
      if (err instanceof ReportValidationError) throw new AuditError(err.message, 'PARSE');
      throw err;
    }
  } finally {
    if (uploaded?.name) {
      // Best effort — never let cleanup mask the real error. Files also auto-expire after 48h.
      ai.files.delete({ name: uploaded.name }).catch((e: Error) =>
        console.warn(`[adAuditorAgent] failed to delete Gemini file ${uploaded?.name}: ${e.message}`),
      );
    }
  }
}
