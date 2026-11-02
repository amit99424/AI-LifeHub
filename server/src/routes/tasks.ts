import { Router } from 'express';
import { z } from 'zod';
import { TaskPriority, TaskStatus, type Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, ah, validate } from '../lib/http.js';
import { requireAuth, userTz } from '../middleware/auth.js';
import { dateKey, localDateKey, todayKey } from '../lib/dates.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const priorityEnum = z.nativeEnum(TaskPriority);
const statusEnum = z.nativeEnum(TaskStatus);

const createSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  category: z.string().trim().max(40).default('General'),
  priority: priorityEnum.default('MEDIUM'),
  status: statusEnum.default('TODO'),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: statusEnum.optional(),
  order: z.number().int().optional(),
});

const listSchema = z.object({
  status: z.union([statusEnum, z.literal('ALL'), z.literal('OPEN')]).optional(),
  priority: priorityEnum.optional(),
  category: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
  due: z.enum(['today', 'overdue', 'week', 'none']).optional(),
  sort: z.enum(['dueDate', 'createdAt', 'priority', 'title']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseDue(value: string | null | undefined, tz: string): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // A date-only due date means end of that local day.
    return new Date(`${value}T23:59:00.000Z`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid due date');
  return d;
}

/** Derives completion metadata automatically — users never type durations. */
function deriveTaskState(
  current: { status: TaskStatus; startedAt: Date | null; completedAt: Date | null; createdAt: Date },
  nextStatus: TaskStatus,
) {
  const now = new Date();
  if (nextStatus === 'COMPLETED' && current.status !== 'COMPLETED') {
    const startedAt = current.startedAt ?? current.createdAt;
    return {
      completedAt: now,
      startedAt,
      timeTakenSec: Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000)),
    };
  }
  if (nextStatus === 'IN_PROGRESS' && !current.startedAt) {
    return { startedAt: now };
  }
  if (nextStatus !== 'COMPLETED' && current.status === 'COMPLETED') {
    // Re-opened: clear the completion metadata so analytics stay truthful.
    return { completedAt: null, timeTakenSec: null };
  }
  return {};
}

// GET /api/tasks
tasksRouter.get(
  '/',
  validate({ query: listSchema }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const tz = userTz(req);
    const where: Prisma.TaskWhereInput = { userId: req.user!.id };

    if (q.status && q.status !== 'ALL') {
      where.status = q.status === 'OPEN' ? { in: ['TODO', 'IN_PROGRESS'] } : q.status;
    }
    if (q.priority) where.priority = q.priority;
    if (q.category) where.category = q.category;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const todayK = todayKey(tz);
    if (q.due === 'today') {
      where.dueDate = { gte: new Date(`${todayK}T00:00:00Z`), lt: new Date(`${todayK}T23:59:59Z`) };
    } else if (q.due === 'overdue') {
      where.dueDate = { lt: new Date() };
      where.status = { in: ['TODO', 'IN_PROGRESS'] };
    } else if (q.due === 'week') {
      const end = new Date(`${todayK}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 7);
      where.dueDate = { gte: new Date(`${todayK}T00:00:00Z`), lt: end };
    } else if (q.due === 'none') {
      where.dueDate = null;
    }

    const orderBy: Prisma.TaskOrderByWithRelationInput[] =
      q.sort === 'createdAt'
        ? [{ createdAt: 'desc' }]
        : q.sort === 'priority'
          ? [{ priority: 'desc' }, { dueDate: 'asc' }]
          : q.sort === 'title'
            ? [{ title: 'asc' }]
            : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }];

    const [items, total, counts] = await Promise.all([
      prisma.task.findMany({ where, orderBy, take: q.limit, skip: q.offset }),
      prisma.task.count({ where }),
      prisma.task.groupBy({ by: ['status'], where: { userId: req.user!.id }, _count: { _all: true } }),
    ]);

    const now = new Date();
    res.json({
      tasks: items.map((t) => ({
        ...t,
        overdue: Boolean(t.dueDate && t.status !== 'COMPLETED' && t.status !== 'ARCHIVED' && new Date(t.dueDate) < now),
        dueToday: Boolean(t.dueDate && localDateKey(new Date(t.dueDate), tz) === todayK),
      })),
      total,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    });
  }),
);

// POST /api/tasks
tasksRouter.post(
  '/',
  validate({ body: createSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const tz = userTz(req);
    const now = new Date();
    const task = await prisma.task.create({
      data: {
        userId: req.user!.id,
        title: body.title,
        description: body.description ?? null,
        category: body.category,
        priority: body.priority,
        status: body.status,
        dueDate: parseDue(body.dueDate, tz),
        startedAt: body.status === 'IN_PROGRESS' ? now : null,
        completedAt: body.status === 'COMPLETED' ? now : null,
        timeTakenSec: body.status === 'COMPLETED' ? 0 : null,
      },
    });
    res.status(201).json({ task });
  }),
);

// PATCH /api/tasks/:id
tasksRouter.patch(
  '/:id',
  validate({ body: updateSchema }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const tz = userTz(req);
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Task not found');

    const data: Prisma.TaskUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.category !== undefined) data.category = body.category;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) data.dueDate = parseDue(body.dueDate, tz);
    if (body.status !== undefined) {
      data.status = body.status;
      Object.assign(data, deriveTaskState(existing, body.status));
    }

    const task = await prisma.task.update({ where: { id: existing.id }, data });
    res.json({ task });
  }),
);

// POST /api/tasks/:id/toggle
tasksRouter.post(
  '/:id/toggle',
  ah(async (req, res) => {
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw ApiError.notFound('Task not found');
    const next: TaskStatus = existing.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    const task = await prisma.task.update({
      where: { id: existing.id },
      data: { status: next, ...deriveTaskState(existing, next) },
    });
    res.json({ task });
  }),
);

// DELETE /api/tasks/:id
tasksRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const result = await prisma.task.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    if (!result.count) throw ApiError.notFound('Task not found');
    res.json({ ok: true });
  }),
);

// GET /api/tasks/meta/categories
tasksRouter.get(
  '/meta/categories',
  ah(async (req, res) => {
    const groups = await prisma.task.groupBy({
      by: ['category'],
      where: { userId: req.user!.id },
      _count: { _all: true },
    });
    res.json({ categories: groups.map((g) => ({ category: g.category, count: g._count._all })) });
  }),
);

// GET /api/tasks/upcoming/deadlines
tasksRouter.get(
  '/upcoming/deadlines',
  ah(async (req, res) => {
    const tz = userTz(req);
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86_400_000);
    const tasks = await prisma.task.findMany({
      where: {
        userId: req.user!.id,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        dueDate: { not: null, lte: horizon },
      },
      orderBy: { dueDate: 'asc' },
      take: 12,
      select: { id: true, title: true, dueDate: true, priority: true, status: true, category: true },
    });
    res.json({
      deadlines: tasks.map((t) => ({
        ...t,
        overdue: Boolean(t.dueDate && new Date(t.dueDate) < now),
        dueInDays: t.dueDate
          ? Math.round(
              (new Date(`${dateKey(new Date(t.dueDate))}T00:00:00Z`).getTime() - new Date(`${todayKey(tz)}T00:00:00Z`).getTime()) /
                86_400_000,
            )
          : null,
      })),
    });
  }),
);
