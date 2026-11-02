/**
 * Deterministic feature engineering.
 *
 * Every number the LLM sees is computed here from real rows — the model is
 * never asked to "count" and never receives raw table dumps. It also produces
 * the data-availability report used to decide whether enough history exists
 * to make claims at all.
 */
import type { ActivityData } from './collector.js';
import { truncate } from './collector.js';
import {
  dateKey,
  hourBucket,
  HOUR_BUCKETS,
  localDateKey,
  localHour,
  rangeKeys,
  weekdayName,
  isWeekendKey,
  type HourBucket,
} from '../lib/dates.js';

export interface TaskFeatures {
  totalCreated: number;
  totalCompleted: number;
  completionRate: number;
  avgTimeToCompleteHours: number | null;
  overdueOpen: number;
  openCount: number;
  highPriorityOpen: number;
  openDueToday: number;
  byPriority: Record<string, { created: number; completed: number }>;
  byCategory: Record<string, number>;
  completionsByBucket: Record<HourBucket, number>;
  completionsByWeekday: Record<string, number>;
  completedOnTime: number;
  completedLate: number;
  busiestDay: { date: string; completed: number } | null;
  oldestOpenDays: number | null;
}

export interface HabitFeatures {
  activeHabits: number;
  totalHabits: number;
  overallCompletionRate: number; // across the window, per active habit per day
  perHabit: {
    name: string;
    frequency: string;
    completions: number;
    expected: number;
    rate: number;
    currentStreak: number;
    longestStreak: number;
    lastDone: string | null;
  }[];
  bestHabit: string | null;
  weakestHabit: string | null;
  missedMostDay: string | null;
}

export interface MoodFeatures {
  entries: number;
  avgScore: number | null;
  distribution: Record<string, number>;
  avgFocus: number | null;
  avgEnergy: number | null;
  trend: 'improving' | 'declining' | 'stable' | null;
}

export interface SessionFeatures {
  totalSessions: number;
  totalMinutes: number;
  avgSessionMinutes: number | null;
  byCategory: Record<string, number>;
  byBucket: Record<HourBucket, number>;
  avgFocus: number | null;
  longestSessionMinutes: number | null;
}

export interface JournalFeatures {
  entries: number;
  analyzedEntries: number;
  avgSentiment: number | null;
  sentimentMix: Record<string, number>;
  topThemes: { theme: string; count: number }[];
  snippets: { date: string; summary: string; sentiment: string | null }[];
}

export interface RoutineFeatures {
  daysRecorded: number;
  avgSleepHours: number | null;
  avgScreenHours: number | null;
  avgExerciseMinutes: number | null;
  avgMeditationMinutes: number | null;
  avgSocialMinutes: number | null;
}

export interface DataAvailability {
  daysWithAnyActivity: number;
  tasksCompleted: number;
  habitLogs: number;
  moodEntries: number;
  journalEntries: number;
  completedSessions: number;
  routineDays: number;
  sufficientForPatterns: boolean;
  sufficientForMoodCorrelation: boolean;
  missing: string[];
}

export interface FeatureBundle {
  window: { from: string; to: string; days: number; tz: string };
  tasks: TaskFeatures;
  habits: HabitFeatures;
  mood: MoodFeatures;
  sessions: SessionFeatures;
  journal: JournalFeatures;
  routine: RoutineFeatures;
  availability: DataAvailability;
  derived: {
    moodVsProductivity: { label: string; moodScore: number; completions: number; sessions: number; days: number }[];
    sleepVsProductivity: { bucket: string; avgSleepHours: number; completionsPerDay: number; days: number }[];
    screenVsProductivity: { bucket: string; avgScreenHours: number; completionsPerDay: number; days: number }[];
  };
}

