/**
 * Phase 6 — the planning reads behind the assistant.
 *
 * Three deterministic reads, computed from rows only:
 *   dailyPlan()    what is open, what is late, and how a realistic day fits
 *   prioritise()   a ranked shortlist with a stated reason per task
 *   weeklyReview() this week against the person's own previous weeks
 *
 * Nothing here calls a model. The AI's job is to say these things well, not to
 * produce the numbers — so a failure at the model leaves the facts intact, and
 * every figure the user reads can be traced to a record.
 */
import { prisma } from '../lib/prisma.js';
import { addDaysKey, daysBetweenKeys, localDateKey, startOfWeekKey, todayKey, dateKey } from '../lib/dates.js';
import { analyseGrowth, type SkillLevel } from './growth.js';
import { collectGrowth } from '../routes/skills.js';

// ─────────────────────────────────────────────────────────────
// Time budget
// ─────────────────────────────────────────────────────────────

export interface TimeBudget {
  /** Minutes the user can actually give today. Null when they did not say. */
  minutes: number | null;
  /** Where the number came from, so the plan can say how real it is. */
  source: 'stated' | 'typical_session' | 'unknown';
  basis: string;
}

/**
 * How much time a day can hold.
 *
 * When the user states their available minutes, that is the answer. Otherwise
 * the best evidence available is their own completed sessions: the median
 * length, plus an assumption that a day holds a few of them. That assumption
 * is stated out loud in `basis`, because a plan built on a guess must not
 * read like a plan built on a fact.
 */
export function dailyBudget(sessionSeconds: number[], statedMinutes: number | null): TimeBudget {
  if (statedMinutes !== null && statedMinutes > 0) {
    return { minutes: statedMinutes, source: 'stated', basis: `${statedMinutes} minutes, as you said.` };
  }
  const lengths = sessionSeconds.filter((s) => s >= 300).map((s) => Math.round(s / 60)).sort((a, b) => a - b);
  if (lengths.length < 3) {
    return { minutes: null, source: 'unknown', basis: 'No available time was given, and there are not enough completed sessions to estimate a typical day.' };
  }
  const median = lengths[Math.floor(lengths.length / 2)];
  const minutes = median * 4;
  return {
    minutes,
    source: 'typical_session',
    basis: `No available time was given. This assumes four sessions of your typical length (about ${median} minutes); adjust it if that is wrong.`,
  };
}

// ─────────────────────────────────────────────────────────────
// Prioritisation
// ─────────────────────────────────────────────────────────────

export interface CandidateTask {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
  dueDate: Date | null;
  goalId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  goalTitle: string | null;
  timeTakenSec: number | null;
}

export interface TaskScore {
  taskId: string;
  title: string;
  score: number;
  /** Which factors fired, each with the figures behind it. Never a bare number. */
  reasons: string[];
  /** The single strongest reason, for a one-line list. */
  headline: string;
  urgency: 'overdue' | 'today' | 'soon' | 'none';
  daysOverdue: number | null;
  daysUntilDue: number | null;
  contributesTo: string | null;
}

const PRIORITY_WEIGHT: Record<CandidateTask['priority'], number> = { URGENT: 40, HIGH: 25, MEDIUM: 10, LOW: 0 };

/**
 * Rank open work.
 *
 * The weights are a stated heuristic, not a model output: overdue dominates,
 * then declared priority, then a deadline inside the week, then whether the
 * task is the only thing moving an active goal. Two rules matter more than the
 * arithmetic though — a task with no deadline is never called "urgent", and a
 * work-in-progress task outranks a fresh one of the same shape, because
 * finishing beats starting.
 */
