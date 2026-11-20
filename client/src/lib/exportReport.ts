import { PILLAR_META, type AdAuditReport, type PillarKey } from '../../../shared/types';
import { fmtTime } from './format';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'ad';

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (r: AdAuditReport) => `adpulse-audit-${slug(r.video.fileName)}-${r.createdAt.slice(0, 10)}`;

export function exportJson(r: AdAuditReport) {
  download(JSON.stringify(r, null, 2), `${baseName(r)}.json`, 'application/json');
}

export function reportToMarkdown(r: AdAuditReport): string {
  const L: string[] = [];
  const t = (s: number | null) => (s === null ? '—' : `\`${fmtTime(s)}\``);
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

  L.push(`# AdPulse AI — Creative Audit: ${r.video.fileName}`, '');
  L.push(
    `**Overall viability:** ${r.overallScore}/100 · **Verdict:** ${r.verdict}  `,
    `**Platform:** ${r.context.platform} · **Goal:** ${r.context.primaryGoal}` +
      (r.context.category ? ` · **Category:** ${r.context.category}` : '') +
      (r.context.targetAudience ? `  \n**Target audience:** ${r.context.targetAudience}` : ''),
    `_Duration ${fmtTime(r.video.durationSeconds)} · Generated ${new Date(r.createdAt).toLocaleString()} · Model ${r.model}_`,
    '',
  );
  L.push('## Executive summary', '', r.executiveSummary, '', `> **Why "${r.verdict}":** ${r.verdictRationale}`, '');
  L.push('## What happens in the ad', '', r.adSummary, '');

  L.push('## Pillar scores', '', '| Pillar | Score | Rationale |', '|---|---:|---|');
  (Object.keys(PILLAR_META) as PillarKey[]).forEach((k) =>
    L.push(`| ${PILLAR_META[k].label} | ${r.pillars[k].score} | ${cell(r.pillars[k].rationale)} |`),
  );
  L.push('');
  (Object.keys(PILLAR_META) as PillarKey[]).forEach((k) => {
    const p = r.pillars[k];
    L.push(`### ${PILLAR_META[k].label} — ${p.score}/100`, '');
    if (p.strengths.length) L.push('**Strengths**', ...p.strengths.map((s) => `- ${s}`), '');
    if (p.weaknesses.length) L.push('**Weaknesses**', ...p.weaknesses.map((s) => `- ${s}`), '');
    if (p.evidence.length) L.push('**Evidence**', ...p.evidence.map((e) => `- ${t(e.timestamp)} ${e.note}`), '');
  });

  const d = r.detected;
  L.push('## Detected elements', '');
  L.push(
    `- First spoken line: ${d.firstSpokenLine ? `“${d.firstSpokenLine}”` : '_none_'}`,
    `- First on-screen text: ${d.firstOnScreenText ? `“${d.firstOnScreenText}”` : '_none_'}`,
    `- CTA: ${d.ctaText ? `“${d.ctaText}”` : '_none detected_'}`,
    `- Voiceover: ${d.hasVoiceover ? 'yes' : 'no'} · Music: ${d.hasMusic ? 'yes' : 'no'} · Captions: ${d.hasCaptions ? 'yes' : 'no'}`,
    `- Brand first appears: ${t(d.brandFirstAppearsAt)} · Product first appears: ${t(d.productFirstAppearsAt)}`,
    `- Cuts: ~${d.estimatedCutCount} · Avg shot length: ${d.averageShotLengthSeconds}s`,
    '',
  );

  L.push('## Prioritized fix list', '', '| # | Fix | When | Effort | Lift |', '|---:|---|---|---|---|');
  r.fixes.forEach((f) => L.push(`| ${f.priority} | **${cell(f.title)}** — ${cell(f.description)} | ${t(f.timestamp)} | ${f.effort} | ${f.expectedLift} |`));
  L.push('');

  L.push('## Alternative hooks (0:00–0:03)', '');
  r.hookRewrites.forEach((h, i) => {
    L.push(`### ${i + 1}. ${h.title} _(${h.angle})_`, '');
    L.push(`- **Visual:** ${h.visual}`, `- **Script:** “${h.script}”`, `- **On-screen text:** “${h.onScreenText}”`, `- **Why it works:** ${h.whyItWorks}`, '');
  });

  L.push('## Simulated retention', '');
  const marks = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60].filter((s) => s < r.retentionCurve.length);
  L.push(`| Second | ${marks.map((s) => fmtTime(s)).join(' | ')} |`, `|---|${marks.map(() => '---:').join('|')}|`);
  L.push(`| Retention | ${marks.map((s) => `${Math.round(r.retentionCurve[s].retention)}%`).join(' | ')} |`, '');
  if (r.dropOffRisks.length) {
    L.push('**Drop-off risks**', ...r.dropOffRisks.map((x) => `- ${t(x.timestamp)} (−${x.estimatedDrop} pts, ${x.severity}) ${x.reason}`), '');
  }

  L.push('## Simulated audience focus group', '');
  r.personas.forEach((p) => {
    L.push(`### ${p.name}, ${p.age} — ${p.segment} · resonance ${p.resonanceScore}/100`, '');
    L.push(`_${p.descriptor}_`, '', `> “${p.reaction}”`, '');
    L.push(`- **Objection:** ${p.primaryObjection}`, `- **Purchase trigger:** ${p.purchaseTrigger}`, `- **Likely action:** ${p.likelyAction}`, '');
  });

  L.push('## Timeline critique', '');
  r.timelineMarkers.forEach((m) =>
    L.push(`- ${t(m.timestamp)}${m.endTimestamp !== null ? `–${t(m.endTimestamp)}` : ''} **[${m.severity}/${m.category}] ${m.title}** — ${m.note}`),
  );
  L.push('', '---', '_Generated by AdPulse AI. Retention and persona reactions are AI simulations, not measured data._', '');
  return L.join('\n');
}

export function exportMarkdown(r: AdAuditReport) {
  download(reportToMarkdown(r), `${baseName(r)}.md`, 'text/markdown');
}