const MOOD_SCORE: Record<string, number> = { GREAT: 5, GOOD: 4, NEUTRAL: 3, BAD: 2, TERRIBLE: 1 };

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n: number | null, digits = 2): number | null {
  if (n === null || Number.isNaN(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function streaks(logDates: Set<string>, todayKey: string, allowTodayGap = true): { current: number; longest: number } {
  if (!logDates.size) return { current: 0, longest: 0 };
  const sorted = [...logDates].sort();
  // longest
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    if (cur - prev === 86_400_000) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }
  // current: walk back from today (or yesterday if today not yet done)
  let current = 0;
  let cursor = new Date(`${todayKey}T00:00:00Z`);
  if (!logDates.has(todayKey) && allowTodayGap) cursor = new Date(cursor.getTime() - 86_400_000);
  for (let i = 0; i < 400; i++) {
    const k = cursor.toISOString().slice(0, 10);
    if (logDates.has(k)) {
      current += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    } else break;
  }
  return { current, longest };
}

export function computeFeatures(data: ActivityData, opts: { from: Date; to: Date; tz: string; todayKey: string }): FeatureBundle {
  const { from, to, tz, todayKey } = opts;
  const days = rangeKeys(dateKey(from), dateKey(new Date(to.getTime() - 86_400_000)));

  // ── tasks ────────────────────────────────────────────────
  const created = data.tasks.length;
  const completed = data.completedTasks;
  const byPriority: Record<string, { created: number; completed: number }> = {};
  for (const t of data.tasks) {
    byPriority[t.priority] ??= { created: 0, completed: 0 };
    byPriority[t.priority].created += 1;
  }
  for (const t of completed) {
    byPriority[t.priority] ??= { created: 0, completed: 0 };
    byPriority[t.priority].completed += 1;
  }

  const byCategory: Record<string, number> = {};
  for (const t of completed) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;

  const completionsByBucket = Object.fromEntries(HOUR_BUCKETS.map((b) => [b, 0])) as Record<HourBucket, number>;
  const completionsByWeekday: Record<string, number> = {};
  let onTime = 0;
  let late = 0;
  const perDayCompleted = new Map<string, number>();
  const times: number[] = [];

  for (const t of completed) {
    if (!t.completedAt) continue;
    completionsByBucket[hourBucket(localHour(t.completedAt, tz))] += 1;
    const wk = weekdayName(localDateKey(t.completedAt, tz));
    completionsByWeekday[wk] = (completionsByWeekday[wk] ?? 0) + 1;
    if (t.dueDate) {
      if (t.completedAt <= new Date(new Date(t.dueDate).getTime() + 86_400_000)) onTime += 1;
      else late += 1;
    }
    if (t.timeTakenSec && t.timeTakenSec > 0) times.push(t.timeTakenSec / 3600);
    const dk = localDateKey(t.completedAt, tz);
    perDayCompleted.set(dk, (perDayCompleted.get(dk) ?? 0) + 1);
  }

  const now = new Date();
  const overdueOpen = data.openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length;
  const openDueToday = data.openTasks.filter(
    (t) => t.dueDate && localDateKey(new Date(t.dueDate), tz) === todayKey,
  ).length;
  const highPriorityOpen = data.openTasks.filter(
    (t) => t.priority === 'HIGH' || t.priority === 'URGENT',
  ).length;
  const oldestOpenDays = data.openTasks.length
    ? Math.max(...data.openTasks.map((t) => Math.round((now.getTime() - new Date(t.createdAt).getTime()) / 86_400_000)))
    : null;

  let busiestDay: { date: string; completed: number } | null = null;
  for (const [date, n] of perDayCompleted) {
    if (!busiestDay || n > busiestDay.completed) busiestDay = { date, completed: n };
  }

  const taskFeatures: TaskFeatures = {
    totalCreated: created,
    totalCompleted: completed.length,
    completionRate: round(created ? completed.length / created : 0) ?? 0,
    avgTimeToCompleteHours: round(mean(times), 1),
    overdueOpen,
    openCount: data.openTasks.length,
    highPriorityOpen,
    openDueToday,
    byPriority,
    byCategory,
    completionsByBucket,
    completionsByWeekday,
    completedOnTime: onTime,
    completedLate: late,
    busiestDay,
    oldestOpenDays,
  };

  // ── habits ───────────────────────────────────────────────
  const logsByHabit = new Map<string, Set<string>>();
  for (const log of data.habitLogs) {
    const k = dateKey(log.date);
    const set = logsByHabit.get(log.habitId) ?? new Set<string>();
    set.add(k);
    logsByHabit.set(log.habitId, set);
  }
  const activeHabits = data.habits.filter((h) => h.active);
  const perHabit = data.habits.map((h) => {
    const set = logsByHabit.get(h.id) ?? new Set<string>();
    const completions = set.size;
    const expected = h.frequency === 'DAILY' ? days.length : Math.min(days.length, h.targetPerWeek * Math.ceil(days.length / 7));
    const st = streaks(set, todayKey);
    const lastDone = set.size ? [...set].sort().at(-1)! : null;
    return {
      name: h.name,
      frequency: h.frequency,
      completions,
      expected,
      rate: round(expected ? completions / expected : 0) ?? 0,
      currentStreak: st.current,
      longestStreak: st.longest,
      lastDone,
    };
  });

  const rated = perHabit.filter((h) => h.expected > 0);
  const overall =
    rated.length && days.length
      ? rated.reduce((acc, h) => acc + h.rate!, 0) / rated.length
      : 0;

  const missedByWeekday: Record<string, number> = {};
  for (const d of days) {
    if (!activeHabits.length) break;
    const done = data.habitLogs.filter((l) => dateKey(l.date) === d).length;
    if (done < activeHabits.length) {
      const wk = weekdayName(d);
      missedByWeekday[wk] = (missedByWeekday[wk] ?? 0) + (activeHabits.length - done);
    }
  }
  const missedMostDay = Object.entries(missedByWeekday).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const sortedByRate = [...rated].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

  const habitFeatures: HabitFeatures = {
    activeHabits: activeHabits.length,
    totalHabits: data.habits.length,
    overallCompletionRate: round(overall) ?? 0,
    perHabit,
    bestHabit: sortedByRate[0]?.name ?? null,
    weakestHabit: sortedByRate.length > 1 ? sortedByRate.at(-1)!.name : null,
    missedMostDay,
  };

  // ── mood ─────────────────────────────────────────────────
  const moodScores = data.moodLogs.map((m) => m.score);
  const distribution: Record<string, number> = {};
  for (const m of data.moodLogs) distribution[m.level] = (distribution[m.level] ?? 0) + 1;
  const half = Math.floor(data.moodLogs.length / 2);
  let trend: MoodFeatures['trend'] = null;
  if (data.moodLogs.length >= 4) {
    const first = mean(moodScores.slice(0, half))!;
    const second = mean(moodScores.slice(half))!;
    trend = second - first > 0.4 ? 'improving' : first - second > 0.4 ? 'declining' : 'stable';
  }
  const moodFeatures: MoodFeatures = {
    entries: data.moodLogs.length,
    avgScore: round(mean(moodScores), 2),
    distribution,
    avgFocus: round(mean(data.moodLogs.map((m) => m.focus).filter((x): x is number => typeof x === 'number')), 2),
    avgEnergy: round(mean(data.moodLogs.map((m) => m.energy).filter((x): x is number => typeof x === 'number')), 2),
    trend,
  };

  // ── sessions ─────────────────────────────────────────────
  const sessionByCategory: Record<string, number> = {};
  const byBucket = Object.fromEntries(HOUR_BUCKETS.map((b) => [b, 0])) as Record<HourBucket, number>;
  let totalMin = 0;
  let longest: number | null = null;
  for (const s of data.workSessions) {
    const mins = s.durationSec / 60;
    totalMin += mins;
    sessionByCategory[s.category] = (sessionByCategory[s.category] ?? 0) + Math.round(mins);
    byBucket[hourBucket(localHour(s.startedAt, tz))] += Math.round(mins);
    longest = Math.max(longest ?? 0, Math.round(mins));
  }
  const sessionFeatures: SessionFeatures = {
    totalSessions: data.workSessions.length,
    totalMinutes: Math.round(totalMin),
    avgSessionMinutes: round(mean(data.workSessions.map((s) => s.durationSec / 60)), 0),
    byCategory: sessionByCategory,
    byBucket,
    avgFocus: round(mean(data.workSessions.map((s) => s.focusScore).filter((x): x is number => typeof x === 'number')), 2),
    longestSessionMinutes: longest,
  };

  // ── journal ──────────────────────────────────────────────
  const analyzed = data.journalEntries.filter((j) => j.sentiment);
  const sentimentMix: Record<string, number> = {};
  for (const j of analyzed) sentimentMix[j.sentiment!] = (sentimentMix[j.sentiment!] ?? 0) + 1;
  const themeCount = new Map<string, number>();
  for (const j of data.journalEntries) {
    for (const t of j.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
  }
  const journalFeatures: JournalFeatures = {
    entries: data.journalEntries.length,
    analyzedEntries: analyzed.length,
    avgSentiment: round(mean(analyzed.map((j) => j.sentimentScore ?? 0)), 2),
    sentimentMix,
    topThemes: [...themeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([theme, count]) => ({ theme, count })),
    snippets: data.journalEntries.slice(0, 6).map((j) => ({
      date: dateKey(j.date),
      summary: truncate(j.summary || j.content, 220),
      sentiment: j.sentiment,
    })),
  };

  // ── routine ──────────────────────────────────────────────
  const routineFeatures: RoutineFeatures = {
    daysRecorded: data.dailyActivities.length,
    avgSleepHours: round(
      mean(data.dailyActivities.map((d) => d.sleepMinutes).filter((x): x is number => typeof x === 'number').map((m) => m / 60)),
      1,
    ),
    avgScreenHours: round(
      mean(data.dailyActivities.map((d) => d.screenMinutes).filter((x): x is number => typeof x === 'number').map((m) => m / 60)),
      1,
    ),
    avgExerciseMinutes: round(mean(data.dailyActivities.map((d) => d.exerciseMinutes).filter((x): x is number => typeof x === 'number')), 0),
    avgMeditationMinutes: round(mean(data.dailyActivities.map((d) => d.meditationMinutes).filter((x): x is number => typeof x === 'number')), 0),
    avgSocialMinutes: round(mean(data.dailyActivities.map((d) => d.socialMinutes).filter((x): x is number => typeof x === 'number')), 0),
  };

  // ── correlations (descriptive, computed, never invented) ──
  const completionsPerDay = new Map<string, number>();
  for (const [k, v] of perDayCompleted) completionsPerDay.set(k, v);
  const sessionsPerDay = new Map<string, number>();
  for (const s of data.workSessions) {
    const k = localDateKey(s.startedAt, tz);
    sessionsPerDay.set(k, (sessionsPerDay.get(k) ?? 0) + s.durationSec / 60);
  }

  const moodVsProductivity: FeatureBundle['derived']['moodVsProductivity'] = [];
  const moodGroups = new Map<number, { completions: number; sessions: number; days: number }>();
  for (const m of data.moodLogs) {
    const k = dateKey(m.date);
    const g = moodGroups.get(m.score) ?? { completions: 0, sessions: 0, days: 0 };
    g.completions += completionsPerDay.get(k) ?? 0;
    g.sessions += Math.round(sessionsPerDay.get(k) ?? 0);
    g.days += 1;
    moodGroups.set(m.score, g);
  }
  for (const [score, g] of [...moodGroups.entries()].sort((a, b) => b[0] - a[0])) {
    moodVsProductivity.push({
      label: Object.keys(MOOD_SCORE).find((k) => MOOD_SCORE[k] === score) ?? String(score),
      moodScore: score,
      completions: round(g.completions / g.days, 1)!,
      sessions: Math.round(g.sessions / g.days),
      days: g.days,
    });
  }

  const sleepVsProductivity: FeatureBundle['derived']['sleepVsProductivity'] = [];
  const sleepBuckets: { label: string; test: (h: number) => boolean }[] = [
    { label: '<6h', test: (h) => h < 6 },
    { label: '6-7h', test: (h) => h >= 6 && h < 7 },
    { label: '7-8h', test: (h) => h >= 7 && h < 8 },
    { label: '8h+', test: (h) => h >= 8 },
  ];
  const screenBuckets: { label: string; test: (h: number) => boolean }[] = [
    { label: '<2h', test: (h) => h < 2 },
    { label: '2-4h', test: (h) => h >= 2 && h < 4 },
    { label: '4-6h', test: (h) => h >= 4 && h < 6 },
    { label: '6h+', test: (h) => h >= 6 },
  ];
  for (const b of sleepBuckets) {
    const rows = data.dailyActivities.filter((d) => d.sleepMinutes != null && b.test(d.sleepMinutes / 60));
    if (!rows.length) continue;
    const comps = rows.reduce((acc, r) => acc + (completionsPerDay.get(dateKey(r.date)) ?? 0), 0);
    sleepVsProductivity.push({
      bucket: b.label,
      avgSleepHours: round(mean(rows.map((r) => r.sleepMinutes! / 60)), 1)!,
      completionsPerDay: round(comps / rows.length, 1)!,
      days: rows.length,
    });
  }
  const screenVsProductivity: FeatureBundle['derived']['screenVsProductivity'] = [];
  for (const b of screenBuckets) {
    const rows = data.dailyActivities.filter((d) => d.screenMinutes != null && b.test(d.screenMinutes / 60));
    if (!rows.length) continue;
    const comps = rows.reduce((acc, r) => acc + (completionsPerDay.get(dateKey(r.date)) ?? 0), 0);
    screenVsProductivity.push({
      bucket: b.label,
      avgScreenHours: round(mean(rows.map((r) => r.screenMinutes! / 60)), 1)!,
      completionsPerDay: round(comps / rows.length, 1)!,
      days: rows.length,
    });
  }

  // ── availability ─────────────────────────────────────────
  const activityDays = new Set<string>();
  for (const t of completed) if (t.completedAt) activityDays.add(localDateKey(t.completedAt, tz));
  for (const l of data.habitLogs) activityDays.add(dateKey(l.date));
  for (const m of data.moodLogs) activityDays.add(dateKey(m.date));
  for (const j of data.journalEntries) activityDays.add(dateKey(j.date));
  for (const s of data.workSessions) activityDays.add(localDateKey(s.startedAt, tz));

  const missing: string[] = [];
  if (completed.length < 5) missing.push('task completion history (need ≥5 completed tasks)');
  if (data.habitLogs.length < 5) missing.push('habit check-ins (need ≥5)');
  if (data.moodLogs.length < 3) missing.push('mood entries (need ≥3)');
  if (data.workSessions.length < 3) missing.push('focus sessions (need ≥3)');
  if (data.journalEntries.length < 1) missing.push('journal entries');
  if (data.dailyActivities.length < 3) missing.push('routine data such as sleep or screen time');

  const availability: DataAvailability = {
    daysWithAnyActivity: activityDays.size,
    tasksCompleted: completed.length,
    habitLogs: data.habitLogs.length,
    moodEntries: data.moodLogs.length,
    journalEntries: data.journalEntries.length,
    completedSessions: data.workSessions.length,
    routineDays: data.dailyActivities.length,
    sufficientForPatterns: activityDays.size >= 5 && completed.length + data.habitLogs.length >= 10,
    sufficientForMoodCorrelation: data.moodLogs.length >= 5 && completed.length >= 5,
    missing,
  };

  return {
    window: { from: dateKey(from), to: dateKey(new Date(to.getTime() - 86_400_000)), days: days.length, tz },
    tasks: taskFeatures,
    habits: habitFeatures,
    mood: moodFeatures,
    sessions: sessionFeatures,
    journal: journalFeatures,
    routine: routineFeatures,
    availability,
    derived: { moodVsProductivity, sleepVsProductivity, screenVsProductivity },
  };
}

/** Compact JSON for the prompt: drops nulls/empties so tokens are not wasted. */
export function compactFeatures(f: FeatureBundle): string {
  const prune = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const arr = v.map(prune).filter((x) => x !== undefined);
      return arr.length ? arr : undefined;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const p = prune(val);
        if (p !== undefined && p !== null) out[k] = p;
      }
      return Object.keys(out).length ? out : undefined;
    }
    if (v === null || v === undefined) return undefined;
    return v;
  };
  return JSON.stringify(prune(f) ?? {}, null, 1);
}