export function prioritise(tasks: CandidateTask[], today: string, opts: { goalIds: Set<string> } = { goalIds: new Set() }): TaskScore[] {
  const scored: TaskScore[] = [];
  for (const t of tasks) {
    if (t.status !== 'TODO' && t.status !== 'IN_PROGRESS') continue;
    const reasons: string[] = [];
    let score = PRIORITY_WEIGHT[t.priority];

    let urgency: TaskScore['urgency'] = 'none';
    let daysOverdue: number | null = null;
    let daysUntilDue: number | null = null;

    if (t.dueDate) {
      const dueKey = dateKey(t.dueDate);
      const delta = daysBetweenKeys(dueKey, today); // positive = past due
      if (delta > 0) {
        urgency = 'overdue';
        daysOverdue = delta;
        // Age matters, but it must not let an ancient trivial task outrank a
        // deadline today: the curve flattens at two weeks.
        score += 50 + Math.min(delta, 14) * 2;
        reasons.push(`Overdue by ${delta} day${delta === 1 ? '' : 's'}.`);
      } else if (delta === 0) {
        urgency = 'today';
        daysUntilDue = 0;
        score += 45;
        reasons.push('Due today.');
      } else {
        daysUntilDue = -delta;
        if (-delta <= 3) {
          urgency = 'soon';
          score += 30 - (-delta) * 4;
          reasons.push(`Due in ${-delta} day${-delta === 1 ? '' : 's'}.`);
        } else if (-delta <= 7) {
          urgency = 'soon';
          score += 10;
          reasons.push(`Due this week (${-delta} days).`);
        } else {
          reasons.push(`Due in ${-delta} days.`);
        }
      }
    }

    if (t.priority === 'URGENT') reasons.push('You marked it urgent.');
    else if (t.priority === 'HIGH') reasons.push('You marked it high priority.');

    if (t.status === 'IN_PROGRESS') {
      score += 12;
      reasons.push('Already started, so finishing it is cheaper than starting something new.');
    }

    if (t.goalId && opts.goalIds.has(t.goalId)) {
      score += 15;
      reasons.push(`It is part of the active goal "${t.goalTitle ?? 'a goal'}".`);
    }

    if (t.projectId) score += 3;

    if (!reasons.length) reasons.push('Nothing about it is urgent; it ranks on priority alone.');

    scored.push({
      taskId: t.id,
      title: t.title,
      score,
      reasons,
      headline: reasons[0],
      urgency,
      daysOverdue,
      daysUntilDue,
      contributesTo: t.goalTitle ?? t.projectTitle ?? null,
    });
  }
  return scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

// ─────────────────────────────────────────────────────────────
// Daily plan
// ─────────────────────────────────────────────────────────────

export interface PlannedBlock {
  taskId: string;
  title: string;
  minutes: number;
  why: string;
}

export interface DailyPlanFact {
  date: string;
  budget: TimeBudget;
  priorities: TaskScore[];
  /** What fits in the stated/estimated time, in order. */
  blocks: PlannedBlock[];
  /** Open work that did not fit, with the reason it was left out. */
  postponed: { taskId: string; title: string; reason: string }[];
  deadlines: { id: string; title: string; dueDate: string; daysUntil: number }[];
  breaks: string[];
  /** Anything the plan could not know, said plainly. */
  caveats: string[];
  context: {
    openTasks: number;
    overdueTasks: number;
    sessionsLogged30d: number;
    lastSessionMinutes: number | null;
    wellness: { stress: number | null; energy: number | null; sleepQuality: number | null } | null;
    activeProjects: number;
    activeGoals: number;
  };
}

function estimateMinutes(t: CandidateTask, samples: number[]): number {
  if (t.timeTakenSec && t.timeTakenSec > 60) return Math.round(t.timeTakenSec / 60);
  if (!samples.length) return 30;
  const sorted = [...samples].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] / 60) || 30;
}

/**
 * Build a day that fits.
 *
 * The rule that makes this honest: a plan is only ever built from the time the
 * person has, so tasks that do not fit are named as postponed rather than
 * crammed in. What a task costs is taken from the user's own recorded times
 * when there are any, and stated as an estimate when there are not.
 */
