/**
 * The monthly review: a written reading of a report that is already computed.
 *
 * The split matters. `buildReport` produces the figures; this file only asks a
 * model to talk about them. When the model is unavailable the same figures come
 * back as a plainly-labelled arithmetic summary, so the page still answers —
 * and never pretends arithmetic is advice.
 */
import { config } from '../config.js';
import { AIUnconfiguredError, complete } from './llm.js';
import { reportForPrompt, type Report } from './reports.js';

const SYSTEM = `You are the monthly reviewer inside AI-LifeHub, a personal life management app.
Rules:
1. Use ONLY the REPORT block. Every number you write must appear in it. Never estimate, extrapolate or invent one.
2. If a figure says "not recorded", say it was not recorded. Never treat it as zero and never fill the gap with a guess.
3. Separate what the records show from what you suggest. Accomplishments and improvements are facts from the REPORT; priorities are your suggestions and must be labelled as such.
4. Never claim one thing caused another. "Focus time rose while stress fell" is allowed; "less stress improved your focus" is not.
5. Never compare the user with other people or with an average user. Compare only with their own previous period, and only when the REPORT gives that comparison.
6. If the REPORT shows very few days with records, say so in one line and keep the review short.
7. Be concrete and practical. No generic productivity advice, no motivational filler.
Reply in markdown with exactly these headings:
## What the records show
## Improvements supported by records
## Areas needing attention
## Goals and skills
## Suggested priorities for next month
Keep the whole reply under 400 words.`;

export interface MonthlyReview {
  text: string;
  /** 'AI' when a model wrote it, 'FALLBACK' when it is the records summarised. */
  source: 'AI' | 'FALLBACK';
  provider: string | null;
  model: string | null;
  generatedAt: string;
  /** Present on a fallback so the UI can say why the prose is missing. */
  note: string | null;
}

/**
 * Deterministic summary of the same report. Arithmetic, labelled as such —
 * this is what the user sees when no model is configured or the call fails.
 */
export function fallbackReview(r: Report): MonthlyReview {
  const lines: string[] = [];
  lines.push('## What the records show');
  const m = (k: string) => r.metrics.find((x) => x.key === k);
  const fmt = (k: string) => {
    const f = m(k);
    if (!f || f.value === null) return 'not recorded';
    return `${f.value}${f.unit ? ` ${f.unit}` : ''}`;
  };
  lines.push(
    `Over ${r.range.from} to ${r.range.to}, ${r.totals.daysWithData} of ${r.totals.days} days have a record: ${fmt('tasksCompleted')} tasks completed, ${fmt('focusMinutes')} focus minutes, ${fmt('habitCheckins')} habit check-ins.`,
  );
  lines.push('');

  lines.push('## Improvements supported by records');
  const improved = r.metrics.filter((x) => x.change !== null && x.change > 0 && x.recorded);
  if (improved.length) {
    for (const x of improved) lines.push(`- ${x.label}: ${x.previous} → ${x.value}${x.unit ? ` ${x.unit}` : ''} (previous period).`);
  } else {
    lines.push('- No metric rose against the previous period, so there is nothing to report here.');
  }
  lines.push('');

  lines.push('## Areas needing attention');
  if (r.needsAttention.length) for (const n of r.needsAttention) lines.push(`- ${n}`);
  else lines.push('- Nothing in the records points to a problem in this period.');
  lines.push('');

  lines.push('## Goals and skills');
  if (r.goals.length) {
    for (const g of r.goals) {
      lines.push(
        `- ${g.title}: ${g.current ?? 'not recorded'} of ${g.target ?? 'no target'}${g.metric ? ` ${g.metric}` : ''}${g.fraction === null ? ' (no percentage computable)' : ` (${Math.round(g.fraction * 100)}%)`}${g.deadline ? `, due ${g.deadline}` : ''}.`,
      );
    }
  } else lines.push('- No active goals.');
  if (r.skills.length) for (const s of r.skills) lines.push(`- ${s.name}: ${s.level}, ${s.practiceMinutes} minutes on ${s.practiceDays} day(s), ${s.levelsGained} level change(s).`);
  else lines.push('- No skills are tracked.');
  lines.push('');

  lines.push('## Suggested priorities for next month');
  lines.push('_The AI writer is not available, so this section is left to you rather than filled with generic advice._');
  lines.push('- These figures are arithmetic on your own records, not a recommendation.');
  if (r.gaps.length) {
    lines.push('');
    lines.push(`Not recorded: ${r.gaps.join(' ')}`);
  }

  return {
    text: lines.join('\n'),
    source: 'FALLBACK',
    provider: null,
    model: null,
    generatedAt: new Date().toISOString(),
    note: 'The AI writer is not configured or did not answer, so this is your records summarised rather than a written review.',
  };
}

/** Ask the model to write the review. Falls back rather than failing. */
export async function generateMonthlyReview(r: Report): Promise<MonthlyReview> {
  try {
    const res = await complete(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `REPORT:\n${reportForPrompt(r)}\n\nWrite the monthly review.` },
      ],
      { maxTokens: Math.min(1400, config.AI_MAX_CONTEXT_TOKENS) },
    );
    const text = res.text.trim();
    if (text.length < 80) return fallbackReview(r);
    return { text, source: 'AI', provider: res.provider, model: res.model, generatedAt: new Date().toISOString(), note: null };
  } catch (err) {
    if (err instanceof AIUnconfiguredError) return fallbackReview(r);
    return fallbackReview(r);
  }
}
