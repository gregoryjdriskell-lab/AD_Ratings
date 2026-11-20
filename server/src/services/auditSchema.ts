import { Type, type Schema } from '@google/genai';
import { LEVELS, MARKER_CATEGORIES, SEVERITIES, VERDICTS } from '../../../shared/types.js';
import type { AdAuditReport } from '../../../shared/types.js';

/**
 * The exact shape the model must return. Server-owned fields (id, createdAt, model,
 * context, video, overallScore) are added afterwards by the normalizer.
 */
export type RawAuditOutput = Omit<AdAuditReport, 'id' | 'createdAt' | 'model' | 'context' | 'video' | 'overallScore'> & {
  modelOverallScore: number;
  estimatedDurationSeconds: number;
};

const str = (description: string): Schema => ({ type: Type.STRING, description });
const num = (description: string): Schema => ({ type: Type.NUMBER, description });
const int = (description: string): Schema => ({ type: Type.INTEGER, description });
const bool = (description: string): Schema => ({ type: Type.BOOLEAN, description });
const nullableNum = (description: string): Schema => ({ type: Type.NUMBER, description, nullable: true });
const nullableStr = (description: string): Schema => ({ type: Type.STRING, description, nullable: true });
const enumOf = (values: readonly string[], description: string): Schema => ({
  type: Type.STRING,
  format: 'enum',
  enum: [...values],
  description,
});
const arr = (items: Schema, description: string, minItems?: number, maxItems?: number): Schema => ({
  type: Type.ARRAY,
  items,
  description,
  ...(minItems !== undefined ? { minItems: String(minItems) } : {}),
  ...(maxItems !== undefined ? { maxItems: String(maxItems) } : {}),
});
const obj = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: Type.OBJECT,
  properties,
  required: Object.keys(properties),
  propertyOrdering: Object.keys(properties),
  ...(description ? { description } : {}),
});

const timestampedNote = obj({
  timestamp: num('Seconds from video start, decimals allowed (e.g. 1.5).'),
  note: str('Specific observation at this moment — what is seen/heard and why it matters.'),
});

const pillar = (focus: string): Schema =>
  obj(
    {
      score: int('0–100. Be harsh: 50 is average for paid social, 80+ is top-decile.'),
      rationale: str('2–3 sentence verdict for this pillar referencing concrete moments.'),
      strengths: arr(str('A concrete strength.'), 'What works.', 0, 4),
      weaknesses: arr(str('A concrete weakness.'), 'What is costing performance.', 0, 5),
      evidence: arr(timestampedNote, 'Timestamped evidence supporting the score.', 1, 6),
    },
    focus,
  );

