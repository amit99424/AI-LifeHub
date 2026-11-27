import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { addDaysKey, dateKey, dateKeyToDate, todayKey } from '../lib/dates.js';

export const wellnessRouter = Router();
wellnessRouter.use(requireAuth);

/**
 * One day of wellness, as the person experiences it.
 *
 * The data already lives in two tables — self-reports and hours in
 * `DailyActivity`, mood in `MoodLog` — and this endpoint exists so the client
 * can save a day in one action without knowing that. Both writes happen in one
 * transaction, so a day is either fully saved or not saved at all.
 *
 * Nothing is auto-detected: a browser cannot read a phone's screen time or
 * health data, so every number here is what the person typed.
 */

const level = z.number().int().min(1).max(5).nullable().optional();
const hours = z.number().min(0).max(24).nullable().optional();

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sleepHours: hours,
  sleepQuality: level,
  energyLevel: level,
  stressLevel: level,
  exerciseMinutes: z.number().int().min(0).max(600).nullable().optional(),
  screenHours: hours,
  /** Mood is stored as a 1-5 score; the enum is derived from it. */
  moodScore: level,
  focusLevel: level,
  notes: z.string().trim().max(500).nullable().optional(),
});

/** 1-5 → the MoodLog enum, matching MOOD_SCORE in routes/moods.ts. */
const LEVEL_TO_MOOD = ['TERRIBLE', 'BAD', 'NEUTRAL', 'GOOD', 'GREAT'] as const;
const MOOD_TO_LEVEL: Record<string, number> = { TERRIBLE: 1, BAD: 2, NEUTRAL: 3, GOOD: 4, GREAT: 5 };

const hoursToMinutes = (h: number | null | undefined): number | null =>
  h === null || h === undefined ? null : Math.round(h * 60);

const minutesToHours = (m: number | null): number | null => (m === null ? null : Math.round((m / 60) * 100) / 100);

// GET /api/wellness?days=30
// The whole form for today plus history, and an honest coverage figure so the
// UI can show an empty state instead of a flat chart.
wellnessRouter.get(
  '/',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const tz = userTz(req);
    const today = todayKey(tz);
    const from = addDaysKey(today, -(days - 1));
    const range = { gte: dateKeyToDate(from), lte: dateKeyToDate(today) };

    const [activities, moods] = await Promise.all([
      prisma.dailyActivity.findMany({ where: { userId: req.user!.id, date: range }, orderBy: { date: 'desc' } }),
      prisma.moodLog.findMany({ where: { userId: req.user!.id, date: range }, orderBy: { date: 'desc' } }),
    ]);

    const actByDay = new Map(activities.map((a) => [dateKey(a.date), a]));
    const moodByDay = new Map(moods.map((m) => [dateKey(m.date), m]));

    const toDay = (key: string) => {
      const a = actByDay.get(key);
      const m = moodByDay.get(key);
      return {
        date: key,
        sleepHours: minutesToHours(a?.sleepMinutes ?? null),
        sleepQuality: a?.sleepQuality ?? null,
        energyLevel: a?.energyLevel ?? null,
        stressLevel: a?.stressLevel ?? null,
        exerciseMinutes: a?.exerciseMinutes ?? null,
        screenHours: minutesToHours(a?.screenMinutes ?? null),
        moodScore: m?.score ?? null,
        focusLevel: m?.focus ?? null,
        notes: a?.notes ?? null,
        hasEntry: Boolean(a || m),
      };
    };

    // Every day in the window, so the client can render a calendar without
    // guessing which days are missing.
    const series: ReturnType<typeof toDay>[] = [];
    for (let i = 0; i < days; i++) series.push(toDay(addDaysKey(today, -i)));

    const logged = series.filter((d) => d.hasEntry);
    const avg = (pick: (d: ReturnType<typeof toDay>) => number | null) => {
      const v = logged.map(pick).filter((x): x is number => typeof x === 'number');
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };

    res.json({
      today: toDay(today),
      series,
      entries: logged,
      averages: {
        sleepHours: avg((d) => d.sleepHours),
        sleepQuality: avg((d) => d.sleepQuality),
        energyLevel: avg((d) => d.energyLevel),
        stressLevel: avg((d) => d.stressLevel),
        exerciseMinutes: avg((d) => d.exerciseMinutes),
        screenHours: avg((d) => d.screenHours),
        moodScore: avg((d) => d.moodScore),
        focusLevel: avg((d) => d.focusLevel),
      },
      coverage: {
        logged: logged.length,
        of: days,
        /** Fields reported on the most recent logged day, 0-8. */
        lastDayFields: logged.length
          ? [logged[0].sleepHours, logged[0].sleepQuality, logged[0].energyLevel, logged[0].stressLevel, logged[0].exerciseMinutes, logged[0].screenHours, logged[0].moodScore, logged[0].focusLevel].filter(
              (v) => v !== null && v !== undefined,
            ).length
          : 0,
        fieldsPerDay: 8,
      },
    });
  }),
);

