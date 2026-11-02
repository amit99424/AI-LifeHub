/**
 * AI engine: insights, recommendations, journal NLP and the personal assistant.
 *
 * Pipeline (see README): collect → clean → feature-engineer → prompt → LLM →
 * validate → persist. The LLM receives only the compact feature bundle, never
 * raw tables, and every number in the prompt is computed in features.ts.
 */
import { InsightType, type JournalEntry } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { collectActivityData, truncate } from './collector.js';
import { compactFeatures, computeFeatures, type FeatureBundle } from './features.js';
import { AIUnconfiguredError, complete, estimateTokens, parseJsonLoose, truncateToTokens, type LLMMessage } from './llm.js';
import { config } from '../config.js';
import { addDaysKey, todayKey } from '../lib/dates.js';
import { ApiError } from '../lib/http.js';

// ─────────────────────────────────────────────────────────────
// usage metering
// ─────────────────────────────────────────────────────────────
async function bumpUsage(userId: string, patch: { chatMessages?: number; insights?: number; journalAnalyses?: number; tokensIn?: number; tokensOut?: number }) {
  const date = new Date(`${todayKey('UTC')}T00:00:00.000Z`);
  await prisma.userUsage.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      chatMessages: patch.chatMessages ?? 0,
      insights: patch.insights ?? 0,
      journalAnalyses: patch.journalAnalyses ?? 0,
      tokensIn: patch.tokensIn ?? 0,
      tokensOut: patch.tokensOut ?? 0,
    },
    update: {
      chatMessages: { increment: patch.chatMessages ?? 0 },
      insights: { increment: patch.insights ?? 0 },
      journalAnalyses: { increment: patch.journalAnalyses ?? 0 },
      tokensIn: { increment: patch.tokensIn ?? 0 },
      tokensOut: { increment: patch.tokensOut ?? 0 },
    },
  });
}

