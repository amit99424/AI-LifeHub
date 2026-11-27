import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { mergeWidgetOrder, occupationDisplayName, parseLayout, resolveOccupation, WIDGET_IDS } from '../services/occupations.js';
import { buildAnalytics } from '../services/analytics.js';
import { analyseLife, summarisePeriod, type LifeDay } from '../services/lifeEngine.js';
import { analyseGrowth, type GrowthAnalysis } from '../services/growth.js';
import { collectGrowth } from './skills.js';
import { addDaysKey, endOfMonthKey, startOfMonthKey, todayKey } from '../lib/dates.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

/**
 * The dashboard's growth widget gets the same read as the Growth Hub, trimmed
 * to what a card can show. It carries the reasons, not just the counts, so the
 * card cannot imply more than the records support.
 */
function growthWidget(g: GrowthAnalysis) {
  return {
    hasAnyRecord: g.hasAnyRecord,
    totals: g.totals,
    improving: g.improving.slice(0, 3).map((s) => ({
      name: s.name,
      from: s.levelAtWindowStart,
      to: s.currentLevel,
      gained: s.levelsGainedInWindow,
    })),
    needingAttention: g.needingAttention.slice(0, 3).map((n) => ({ name: n.skill.name, reason: n.reason })),
    consistency: g.consistency,
    weekly: g.weekly,
    summary: g.summary,
    window: g.window,
  };
}

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preset: z.enum(['7d', '30d', '90d', 'month', 'custom']).default('30d'),
});

function resolveRange(q: { from?: string; to?: string; preset: '7d' | '30d' | '90d' | 'month' | 'custom' }, tz: string) {
  const today = todayKey(tz);
  if (q.preset === 'custom' && q.from && q.to) return { fromKey: q.from, toKey: q.to };
  if (q.preset === 'month') return { fromKey: startOfMonthKey(today), toKey: endOfMonthKey(today) };
  const days = q.preset === '7d' ? 7 : q.preset === '90d' ? 90 : 30;
  return { fromKey: addDaysKey(today, -(days - 1)), toKey: today };
}

analyticsRouter.get(
  '/',
  validate({ query: rangeSchema }),
  ah(async (req, res) => {
    const q = req.query as unknown as { from?: string; to?: string; preset: '7d' | '30d' | '90d' | 'month' | 'custom' };
    const tz = userTz(req);
    const { fromKey, toKey } = resolveRange(q, tz);
    const profile = await prisma.profile.findUnique({ where: { userId: req.user!.id }, select: { weekStart: true } });
    const payload = await buildAnalytics(req.user!.id, { fromKey, toKey, tz, weekStart: profile?.weekStart ?? 1 });
    res.json(payload);
  }),
);

