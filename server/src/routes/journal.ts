import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { dateKeyToDate, todayKey } from '../lib/dates.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { analyzeJournalEntry } from '../services/ai.js';

export const journalRouter = Router();
journalRouter.use(requireAuth);

const entrySchema = z.object({
  title: z.string().trim().max(160).nullable().optional(),
  content: z.string().trim().min(1, 'Write something first').max(20000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  analyze: z.boolean().optional(),
});

// GET /api/journal
journalRouter.get(
  '/',
  validate({
    query: z.object({
      search: z.string().max(120).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  ah(async (req, res) => {
    const q = req.query as unknown as { search?: string; from?: string; to?: string; limit: number; offset: number };
    const where = {
      userId: req.user!.id,
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' as const } },
              { content: { contains: q.search, mode: 'insensitive' as const } },
              { summary: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(q.from || q.to
        ? {
            date: {
              ...(q.from ? { gte: dateKeyToDate(q.from) } : {}),
              ...(q.to ? { lte: dateKeyToDate(q.to) } : {}),
            },
          }
        : {}),
    };
    const [entries, total, stats] = await Promise.all([
      prisma.journalEntry.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: q.limit, skip: q.offset }),
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.groupBy({
        by: ['sentiment'],
        where: { userId: req.user!.id },
        _count: { _all: true },
      }),
    ]);
    res.json({
      entries,
      total,
      sentimentMix: Object.fromEntries(stats.filter((s) => s.sentiment).map((s) => [s.sentiment!, s._count._all])),
    });
  }),
);

// GET /api/journal/:id
journalRouter.get(
  '/:id',
  ah(async (req, res) => {
    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!entry) throw ApiError.notFound('Entry not found');
    res.json({ entry });
  }),
);

// POST /api/journal
journalRouter.post(
  '/',
  validate({ body: entrySchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof entrySchema>;
    const tz = userTz(req);
    const key = body.date ?? todayKey(tz);
    const wordCount = body.content.split(/\s+/).filter(Boolean).length;
    const entry = await prisma.journalEntry.create({
      data: {
        userId: req.user!.id,
        title: body.title ?? null,
        content: body.content,
        date: dateKeyToDate(key),
        wordCount,
      },
    });
    res.status(201).json({ entry });
  }),
);

// PATCH /api/journal/:id
journalRouter.patch(
  '/:id',
  validate({ body: entrySchema.partial() }),
  ah(async (req, res) => {
    const existing = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Entry not found');
    const body = req.body as z.infer<typeof entrySchema>;
    const contentChanged = body.content !== undefined && body.content !== existing.content;
    const entry = await prisma.journalEntry.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined
          ? { content: body.content, wordCount: body.content.split(/\s+/).filter(Boolean).length }
          : {}),
        ...(body.date ? { date: dateKeyToDate(body.date) } : {}),
        // Editing the text invalidates previous AI enrichment.
        ...(contentChanged
          ? { sentiment: null, sentimentScore: null, summary: null, themes: [], productivityNotes: null, analyzedAt: null }
          : {}),
      },
    });
    res.json({ entry });
  }),
);

// DELETE /api/journal/:id
journalRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.journalEntry.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Entry not found');
    res.json({ ok: true });
  }),
);

// POST /api/journal/:id/analyze — real LLM sentiment + themes + summary
journalRouter.post(
  '/:id/analyze',
  aiLimiter,
  ah(async (req, res) => {
    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!entry) throw ApiError.notFound('Entry not found');
    const result = await analyzeJournalEntry(req.user!.id, entry);
    res.json(result);
  }),
);

// GET /api/journal/insights/themes — aggregate themes across analyzed entries
journalRouter.get(
  '/insights/themes',
  ah(async (req, res) => {
    const entries = await prisma.journalEntry.findMany({
      where: { userId: req.user!.id },
      select: { themes: true, sentiment: true, date: true, analyzedAt: true },
      orderBy: { date: 'desc' },
      take: 200,
    });
    const counts = new Map<string, number>();
    for (const e of entries) for (const t of e.themes) counts.set(t, (counts.get(t) ?? 0) + 1);
    res.json({
      analyzed: entries.filter((e) => e.analyzedAt).length,
      total: entries.length,
      themes: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([theme, count]) => ({ theme, count })),
    });
  }),
);