export const auditResponseSchema: Schema = obj({
  estimatedDurationSeconds: num('Your measured duration of the video in seconds.'),
  adSummary: str('One-paragraph neutral description of what happens in the ad, beat by beat.'),
  modelOverallScore: int('Holistic 0–100 commercial viability score using the weighting described in the instructions.'),
  verdict: enumOf(VERDICTS, 'Verdict following the verdict rules in the instructions.'),
  verdictRationale: str('One or two sentences justifying the verdict.'),
  executiveSummary: str('3–5 sentence executive summary a creative strategist could paste into Slack.'),
  pillars: obj({
    hook: pillar('3-Second Hook Strength: visual pattern interrupt, opening audio/text hook, scroll-stop power in 0:00–0:03.'),
    creative: pillar('Creative Originality & Craft: pacing, edit rhythm, visual storytelling, native platform feel vs. ad-fatigue tropes.'),
    commercial: pillar('Commercial Viability & Conversion: value-prop clarity, emotional resonance, CTA strength, offer framing.'),
    audioPacing: pillar('Audio & Pacing Dynamics: voiceover clarity, music energy match, dead-air detection, caption readability.'),
  }),
  detected: obj({
    firstSpokenLine: nullableStr('Verbatim first spoken words, or null if none.'),
    firstOnScreenText: nullableStr('Verbatim first on-screen text overlay, or null if none.'),
    ctaText: nullableStr('Verbatim call to action (spoken or on-screen), or null if none.'),
    hasVoiceover: bool('True if there is a voiceover or on-camera speech.'),
    hasMusic: bool('True if there is a music bed.'),
    hasCaptions: bool('True if spoken words are captioned on screen.'),
    brandFirstAppearsAt: nullableNum('Seconds when brand name/logo is first visible or spoken, null if never.'),
    productFirstAppearsAt: nullableNum('Seconds when the product is first clearly shown, null if never.'),
    estimatedCutCount: int('Number of hard cuts / scene changes observed.'),
    averageShotLengthSeconds: num('Average shot length in seconds.'),
  }),
  timelineMarkers: arr(
    obj({
      timestamp: num('Start second of the moment.'),
      endTimestamp: nullableNum('End second if this spans a range, else null.'),
      category: enumOf(MARKER_CATEGORIES, 'What aspect this marker is about.'),
      severity: enumOf(SEVERITIES, 'critical = actively losing viewers/sales, warning = suboptimal, positive = working well.'),
      title: str('Short label, max 6 words.'),
      note: str('Specific critique and what to do about it.'),
    }),
    'Chronological critique markers across the whole video. Cover the hook densely.',
    5,
    16,
  ),
  retentionCurve: arr(
    obj({
      second: int('Whole second from 0 to the final second of the video.'),
      retention: num('Predicted % of impressions still watching at this second (0–100). Second 0 is 100.'),
    }),
    'One point per whole second from 0 through the final second. Must be non-increasing.',
    2,
    61,
  ),
  dropOffRisks: arr(
    obj({
      timestamp: num('Second at which viewers are predicted to drop.'),
      severity: enumOf(SEVERITIES, 'Severity of the drop (use critical or warning).'),
      reason: str('Concrete cause (e.g. "Static logo card with no motion or VO").'),
      estimatedDrop: num('Estimated percentage-point retention loss at this moment.'),
    }),
    'The specific moments responsible for the steepest drops in the retention curve.',
    1,
    6,
  ),
  personas: arr(
    obj({
      name: str('Realistic first name and last initial.'),
      age: int('Age in years.'),
      descriptor: str('One-line life context and scrolling habits.'),
      segment: str('Audience segment, e.g. "Core buyer", "Skeptical comparer", "Lapsed customer", "Adjacent lookalike".'),
      resonanceScore: int('1–100 how strongly this ad resonates with this persona.'),
      reaction: str('Realistic first-person reaction while watching, in their own voice (1–3 sentences). Reference specific moments.'),
      primaryObjection: str('Their main objection or reason not to act.'),
      purchaseTrigger: str('What would (or did) push them to act.'),
      likelyAction: enumOf(
        ['Scroll past', 'Watch, no action', 'Engage (like/comment/share)', 'Click through', 'Convert'],
        'Most likely behavior after seeing this ad in-feed.',
      ),
    }),
    'Exactly 4 distinct personas drawn from the target audience, including at least one skeptic.',
    4,
    4,
  ),
  fixes: arr(
    obj({
      priority: int('1 = highest priority. Ranked by expected lift relative to effort.'),
      title: str('Imperative, specific edit, e.g. "Cut 0:00–0:01.5 to start mid-action".'),
      description: str('Exactly how to execute the edit.'),
      timestamp: nullableNum('Second the fix applies to, or null if global.'),
      category: enumOf(MARKER_CATEGORIES, 'Aspect of the ad this fix targets.'),
      effort: enumOf(LEVELS, 'Production effort required.'),
      expectedLift: enumOf(LEVELS, 'Expected performance lift.'),
      liftRationale: str('Why this should move the metric tied to the primary goal.'),
    }),
    'Prioritized, high-impact edit list.',
    4,
    10,
  ),
  hookRewrites: arr(
    obj({
      title: str('Short name for the hook concept.'),
      angle: str('Strategic angle, e.g. "Problem-agitation", "Pattern interrupt", "Social proof", "Curiosity gap".'),
      visual: str('Shot-by-shot visual direction for 0:00–0:03, achievable with the existing footage where possible.'),
      script: str('Exact spoken line(s) for the first 3 seconds.'),
      onScreenText: str('Exact on-screen text overlay for the first 3 seconds.'),
      whyItWorks: str('Why this beats the current opening for this platform and audience.'),
    }),
    'Exactly 3 alternative hooks for the first 3 seconds, each using a different angle.',
    3,
    3,
  ),
});