export async function dailyPlan(userId: string, tz: string, opts: { date?: string; availableMinutes?: number | null; question?: string } = {}): Promise<DailyPlanFact> {
  const today = opts.date ?? todayKey(tz);

  const [openTasks, completedTasks, projects, goals, sessions, wellness] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] } },
      select: {
        id: true, title: true, priority: true, status: true, dueDate: true, goalId: true, projectId: true, timeTakenSec: true,
        project: { select: { title: true } }, goal: { select: { title: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 200,
    }),
    prisma.task.findMany({
      where: { userId, completedAt: { not: null } },
      select: { timeTakenSec: true },
      orderBy: { completedAt: 'desc' },
      take: 60,
    }),
    prisma.project.count({ where: { userId, archivedAt: null, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } } }),
    prisma.goal.findMany({ where: { userId, status: 'ACTIVE' }, select: { id: true, title: true, deadline: true } }),
    prisma.workSession.findMany({
      where: { userId, status: 'COMPLETED' },
      select: { durationSec: true, startedAt: true },
      orderBy: { startedAt: 'desc' },
      take: 60,
    }),
    prisma.dailyActivity.findFirst({ where: { userId }, orderBy: { date: 'desc' }, select: { stressLevel: true, energyLevel: true, sleepQuality: true, date: true } }),
  ]);

  const samples = completedTasks.map((t) => t.timeTakenSec ?? 0).filter((s) => s > 0);
  const budget = dailyBudget(sessions.map((s) => s.durationSec), opts.availableMinutes ?? null);

  const candidates: CandidateTask[] = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate,
    goalId: t.goalId,
    projectId: t.projectId,
    projectTitle: t.project?.title ?? null,
    goalTitle: t.goal?.title ?? null,
    timeTakenSec: t.timeTakenSec,
  }));

  const priorities = prioritise(candidates, today, { goalIds: new Set(goals.map((g) => g.id)) });

  const blocks: PlannedBlock[] = [];
  const postponed: DailyPlanFact['postponed'] = [];
  let left = budget.minutes ?? 0;

  for (const p of priorities) {
    const t = candidates.find((c) => c.id === p.taskId)!;
    const minutes = estimateMinutes(t, samples);
    // Everything essential goes in even when the estimate is over: a deadline
    // today is not postponed because the maths says so.
    const essential = p.urgency === 'overdue' || p.urgency === 'today';
    if ((budget.minutes !== null && minutes <= left) || (budget.minutes === null && blocks.length < 3) || (essential && blocks.length < 5)) {
      blocks.push({
        taskId: p.taskId,
        title: p.title,
        minutes,
        why: t.timeTakenSec ? `${p.headline} Usually takes you about ${minutes} minutes.` : `${p.headline} Estimated ${minutes} minutes; you have not recorded a time for this one.`,
      });
      left = Math.max(0, left - minutes);
    } else {
      postponed.push({
        taskId: p.taskId,
        title: p.title,
        reason:
          budget.minutes === null
            ? 'Kept off today because no available time was given, so nothing is assumed to fit.'
            : `Would need about ${minutes} minutes and only ${Math.max(0, Math.round(left))} are left.`,
      });
    }
  }

  const deadlines = openTasks
    .filter((t) => t.dueDate)
    .map((t) => ({ id: t.id, title: t.title, dueDate: dateKey(t.dueDate!), daysUntil: -daysBetweenKeys(dateKey(t.dueDate!), today) }))
    .filter((d) => d.daysUntil >= 0 && d.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 6);

  const caveats: string[] = [];
  if (budget.source === 'unknown') caveats.push(budget.basis);
  if (budget.source === 'typical_session') caveats.push(budget.basis);
  if (wellness && localDateKey(wellness.date, tz) !== today) caveats.push('No wellness check-in for today, so energy and stress are not part of this plan.');
  if (!wellness) caveats.push('No wellness records at all, so energy, stress and sleep are not part of this plan.');
  if (!samples.length) caveats.push('No completed tasks with a recorded time, so task durations are estimated at 30 minutes.');
  if (!openTasks.length) caveats.push('There is no open work, so there is nothing to schedule.');

  const breaks: string[] = [];
  if (blocks.length >= 3) breaks.push('A 10-minute break after every two tasks keeps the second half of the day usable.');
  if (wellness?.energyLevel !== null && wellness?.energyLevel !== undefined && wellness.energyLevel <= 2) {
    breaks.push(`You recorded low energy (${wellness.energyLevel}/5), so keep sessions shorter than usual and take breaks between them.`);
  }
  if (wellness?.stressLevel !== null && wellness?.stressLevel !== undefined && wellness.stressLevel >= 4) {
    breaks.push(`You recorded high stress (${wellness.stressLevel}/5). The plan below is deliberately short.`);
  }

  return {
    date: today,
    budget,
    priorities,
    blocks,
    postponed,
    deadlines,
    breaks,
    caveats,
    context: {
      openTasks: openTasks.length,
      overdueTasks: priorities.filter((p) => p.urgency === 'overdue').length,
      sessionsLogged30d: sessions.filter((s) => daysBetweenKeys(localDateKey(s.startedAt, tz), today) <= 30).length,
      lastSessionMinutes: sessions[0] ? Math.round(sessions[0].durationSec / 60) : null,
      wellness: wellness
        ? { stress: wellness.stressLevel, energy: wellness.energyLevel, sleepQuality: wellness.sleepQuality }
        : null,
      activeProjects: projects,
      activeGoals: goals.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Weekly review
// ─────────────────────────────────────────────────────────────

export interface WeekFacts {
  weekStart: string;
  weekEnd: string;
  tasksCompleted: number;
  tasksCreated: number;
  overdueOpen: number;
  focusMinutes: number;
  focusSessions: number;
  habitLogs: number;
  habitRate: number | null;
  moodAverage: number | null;
  wellnessDays: number;
  avgStress: number | null;
  avgEnergy: number | null;
  milestonesDone: number;
  levelsGained: number;
  skillsPractised: number;
}

export interface WeeklyReviewFact {
  thisWeek: WeekFacts;
  previousWeek: WeekFacts | null;
  deltas: { key: keyof WeekFacts; label: string; thisWeek: number | null; previous: number | null; change: number | null }[];
  goals: { id: string; title: string; current: number | null; target: number | null; metric: string | null; deadline: string | null; fraction: number | null }[];
  behindGoals: NonNullable<WeeklyReviewFact['goals']>;
  skillRead: ReturnType<typeof analyseGrowth>;
  obstacles: string[];
  caveats: string[];
  enoughData: boolean;
}

const WEEK_KEYS: { key: keyof WeekFacts; label: string }[] = [
  { key: 'tasksCompleted', label: 'Tasks completed' },
  { key: 'focusMinutes', label: 'Focus minutes' },
  { key: 'habitLogs', label: 'Habit check-ins' },
  { key: 'overdueOpen', label: 'Still overdue' },
  { key: 'milestonesDone', label: 'Milestones reached' },
  { key: 'levelsGained', label: 'Skill levels gained' },
];

async function weekFacts(userId: string, tz: string, weekStart: string): Promise<WeekFacts> {
  const weekEnd = addDaysKey(weekStart, 6);
  const from = new Date(`${weekStart}T00:00:00.000Z`);
  const to = new Date(`${addDaysKey(weekStart, 7)}T00:00:00.000Z`);

  const [completed, created, overdue, sessions, habits, habitsCount, moods, wellness, milestones, growth] = await Promise.all([
    prisma.task.count({ where: { userId, completedAt: { gte: from, lt: to } } }),
    prisma.task.count({ where: { userId, createdAt: { gte: from, lt: to } } }),
    prisma.task.count({ where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: to } } }),
    prisma.workSession.findMany({ where: { userId, status: 'COMPLETED', date: { gte: from, lt: to } }, select: { durationSec: true } }),
    prisma.habitLog.findMany({ where: { userId, date: { gte: from, lt: to } }, select: { id: true } }),
    prisma.habit.count({ where: { userId } }),
    prisma.moodLog.findMany({ where: { userId, date: { gte: from, lt: to } }, select: { score: true } }),
    prisma.dailyActivity.findMany({ where: { userId, date: { gte: from, lt: to } }, select: { stressLevel: true, energyLevel: true } }),
    prisma.milestone.count({ where: { userId, completedAt: { gte: from, lt: to } } }),
    collectGrowth(userId, tz, 7),
  ]);

  const focusMinutes = Math.round(sessions.reduce((a, s) => a + s.durationSec, 0) / 60);
  const stress = wellness.map((w) => w.stressLevel).filter((n): n is number => n !== null);
  const energy = wellness.map((w) => w.energyLevel).filter((n): n is number => n !== null);
  const g = analyseGrowth({ ...growth, windowStart: weekStart, today: weekEnd });

  return {
    weekStart,
    weekEnd,
    tasksCompleted: completed,
    tasksCreated: created,
    overdueOpen: overdue,
    focusMinutes,
    focusSessions: sessions.length,
    habitLogs: habits.length,
    habitRate: habitsCount > 0 ? Math.round((habits.length / (habitsCount * 7)) * 100) : null,
    moodAverage: moods.length ? Math.round((moods.reduce((a, m) => a + m.score, 0) / moods.length) * 10) / 10 : null,
    wellnessDays: wellness.length,
    avgStress: stress.length ? Math.round((stress.reduce((a, b) => a + b, 0) / stress.length) * 10) / 10 : null,
    avgEnergy: energy.length ? Math.round((energy.reduce((a, b) => a + b, 0) / energy.length) * 10) / 10 : null,
    milestonesDone: milestones,
    levelsGained: g.totals.levelsGained,
    skillsPractised: g.totals.practiceDays,
  };
}