// Compact payload for the dashboard (today + last 7/14 days + deadlines + mood)
analyticsRouter.get(
  '/dashboard',
  ah(async (req, res) => {
    const tz = userTz(req);
    const today = todayKey(tz);
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user!.id },
      select: { weekStart: true, primaryGoal: true, onboarded: true, occupation: true, occupationType: true },
    });
    const occupationLabel = await prisma.occupationLabel.findUnique({
      where: { userId: req.user!.id },
      select: { label: true },
    });
    const [full, deadlines, moodToday, habitsToday, recentInsights, unreadCounts] = await Promise.all([
      buildAnalytics(req.user!.id, { fromKey: addDaysKey(today, -29), toKey: today, tz, weekStart: profile?.weekStart ?? 1 }),
      prisma.task.findMany({
        where: { userId: req.user!.id, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { not: null } },
        orderBy: { dueDate: 'asc' },
        take: 6,
        select: { id: true, title: true, dueDate: true, priority: true, status: true },
      }),
      prisma.moodLog.findFirst({ where: { userId: req.user!.id, date: new Date(`${today}T00:00:00.000Z`) } }),
      prisma.habit.findMany({ where: { userId: req.user!.id, active: true, archivedAt: null }, select: { id: true, name: true, icon: true, color: true } }),
      prisma.aIInsight.findMany({
        where: { userId: req.user!.id, dismissed: false },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 4,
      }),
      prisma.task.groupBy({ by: ['status'], where: { userId: req.user!.id }, _count: { _all: true } }),
    ]);

    const habitDoneToday = await prisma.habitLog.count({
      where: { userId: req.user!.id, date: new Date(`${today}T00:00:00.000Z`) },
    });

    // The engine reads the same daily stats the charts do, so a claim on the
    // dashboard and a claim in the AI can never disagree.
    const lifeDays: LifeDay[] = full.daily.map((d) => ({
      date: d.date,
      score: d.score,
      sleepHours: d.wellness.sleepHours,
      screenHours: d.wellness.screenHours,
      exerciseMinutes: d.wellness.exerciseMinutes,
      // Focused work and study are the same thing to the engine; a session
      // log does not distinguish them in this window.
      studyMinutes: d.focusMinutes,
      mood: d.moodScore,
      stress: d.wellness.stress,
      focus: d.wellness.focus,
      energy: d.wellness.energy,
      sleepQuality: d.wellness.sleepQuality,
      habitRate: d.habitsTotal > 0 ? Math.round((d.habitsDone / d.habitsTotal) * 100) : null,
      tasksCompleted: d.tasksCompleted,
      tasksOverdue: d.tasksOverdue,
    }));

    const analysis = analyseLife({
      days: lifeDays,
      hourly: full.hourly,
      weekday: full.weekday,
      domainsPresent: {
        tasks: full.totals.tasksCompleted > 0,
        habits: full.totals.habitLogs > 0,
        focus: full.totals.focusMinutes > 0,
        mood: full.totals.avgMood !== null,
        wellness: full.daily.some((d) => d.wellness.stress !== null || d.wellness.energy !== null),
      },
    });

    // Which widgets to show, in which order, with the saved layout applied.
    // The client renders this list; it never re-derives it.
    const savedSettings = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id },
      select: { dashboardLayout: true },
    });
    const layout = parseLayout(savedSettings?.dashboardLayout ?? null);
    const resolvedOccupation = resolveOccupation({
      occupationType: profile?.occupationType ?? null,
      occupation: profile?.occupation ?? null,
      customLabel: occupationLabel?.label ?? null,
    });
    const widgetOrder = mergeWidgetOrder(resolvedOccupation.profile.widgets, layout.order).filter(
      (w) => !layout.hidden.includes(w),
    );

    // Study/work, read from the same rows the life analysis uses. The window
    // matches the engine's (30 days ending today) so minutes agree.
    const studyFrom = new Date(full.daily[0]?.date ? `${full.daily[0].date}T00:00:00.000Z` : `${today}T00:00:00.000Z`);
    const studyTo = new Date(`${today}T00:00:00.000Z`);
    studyTo.setUTCDate(studyTo.getUTCDate() + 1);
    const from = studyFrom;
    const to = studyTo;
    const [projectRows, goalRows, overdueRows, growthInput] = await Promise.all([
      prisma.project.findMany({
        where: { userId: req.user!.id, archivedAt: null },
        select: { id: true, title: true, kind: true, status: true, deadline: true, _count: { select: { tasks: true } } },
        orderBy: [{ status: 'asc' }, { deadline: 'asc' }],
        take: 12,
      }),
      prisma.goal.findMany({
        where: { userId: req.user!.id, status: 'ACTIVE' },
        select: { id: true, title: true, current: true, target: true, metric: true, deadline: true },
        orderBy: { deadline: 'asc' },
        take: 6,
      }),
      prisma.task.count({
        where: { userId: req.user!.id, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } },
      }),
      // The growth widget reads the same analysis the Growth Hub page shows,
      // so the two can never disagree about how many skills improved.
      collectGrowth(req.user!.id, tz, 30),
    ]);
    const projectMinutes = new Map(
      (
        await prisma.workSession.groupBy({
          by: ['projectId'],
          where: { userId: req.user!.id, status: 'COMPLETED', date: { gte: from, lt: to }, projectId: { not: null } },
          _sum: { durationSec: true },
        })
      ).map((g) => [g.projectId, Math.round((g._sum.durationSec ?? 0) / 60)]),
    );
    // Attached to the payload as its own block: it is not study/work data and
    // folding it in there would make the widget list lie about what it holds.
    const growth = growthWidget(analyseGrowth(growthInput));
    const studyWork = {
      overdueTasks: overdueRows,
      projects: projectRows.map((p) => ({
        id: p.id,
        title: p.title,
        kind: p.kind,
        status: p.status,
        deadline: p.deadline,
        tasks: p._count.tasks,
        minutes: projectMinutes.get(p.id) ?? 0,
      })),
      goals: goalRows,
      minutesByProject: [...projectMinutes.entries()]
        .map(([id, minutes]) => ({ id, title: projectRows.find((p) => p.id === id)?.title ?? 'Untitled', minutes }))
        .sort((a, b) => b.minutes - a.minutes),
    };

    // Daily / weekly / monthly comparisons, computed here so every surface
    // reads the same numbers. Each window is compared with the one before it.
    // Windows come from `lifeDays`, the same array the analysis reads, so a
    // comparison can never be computed from a different set of days.
    const win = (n: number, offset = 0) => lifeDays.slice(lifeDays.length - (n + offset), lifeDays.length - offset || undefined);
    const comparisons = {
      day: compareWindows(win(1), win(1, 1), 'today vs yesterday'),
      week: compareWindows(win(7), win(7, 7), 'last 7 days vs the 7 before'),
      month: compareWindows(win(30), win(30, 30), 'last 30 days vs the 30 before'),
    };

    const now = new Date();
    res.json({
      comparisons,
      studyWork,
      growth,
      widgets: widgetOrder,
      widgetLayout: { order: layout.order, hidden: layout.hidden, available: WIDGET_IDS },
      life: {
        sufficiency: analysis.sufficiency,
        correlations: analysis.correlations,
        bestTime: analysis.bestTime,
        deltas: analysis.deltas,
        improvements: analysis.improvements,
        strengths: analysis.strengths,
        consistency: analysis.consistency,
        trend: analysis.trend,
        current: analysis.current,
        previous: analysis.previous,
      },
      today,
      greetingName: req.user!.name.split(' ')[0],
      onboarded: profile?.onboarded ?? false,
      primaryGoal: profile?.primaryGoal ?? null,
      // The dashboard renders itself from this: labels, category chips and
      // widget order all come from the occupation profile.
      occupation: {
        type: resolvedOccupation.type,
        profile: resolvedOccupation.profile,
        source: resolvedOccupation.source,
        displayName: occupationDisplayName(resolvedOccupation.profile, occupationLabel?.label),
        needsConfirmation: resolvedOccupation.source !== 'typed',
      },
      summary: full.today,
      streaks: full.streaks,
      week: full.weekly.at(-1) ?? null,
      weekly: full.weekly.slice(-8),
      daily: full.daily.slice(-14),
      heatmap: full.heatmap.slice(-35),
      totals: full.totals,
      hourly: full.hourly,
      weekday: full.weekday,
      priorities: full.priorities,
      mood: moodToday,
      habitsToday: { total: habitsToday.length, done: habitDoneToday, items: habitsToday },
      deadlines: deadlines.map((d) => ({
        ...d,
        overdue: Boolean(d.dueDate && new Date(d.dueDate) < now),
      })),
      insights: recentInsights.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        body: i.body,
        recommendations: i.recommendations,
        confidence: i.confidence,
        pinned: i.pinned,
        isDemo: i.isDemo,
        createdAt: i.createdAt,
      })),
      counts: Object.fromEntries(unreadCounts.map((c) => [c.status, c._count._all])),
      isEmpty: full.totals.tasksCreated + full.totals.habitLogs + full.totals.sessions + full.totals.journalEntries === 0,
    });
  }),
);

