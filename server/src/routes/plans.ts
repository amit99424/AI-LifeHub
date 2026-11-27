import { Router } from 'express';
import { z } from 'zod';
import { PlanItemKind, PlanStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { buildFeatureBundle } from '../services/ai.js';
import { analyseGrowth } from '../services/growth.js';
import { applyPlanItem, generatePlanDraft, type PlanItemDraft } from '../services/growthPlans.js';
import { collectGrowth } from './skills.js';
import { resolveOccupation } from '../services/occupations.js';

export const plansRouter = Router();
plansRouter.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// Development plans
// ─────────────────────────────────────────────────────────────
// Generating a plan writes a DRAFT. Nothing in the user's goals, tasks or
// milestones changes until they apply an item, one item at a time. That is the
// whole safety story: a recommendation is a record, an applied item is work.

const horizonSchema = z.number().int().min(1).max(12).default(4);

const createSchema = z.object({
  horizonWeeks: horizonSchema.optional(),
  weeklyMinutes: z.number().int().min(30).max(6000).nullable().optional(),
  /** An optional note the planner reads: what the person wants out of this. */
  intent: z.string().trim().max(500).nullable().optional(),
});

const include = {
  items: { orderBy: [{ week: 'asc' }, { order: 'asc' }] },
  goal: { select: { id: true, title: true } },
} satisfies Prisma.DevelopmentPlanInclude;

type PlanRow = Prisma.DevelopmentPlanGetPayload<{ include: typeof include }>;

function planDto(p: PlanRow) {
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    source: p.source,
    status: p.status,
    horizonWeeks: p.horizonWeeks,
    weeklyMinutes: p.weeklyMinutes,
    goal: p.goal,
    createdAt: p.createdAt,
    items: p.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      detail: i.detail,
      week: i.week,
      order: i.order,
      successCriteria: i.successCriteria,
      skillId: i.skillId,
      goalId: i.goalId,
      milestoneId: i.milestoneId,
      taskId: i.taskId,
      appliedAt: i.appliedAt,
    })),
    appliedCount: p.items.filter((i) => i.appliedAt).length,
    itemCount: p.items.length,
  };
}

// GET /api/plans
plansRouter.get(
  '/',
  validate({ query: z.object({ status: z.union([z.nativeEnum(PlanStatus), z.literal('ALL')]).optional() }) }),
  ah(async (req, res) => {
    const q = req.query as { status?: PlanStatus | 'ALL' };
    const where: Prisma.DevelopmentPlanWhereInput = { userId: req.user!.id };
    if (q.status && q.status !== 'ALL') where.status = q.status;
    const rows = await prisma.developmentPlan.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include });
    res.json({ plans: rows.map(planDto) });
  }),
);

// POST /api/plans — generate a draft with the AI (or the deterministic fallback)
plansRouter.post(
  '/',
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const tz = userTz(req);
    const horizonWeeks = body.horizonWeeks ?? 4;

    const [{ features }, growthInput, profile, label] = await Promise.all([
      buildFeatureBundle(req.user!.id, tz, 90),
      collectGrowth(req.user!.id, tz, 90),
      prisma.profile.findUnique({ where: { userId: req.user!.id }, select: { occupation: true, occupationType: true } }),
      prisma.occupationLabel.findUnique({ where: { userId: req.user!.id }, select: { label: true } }),
    ]);
    const growth = analyseGrowth(growthInput);
    const resolved = resolveOccupation({
      occupationType: profile?.occupationType ?? null,
      occupation: profile?.occupation ?? null,
      customLabel: label?.label ?? null,
    });
    const occupationBlock = `USER CONTEXT: ${resolved.profile.label}. A unit of work is called a "${resolved.profile.nouns.project}". What matters for this person: ${resolved.profile.aiFocus}.${body.intent ? `\nWHAT THEY WANT FROM THIS PLAN: ${body.intent}` : ''}`;

    const draft = await generatePlanDraft(features.growth, features, {
      horizonWeeks,
      weeklyMinutes: body.weeklyMinutes ?? null,
      occupationBlock,
      noun: resolved.profile.nouns.project,
    });

    const plan = await prisma.developmentPlan.create({
      data: {
        userId: req.user!.id,
        title: draft.title,
        summary: draft.summary,
        // 'AI' only when a model actually produced it; the fallback says so.
        source: draft.deterministic ? 'FALLBACK' : 'AI',
        status: 'DRAFT',
        horizonWeeks,
        weeklyMinutes: body.weeklyMinutes ?? null,
        inputs: {
          growthTotals: features.growth.totals,
          improving: features.growth.improving.map((i) => i.name),
          perSkill: features.growth.perSkill.map((p) => ({ name: p.name, currentLevel: p.currentLevel, practiceMinutes: p.practiceMinutes })),
          provider: draft.provider,
          model: draft.model,
          intent: body.intent ?? null,
        },
        items: {
          create: draft.items.map((i: PlanItemDraft, idx: number) => ({
            userId: req.user!.id,
            kind: i.kind as PlanItemKind,
            title: i.title,
            detail: i.detail,
            week: i.week,
            order: idx,
            successCriteria: i.successCriteria,
            skillId: i.skillId,
          })),
        },
      },
      include,
    });
    res.status(201).json({ plan: planDto(plan), generatedBy: draft.deterministic ? 'fallback' : 'ai' });
  }),
);