export async function weeklyReview(userId: string, tz: string): Promise<WeeklyReviewFact> {
  const today = todayKey(tz);
  const thisStart = startOfWeekKey(today);
  const prevStart = addDaysKey(thisStart, -7);

  const [thisWeek, previousWeek, goalRows, growth] = await Promise.all([
    weekFacts(userId, tz, thisStart),
    weekFacts(userId, tz, prevStart),
    prisma.goal.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, title: true, current: true, target: true, metric: true, deadline: true },
      orderBy: { deadline: 'asc' },
      take: 12,
    }),
    collectGrowth(userId, tz, 7),
  ]);

  const skillRead = analyseGrowth({ ...growth, windowStart: thisStart, today });

  const goals = goalRows.map((g) => ({
    id: g.id,
    title: g.title,
    current: g.current,
    target: g.target,
    metric: g.metric,
    deadline: g.deadline ? dateKey(g.deadline) : null,
    // No target means no fraction. A blank is not a zero.
    fraction: g.target && g.target > 0 && g.current !== null ? Math.min(1, Math.max(0, g.current / g.target)) : null,
  }));

  const behindGoals = goals.filter((g) => g.fraction !== null && g.fraction < 0.5 && g.deadline !== null);

  const deltas = WEEK_KEYS.map(({ key, label }) => {
    const a = thisWeek[key] as number | null;
    const b = previousWeek[key] as number | null;
    return { key, label, thisWeek: a, previous: b, change: a !== null && b !== null ? a - b : null };
  });

  // Obstacles are only ever things the records show. Each names its figure.
  const obstacles: string[] = [];
  if (thisWeek.overdueOpen > 0) obstacles.push(`${thisWeek.overdueOpen} task${thisWeek.overdueOpen === 1 ? '' : 's'} are still open past their due date.`);
  if (thisWeek.tasksCreated > thisWeek.tasksCompleted) obstacles.push(`You added ${thisWeek.tasksCreated} tasks and completed ${thisWeek.tasksCompleted}, so the backlog grew this week.`);
  if (thisWeek.focusSessions === 0) obstacles.push('No focus sessions were recorded this week.');
  if (previousWeek && thisWeek.focusMinutes < previousWeek.focusMinutes * 0.6 && previousWeek.focusMinutes > 0) {
    obstacles.push(`Focus time fell from ${previousWeek.focusMinutes} to ${thisWeek.focusMinutes} minutes.`);
  }
  if (thisWeek.habitRate !== null && thisWeek.habitRate < 50) obstacles.push(`Habit check-ins covered ${thisWeek.habitRate}% of the possible days.`);
  if (thisWeek.avgStress !== null && thisWeek.avgStress >= 4) obstacles.push(`Average recorded stress was ${thisWeek.avgStress}/5.`);
  if (thisWeek.avgEnergy !== null && thisWeek.avgEnergy <= 2) obstacles.push(`Average recorded energy was ${thisWeek.avgEnergy}/5.`);
  for (const g of behindGoals.slice(0, 3)) {
    obstacles.push(`"${g.title}" stands at ${g.current ?? 0} of ${g.target ?? '?'}${g.metric ? ` ${g.metric}` : ''} with a deadline on ${g.deadline}.`);
  }

  const caveats: string[] = [];
  if (thisWeek.tasksCompleted === 0 && thisWeek.tasksCreated === 0) caveats.push('No tasks were recorded this week, so task figures cannot be read as a slowdown.');
  if (thisWeek.wellnessDays === 0) caveats.push('No wellness check-ins this week, so energy and stress are absent rather than zero.');
  if (thisWeek.habitRate === null) caveats.push('No habits are tracked, so consistency has nothing to measure.');
  if (previousWeek.tasksCompleted === 0 && previousWeek.focusMinutes === 0) caveats.push('Last week has almost no records, so week-on-week comparisons are mostly unavailable.');

  const enoughData =
    thisWeek.tasksCompleted + thisWeek.focusSessions + thisWeek.habitLogs + thisWeek.wellnessDays + skillRead.totals.practiceDays >= 3;

  return { thisWeek, previousWeek, deltas, goals, behindGoals, skillRead, obstacles, caveats, enoughData };
}

