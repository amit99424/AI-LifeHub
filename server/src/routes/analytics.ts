import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { buildAnalytics } from '../services/analytics.js';
import { addDaysKey, endOfMonthKey, startOfMonthKey, todayKey } from '../lib/dates.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

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
    const profile = await prisma.profile.findUnique({ where: { userId: req.user!.id }, select: { weekStart: true, primaryGoal: true, onboarded: true } });
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

    const now = new Date();
    res.json({
      today,
      greetingName: req.user!.name.split(' ')[0],
      onboarded: profile?.onboarded ?? false,
      primaryGoal: profile?.primaryGoal ?? null,
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
