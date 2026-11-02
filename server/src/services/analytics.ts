/**
 * Analytics + productivity scoring. Pure functions over real rows so the same
 * numbers drive the dashboard, the analytics page and the AI feature bundle.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { dateKey, rangeKeys, todayKey as todayKeyFn, localDateKey } from '../lib/dates.js';

const MOOD_SCORE: Record<string, number> = { GREAT: 5, GOOD: 4, NEUTRAL: 3, BAD: 2, TERRIBLE: 1 };

export interface DayStat {
  date: string;
  tasksCompleted: number;
  tasksCreated: number;
  habitsDone: number;
  habitsTotal: number;
  focusMinutes: number;
  moodScore: number | null;
  score: number; // 0-100 productivity score for the day
}

export interface ProductivityScore {
  score: number;
  band: 'excellent' | 'good' | 'fair' | 'low' | 'no-data';
  components: { tasks: number; habits: number; focus: number; consistency: number };
  explanation: string;
}

/**
 * Daily productivity score (0-100), weighted:
 *   tasks 40% · habits 30% · focus 20% · consistency 10%
 * Only components with data contribute; weights are re-normalised so a user
 * who only uses habits still gets a meaningful score.
 */
export function scoreDay(input: {
  tasksCompleted: number;
  tasksDueOrPlanned: number;
  habitsDone: number;
  habitsActive: number;
  focusMinutes: number;
  focusTargetMinutes?: number;
}): { score: number; components: { tasks: number; habits: number; focus: number; consistency: number }; used: number } {
  const parts: { key: 'tasks' | 'habits' | 'focus' | 'consistency'; value: number; weight: number }[] = [];

  if (input.tasksDueOrPlanned > 0) {
    parts.push({ key: 'tasks', value: Math.min(1, input.tasksCompleted / Math.max(1, input.tasksDueOrPlanned)), weight: 0.4 });
  }
  if (input.habitsActive > 0) {
    parts.push({ key: 'habits', value: Math.min(1, input.habitsDone / input.habitsActive), weight: 0.3 });
  }
  const focusTarget = input.focusTargetMinutes ?? 120;
  if (input.focusMinutes > 0) {
    parts.push({ key: 'focus', value: Math.min(1, input.focusMinutes / focusTarget), weight: 0.2 });
  }
  const consistency = parts.length ? parts.reduce((a, p) => a + p.value * p.weight, 0) / parts.reduce((a, p) => a + p.weight, 0) : 0;
  parts.push({ key: 'consistency', value: consistency, weight: 0.1 });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight) * 100);
  const components = { tasks: 0, habits: 0, focus: 0, consistency: Math.round(consistency * 100) };
  for (const p of parts) {
    if (p.key !== 'consistency') components[p.key] = Math.round(p.value * 100);
  }
  return { score: Math.max(0, Math.min(100, score)), components, used: parts.length - 1 };
}

export function scoreBand(score: number, hasData: boolean): ProductivityScore['band'] {
  if (!hasData) return 'no-data';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'low';
}

export interface AnalyticsPayload {
  range: { from: string; to: string; days: number };
  daily: DayStat[];
  weekly: { week: string; label: string; tasksCompleted: number; focusMinutes: number; habitsRate: number; avgMood: number | null; score: number }[];
  monthly: { month: string; label: string; tasksCompleted: number; focusMinutes: number; habitsRate: number; avgMood: number | null; score: number }[];
  totals: {
    tasksCreated: number;
    tasksCompleted: number;
    completionRate: number;
    overdueOpen: number;
    completedLate: number;
    focusMinutes: number;
    sessions: number;
    avgSessionMinutes: number;
    habitsRate: number;
    habitLogs: number;
    avgMood: number | null;
    moodDistribution: Record<string, number>;
    journalEntries: number;
    routineDays: number;
    avgSleepHours: number | null;
    avgScreenHours: number | null;
  };
  today: {
    date: string;
    tasksCompleted: number;
    tasksPending: number;
    habitsDone: number;
    habitsActive: number;
    habitRate: number;
    streak: number;
    focusMinutes: number;
    moodScore: number | null;
    moodLevel: string | null;
    score: ProductivityScore;
  };
  streaks: { current: number; longest: number; label: string };
  heatmap: { date: string; score: number; level: 0 | 1 | 2 | 3 | 4 }[];
  priorities: { priority: string; open: number; completed: number }[];
  categories: { category: string; completed: number; open: number }[];
  hourly: { hour: number; completions: number; focusMinutes: number }[];
  weekday: { day: string; completions: number; focusMinutes: number }[];
}

