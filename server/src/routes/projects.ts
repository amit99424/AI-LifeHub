import { Router } from 'express';
import { z } from 'zod';
import { ProjectKind, ProjectStatus, TaskPriority, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { localDateKey } from '../lib/dates.js';
import { resolveOccupation } from '../services/occupations.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const kindEnum = z.nativeEnum(ProjectKind);
const statusEnum = z.nativeEnum(ProjectStatus);
const priorityEnum = z.nativeEnum(TaskPriority);

const dateish = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give the project a title').max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  kind: kindEnum.optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  code: z.string().trim().max(40).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  deadline: dateish.nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  archived: z.boolean().optional(),
});

const listSchema = z.object({
  status: z.union([statusEnum, z.literal('ALL')]).optional(),
  kind: kindEnum.optional(),
  archived: z.enum(['exclude', 'only', 'all']).default('exclude'),
  search: z.string().max(120).optional(),
  sort: z.enum(['deadline', 'createdAt', 'priority', 'title']).default('deadline'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

function parseDeadline(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:00.000Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid deadline');
  return d;
}

/**
 * Progress is derived from the project's own tasks, never typed in.
 *
 * A project with no tasks has no progress to report, so it returns null rather
 * than 0% -- "0% of nothing" reads as failure and is not a measurement.
 */
export function projectProgress(counts: { total: number; done: number }): number | null {
  if (counts.total === 0) return null;
  return Math.round((counts.done / counts.total) * 100);
}

const projectInclude = {
  _count: { select: { tasks: true, sessions: true, goals: true } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function projectDto(p: ProjectRow & { doneTasks?: number; sessionMinutes?: number }) {
  const total = p._count.tasks;
  const done = p.doneTasks ?? 0;
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    kind: p.kind,
    status: p.status,
    priority: p.priority,
    code: p.code,
    color: p.color,
    deadline: p.deadline,
    archivedAt: p.archivedAt,
    completedAt: p.completedAt,
    createdAt: p.createdAt,
    tasks: { total, done, open: total - done },
    progress: projectProgress({ total, done }),
    sessions: p._count.sessions,
    sessionMinutes: p.sessionMinutes ?? 0,
    goals: p._count.goals,
    isDemo: p.isDemo,
  };
}

/** Tasks done and minutes logged, batched so a list is three queries, not 3N. */
async function decorate(userId: string, rows: ProjectRow[]) {
  if (!rows.length) return [] as ReturnType<typeof projectDto>[];
  const ids = rows.map((r) => r.id);
  const [doneGroups, sessionGroups] = await Promise.all([
    prisma.task.groupBy({ by: ['projectId'], where: { userId, projectId: { in: ids }, status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.workSession.groupBy({ by: ['projectId'], where: { userId, projectId: { in: ids }, status: 'COMPLETED' }, _sum: { durationSec: true } }),
  ]);
  const done = new Map(doneGroups.map((g) => [g.projectId, g._count._all]));
  const minutes = new Map(sessionGroups.map((g) => [g.projectId, Math.round((g._sum.durationSec ?? 0) / 60)]));
  return rows.map((r) => projectDto({ ...r, doneTasks: done.get(r.id) ?? 0, sessionMinutes: minutes.get(r.id) ?? 0 }));
}

/** The person's container vocabulary, resolved from their profile. */
async function occupationOf(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { occupation: true, occupationType: true } });
  const label = await prisma.occupationLabel.findUnique({ where: { userId } });
  return resolveOccupation({
    occupationType: profile?.occupationType ?? null,
    occupation: profile?.occupation ?? null,
    customLabel: label?.label ?? null,
  });
}

async function ownProject(userId: string, id: string) {
  const p = await prisma.project.findFirst({ where: { id, userId }, include: projectInclude });
  if (!p) throw ApiError.notFound('Project not found');
  return p;
}

// GET /api/projects
projectsRouter.get(
  '/',
  validate({ query: listSchema }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const where: Prisma.ProjectWhereInput = { userId: req.user!.id };
    if (q.status && q.status !== 'ALL') where.status = q.status;
    if (q.kind) where.kind = q.kind;
    if (q.archived === 'exclude') where.archivedAt = null;
    if (q.archived === 'only') where.archivedAt = { not: null };
    if (q.search) where.OR = [{ title: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }];

    const orderBy: Prisma.ProjectOrderByWithRelationInput =
      q.sort === 'createdAt' ? { createdAt: 'desc' } : q.sort === 'priority' ? { priority: 'desc' } : q.sort === 'title' ? { title: 'asc' } : { deadline: 'asc' };

    const rows = await prisma.project.findMany({ where, orderBy, take: q.limit, include: projectInclude });
    const projects = await decorate(req.user!.id, rows);
    const occupation = await occupationOf(req.user!.id);
    res.json({
      projects,
      // The words the screen should use for this container. A student reads
      // "Subject", a freelancer "Client project" -- same rows underneath.
      noun: occupation.profile.nouns.project,
      kinds: occupation.profile.kinds ?? [],
      goalNoun: occupation.profile.goalNoun ?? 'Goal',
    });
  }),
);

// GET /api/projects/:id
projectsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const p = await ownProject(req.user!.id, req.params.id);
    const [decorated] = await decorate(req.user!.id, [p]);
    const [tasks, goals] = await Promise.all([
      prisma.task.findMany({ where: { userId: req.user!.id, projectId: p.id, parentId: null }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }], take: 200, include: { _count: { select: { subtasks: true } } } }),
      prisma.goal.findMany({ where: { userId: req.user!.id, projectId: p.id }, orderBy: { createdAt: 'desc' }, include: { milestones: { orderBy: { order: 'asc' } } } }),
    ]);
    res.json({ project: decorated, tasks, goals });
  }),
);

