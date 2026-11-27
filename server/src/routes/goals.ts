import { Router } from 'express';
import { z } from 'zod';
import { GoalStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

const statusEnum = z.nativeEnum(GoalStatus);
const dateish = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give the goal a title').max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  metric: z.string().trim().max(40).nullable().optional(),
  target: z.number().finite().positive().nullable().optional(),
  current: z.number().finite().min(0).nullable().optional(),
  deadline: dateish.nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: statusEnum.optional(),
});

const milestoneSchema = z.object({
  title: z.string().trim().min(1, 'Give the milestone a title').max(160),
  dueDate: dateish.nullable().optional(),
  order: z.number().int().min(0).max(999).optional(),
});

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:00.000Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid date');
  return d;
}

/**
 * Goal progress. A goal without a target has no percentage -- it has a state
 * ("3 of ?" is not 60%), so progress is null and the UI shows the raw number.
 */
export function goalProgress(g: { current: number | null; target: number | null }): number | null {
  if (g.target === null || g.target <= 0 || g.current === null) return null;
  return Math.min(100, Math.round((g.current / g.target) * 100));
}

const include = {
  milestones: { orderBy: { order: 'asc' } },
  project: { select: { id: true, title: true, kind: true } },
  _count: { select: { tasks: true } },
} satisfies Prisma.GoalInclude;

type GoalRow = Prisma.GoalGetPayload<{ include: typeof include }>;

function goalDto(g: GoalRow & { doneTasks?: number }) {
  const done = g.milestones.filter((m) => m.completedAt).length;
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    status: g.status,
    metric: g.metric,
    target: g.target,
    current: g.current,
    progress: goalProgress(g),
    deadline: g.deadline,
    achievedAt: g.achievedAt,
    project: g.project,
    tasks: { total: g._count.tasks, done: g.doneTasks ?? 0 },
    milestones: g.milestones.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, completedAt: m.completedAt, order: m.order })),
    milestonesDone: done,
    milestonesTotal: g.milestones.length,
    isDemo: g.isDemo,
    createdAt: g.createdAt,
  };
}

async function ownGoal(userId: string, id: string) {
  const g = await prisma.goal.findFirst({ where: { id, userId }, include });
  if (!g) throw ApiError.notFound('Goal not found');
  return g;
}

async function withDoneCounts(userId: string, rows: GoalRow[]) {
  if (!rows.length) return [] as ReturnType<typeof goalDto>[];
  const groups = await prisma.task.groupBy({
    by: ['goalId'],
    where: { userId, goalId: { in: rows.map((r) => r.id) }, status: 'COMPLETED' },
    _count: { _all: true },
  });
  const done = new Map(groups.map((g) => [g.goalId, g._count._all]));
  return rows.map((g) => goalDto({ ...g, doneTasks: done.get(g.id) ?? 0 }));
}

// GET /api/goals
goalsRouter.get(
  '/',
  validate({ query: z.object({ status: z.union([statusEnum, z.literal('ALL')]).optional(), projectId: z.string().uuid().optional() }) }),
  ah(async (req, res) => {
    const q = req.query as { status?: GoalStatus | 'ALL'; projectId?: string };
    const where: Prisma.GoalWhereInput = { userId: req.user!.id };
    if (q.status && q.status !== 'ALL') where.status = q.status;
    if (q.projectId) where.projectId = q.projectId;
    const rows = await prisma.goal.findMany({ where, orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { createdAt: 'desc' }], take: 200, include });
    res.json({ goals: await withDoneCounts(req.user!.id, rows) });
  }),
);

// POST /api/goals
goalsRouter.post(
  '/',
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    if (body.projectId) {
      const p = await prisma.project.findFirst({ where: { id: body.projectId, userId: req.user!.id }, select: { id: true } });
      if (!p) throw ApiError.badRequest('That project does not exist');
    }
    const goal = await prisma.goal.create({
      data: {
        userId: req.user!.id,
        title: body.title,
        description: body.description ?? null,
        metric: body.metric ?? null,
        target: body.target ?? null,
        current: body.current ?? null,
        deadline: parseDate(body.deadline) ?? null,
        projectId: body.projectId ?? null,
      },
      include,
    });
    res.status(201).json({ goal: goalDto(goal) });
  }),
);

// PATCH /api/goals/:id
goalsRouter.patch(
  '/:id',
  validate({ body: updateSchema }),
  ah(async (req, res) => {
    const existing = await ownGoal(req.user!.id, req.params.id);
    const body = req.body as z.infer<typeof updateSchema>;
    if (body.projectId) {
      const p = await prisma.project.findFirst({ where: { id: body.projectId, userId: req.user!.id }, select: { id: true } });
      if (!p) throw ApiError.badRequest('That project does not exist');
    }
    const data: Prisma.GoalUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.metric !== undefined) data.metric = body.metric;
    if (body.target !== undefined) data.target = body.target;
    if (body.current !== undefined) data.current = body.current;
    if (body.projectId !== undefined) data.project = body.projectId ? { connect: { id: body.projectId } } : { disconnect: true };
    const deadline = parseDate(body.deadline);
    if (deadline !== undefined) data.deadline = deadline;
    if (body.status !== undefined) {
      data.status = body.status;
      data.achievedAt = body.status === 'ACHIEVED' ? (existing.achievedAt ?? new Date()) : null;
    }
    const goal = await prisma.goal.update({ where: { id: existing.id }, data, include });
    const [dto] = await withDoneCounts(req.user!.id, [goal]);
    res.json({ goal: dto });
  }),
);

// DELETE /api/goals/:id
goalsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.goal.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Goal not found');
    res.json({ ok: true });
  }),
);

// POST /api/goals/:id/milestones
goalsRouter.post(
  '/:id/milestones',
  validate({ body: milestoneSchema }),
  ah(async (req, res) => {
    const goal = await ownGoal(req.user!.id, req.params.id);
    const body = req.body as z.infer<typeof milestoneSchema>;
    const milestone = await prisma.milestone.create({
      data: {
        goalId: goal.id,
        userId: req.user!.id,
        title: body.title,
        dueDate: parseDate(body.dueDate) ?? null,
        order: body.order ?? goal.milestones.length,
      },
    });
    res.status(201).json({ milestone });
  }),
);

// PATCH /api/goals/:id/milestones/:mid
goalsRouter.patch(
  '/:id/milestones/:mid',
  validate({ body: milestoneSchema.partial().extend({ completed: z.boolean().optional() }) }),
  ah(async (req, res) => {
    const m = await prisma.milestone.findFirst({ where: { id: req.params.mid, goalId: req.params.id, userId: req.user!.id } });
    if (!m) throw ApiError.notFound('Milestone not found');
    const body = req.body as Partial<z.infer<typeof milestoneSchema>> & { completed?: boolean };
    const dueDate = parseDate(body.dueDate);
    const milestone = await prisma.milestone.update({
      where: { id: m.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        ...(body.completed !== undefined ? { completedAt: body.completed ? new Date() : null } : {}),
      },
    });
    res.json({ milestone });
  }),
);

// DELETE /api/goals/:id/milestones/:mid
goalsRouter.delete(
  '/:id/milestones/:mid',
  ah(async (req, res) => {
    const result = await prisma.milestone.deleteMany({ where: { id: req.params.mid, goalId: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Milestone not found');
    res.json({ ok: true });
  }),
);