/** A compact, labelled block for a prompt: measured figures and nothing else. */
export function planForPrompt(p: DailyPlanFact): string {
  const lines = [
    `DATE: ${p.date}`,
    `TIME AVAILABLE: ${p.budget.minutes === null ? 'not known' : `${p.budget.minutes} minutes`} (${p.budget.basis})`,
    `WORKLOAD: ${p.context.openTasks} open, ${p.context.overdueTasks} overdue, ${p.context.activeProjects} active containers, ${p.context.activeGoals} active goals.`,
    `WELLNESS (recorded): ${p.context.wellness ? `stress ${p.context.wellness.stress ?? 'not recorded'}/5, energy ${p.context.wellness.energy ?? 'not recorded'}/5, sleep quality ${p.context.wellness.sleepQuality ?? 'not recorded'}/5` : 'nothing recorded'}`,
    '',
    'RANKED OPEN WORK (scored by overdue, declared priority, deadline proximity, in-progress state and goal link):',
    ...p.priorities.slice(0, 10).map((t, i) => `${i + 1}. ${t.title} [${t.urgency}] — ${t.reasons.join(' ')}`),
    '',
    'FITS THE TIME:',
    ...(p.blocks.length ? p.blocks.map((b) => `- ${b.title} (${b.minutes} min) — ${b.why}`) : ['- nothing fits, or nothing is open']),
    '',
    'DOES NOT FIT:',
    ...(p.postponed.length ? p.postponed.slice(0, 8).map((x) => `- ${x.title} — ${x.reason}`) : ['- nothing was postponed']),
    '',
    'DEADLINES (next 14 days):',
    ...(p.deadlines.length ? p.deadlines.map((d) => `- ${d.title} — in ${d.daysUntil} day${d.daysUntil === 1 ? '' : 's'} (${d.dueDate})`) : ['- none recorded']),
  ];
  if (p.caveats.length) lines.push('', 'STATED UNCERTAINTIES:', ...p.caveats.map((c) => `- ${c}`));
  return lines.join('\n');
}

