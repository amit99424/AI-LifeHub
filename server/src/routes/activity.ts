import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { addDaysKey, dateKey, dateKeyToDate, rangeKeys, todayKey } from '../lib/dates.js';

export const activityRouter = Router();
activityRouter.use(requireAuth);

/**
 * Daily routine log (sleep / exercise / screen / meditation / social).
 *
 * IMPORTANT: a browser cannot read a phone's screen-time or health data without
 * an explicit platform integration. So this module offers (a) quick manual
 * entry, (b) CSV import, and (c) a documented hook for device sync. Nothing is
 * invented or auto-detected silently.
 */
const routineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sleepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  exerciseMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  screenMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  meditationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  socialMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  steps: z.number().int().min(0).max(200000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  source: z.enum(['manual', 'csv', 'device']).default('manual'),
});

// GET /api/activity
activityRouter.get(
  '/',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const tz = userTz(req);
    const today = todayKey(tz);
    const from = addDaysKey(today, -(days - 1));
    const rows = await prisma.dailyActivity.findMany({
      where: { userId: req.user!.id, date: { gte: dateKeyToDate(from), lte: dateKeyToDate(today) } },
      orderBy: { date: 'desc' },
    });
    const byDay = new Map(rows.map((r) => [dateKey(r.date), r]));
    const avg = (pick: (r: (typeof rows)[number]) => number | null) => {
      const vals = rows.map(pick).filter((v): v is number => typeof v === 'number');
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };
    res.json({
      today: byDay.get(today) ?? null,
      entries: rows,
      series: rangeKeys(from, today).map((k) => {
        const r = byDay.get(k);
        return {
          date: k,
          sleepHours: r?.sleepMinutes != null ? Math.round((r.sleepMinutes / 60) * 10) / 10 : null,
          screenHours: r?.screenMinutes != null ? Math.round((r.screenMinutes / 60) * 10) / 10 : null,
          exerciseMinutes: r?.exerciseMinutes ?? null,
          meditationMinutes: r?.meditationMinutes ?? null,
        };
      }),
      averages: {
        sleepMinutes: avg((r) => r.sleepMinutes),
        exerciseMinutes: avg((r) => r.exerciseMinutes),
        screenMinutes: avg((r) => r.screenMinutes),
        meditationMinutes: avg((r) => r.meditationMinutes),
        socialMinutes: avg((r) => r.socialMinutes),
      },
      daysLogged: rows.length,
    });
  }),
);

// PUT /api/activity — upsert for a date
activityRouter.put(
  '/',
  validate({ body: routineSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof routineSchema>;
    const tz = userTz(req);
    const key = body.date ?? todayKey(tz);
    if (key > todayKey(tz)) throw ApiError.badRequest('You cannot log routine data for a future date');
    const data = {
      sleepMinutes: body.sleepMinutes ?? null,
      exerciseMinutes: body.exerciseMinutes ?? null,
      screenMinutes: body.screenMinutes ?? null,
      meditationMinutes: body.meditationMinutes ?? null,
      socialMinutes: body.socialMinutes ?? null,
      steps: body.steps ?? null,
      notes: body.notes ?? null,
      source: body.source,
    };
    const entry = await prisma.dailyActivity.upsert({
      where: { userId_date: { userId: req.user!.id, date: dateKeyToDate(key) } },
      create: { userId: req.user!.id, date: dateKeyToDate(key), ...data },
      update: data,
    });
    res.json({ entry });
  }),
);

// DELETE /api/activity/:date
activityRouter.delete(
  '/:date',
  ah(async (req, res) => {
    const result = await prisma.dailyActivity.deleteMany({
      where: { userId: req.user!.id, date: dateKeyToDate(req.params.date) },
    });
    if (!result.count) throw ApiError.notFound('No entry for that date');
    res.json({ ok: true });
  }),
);

// POST /api/activity/import — CSV: date,sleepHours,screenHours,exerciseMinutes,meditationMinutes,socialMinutes,steps
activityRouter.post(
  '/import',
  validate({ body: z.object({ csv: z.string().min(3).max(200_000) }) }),
  ah(async (req, res) => {
    const { csv } = req.body as { csv: string };
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) throw ApiError.badRequest('CSV needs a header row and at least one data row');

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name.toLowerCase());
    const dateIdx = idx('date');
    if (dateIdx < 0) throw ApiError.badRequest('CSV must contain a "date" column (YYYY-MM-DD)');

    const num = (cols: string[], name: string, factor = 1): number | null => {
      const i = idx(name);
      if (i < 0) return null;
      const raw = cols[i]?.trim();
      if (!raw) return null;
      const v = Number(raw);
      return Number.isFinite(v) ? Math.round(v * factor) : null;
    };

    const today = todayKey(userTz(req));
    let imported = 0;
    const errors: { line: number; message: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const rawDate = cols[dateIdx]?.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate ?? '')) {
        errors.push({ line: i + 1, message: `Invalid date "${rawDate}"` });
        continue;
      }
      if (rawDate! > today) {
        errors.push({ line: i + 1, message: 'Future dates are skipped' });
        continue;
      }
      const data = {
        sleepMinutes: num(cols, 'sleephours', 60),
        screenMinutes: num(cols, 'screenhours', 60),
        exerciseMinutes: num(cols, 'exerciseminutes'),
        meditationMinutes: num(cols, 'meditationminutes'),
        socialMinutes: num(cols, 'socialminutes'),
        steps: num(cols, 'steps'),
        source: 'csv',
      };
      await prisma.dailyActivity.upsert({
        where: { userId_date: { userId: req.user!.id, date: dateKeyToDate(rawDate!) } },
        create: { userId: req.user!.id, date: dateKeyToDate(rawDate!), ...data },
        update: data,
      });
      imported += 1;
    }
    res.json({ imported, errors, sampleFormat: 'date,sleepHours,screenHours,exerciseMinutes,meditationMinutes,socialMinutes,steps' });
  }),
);