/**
 * Compare two windows of days and report only what the data supports.
 *
 * Both sides must have at least one recorded day, otherwise the comparison is
 * reported as unavailable rather than as a change. That is the difference
 * between "your focus time fell 40%" and "you recorded nothing yesterday".
 */
function compareWindows(current: LifeDay[], previous: LifeDay[], label: string) {
  const cur = summarisePeriod(current);
  const prev = summarisePeriod(previous);
  const hasBoth = cur.daysWithData > 0 && prev.daysWithData > 0;

  const pick = (s: typeof cur) => ({
    score: s.score,
    tasksCompleted: s.tasksCompleted,
    focusMinutes: s.focusMinutes,
    habitRate: s.habitRate,
    mood: s.mood,
    sleepHours: s.sleepHours,
    stress: s.stress,
    energy: s.energy,
  });

  const currentValues = pick(cur);
  const previousValues = pick(prev);
  const changes = Object.entries(currentValues).map(([key, value]) => {
    const before = previousValues[key as keyof typeof previousValues];
    const change = value !== null && before !== null ? Math.round((value - before) * 100) / 100 : null;
    return {
      key,
      current: value,
      previous: before,
      change,
      direction: change === null ? 'unknown' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    };
  });

  return {
    label,
    days: current.length,
    available: hasBoth,
    note: hasBoth
      ? `Compared ${cur.daysWithData} recorded days with ${prev.daysWithData}.`
      : 'Not enough recorded days on both sides to compare. Nothing is shown rather than a change that is not there.',
    current: currentValues,
    previous: previousValues,
    changes,
  };
}
