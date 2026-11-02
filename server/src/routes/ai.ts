import { Router } from 'express';
import { z } from 'zod';
import { InsightType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { aiStatus } from '../services/llm.js';
import { askAssistant, generateInsight, generateInsightSet, insightDto, usageToday } from '../services/ai.js';
import { buildFeatureBundle } from '../services/ai.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

// GET /api/ai/status — what is configured, never pretends
aiRouter.get(
  '/status',
  ah(async (req, res) => {
    const settings = await prisma.userSettings.findUnique({ where: { userId: req.user!.id } });
    res.json({
      ...aiStatus(),
      userEnabled: settings?.aiEnabled ?? true,
      autoInsights: settings?.aiAutoInsights ?? true,
      usage: await usageToday(req.user!.id),
    });
  }),
);

// GET /api/ai/insights
aiRouter.get(
  '/insights',
  validate({
    query: z.object({
      type: z.nativeEnum(InsightType).optional(),
      includeDismissed: z.coerce.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  }),
  ah(async (req, res) => {
    const q = req.query as unknown as { type?: InsightType; includeDismissed?: boolean; limit: number };
    const insights = await prisma.aIInsight.findMany({
      where: { userId: req.user!.id, ...(q.type ? { type: q.type } : {}), ...(q.includeDismissed ? {} : { dismissed: false }) },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: q.limit,
    });
    res.json({ insights: insights.map(insightDto) });
  }),
);

// GET /api/ai/features — the deterministic feature snapshot the AI uses
aiRouter.get(
  '/features',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }) }),
  ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const { features } = await buildFeatureBundle(req.user!.id, userTz(req), days);
    res.json({ features });
  }),
);

// POST /api/ai/insights/generate
aiRouter.post(
  '/insights/generate',
  aiLimiter,
  validate({
    body: z
      .object({
        type: z.union([z.nativeEnum(InsightType), z.literal('ALL')]).default('ALL'),
        days: z.number().int().min(7).max(180).optional(),
        force: z.boolean().optional(),
      })
      .default({ type: 'ALL' }),
  }),
  ah(async (req, res) => {
    const body = (req.body ?? { type: 'ALL' }) as { type: InsightType | 'ALL'; days?: number; force?: boolean };
    const tz = userTz(req);
    const usage = await usageToday(req.user!.id);
    if (usage.insights >= usage.limits.insights) {
      throw ApiError.tooMany(`Daily insight limit reached (${usage.limits.insights}). Try again tomorrow.`);
    }

    if (body.type === 'ALL') {
      const results = await generateInsightSet(req.user!.id, tz, { force: body.force });
      return res.json({
        results,
        insights: results.flatMap((r) => (r.insight ? [r.insight] : [])),
        skipped: results.filter((r) => r.skipped).map((r) => ({ type: r.type, reason: r.skipped })),
        errors: results.filter((r) => r.error).map((r) => ({ type: r.type, message: r.error })),
      });
    }
    const result = await generateInsight(req.user!.id, body.type as Exclude<InsightType, 'JOURNAL'>, {
      tz,
      windowDays: body.days,
      force: body.force,
    });
    if ('skipped' in result) return res.json({ skipped: [{ type: body.type, reason: result.skipped }], insights: [] });
    res.json({ insights: [result] });
  }),
);

// PATCH /api/ai/insights/:id  (dismiss / pin)
aiRouter.patch(
  '/insights/:id',
  validate({ body: z.object({ dismissed: z.boolean().optional(), pinned: z.boolean().optional() }) }),
  ah(async (req, res) => {
    const existing = await prisma.aIInsight.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Insight not found');
    const insight = await prisma.aIInsight.update({ where: { id: existing.id }, data: req.body });
    res.json({ insight: insightDto(insight) });
  }),
);

// ── conversations ────────────────────────────────────────────
aiRouter.get(
  '/conversations',
  ah(async (req, res) => {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
    });
    res.json({ conversations });
  }),
);

aiRouter.get(
  '/conversations/:id',
  ah(async (req, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
    if (!conversation) throw ApiError.notFound('Conversation not found');
    res.json({ conversation });
  }),
);

aiRouter.delete(
  '/conversations/:id',
  ah(async (req, res) => {
    const result = await prisma.conversation.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Conversation not found');
    res.json({ ok: true });
  }),
);

// POST /api/ai/chat — streaming (SSE) answer grounded in the user's history
aiRouter.post(
  '/chat',
  aiLimiter,
  validate({
    body: z.object({
      conversationId: z.string().uuid().optional(),
      message: z.string().trim().min(1, 'Ask something').max(2000),
      days: z.number().int().min(7).max(180).optional(),
      stream: z.boolean().default(true),
    }),
  }),
  ah(async (req, res) => {
    const body = req.body as { conversationId?: string; message: string; days?: number; stream: boolean };
    const userId = req.user!.id;
    const tz = userTz(req);

    const usage = await usageToday(userId);
    if (usage.chatMessages >= usage.limits.chatMessages) {
      throw ApiError.tooMany(`You've used all ${usage.limits.chatMessages} assistant messages for today.`);
    }

    let conversation = body.conversationId
      ? await prisma.conversation.findFirst({ where: { id: body.conversationId, userId } })
      : null;
    if (body.conversationId && !conversation) throw ApiError.notFound('Conversation not found');

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId, title: body.message.slice(0, 60) },
      });
    }

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { role: true, content: true },
    });

    await prisma.message.create({ data: { conversationId: conversation.id, userId, role: 'user', content: body.message } });

    // "last 7 days" / "this week" style questions get a matching data window.
    const askedDays = /\b(7|seven)[\s-]*days?\b|this week|past week|last week/i.test(body.message)
      ? 7
      : /\b(30|thirty)[\s-]*days?\b|this month|past month/i.test(body.message)
        ? 30
        : /\b(90|ninety)[\s-]*days?\b|three months/i.test(body.message)
          ? 90
          : body.days;

    const answer = await askAssistant(userId, {
      tz,
      history: history as { role: 'user' | 'assistant'; content: string }[],
      question: body.message,
      windowDays: askedDays,
    });

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        role: 'assistant',
        content: answer.answer,
        provider: answer.provider,
        model: answer.model,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), ...(history.length === 0 ? { title: body.message.slice(0, 60) } : {}) },
    });

    res.json({
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: answer.answer,
        createdAt: assistantMessage.createdAt,
        provider: answer.provider,
        model: answer.model,
      },
      dataWindow: answer.dataWindow,
      availability: answer.availability,
      usage: await usageToday(userId),
    });
  }),
);