// PUT /api/wellness — save one day, today or any past day
wellnessRouter.put(
  '/',
  validate({ body: daySchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof daySchema>;
    const userId = req.user!.id;
    const tz = userTz(req);
    const today = todayKey(tz);
    const key = body.date ?? today;
    if (key > today) throw ApiError.badRequest('You cannot record wellness for a future date');

    const date = dateKeyToDate(key);

    await prisma.$transaction(async (tx) => {
      // ── the daily activity row ──────────────────────────────
      const existing = await tx.dailyActivity.findUnique({ where: { userId_date: { userId, date } } });
      const activityData = {
        // Nulls are written as null on purpose: clearing a field is a real
        // action, and it must not silently keep yesterday's answer.
        sleepMinutes: hoursToMinutes(body.sleepHours),
        sleepQuality: body.sleepQuality ?? null,
        energyLevel: body.energyLevel ?? null,
        stressLevel: body.stressLevel ?? null,
        exerciseMinutes: body.exerciseMinutes ?? null,
        screenMinutes: hoursToMinutes(body.screenHours),
        notes: body.notes ?? null,
      };
      const hasActivity =
        body.sleepHours !== undefined ||
        body.sleepQuality !== undefined ||
        body.energyLevel !== undefined ||
        body.stressLevel !== undefined ||
        body.exerciseMinutes !== undefined ||
        body.screenHours !== undefined ||
        body.notes !== undefined;

      if (hasActivity || existing) {
        await tx.dailyActivity.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date, ...activityData, source: 'manual' },
          // A row that came from CSV or a device keeps its provenance.
          update: { ...activityData, ...(existing?.source === 'manual' || !existing ? { source: 'manual' } : {}) },
        });
      }

      // ── the mood row ────────────────────────────────────────
      if (body.moodScore !== undefined || body.focusLevel !== undefined) {
        const prevMood = await tx.moodLog.findUnique({ where: { userId_date: { userId, date } } });
        // Mood needs a level; if only focus was sent, keep the existing level
        // rather than inventing one from focus, which is a different question.
        const score = body.moodScore ?? prevMood?.score ?? null;
        if (score !== null) {
          await tx.moodLog.upsert({
            where: { userId_date: { userId, date } },
            create: {
              userId,
              date,
              level: LEVEL_TO_MOOD[score - 1],
              score,
              focus: body.focusLevel ?? null,
            },
            update: {
              level: LEVEL_TO_MOOD[score - 1],
              score,
              focus: body.focusLevel ?? prevMood?.focus ?? null,
            },
          });
        }
      }
    });

    res.json({ ok: true, date: key });
  }),
);

// DELETE /api/wellness/:date — remove a day's wellness record
wellnessRouter.delete(
  '/:date',
  ah(async (req, res) => {
    const { date: raw } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw ApiError.badRequest('Date must be YYYY-MM-DD');
    const userId = req.user!.id;
    const date = dateKeyToDate(raw);
    const [a, m] = await prisma.$transaction([
      prisma.dailyActivity.deleteMany({ where: { userId, date } }),
      prisma.moodLog.deleteMany({ where: { userId, date } }),
    ]);
    if (!a.count && !m.count) throw ApiError.notFound('Nothing recorded for that date');
    res.json({ ok: true });
  }),
);
