import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { addDaysKey, dateKey, dateKeyToDate, rangeKeys, startOfWeekKey, todayKey } from '../lib/dates.js';

export const habitsRouter = Router();
habitsRouter.use(requireAuth);

const habitSchema = z.object({
  name: z.string().trim().min(1, 'Name your habit').max(60),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().max(40).default('Sparkles'),
  color: z.string().max(20).default('violet'),
  frequency: z.enum(['DAILY', 'WEEKLY']).default('DAILY'),
  targetPerWeek: z.number().int().min(1).max(7).default(7),
});

function streaks(logDates: Set<string>, today: string) {
  const sorted = [...logDates].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of sorted) {
    if (prev && addDaysKey(prev, 1) === k) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  let current = 0;
  let cursor = logDates.has(today) ? today : addDaysKey(today, -1);
  while (logDates.has(cursor) && current < 3650) {
    current += 1;
    cursor = addDaysKey(cursor, -1);
  }
  return { current, longest };
}

// GET /api/habits — habits + today's status + streaks + window stats
habitsRouter.get(
  '/',
  ah(async (req, res) => {
    const tz = userTz(req);
    const today = todayKey(tz);
    const weekStart = startOfWeekKey(today, 1);
    const monthStart = `${today.slice(0, 7)}-01`;
    const earliest = monthStart < addDaysKey(today, -60) ? monthStart : addDaysKey(today, -60);

    const habits = await prisma.habit.findMany({
      where: { userId: req.user!.id, archivedAt: null },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
    const logs = await prisma.habitLog.findMany({
      where: { userId: req.user!.id, date: { gte: dateKeyToDate(earliest), lte: dateKeyToDate(today) } },
      select: { habitId: true, date: true },
      orderBy: { date: 'asc' },
      take: 20000,
    });

    const byHabit = new Map<string, Set<string>>();
    for (const l of logs) {
      const k = dateKey(l.date);
      if (!byHabit.has(l.habitId)) byHabit.set(l.habitId, new Set());
      byHabit.get(l.habitId)!.add(k);
    }
    const weekDays = rangeKeys(weekStart, addDaysKey(weekStart, 6));
    const monthDays = rangeKeys(monthStart, today);

    const items = habits.map((h) => {
      const set = byHabit.get(h.id) ?? new Set<string>();
      const st = streaks(set, today);
      const weekDone = weekDays.filter((d) => set.has(d)).length;
      const monthDone = monthDays.filter((d) => set.has(d)).length;
      return {
        ...h,
        doneToday: set.has(today),
        streak: st.current,
        longestStreak: st.longest,
        weekDone,
        weekTarget: h.frequency === 'DAILY' ? 7 : h.targetPerWeek,
        weekRate: Math.round((weekDone / (h.frequency === 'DAILY' ? 7 : h.targetPerWeek)) * 100),
        monthDone,
        monthRate: Math.round((monthDone / monthDays.length) * 100),
        last30: Array.from({ length: 30 }, (_, i) => {
          const d = addDaysKey(today, -(29 - i));
          return { date: d, done: set.has(d) };
        }),
      };
    });

    res.json({ habits: items, today });
  }),
);

// POST /api/habits
habitsRouter.post(
  '/',
  validate({ body: habitSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof habitSchema>;
    const habit = await prisma.habit.create({ data: { ...body, userId: req.user!.id } });
    res.status(201).json({ habit });
  }),
);

// PATCH /api/habits/:id
habitsRouter.patch(
  '/:id',
  validate({ body: habitSchema.partial().extend({ active: z.boolean().optional() }) }),
  ah(async (req, res) => {
    const existing = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Habit not found');
    const habit = await prisma.habit.update({ where: { id: existing.id }, data: req.body });
    res.json({ habit });
  }),
);

// DELETE /api/habits/:id — archive keeps history, hard delete is explicit
habitsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const hard = req.query.hard === 'true';
    const existing = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Habit not found');
    if (hard) await prisma.habit.delete({ where: { id: existing.id } });
    else await prisma.habit.update({ where: { id: existing.id }, data: { archivedAt: new Date(), active: false } });
    res.json({ ok: true });
  }),
);

// POST /api/habits/:id/checkin  — one click, optional date for backfill
habitsRouter.post(
  '/:id/checkin',
  validate({ body: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(300).optional() }).optional() }),
  ah(async (req, res) => {
    const habit = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!habit) throw ApiError.notFound('Habit not found');
    const today = todayKey(userTz(req));
    const key = (req.body as { date?: string; note?: string } | undefined)?.date ?? today;
    if (key > today) throw ApiError.badRequest('You cannot check in for a future date');

    const existing = await prisma.habitLog.findUnique({ where: { habitId_date: { habitId: habit.id, date: dateKeyToDate(key) } } });
    if (existing) {
      await prisma.habitLog.delete({ where: { id: existing.id } });
      return res.json({ done: false, date: key });
    }
    await prisma.habitLog.create({
      data: { habitId: habit.id, userId: req.user!.id, date: dateKeyToDate(key), note: (req.body as { note?: string } | undefined)?.note },
    });
    res.json({ done: true, date: key });
  }),
);

// GET /api/habits/:id/history?days=90
habitsRouter.get(
  '/:id/history',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(90) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const habit = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!habit) throw ApiError.notFound('Habit not found');
    const today = todayKey(userTz(req));
    const from = addDaysKey(today, -(days - 1));
    const logs = await prisma.habitLog.findMany({
      where: { habitId: habit.id, date: { gte: dateKeyToDate(from), lte: dateKeyToDate(today) } },
      select: { date: true, note: true },
      orderBy: { date: 'asc' },
    });
    const doneSet = new Set(logs.map((l) => dateKey(l.date)));
    const keys = rangeKeys(from, today);
    res.json({
      habit,
      days: keys.map((k) => ({ date: k, done: doneSet.has(k), note: logs.find((l) => dateKey(l.date) === k)?.note ?? null })),
      completionRate: Math.round((doneSet.size / keys.length) * 100),
      streak: streaks(doneSet, today),
    });
  }),
);

// GET /api/habits/reports/summary
habitsRouter.get(
  '/reports/summary',
  ah(async (req, res) => {
    const tz = userTz(req);
    const today = todayKey(tz);
    const from = addDaysKey(today, -29);
    const habits = await prisma.habit.findMany({ where: { userId: req.user!.id, archivedAt: null }, select: { id: true, name: true } });
    const logs = await prisma.habitLog.findMany({
      where: { userId: req.user!.id, date: { gte: dateKeyToDate(from), lte: dateKeyToDate(today) } },
      select: { habitId: true, date: true },
      take: 20000,
    });
    const keys = rangeKeys(from, today);
    const daily = keys.map((k) => ({
      date: k,
      done: logs.filter((l) => dateKey(l.date) === k).length,
      total: habits.length,
    }));
    const perHabit = habits.map((h) => ({
      name: h.name,
      completions: logs.filter((l) => l.habitId === h.id).length,
      rate: Math.round((logs.filter((l) => l.habitId === h.id).length / keys.length) * 100),
    }));
    res.json({ daily, perHabit, windowDays: keys.length });
  }),
);