export async function buildAnalytics(
  userId: string,
  opts: { fromKey: string; toKey: string; tz: string; weekStart?: number },
): Promise<AnalyticsPayload> {
  const { fromKey, toKey, tz } = opts;
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T00:00:00.000Z`);
  const toExclusive = new Date(to.getTime() + 86_400_000);
  const keys = rangeKeys(fromKey, toKey);
  const todayK = todayKeyFn(tz);

  const [tasks, completedInRange, habits, habitLogs, moods, sessions, activities, journalCount, openTasks, lateCount] =
    await Promise.all([
      prisma.task.findMany({
        where: { userId, createdAt: { gte: from, lt: toExclusive } },
        select: { id: true, createdAt: true, status: true, priority: true, category: true, dueDate: true },
        take: 5000,
      }),
      prisma.task.findMany({
        where: { userId, completedAt: { gte: from, lt: toExclusive } },
        select: { id: true, completedAt: true, priority: true, category: true, dueDate: true, createdAt: true },
        take: 5000,
      }),
      prisma.habit.findMany({ where: { userId }, select: { id: true, name: true, active: true, frequency: true } }),
      prisma.habitLog.findMany({
        where: { userId, date: { gte: from, lt: toExclusive } },
        select: { habitId: true, date: true },
        take: 20000,
      }),
      prisma.moodLog.findMany({
        where: { userId, date: { gte: from, lt: toExclusive } },
        select: { date: true, level: true, score: true },
        take: 2000,
      }),
      prisma.workSession.findMany({
        where: { userId, startedAt: { gte: from, lt: toExclusive }, status: 'COMPLETED' },
        select: { startedAt: true, durationSec: true, category: true },
        take: 5000,
      }),
      prisma.dailyActivity.findMany({
        where: { userId, date: { gte: from, lt: toExclusive } },
        select: { date: true, sleepMinutes: true, screenMinutes: true },
        take: 2000,
      }),
      prisma.journalEntry.count({ where: { userId, date: { gte: from, lt: toExclusive } } }),
      prisma.task.findMany({
        where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] } },
        select: { id: true, priority: true, category: true, dueDate: true },
        take: 5000,
      }),
      prisma.task.count({
        where: {
          userId,
          completedAt: { gte: from, lt: toExclusive },
          dueDate: { lt: from },
        },
      }),
    ]);

  const activeHabits = habits.filter((h) => h.active);
  const activeHabitCount = activeHabits.length;

  const completionsByDay = new Map<string, number>();
  const createdByDay = new Map<string, number>();
  const focusByDay = new Map<string, number>();
  const habitsByDay = new Map<string, number>();
  const moodByDay = new Map<string, number>();
  const hourlyCompletions = Array.from({ length: 24 }, () => 0);
  const hourlyFocus = Array.from({ length: 24 }, () => 0);

  for (const t of completedInRange) {
    if (!t.completedAt) continue;
    const k = localDateKey(t.completedAt, tz);
    completionsByDay.set(k, (completionsByDay.get(k) ?? 0) + 1);
    const hour = new Date(t.completedAt.getTime() + tzShift(tz, t.completedAt)).getUTCHours();
    hourlyCompletions[hour] += 1;
  }
  for (const t of tasks) {
    const k = localDateKey(t.createdAt, tz);
    createdByDay.set(k, (createdByDay.get(k) ?? 0) + 1);
  }
  for (const s of sessions) {
    const k = localDateKey(s.startedAt, tz);
    focusByDay.set(k, (focusByDay.get(k) ?? 0) + s.durationSec / 60);
    const hour = new Date(s.startedAt.getTime() + tzShift(tz, s.startedAt)).getUTCHours();
    hourlyFocus[hour] += Math.round(s.durationSec / 60);
  }
  for (const l of habitLogs) {
    const k = dateKey(l.date);
    habitsByDay.set(k, (habitsByDay.get(k) ?? 0) + 1);
  }
  for (const m of moods) moodByDay.set(dateKey(m.date), m.score);

  const daily: DayStat[] = keys.map((k) => {
    const tasksCompleted = completionsByDay.get(k) ?? 0;
    const tasksCreated = createdByDay.get(k) ?? 0;
    const habitsDone = habitsByDay.get(k) ?? 0;
    const focusMinutes = Math.round(focusByDay.get(k) ?? 0);
    const moodScore = moodByDay.get(k) ?? null;
    const planned = Math.max(tasksCreated, tasksCompleted, 1);
    const { score } = scoreDay({
      tasksCompleted,
      tasksDueOrPlanned: tasksCompleted || tasksCreated ? planned : 0,
      habitsDone,
      habitsActive: activeHabitCount,
      focusMinutes,
    });
    return { date: k, tasksCompleted, tasksCreated, habitsDone, habitsTotal: activeHabitCount, focusMinutes, moodScore, score };
  });

  // weekly / monthly rollups
  const weekMap = new Map<string, DayStat[]>();
  const monthMap = new Map<string, DayStat[]>();
  for (const d of daily) {
    const weekKey = weekStartKey(d.date, opts.weekStart ?? 1);
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
    weekMap.get(weekKey)!.push(d);
    const monthKey = d.date.slice(0, 7);
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
    monthMap.get(monthKey)!.push(d);
  }
  const rollup = (arr: DayStat[]) => {
    const tasksCompleted = arr.reduce((a, d) => a + d.tasksCompleted, 0);
    const focusMinutes = arr.reduce((a, d) => a + d.focusMinutes, 0);
    const habitPossible = arr.reduce((a, d) => a + d.habitsTotal, 0);
    const habitDone = arr.reduce((a, d) => a + d.habitsDone, 0);
    const moodVals = arr.map((d) => d.moodScore).filter((x): x is number => x !== null);
    const active = arr.filter((d) => d.tasksCompleted || d.habitsDone || d.focusMinutes);
    return {
      tasksCompleted,
      focusMinutes,
      habitsRate: habitPossible ? Math.round((habitDone / habitPossible) * 100) : 0,
      avgMood: moodVals.length ? Math.round((moodVals.reduce((a, b) => a + b, 0) / moodVals.length) * 10) / 10 : null,
      score: active.length ? Math.round(active.reduce((a, d) => a + d.score, 0) / active.length) : 0,
    };
  };

  const weekly = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, arr]) => ({ week, label: formatWeekLabel(week), ...rollup(arr) }));
  const monthly = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, arr]) => ({
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      ...rollup(arr),
    }));

  // totals
  const moodDistribution: Record<string, number> = {};
  for (const m of moods) moodDistribution[m.level] = (moodDistribution[m.level] ?? 0) + 1;
  const moodAvg = moods.length ? moods.reduce((a, m) => a + m.score, 0) / moods.length : null;
  const totalFocus = sessions.reduce((a, s) => a + s.durationSec / 60, 0);
  const habitPossible = daily.reduce((a, d) => a + d.habitsTotal, 0);
  const habitDone = daily.reduce((a, d) => a + d.habitsDone, 0);
  const sleepVals = activities.map((a) => a.sleepMinutes).filter((x): x is number => typeof x === 'number');
  const screenVals = activities.map((a) => a.screenMinutes).filter((x): x is number => typeof x === 'number');

  // today
  const todayTasksCompleted = completionsByDay.get(todayK) ?? 0;
  const todayPending = openTasks.filter((t) => !t.dueDate || localDateKey(new Date(t.dueDate), tz) <= todayK).length;
  const todayHabits = habitsByDay.get(todayK) ?? 0;
  const todayFocus = Math.round(focusByDay.get(todayK) ?? 0);
  const todayMood = moods.find((m) => dateKey(m.date) === todayK);
  const todayTasksCreated = createdByDay.get(todayK) ?? 0;
  const todayScoreRaw = scoreDay({
    tasksCompleted: todayTasksCompleted,
    tasksDueOrPlanned: Math.max(todayTasksCreated, todayTasksCompleted),
    habitsDone: todayHabits,
    habitsActive: activeHabitCount,
    focusMinutes: todayFocus,
  });
  const todayHasData = todayTasksCompleted + todayHabits + todayFocus > 0;
  const todayScore: ProductivityScore = {
    score: todayHasData ? todayScoreRaw.score : 0,
    band: scoreBand(todayScoreRaw.score, todayHasData),
    components: todayScoreRaw.components,
    explanation: todayHasData
      ? 'Weighted from tasks (40%), habits (30%), focus time (20%) and consistency (10%); only components with data are counted.'
      : 'Log a task, habit or focus session and today’s score appears here.',
  };

  // streaks — consecutive days with at least one productive action
  const activeDays = new Set(
    daily.filter((d) => d.tasksCompleted > 0 || d.habitsDone > 0 || d.focusMinutes > 0).map((d) => d.date),
  );
  let current = 0;
  {
    let cursor = todayK;
    if (!activeDays.has(cursor)) {
      const y = new Date(`${todayK}T00:00:00Z`);
      y.setUTCDate(y.getUTCDate() - 1);
      cursor = y.toISOString().slice(0, 10);
    }
    while (activeDays.has(cursor) && current < 3650) {
      current += 1;
      const d = new Date(`${cursor}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }
  }
  let longest = 0;
  let run = 0;
  for (const k of [...activeDays].sort()) {
    const prev = new Date(`${k}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    run = activeDays.has(prev.toISOString().slice(0, 10)) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // heatmap levels from score quantiles
  const heatmap = daily.map((d) => {
    const has = d.tasksCompleted || d.habitsDone || d.focusMinutes;
    const level: 0 | 1 | 2 | 3 | 4 = !has ? 0 : d.score >= 80 ? 4 : d.score >= 60 ? 3 : d.score >= 40 ? 2 : 1;
    return { date: d.date, score: d.score, level };
  });

  // priority / category breakdown
  const priorityMap = new Map<string, { open: number; completed: number }>();
  for (const p of ['URGENT', 'HIGH', 'MEDIUM', 'LOW']) priorityMap.set(p, { open: 0, completed: 0 });
  for (const t of openTasks) priorityMap.get(t.priority)!.open += 1;
  for (const t of completedInRange) priorityMap.get(t.priority)!.completed += 1;

  const catMap = new Map<string, { completed: number; open: number }>();
  for (const t of completedInRange) {
    const c = catMap.get(t.category) ?? { completed: 0, open: 0 };
    c.completed += 1;
    catMap.set(t.category, c);
  }
  for (const t of openTasks) {
    const c = catMap.get(t.category) ?? { completed: 0, open: 0 };
    c.open += 1;
    catMap.set(t.category, c);
  }

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdayNames.map((day) => ({ day, completions: 0, focusMinutes: 0 }));
  for (const [k, n] of completionsByDay) weekday[new Date(`${k}T00:00:00Z`).getUTCDay()].completions += n;
  for (const [k, n] of focusByDay) weekday[new Date(`${k}T00:00:00Z`).getUTCDay()].focusMinutes += Math.round(n);

  return {
    range: { from: fromKey, to: toKey, days: keys.length },
    daily,
    weekly,
    monthly,
    totals: {
      tasksCreated: tasks.length,
      tasksCompleted: completedInRange.length,
      completionRate: tasks.length ? Math.round((completedInRange.length / tasks.length) * 100) : 0,
      overdueOpen: openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length,
      completedLate: lateCount,
      focusMinutes: Math.round(totalFocus),
      sessions: sessions.length,
      avgSessionMinutes: sessions.length ? Math.round(totalFocus / sessions.length) : 0,
      habitsRate: habitPossible ? Math.round((habitDone / habitPossible) * 100) : 0,
      habitLogs: habitLogs.length,
      avgMood: moodAvg === null ? null : Math.round(moodAvg * 10) / 10,
      moodDistribution,
      journalEntries: journalCount,
      routineDays: activities.length,
      avgSleepHours: sleepVals.length ? Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length / 60) * 10) / 10 : null,
      avgScreenHours: screenVals.length ? Math.round((screenVals.reduce((a, b) => a + b, 0) / screenVals.length / 60) * 10) / 10 : null,
    },
    today: {
      date: todayK,
      tasksCompleted: todayTasksCompleted,
      tasksPending: todayPending,
      habitsDone: todayHabits,
      habitsActive: activeHabitCount,
      habitRate: activeHabitCount ? Math.round((todayHabits / activeHabitCount) * 100) : 0,
      streak: current,
      focusMinutes: todayFocus,
      moodScore: todayMood?.score ?? null,
      moodLevel: todayMood?.level ?? null,
      score: todayScore,
    },
    streaks: { current, longest, label: 'Productive-day streak' },
    heatmap,
    priorities: [...priorityMap.entries()].map(([priority, v]) => ({ priority, ...v })),
    categories: [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.completed - a.completed),
    hourly: hourlyCompletions.map((completions, hour) => ({ hour, completions, focusMinutes: hourlyFocus[hour] })),
    weekday,
  };
}

function weekStartKey(key: string, weekStartsOn = 1): string {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = d.getUTCDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return `W${getISOWeek(d)} · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function tzShift(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - at.getTime();
  } catch {
    return 0;
  }
}

export { MOOD_SCORE };
export type TaskWithDates = Prisma.TaskGetPayload<{
  select: { id: true; createdAt: true; status: true; priority: true; category: true; dueDate: true };
}>;
