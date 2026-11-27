import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Fetch exactly the data the AI pipeline needs for one user and a date window.
 * Never dumps tables: every query is bounded (take limits + date filters) so a
 * heavy user cannot blow up the prompt or the token budget.
 */
export interface WindowOptions {
  from: Date; // inclusive, midnight UTC
  to: Date; // exclusive
  tz: string;
}

export async function collectActivityData(userId: string, { from, to }: WindowOptions) {
  const [
    tasks,
    completedTasks,
    habits,
    habitLogs,
    moodLogs,
    journalEntries,
    workSessions,
    dailyActivities,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { userId, createdAt: { gte: from, lt: to } },
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        category: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        timeTakenSec: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.task.findMany({
      where: { userId, completedAt: { gte: from, lt: to } },
      select: {
        id: true,
        title: true,
        priority: true,
        category: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        timeTakenSec: true,
      },
      orderBy: { completedAt: 'desc' },
      take: 400,
    }),
    prisma.habit.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        frequency: true,
        targetPerWeek: true,
        active: true,
        createdAt: true,
      },
      take: 50,
    }),
    prisma.habitLog.findMany({
      where: { userId, date: { gte: from, lt: to } },
      select: { habitId: true, date: true },
      orderBy: { date: 'asc' },
      take: 2000,
    }),
    prisma.moodLog.findMany({
      where: { userId, date: { gte: from, lt: to } },
      select: { date: true, level: true, score: true, focus: true, energy: true, note: true },
      orderBy: { date: 'asc' },
      take: 200,
    }),
    prisma.journalEntry.findMany({
      where: { userId, date: { gte: from, lt: to } },
      select: {
        date: true,
        title: true,
        content: true,
        sentiment: true,
        sentimentScore: true,
        summary: true,
        themes: true,
        wordCount: true,
      },
      orderBy: { date: 'desc' },
      take: 30,
    }),
    prisma.workSession.findMany({
      where: { userId, startedAt: { gte: from, lt: to }, status: 'COMPLETED' },
      select: {
        startedAt: true,
        category: true,
        durationSec: true,
        focusScore: true,
        projectId: true,
        project: { select: { title: true, kind: true } },
      },
      orderBy: { startedAt: 'asc' },
      take: 400,
    }),
    prisma.dailyActivity.findMany({
      where: { userId, date: { gte: from, lt: to } },
      select: {
        date: true,
        sleepMinutes: true,
        exerciseMinutes: true,
        screenMinutes: true,
        meditationMinutes: true,
        socialMinutes: true,
        stressLevel: true,
        energyLevel: true,
        sleepQuality: true,
      },
      orderBy: { date: 'asc' },
      take: 200,
    }),
  ]);

  const openTasks = await prisma.task.findMany({
    where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] } },
    select: {
      id: true,
      title: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      status: true,
      projectId: true,
      project: { select: { title: true } },
      parentId: true,
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 120,
  });

  // Containers and goals, so the AI can name unfinished work the way the user
  // filed it instead of inventing a category of its own.
  const [projects, goals] = await Promise.all([
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      // Tasks come along so progress can be counted rather than guessed.
      select: { id: true, title: true, kind: true, status: true, deadline: true, tasks: { select: { status: true } } },
      orderBy: { deadline: 'asc' },
      take: 40,
    }),
    prisma.goal.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, title: true, target: true, current: true, metric: true, deadline: true, projectId: true },
      orderBy: { deadline: 'asc' },
      take: 30,
    }),
  ]);

  // Skill activity, so "you logged practice but no skill is recorded" is a
  // statement about real rows rather than a gap in the bundle.
  const [skillUpdates, skillCount] = await Promise.all([
    prisma.skillUpdate.findMany({ where: { userId, createdAt: { gte: from, lt: to } }, select: { id: true, createdAt: true, minutes: true }, take: 500 }),
    prisma.skill.count({ where: { userId, archivedAt: null } }),
  ]);

  return { tasks, completedTasks, habits, habitLogs, moodLogs, journalEntries, workSessions, dailyActivities, openTasks, projects, goals, skillUpdates, skillCount };
}

export type ActivityData = Awaited<ReturnType<typeof collectActivityData>>;

/** Journal content is truncated per entry — the LLM never receives raw full text dumps. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export type TaskRow = Prisma.TaskGetPayload<{
  select: {
    id: true;
    title: true;
    priority: true;
    status: true;
    category: true;
    dueDate: true;
    completedAt: true;
    createdAt: true;
    timeTakenSec: true;
  };
}>;
