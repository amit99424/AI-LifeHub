import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { addDaysKey, dateKey, dateKeyToDate, rangeKeys, todayKey } from '../lib/dates.js';

export const moodsRouter = Router();
moodsRouter.use(requireAuth);

const MOOD_SCORE = { GREAT: 5, GOOD: 4, NEUTRAL: 3, BAD: 2, TERRIBLE: 1 } as const;

const logSchema = z.object({
  level: z.enum(['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE']),
  note: z.string().trim().max(1000).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  focus: z.number().int().min(1).max(5).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/moods — history + today + trends
moodsRouter.get(
  '/',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const tz = userTz(req);
    const today = todayKey(tz);
    const from = addDaysKey(today, -(days - 1));
    const logs = await prisma.moodLog.findMany({
      where: { userId: req.user!.id, date: { gte: dateKeyToDate(from), lte: dateKeyToDate(today) } },
      orderBy: { date: 'desc' },
    });
    const byDay = new Map(logs.map((l) => [dateKey(l.date), l]));
    const distribution: Record<string, number> = { GREAT: 0, GOOD: 0, NEUTRAL: 0, BAD: 0, TERRIBLE: 0 };
    for (const l of logs) distribution[l.level] += 1;
    const avg = logs.length ? logs.reduce((a, l) => a + l.score, 0) / logs.length : null;

    // weekly averages (last 8 weeks)
    const weekMap = new Map<string, number[]>();
    for (const l of logs) {
      const k = dateKey(l.date);
      const d = new Date(`${k}T00:00:00Z`);
      const diff = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - diff);
      const wk = d.toISOString().slice(0, 10);
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      weekMap.get(wk)!.push(l.score);
    }
    const weekly = [...weekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, scores]) => ({
        week,
        label: new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        entries: scores.length,
      }));

    // monthly averages
    const monthMap = new Map<string, number[]>();
    for (const l of logs) {
      const m = dateKey(l.date).slice(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, []);
      monthMap.get(m)!.push(l.score);
    }
    const monthly = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, scores]) => ({
        month,
        label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short' }),
        avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        entries: scores.length,
      }));

    res.json({
      today: byDay.get(today) ?? null,
      logs,
      distribution,
      avgScore: avg === null ? null : Math.round(avg * 100) / 100,
      weekly,
      monthly,
      series: rangeKeys(from, today).map((k) => ({ date: k, score: byDay.get(k)?.score ?? null, level: byDay.get(k)?.level ?? null })),
    });
  }),
);

// POST /api/moods — upsert one entry per day
moodsRouter.post(
  '/',
  validate({ body: logSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof logSchema>;
    const tz = userTz(req);
    const today = todayKey(tz);
    const key = body.date ?? today;
    if (key > today) throw ApiError.badRequest('You cannot log a mood for a future date');

    const log = await prisma.moodLog.upsert({
      where: { userId_date: { userId: req.user!.id, date: dateKeyToDate(key) } },
      create: {
        userId: req.user!.id,
        level: body.level,
        score: MOOD_SCORE[body.level],
        note: body.note ?? null,
        energy: body.energy ?? null,
        focus: body.focus ?? null,
        date: dateKeyToDate(key),
      },
      update: {
        level: body.level,
        score: MOOD_SCORE[body.level],
        note: body.note ?? null,
        energy: body.energy ?? null,
        focus: body.focus ?? null,
      },
    });
    res.status(201).json({ mood: log });
  }),
);

// DELETE /api/moods/:id
moodsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.moodLog.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Mood entry not found');
    res.json({ ok: true });
  }),
);