// GET /api/plans/:id
plansRouter.get('/:id', ah(async (req, res) => {
  const p = await prisma.developmentPlan.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include });
  if (!p) throw ApiError.notFound('Plan not found');
  res.json({ plan: planDto(p) });
}));

// PATCH /api/plans/:id — status only. The items are the plan's content and are
// edited by applying or discarding them, not by rewriting the recommendation.
plansRouter.patch(
  '/:id',
  validate({ body: z.object({ status: z.nativeEnum(PlanStatus).optional(), title: z.string().trim().min(1).max(160).optional() }) }),
  ah(async (req, res) => {
    const body = req.body as { status?: PlanStatus; title?: string };
    const existing = await prisma.developmentPlan.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
    if (!existing) throw ApiError.notFound('Plan not found');
    const p = await prisma.developmentPlan.update({ where: { id: existing.id }, data: { status: body.status, title: body.title }, include });
    res.json({ plan: planDto(p) });
  }),
);

// DELETE /api/plans/:id — the plan and its items go; the goals, milestones and
// tasks that were applied from it stay, because they are the user's work now.
plansRouter.delete('/:id', ah(async (req, res) => {
  const p = await prisma.developmentPlan.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
  if (!p) throw ApiError.notFound('Plan not found');
  await prisma.developmentPlan.delete({ where: { id: p.id } });
  res.json({ ok: true });
}));

// POST /api/plans/:id/items/:itemId/apply
plansRouter.post('/:id/items/:itemId/apply', ah(async (req, res) => {
  const item = await prisma.developmentPlanItem.findFirst({
    where: { id: req.params.itemId, planId: req.params.id, userId: req.user!.id },
    select: { id: true },
  });
  if (!item) throw ApiError.notFound('Plan item not found');
  const links = await applyPlanItem(req.user!.id, item.id, {});
  const p = await prisma.developmentPlan.findFirstOrThrow({ where: { id: req.params.id, userId: req.user!.id }, include });
  res.json({ ...links, plan: planDto(p) });
}));

// POST /api/plans/:id/apply-all — applies every objective first, so activities
// and milestones land under a goal rather than creating orphans.
plansRouter.post('/:id/apply-all', ah(async (req, res) => {
  const plan = await prisma.developmentPlan.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include });
  if (!plan) throw ApiError.notFound('Plan not found');
  const pending = plan.items.filter((i) => !i.appliedAt);
  const ordered = [...pending.filter((i) => i.kind === 'OBJECTIVE'), ...pending.filter((i) => i.kind !== 'OBJECTIVE')];
  for (const item of ordered) {
    try {
      await applyPlanItem(req.user!.id, item.id, {});
    } catch {
      // One item failing must not stop the rest; its state stays "not applied"
      // and the response shows exactly which ones those are.
    }
  }
  const after = await prisma.developmentPlan.findFirstOrThrow({ where: { id: plan.id }, include });
  res.json({ plan: planDto(after) });
}));