export async function usageToday(userId: string) {
  const date = new Date(`${todayKey('UTC')}T00:00:00.000Z`);
  const usage = await prisma.userUsage.findUnique({ where: { userId_date: { userId, date } } });
  return {
    chatMessages: usage?.chatMessages ?? 0,
    insights: usage?.insights ?? 0,
    journalAnalyses: usage?.journalAnalyses ?? 0,
    tokensIn: usage?.tokensIn ?? 0,
    tokensOut: usage?.tokensOut ?? 0,
    limits: {
      chatMessages: config.AI_CHAT_DAILY_LIMIT,
      insights: config.AI_INSIGHT_DAILY_LIMIT,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// feature bundle for a window
// ─────────────────────────────────────────────────────────────
export async function buildFeatureBundle(userId: string, tz: string, windowDays: number) {
  const today = todayKey(tz);
  const fromKey = addDaysKey(today, -(windowDays - 1));
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${addDaysKey(today, 1)}T00:00:00.000Z`);
  const data = await collectActivityData(userId, { from, to, tz });
  const features = computeFeatures(data, { from, to, tz, todayKey: today });
  return { features, data, today, fromKey };
}

const BASE_SYSTEM = `You are the analysis engine inside AI-LifeHub, a personal productivity companion.
Rules you must never break:
1. Only use the numbers in the DATA block. Never invent, estimate or extrapolate a metric that is not present.
2. If the data is too sparse for a claim, say so plainly and ask for more activity instead of guessing.
3. Correlations are correlations: write "has tended to", never "causes", "proves" or "because of".
4. You are not a doctor or therapist. Never diagnose, never give medical or psychological advice. Mood data is self-reported.
5. Be concise, specific and warm. Reference the user's actual numbers when you make a point.
6. No emojis, no markdown headings. Plain sentences and short bullet-like lines are enough.`;

function windowLabel(f: FeatureBundle) {
  return `${f.window.from} to ${f.window.to} (${f.window.days} days, timezone ${f.window.tz})`;
}

// ─────────────────────────────────────────────────────────────
// Insight generation
// ─────────────────────────────────────────────────────────────

const INSIGHT_SPECS: Record<
  Exclude<InsightType, 'WEEKLY_SUMMARY'>,
  { label: string; needs: (f: FeatureBundle) => boolean; focus: string }
> = {
  PRODUCTIVITY: {
    label: 'Productivity patterns',
    needs: (f) => f.availability.tasksCompleted >= 5 || f.availability.completedSessions >= 3,
    focus:
      'Identify WHEN this person is most productive (hour buckets, weekdays), how their completion rate and on-time rate look, and what their task volume says. Give 2-3 concrete scheduling recommendations.',
  },
  HABIT: {
    label: 'Habit consistency',
    needs: (f) => f.availability.habitLogs >= 5,
    focus:
      'Analyse habit consistency, streaks, which habits are strongest/weakest and which weekday they miss most. Recommend 2-3 realistic adjustments (never suggest doing everything at once).',
  },
  OVERLOAD: {
    label: 'Task overload check',
    needs: (f) => f.tasks.openCount >= 5 || f.tasks.overdueOpen >= 2,
    focus:
      'Check for overload: open task count, overdue items, high-priority accumulation, low completion rate, late completions. If overloaded, recommend a triage plan. If not, say so briefly.',
  },
  MOOD: {
    label: 'Mood and productivity',
    needs: (f) => f.availability.sufficientForMoodCorrelation,
    focus:
      'Compare self-reported mood against task completions and focus minutes using the derived moodVsProductivity table. Describe tendencies only, state clearly that this is correlation and self-reported, and suggest one gentle experiment.',
  },
  JOURNAL: {
    label: 'Journal themes',
    needs: (f) => f.journal.analyzedEntries >= 1 || f.journal.entries >= 1,
    focus:
      'Summarise themes, sentiment mix and recurring productivity topics from the journal data. Quote at most one short phrase. Suggest what to notice or write about next.',
  },
  ROUTINE: {
    label: 'Routine signals',
    needs: (f) => f.routine.daysRecorded >= 3,
    focus:
      'Use sleep, screen time, exercise and meditation data with the derived sleepVsProductivity and screenVsProductivity tables. Describe tendencies only and suggest one small routine change.',
  },
};

export interface GeneratedInsight {
  id?: string;
  type: InsightType;
  title: string;
  body: string;
  recommendations: string[];
  confidence: 'low' | 'medium' | 'high';
  dataPoints?: unknown;
  createdAt?: Date;
}

function confidenceFor(f: FeatureBundle, type: InsightType): 'low' | 'medium' | 'high' {
  const days = f.availability.daysWithAnyActivity;
  if (type === 'MOOD') return f.availability.sufficientForMoodCorrelation && days >= 14 ? 'medium' : 'low';
  if (days >= 21 && f.availability.tasksCompleted >= 20) return 'high';
  if (days >= 7) return 'medium';
  return 'low';
}

interface RawInsight {
  title?: string;
  body?: string;
  recommendations?: string[];
}

export async function generateInsight(
  userId: string,
  type: Exclude<InsightType, 'WEEKLY_SUMMARY'> | 'WEEKLY_SUMMARY',
  opts: { windowDays?: number; tz: string; force?: boolean },
): Promise<GeneratedInsight | { skipped: string }> {
  const windowDays = opts.windowDays ?? (type === 'WEEKLY_SUMMARY' ? 7 : 30);
  const { features } = await buildFeatureBundle(userId, opts.tz, windowDays);

  if (type !== 'WEEKLY_SUMMARY') {
    const spec = INSIGHT_SPECS[type];
    if (!spec.needs(features)) {
      return { skipped: `Not enough data for ${spec.label.toLowerCase()} yet. ${features.availability.missing.slice(0, 2).join('; ')}` };
    }
  } else if (!features.availability.sufficientForPatterns) {
    return { skipped: 'A weekly summary needs at least 5 days of activity.' };
  }

  // Cache: don't burn tokens regenerating the same insight for the same window.
  if (!opts.force) {
    const recent = await prisma.aIInsight.findFirst({
      where: {
        userId,
        type: type as InsightType,
        dismissed: false,
        createdAt: { gte: new Date(Date.now() - (type === 'WEEKLY_SUMMARY' ? 6 * 3600_000 : 12 * 3600_000)) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) return insightDto(recent);
  }

  const focus =
    type === 'WEEKLY_SUMMARY'
      ? 'Write a short weekly progress summary: what moved forward, what stalled, one thing to repeat next week and one thing to drop.'
      : INSIGHT_SPECS[type].focus;

  const dataBlock = truncateToTokens(compactFeatures(features), config.AI_MAX_CONTEXT_TOKENS);
  const messages: LLMMessage[] = [
    { role: 'system', content: `${BASE_SYSTEM}\n\nReturn ONLY JSON: {"title": string (max 60 chars), "body": string (2-4 sentences, max 90 words), "recommendations": string[] (2-3 items, each max 20 words, imperative)}.` },
    {
      role: 'user',
      content: `TASK: ${focus}\n\nWINDOW: ${windowLabel(features)}\n\nDATA (computed from the user's real records):\n${dataBlock}`,
    },
  ];

  const result = await complete(messages, { json: true, maxTokens: 900 });
  const parsed = parseJsonLoose<RawInsight>(result.text);
  const title = (parsed.title ?? 'Insight').toString().slice(0, 80);
  const body = (parsed.body ?? '').toString().slice(0, 1200);
  if (!body.trim()) throw new ApiError(502, 'The model returned an empty insight', 'ai_empty');

  const recommendations = (parsed.recommendations ?? [])
    .filter((r) => typeof r === 'string' && r.trim())
    .slice(0, 3)
    .map((r) => r.trim().slice(0, 200));

  const saved = await prisma.aIInsight.create({
    data: {
      userId,
      type: type as InsightType,
      title,
      body,
      recommendations,
      confidence: confidenceFor(features, type as InsightType),
      dataPoints: features as unknown as object,
      provider: result.provider,
      model: result.model,
      periodStart: new Date(`${features.window.from}T00:00:00.000Z`),
      periodEnd: new Date(`${features.window.to}T00:00:00.000Z`),
    },
  });
  await bumpUsage(userId, { insights: 1, tokensIn: result.tokensIn ?? estimateTokens(messages.map((m) => m.content).join()), tokensOut: result.tokensOut ?? estimateTokens(result.text) });
  return insightDto(saved);
}

export function insightDto(i: {
  id: string;
  type: InsightType;
  title: string;
  body: string;
  recommendations: string[];
  confidence: string;
  provider: string;
  model: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  dismissed: boolean;
  pinned: boolean;
  isDemo: boolean;
  createdAt: Date;
}) {
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    body: i.body,
    recommendations: i.recommendations,
    confidence: (['low', 'medium', 'high'].includes(i.confidence) ? i.confidence : 'low') as 'low' | 'medium' | 'high',
    provider: i.provider,
    model: i.model,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    dismissed: i.dismissed,
    pinned: i.pinned,
    isDemo: i.isDemo,
    createdAt: i.createdAt,
  };
}

/** Generates the dashboard set: weekly summary + the most relevant signals. */
export async function generateInsightSet(userId: string, tz: string, opts: { force?: boolean; types?: (keyof typeof INSIGHT_SPECS | 'WEEKLY_SUMMARY')[] } = {}) {
  const types = opts.types ?? ['WEEKLY_SUMMARY', 'PRODUCTIVITY', 'HABIT', 'OVERLOAD', 'MOOD'];
  const out: { type: string; insight?: GeneratedInsight; skipped?: string; error?: string }[] = [];
  for (const t of types) {
    try {
      const r = await generateInsight(userId, t as Exclude<InsightType, 'JOURNAL'>, { tz, force: opts.force, windowDays: t === 'WEEKLY_SUMMARY' ? 7 : 30 });
      if ('skipped' in r) out.push({ type: t, skipped: r.skipped });
      else out.push({ type: t, insight: r });
    } catch (err) {
      if (err instanceof AIUnconfiguredError) throw err;
      out.push({ type: t, error: (err as Error).message });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Journal NLP
// ─────────────────────────────────────────────────────────────
interface JournalAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore: number;
  summary: string;
  themes: string[];
  productivityNotes: string;
}

export async function analyzeJournalEntry(userId: string, entry: JournalEntry) {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `${BASE_SYSTEM}\n\nYou are analysing a private journal entry. Return ONLY JSON:
{"sentiment": "positive"|"neutral"|"negative"|"mixed", "sentimentScore": number between -1 and 1, "summary": string (max 40 words, second person), "themes": string[] (2-5 short lowercase themes such as "deep work", "sleep", "stress", "learning"), "productivityNotes": string (max 30 words, one observation about work/productivity if present, else "")}
This is sentiment analysis of text, not a psychological assessment. Never diagnose.`,
    },
    {
      role: 'user',
      content: `DATE: ${entry.date.toISOString().slice(0, 10)}\nTITLE: ${truncate(entry.title ?? '', 120)}\nENTRY:\n${truncate(entry.content, 6000)}`,
    },
  ];
  const result = await complete(messages, { json: true, maxTokens: 500 });
  const parsed = parseJsonLoose<JournalAnalysis>(result.text);

  const sentiment = ['positive', 'neutral', 'negative', 'mixed'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
  const score = Math.max(-1, Math.min(1, Number(parsed.sentimentScore) || 0));
  const updated = await prisma.journalEntry.update({
    where: { id: entry.id },
    data: {
      sentiment,
      sentimentScore: score,
      summary: (parsed.summary ?? '').toString().slice(0, 400),
      themes: Array.isArray(parsed.themes)
        ? parsed.themes.filter((t) => typeof t === 'string' && t.trim()).slice(0, 6).map((t) => t.trim().toLowerCase().slice(0, 40))
        : [],
      productivityNotes: (parsed.productivityNotes ?? '').toString().slice(0, 300) || null,
      analyzedAt: new Date(),
    },
  });
  await bumpUsage(userId, {
    journalAnalyses: 1,
    tokensIn: result.tokensIn ?? estimateTokens(messages.map((m) => m.content).join()),
    tokensOut: result.tokensOut ?? estimateTokens(result.text),
  });
  return { entry: updated, provider: result.provider, model: result.model };
}

// ─────────────────────────────────────────────────────────────
// Personal assistant
// ─────────────────────────────────────────────────────────────
export async function askAssistant(
  userId: string,
  opts: { tz: string; history: { role: 'user' | 'assistant'; content: string }[]; question: string; windowDays?: number },
) {
  const windowDays = opts.windowDays ?? 30;
  const { features } = await buildFeatureBundle(userId, opts.tz, windowDays);
  const dataBlock = truncateToTokens(compactFeatures(features), config.AI_MAX_CONTEXT_TOKENS);

  const availabilityNote = features.availability.sufficientForPatterns
    ? ''
    : `\n\nDATA LIMIT: this account only has ${features.availability.daysWithAnyActivity} day(s) of activity. If the question needs history, say what is missing (${features.availability.missing.slice(0, 3).join('; ') || 'more activity'}) and give what you can from the available data.`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `${BASE_SYSTEM}

You are the user's personal productivity assistant inside AI-LifeHub. Answer their question using their DATA block. Keep answers under 160 words unless they ask for a detailed breakdown. Use short lines or a compact list when helpful. If they ask something unrelated to their data, answer briefly and steer back to what the data can help with.

DATA WINDOW: ${windowLabel(features)}
DATA:
${dataBlock}${availabilityNote}`,
    },
    ...opts.history.slice(-8).map((m) => ({ role: m.role, content: truncate(m.content, 1500) }) as LLMMessage),
    { role: 'user', content: opts.question },
  ];

  const result = await complete(messages, { maxTokens: 900 });
  await bumpUsage(userId, {
    chatMessages: 1,
    tokensIn: result.tokensIn ?? estimateTokens(messages.map((m) => m.content).join()),
    tokensOut: result.tokensOut ?? estimateTokens(result.text),
  });
  return {
    answer: result.text.trim(),
    provider: result.provider,
    model: result.model,
    dataWindow: features.window,
    availability: features.availability,
  };
}