export function reviewForPrompt(r: WeeklyReviewFact): string {
  const n = (v: number | null, suffix = '') => (v === null ? 'not recorded' : `${v}${suffix}`);
  const lines = [
    `WEEK: ${r.thisWeek.weekStart} to ${r.thisWeek.weekEnd} (the user's own week, starting Monday)`,
    `THIS WEEK: ${r.thisWeek.tasksCompleted} tasks completed, ${r.thisWeek.tasksCreated} created, ${r.thisWeek.overdueOpen} still overdue; ${r.thisWeek.focusMinutes} focus minutes over ${r.thisWeek.focusSessions} sessions; ${r.thisWeek.habitLogs} habit check-ins (${n(r.thisWeek.habitRate, '%')} coverage); ${r.thisWeek.milestonesDone} milestones reached; ${r.thisWeek.levelsGained} skill level changes.`,
    `WELLNESS RECORDED: ${r.thisWeek.wellnessDays} days, avg stress ${n(r.thisWeek.avgStress, '/5')}, avg energy ${n(r.thisWeek.avgEnergy, '/5')}.`,
    `PREVIOUS WEEK: ${r.previousWeek ? `${r.previousWeek.tasksCompleted} tasks completed, ${r.previousWeek.focusMinutes} focus minutes, ${r.previousWeek.habitLogs} habit check-ins.` : 'not available'}`,
    '',
    'CHANGES AGAINST THEIR OWN PREVIOUS WEEK:',
    ...r.deltas.map((d) => `- ${d.label}: ${n(d.thisWeek)} vs ${n(d.previous)} (${d.change === null ? 'no comparison possible' : d.change > 0 ? `+${d.change}` : `${d.change}`})`),
    '',
    'GOALS:',
    ...(r.goals.length
      ? r.goals.map((g) => `- ${g.title}: ${g.current ?? 'not recorded'} of ${g.target ?? 'no target'}${g.metric ? ` ${g.metric}` : ''}${g.deadline ? `, due ${g.deadline}` : ', no deadline'}${g.fraction === null ? ' — no percentage can be computed' : ''}`)
      : ['- none active']),
    '',
    'SKILLS:',
    ...(r.skillRead.perSkill.length
      ? r.skillRead.perSkill.map((s) => `- ${s.name}: ${s.currentLevel}, ${s.practiceMinutes} minutes on ${s.practiceDays} day(s) this week. ${s.evidence}`)
      : ['- none tracked']),
  ];
  if (r.obstacles.length) lines.push('', 'WHAT THE RECORDS SHOW AS OBSTACLES:', ...r.obstacles.map((o) => `- ${o}`));
  if (r.caveats.length) lines.push('', 'STATED GAPS:', ...r.caveats.map((c) => `- ${c}`));
  return lines.join('\n');
}

export type { SkillLevel };