// POST /api/projects
projectsRouter.post(
  '/',
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const occupation = await occupationOf(req.user!.id);
    const project = await prisma.project.create({
      data: {
        userId: req.user!.id,
        title: body.title,
        description: body.description ?? null,
        kind: body.kind ?? occupation.profile.defaultKind ?? 'WORK',
        status: body.status ?? 'PLANNING',
        priority: body.priority ?? 'MEDIUM',
        code: body.code ?? null,
        color: body.color ?? null,
        deadline: parseDeadline(body.deadline) ?? null,
      },
      include: projectInclude,
    });
    res.status(201).json({ project: projectDto(project) });
  }),
);

// PATCH /api/projects/:id
projectsRouter.patch(
  '/:id',
  validate({ body: updateSchema }),
  ah(async (req, res) => {
    const existing = await ownProject(req.user!.id, req.params.id);
    const body = req.body as z.infer<typeof updateSchema>;
    const data: Prisma.ProjectUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.code !== undefined) data.code = body.code;
    if (body.color !== undefined) data.color = body.color;
    const deadline = parseDeadline(body.deadline);
    if (deadline !== undefined) data.deadline = deadline;
    if (body.archived !== undefined) data.archivedAt = body.archived ? new Date() : null;
    // Completing a project stamps the date; reopening clears it. Archiving is
    // separate, so a finished project can still be put away.
    if (body.status === 'COMPLETED' && existing.status !== 'COMPLETED') data.completedAt = new Date();
    if (body.status && body.status !== 'COMPLETED') data.completedAt = null;

    const project = await prisma.project.update({ where: { id: existing.id }, data, include: projectInclude });
    const [decorated] = await decorate(req.user!.id, [project]);
    res.json({ project: decorated });
  }),
);

// DELETE /api/projects/:id
// Tasks and sessions survive: their projectId is set to null by the foreign
// key, so deleting a container never deletes a person's work history.
projectsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.project.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Project not found');
    res.json({ ok: true });
  }),
);

// GET /api/projects/:id/time — minutes per day for one container
projectsRouter.get(
  '/:id/time',
  ah(async (req, res) => {
    const p = await ownProject(req.user!.id, req.params.id);
    const sessions = await prisma.workSession.findMany({
      where: { userId: req.user!.id, projectId: p.id, status: 'COMPLETED' },
      select: { date: true, durationSec: true },
      orderBy: { date: 'asc' },
      take: 1000,
    });
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const key = s.date.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Math.round(s.durationSec / 60));
    }
    res.json({
      projectId: p.id,
      days: [...byDay.entries()].map(([date, minutes]) => ({ date, minutes })),
      totalMinutes: [...byDay.values()].reduce((a, b) => a + b, 0),
      today: localDateKey(new Date(), userTz(req)),
    });
  }),
);
