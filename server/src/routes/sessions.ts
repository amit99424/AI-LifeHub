import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { addDaysKey, dateKey, dateKeyToDate, rangeKeys, todayKey } from '../lib/dates.js';

export const sessionsRouter = Router();
sessionsRouter.use(requireAuth);

const CATEGORIES = ['STUDYING', 'CODING', 'OFFICE_WORK', 'READING', 'PERSONAL_PROJECTS', 'OTHER'] as const;

const startSchema = z.object({
  category: z.enum(CATEGORIES).default('STUDYING'),
  label: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function elapsedSeconds(s: { startedAt: Date; endedAt: Date | null; pausedAt: Date | null; pausedMs: number }) {
  const end = s.endedAt ?? s.pausedAt ?? new Date();
  return Math.max(0, Math.round((end.getTime() - new Date(s.startedAt).getTime() - s.pausedMs) / 1000));
}

// GET /api/sessions — active session + history + stats
sessionsRouter.get(
  '/',
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(365).default(14) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const tz = userTz(req);
    const today = todayKey(tz);
    const from = addDaysKey(today, -(days - 1));

    const [active, history, all] = await Promise.all([
      prisma.workSession.findFirst({ where: { userId: req.user!.id, status: { in: ['RUNNING', 'PAUSED'] } }, orderBy: { startedAt: 'desc' } }),
      prisma.workSession.findMany({
        where: { userId: req.user!.id, date: { gte: dateKeyToDate(from), lte: dateKeyToDate(today) }, status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
        take: 200,
      }),
      prisma.workSession.findMany({
        where: { userId: req.user!.id, status: 'COMPLETED' },
        select: { startedAt: true, durationSec: true, category: true, focusScore: true },
        orderBy: { startedAt: 'desc' },
        take: 2000,
      }),
    ]);

    const byDay = new Map<string, number>();
    for (const s of all) {
      const k = dateKey(new Date(s.startedAt.getTime()));
      byDay.set(k, (byDay.get(k) ?? 0) + s.durationSec / 60);
    }
    const byCategory: Record<string, number> = {};
    for (const s of all) byCategory[s.category] = (byCategory[s.category] ?? 0) + Math.round(s.durationSec / 60);
    const focusScores = all.map((s) => s.focusScore).filter((x): x is number => typeof x === 'number');

    const totalMinutes = Math.round(all.reduce((a, s) => a + s.durationSec / 60, 0));
    res.json({
      active: active ? { ...active, elapsedSec: elapsedSeconds(active) } : null,
      history,
      daily: rangeKeys(from, today).map((k) => ({ date: k, minutes: Math.round(byDay.get(k) ?? 0) })),
      stats: {
        totalMinutes,
        totalSessions: all.length,
        avgSessionMinutes: all.length ? Math.round(totalMinutes / all.length) : 0,
        todayMinutes: Math.round(byDay.get(today) ?? 0),
        byCategory,
        avgFocus: focusScores.length ? Math.round((focusScores.reduce((a, b) => a + b, 0) / focusScores.length) * 10) / 10 : null,
      },
    });
  }),
);

// POST /api/sessions/start
sessionsRouter.post(
  '/start',
  validate({ body: startSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof startSchema>;
    const existing = await prisma.workSession.findFirst({ where: { userId: req.user!.id, status: { in: ['RUNNING', 'PAUSED'] } } });
    if (existing) throw ApiError.conflict('You already have a session in progress. Stop it first.');
    const session = await prisma.workSession.create({
      data: {
        userId: req.user!.id,
        category: body.category,
        label: body.label,
        notes: body.notes,
        startedAt: new Date(),
        status: 'RUNNING',
        date: dateKeyToDate(todayKey(userTz(req))),
      },
    });
    res.status(201).json({ session: { ...session, elapsedSec: 0 } });
  }),
);

async function ownSession(userId: string, id: string) {
  const s = await prisma.workSession.findFirst({ where: { id, userId } });
  if (!s) throw ApiError.notFound('Session not found');
  return s;
}

// POST /api/sessions/:id/pause
sessionsRouter.post(
  '/:id/pause',
  ah(async (req, res) => {
    const s = await ownSession(req.user!.id, req.params.id);
    if (s.status !== 'RUNNING') throw ApiError.badRequest('Session is not running');
    const session = await prisma.workSession.update({
      where: { id: s.id },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });
    res.json({ session: { ...session, elapsedSec: elapsedSeconds(session) } });
  }),
);

// POST /api/sessions/:id/resume
sessionsRouter.post(
  '/:id/resume',
  ah(async (req, res) => {
    const s = await ownSession(req.user!.id, req.params.id);
    if (s.status !== 'PAUSED' || !s.pausedAt) throw ApiError.badRequest('Session is not paused');
    const pausedMs = s.pausedMs + (Date.now() - new Date(s.pausedAt).getTime());
    const session = await prisma.workSession.update({
      where: { id: s.id },
      data: { status: 'RUNNING', pausedAt: null, pausedMs },
    });
    res.json({ session: { ...session, elapsedSec: elapsedSeconds(session) } });
  }),
);

// POST /api/sessions/:id/stop
sessionsRouter.post(
  '/:id/stop',
  validate({ body: z.object({ focusScore: z.number().int().min(1).max(5).optional(), notes: z.string().max(1000).optional() }).optional() }),
  ah(async (req, res) => {
    const s = await ownSession(req.user!.id, req.params.id);
    if (s.status === 'COMPLETED') throw ApiError.badRequest('Session already stopped');
    const now = new Date();
    const pausedMs = s.pausedMs + (s.pausedAt ? now.getTime() - new Date(s.pausedAt).getTime() : 0);
    const durationSec = Math.max(0, Math.round((now.getTime() - new Date(s.startedAt).getTime() - pausedMs) / 1000));
    const body = (req.body ?? {}) as { focusScore?: number; notes?: string };
    const session = await prisma.workSession.update({
      where: { id: s.id },
      data: {
        status: 'COMPLETED',
        endedAt: now,
        pausedAt: null,
        pausedMs,
        durationSec,
        focusScore: body.focusScore ?? null,
        ...(body.notes ? { notes: body.notes } : {}),
      },
    });
    res.json({ session });
  }),
);

// POST /api/sessions/manual — optional backfill of a completed session
sessionsRouter.post(
  '/manual',
  validate({
    body: z.object({
      category: z.enum(CATEGORIES),
      minutes: z.number().int().min(1).max(1440),
      label: z.string().max(120).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      startedAt: z.string().datetime({ offset: true }).optional(),
    }),
  }),
  ah(async (req, res) => {
    const body = req.body as { category: (typeof CATEGORIES)[number]; minutes: number; label?: string; date?: string; startedAt?: string };
    const tz = userTz(req);
    const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
    const endedAt = new Date(startedAt.getTime() + body.minutes * 60_000);
    const session = await prisma.workSession.create({
      data: {
        userId: req.user!.id,
        category: body.category,
        label: body.label,
        startedAt,
        endedAt,
        status: 'COMPLETED',
        durationSec: body.minutes * 60,
        date: dateKeyToDate(body.date ?? todayKey(tz)),
        notes: 'Manually added',
      },
    });
    res.status(201).json({ session });
  }),
);

// DELETE /api/sessions/:id
sessionsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.workSession.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Session not found');
    res.json({ ok: true });
  }),
);
