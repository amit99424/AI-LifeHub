/**
 * Reports — the same records, read at three scales.
 *
 * A report is not a new source of truth. Every figure here comes from the
 * tables the rest of the app already writes, and every period is compared with
 * the period immediately before it so nothing is measured against a stranger.
 *
 * The rule that shapes the whole file: a missing record is `null`, never 0. A
 * week with no wellness check-in has no wellness average — it does not have an
 * average of zero, which would read as "you felt terrible".
 */
import { prisma } from '../lib/prisma.js';
import { addDaysKey, dateKey, daysBetweenKeys, localDateKey, startOfWeekKey, todayKey } from '../lib/dates.js';
import { collectGrowth } from '../routes/skills.js';
import { analyseGrowth } from './growth.js';

export type ReportPeriod = 'day' | 'week' | 'month';

export interface ReportMetric {
  key: string;
  label: string;
  /** Recorded value, or null when nothing was recorded for the period. */
  value: number | null;
  unit: string | null;
  /** The same metric over the preceding period of equal length. */
  previous: number | null;
  change: number | null;
  /** False when the metric had no records at all, so the UI can say "not recorded". */
  recorded: boolean;
}

export interface ReportRow {
  date: string;
  tasksCompleted: number | null;
  tasksCreated: number | null;
  focusMinutes: number | null;
  habitCheckins: number | null;
  mood: number | null;
  stress: number | null;
  energy: number | null;
  sleepQuality: number | null;
  sleepHours: number | null;
}

export interface ReportGoal {
  id: string;
  title: string;
  current: number | null;
  target: number | null;
  metric: string | null;
  deadline: string | null;
  /** Null when there is no target: a blank is not zero percent. */
  fraction: number | null;
  milestonesDone: number;
  milestonesTotal: number;
}

export interface ReportProject {
  id: string;
  title: string;
  status: string;
  tasksDone: number;
  tasksTotal: number;
  minutes: number;
  fraction: number | null;
}

export interface ReportSkill {
  id: string;
  name: string;
  level: string;
  practiceMinutes: number;
  practiceDays: number;
  levelsGained: number;
}

export interface Report {
  period: ReportPeriod;
  range: { from: string; to: string; label: string };
  previousRange: { from: string; to: string };
  generatedAt: string;
  metrics: ReportMetric[];
  rows: ReportRow[];
  goals: ReportGoal[];
  projects: ReportProject[];
  skills: ReportSkill[];
  accomplishments: string[];
  needsAttention: string[];
  /** What could not be read, said plainly so a gap is never read as a zero. */
  gaps: string[];
  /** True when there is not enough to describe the period rather than list it. */
  thin: boolean;
  totals: { tasksCompleted: number; tasksCreated: number; focusMinutes: number; habitCheckins: number; daysWithData: number; days: number };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The first day of the month a date belongs to, as a key. */
export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** The last day of the month a date belongs to, as a key. */
export function monthEndKey(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0));
  return dateKey(last);
}

/**
 * The window a period covers, ending on `today`.
 *
 * A day is a day, a week is the user's own week (Monday by default, already
 * how the rest of the app counts weeks), and a month is the calendar month so
 * far — because "this month" is what a person means, not "the last 30 days".
 */
export function periodRange(period: ReportPeriod, today: string, weekStart = 1): { from: string; to: string; label: string; previous: { from: string; to: string } } {
  if (period === 'day') {
    return {
      from: today,
      to: today,
      label: `${today}`,
      previous: { from: addDaysKey(today, -1), to: addDaysKey(today, -1) },
    };
  }
  if (period === 'week') {
    const from = startOfWeekKey(today, weekStart);
    const to = addDaysKey(from, 6);
    return {
      from,
      to,
      label: `${from} to ${to}`,
      previous: { from: addDaysKey(from, -7), to: addDaysKey(from, -1) },
    };
  }
  const from = monthStartKey(today);
  const to = monthEndKey(today);
  const prevMonthAnchor = addDaysKey(from, -1);
  return {
    from,
    to,
    label: `${MONTHS[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`,
    previous: { from: monthStartKey(prevMonthAnchor), to: monthEndKey(prevMonthAnchor) },
  };
}

const MOOD_NUM: Record<string, number> = { VERY_LOW: 1, LOW: 2, NEUTRAL: 3, GOOD: 4, GREAT: 5 };

function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);
}

interface RawDay {
  key: string;
  tasksCompleted: number;
  tasksCreated: number;
  focusMinutes: number;
  habitCheckins: number;
  mood: number | null;
  stress: number | null;
  energy: number | null;
  sleepQuality: number | null;
  sleepHours: number | null;
}

async function readDays(userId: string, tz: string, from: string, to: string): Promise<RawDay[]> {
  const start = new Date(`${from}T00:00:00.000Z`);
  const endExclusive = new Date(`${addDaysKey(to, 1)}T00:00:00.000Z`);
  const keys: string[] = [];
  for (let k = from; daysBetweenKeys(k, to) >= 0; k = addDaysKey(k, 1)) keys.push(k);
  const byKey = new Map<string, RawDay>(
    keys.map((k) => [k, { key: k, tasksCompleted: 0, tasksCreated: 0, focusMinutes: 0, habitCheckins: 0, mood: null, stress: null, energy: null, sleepQuality: null, sleepHours: null }]),
  );

  const [completed, created, sessions, habitLogs, moods, activities] = await Promise.all([
    prisma.task.findMany({ where: { userId, completedAt: { gte: start, lt: endExclusive } }, select: { completedAt: true }, take: 5000 }),
    prisma.task.findMany({ where: { userId, createdAt: { gte: start, lt: endExclusive } }, select: { createdAt: true }, take: 5000 }),
    prisma.workSession.findMany({ where: { userId, status: 'COMPLETED', startedAt: { gte: start, lt: endExclusive } }, select: { startedAt: true, durationSec: true }, take: 5000 }),
    prisma.habitLog.findMany({ where: { userId, date: { gte: start, lt: endExclusive } }, select: { date: true }, take: 20000 }),
    prisma.moodLog.findMany({ where: { userId, date: { gte: start, lt: endExclusive } }, select: { date: true, level: true }, take: 5000 }),
    prisma.dailyActivity.findMany({ where: { userId, date: { gte: start, lt: endExclusive } }, select: { date: true, stressLevel: true, energyLevel: true, sleepQuality: true, sleepMinutes: true }, take: 5000 }),
  ]);

  for (const t of completed) {
    const d = byKey.get(localDateKey(t.completedAt!, tz));
    if (d) d.tasksCompleted += 1;
  }
  for (const t of created) {
    const d = byKey.get(localDateKey(t.createdAt, tz));
    if (d) d.tasksCreated += 1;
  }
  for (const s of sessions) {
    const d = byKey.get(localDateKey(s.startedAt, tz));
    if (d) d.focusMinutes += Math.round(s.durationSec / 60);
  }
  for (const h of habitLogs) {
    const d = byKey.get(localDateKey(h.date, tz));
    if (d) d.habitCheckins += 1;
  }
  for (const m of moods) {
    const d = byKey.get(localDateKey(m.date, tz));
    if (d) d.mood = MOOD_NUM[m.level] ?? null;
  }
  for (const a of activities) {
    const d = byKey.get(localDateKey(a.date, tz));
    if (!d) continue;
    d.stress = a.stressLevel;
    d.energy = a.energyLevel;
    d.sleepQuality = a.sleepQuality;
    d.sleepHours = a.sleepMinutes !== null ? Math.round((a.sleepMinutes / 60) * 10) / 10 : null;
  }
  return keys.map((k) => byKey.get(k)!);
}

function metric(key: string, label: string, value: number | null, previous: number | null, unit: string | null, recorded: boolean): ReportMetric {
  return { key, label, value, previous, unit, recorded, change: value !== null && previous !== null ? Math.round((value - previous) * 100) / 100 : null };
}

/** Build one report. Nothing here writes, and nothing here calls a model. */
export async function buildReport(userId: string, tz: string, period: ReportPeriod, opts: { weekStart?: number } = {}): Promise<Report> {
  const today = todayKey(tz);
  const range = periodRange(period, today, opts.weekStart ?? 1);

  const [current, previous] = await Promise.all([
    readDays(userId, tz, range.from, range.to),
    readDays(userId, tz, range.previous.from, range.previous.to),
  ]);

  const c = (k: keyof RawDay) => current.map((d) => d[k] as number | null);
  const p = (k: keyof RawDay) => previous.map((d) => d[k] as number | null);

  // A metric is "recorded" when at least one day in the period has a value.
  const recorded = (vals: (number | null)[]) => vals.some((v) => typeof v === 'number' && Number.isFinite(v));

  const metrics: ReportMetric[] = [
    metric('tasksCompleted', 'Tasks completed', sum(c('tasksCompleted')), sum(p('tasksCompleted')), null, recorded(c('tasksCompleted'))),
    metric('tasksCreated', 'Tasks created', sum(c('tasksCreated')), sum(p('tasksCreated')), null, recorded(c('tasksCreated'))),
    metric('focusMinutes', 'Focus minutes', sum(c('focusMinutes')), sum(p('focusMinutes')), 'min', recorded(c('focusMinutes'))),
    metric('habitCheckins', 'Habit check-ins', sum(c('habitCheckins')), sum(p('habitCheckins')), null, recorded(c('habitCheckins'))),
    metric('mood', 'Mood (1–5)', mean(c('mood')), mean(p('mood')), null, recorded(c('mood'))),
    metric('stress', 'Stress (1–5)', mean(c('stress')), mean(p('stress')), null, recorded(c('stress'))),
    metric('energy', 'Energy (1–5)', mean(c('energy')), mean(p('energy')), null, recorded(c('energy'))),
    metric('sleepQuality', 'Sleep quality (1–5)', mean(c('sleepQuality')), mean(p('sleepQuality')), null, recorded(c('sleepQuality'))),
    metric('sleepHours', 'Sleep (hours)', mean(c('sleepHours')), mean(p('sleepHours')), 'h', recorded(c('sleepHours'))),
  ];

  const start = new Date(`${range.from}T00:00:00.000Z`);
  const endExclusive = new Date(`${addDaysKey(range.to, 1)}T00:00:00.000Z`);

  const [goalRows, projectRows, growthData] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, status: { in: ['ACTIVE', 'ACHIEVED'] } },
      select: { id: true, title: true, current: true, target: true, metric: true, deadline: true, status: true, milestones: { select: { completedAt: true } } },
      orderBy: [{ deadline: 'asc' }],
      take: 30,
    }),
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      select: { id: true, title: true, status: true, tasks: { select: { status: true } }, sessions: { where: { startedAt: { gte: start, lt: endExclusive } }, select: { durationSec: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: 30,
    }),
    collectGrowth(userId, tz, daysBetweenKeys(range.from, range.to) + 1),
  ]);

  const goals: ReportGoal[] = goalRows.map((g) => ({
    id: g.id,
    title: g.title,
    current: g.current,
    target: g.target,
    metric: g.metric,
    deadline: g.deadline ? dateKey(g.deadline) : null,
    fraction: g.target && g.target > 0 && g.current !== null ? Math.min(1, Math.max(0, g.current / g.target)) : null,
    milestonesDone: g.milestones.filter((m) => m.completedAt).length,
    milestonesTotal: g.milestones.length,
  }));

  const projects: ReportProject[] = projectRows.map((pr) => {
    const total = pr.tasks.length;
    const done = pr.tasks.filter((t) => t.status === 'COMPLETED').length;
    return {
      id: pr.id,
      title: pr.title,
      status: pr.status,
      tasksDone: done,
      tasksTotal: total,
      minutes: Math.round(pr.sessions.reduce((a, s) => a + s.durationSec, 0) / 60),
      fraction: total > 0 ? done / total : null,
    };
  });

  const growth = analyseGrowth({ ...growthData, windowStart: range.from, today: range.to });
  const skills: ReportSkill[] = growth.perSkill.map((s) => ({
    id: s.skillId,
    name: s.name,
    level: s.currentLevel,
    practiceMinutes: s.practiceMinutes,
    practiceDays: s.practiceDays,
    levelsGained: s.levelsGainedInWindow,
  }));

  // Accomplishments are only ever records. Each line can be traced to a row.
  const accomplishments: string[] = [];
  const tasksCompleted = sum(c('tasksCompleted'));
  if (tasksCompleted > 0) accomplishments.push(`${tasksCompleted} task${tasksCompleted === 1 ? '' : 's'} completed.`);
  const focusMinutes = sum(c('focusMinutes'));
  if (focusMinutes > 0) accomplishments.push(`${focusMinutes} focus minute${focusMinutes === 1 ? '' : 's'} logged across ${current.filter((d) => d.focusMinutes > 0).length} day(s).`);
  const habitCheckins = sum(c('habitCheckins'));
  if (habitCheckins > 0) accomplishments.push(`${habitCheckins} habit check-in${habitCheckins === 1 ? '' : 's'}.`);
  const milestonesDone = goalRows.reduce((a, g) => a + g.milestones.filter((m) => m.completedAt && localDateKey(m.completedAt, tz) >= range.from && localDateKey(m.completedAt, tz) <= range.to).length, 0);
  if (milestonesDone > 0) accomplishments.push(`${milestonesDone} milestone${milestonesDone === 1 ? '' : 's'} reached.`);
  const levelsGained = growth.totals.levelsGained;
  if (levelsGained > 0) accomplishments.push(`${levelsGained} skill level change${levelsGained === 1 ? '' : 's'} recorded.`);
  const doneGoals = goalRows.filter((g) => g.status === 'ACHIEVED').length;
  if (doneGoals > 0) accomplishments.push(`${doneGoals} goal${doneGoals === 1 ? '' : 's'} completed.`);

  const needsAttention: string[] = [];
  const overdueNow = await prisma.task.count({ where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } } });
  if (overdueNow > 0) needsAttention.push(`${overdueNow} open task${overdueNow === 1 ? '' : 's'} past their due date.`);
  const behind = goals.filter((g) => g.fraction !== null && g.fraction < 0.5 && g.deadline !== null);
  for (const g of behind.slice(0, 3)) needsAttention.push(`"${g.title}" is at ${g.current ?? 0} of ${g.target ?? '?'}${g.metric ? ` ${g.metric}` : ''} with a deadline on ${g.deadline}.`);
  const stressAvg = mean(c('stress'));
  if (stressAvg !== null && stressAvg >= 4) needsAttention.push(`Average recorded stress was ${stressAvg}/5.`);
  const energyAvg = mean(c('energy'));
  if (energyAvg !== null && energyAvg <= 2) needsAttention.push(`Average recorded energy was ${energyAvg}/5.`);

  const gaps: string[] = [];
  if (!recorded(c('mood'))) gaps.push('No mood was recorded in this period.');
  if (!recorded(c('stress')) && !recorded(c('energy'))) gaps.push('No wellness check-ins in this period, so stress and energy are absent rather than zero.');
  if (!recorded(c('focusMinutes'))) gaps.push('No focus sessions were logged in this period.');
  if (!recorded(c('habitCheckins'))) gaps.push('No habit check-ins in this period.');
  if (!previous.length) gaps.push('The preceding period has no records, so comparisons are unavailable.');

  const daysWithData = current.filter(
    (d) => d.tasksCompleted > 0 || d.focusMinutes > 0 || d.habitCheckins > 0 || d.mood !== null || d.stress !== null || d.energy !== null,
  ).length;

  return {
    period,
    range: { from: range.from, to: range.to, label: range.label },
    previousRange: range.previous,
    generatedAt: new Date().toISOString(),
    metrics,
    rows: current.map((d) => ({
      date: d.key,
      tasksCompleted: d.tasksCompleted,
      tasksCreated: d.tasksCreated,
      focusMinutes: d.focusMinutes,
      habitCheckins: d.habitCheckins,
      mood: d.mood,
      stress: d.stress,
      energy: d.energy,
      sleepQuality: d.sleepQuality,
      sleepHours: d.sleepHours,
    })),
    goals,
    projects,
    skills,
    accomplishments,
    needsAttention,
    gaps,
    thin: daysWithData < Math.max(1, Math.ceil(current.length / 3)),
    totals: { tasksCompleted, tasksCreated: sum(c('tasksCreated')), focusMinutes, habitCheckins, daysWithData, days: current.length },
  };
}

/** A compact, labelled block for a prompt. Measured figures only. */
export function reportForPrompt(r: Report): string {
  const m = (k: string) => {
    const f = r.metrics.find((x) => x.key === k)!;
    return f.value === null ? 'not recorded' : `${f.value}${f.unit ? ' ' + f.unit : ''}${f.previous === null ? ' (no previous period)' : ` (previous ${f.previous})`}`;
  };
  const lines = [
    `REPORT: ${r.period} — ${r.range.from} to ${r.range.to}. Compared with ${r.previousRange.from} to ${r.previousRange.to}.`,
    `Days with any record: ${r.totals.daysWithData} of ${r.totals.days}.`,
    `Tasks completed: ${m('tasksCompleted')}; tasks created: ${m('tasksCreated')}; focus minutes: ${m('focusMinutes')}; habit check-ins: ${m('habitCheckins')}.`,
    `Wellness — mood: ${m('mood')}; stress: ${m('stress')}; energy: ${m('energy')}; sleep quality: ${m('sleepQuality')}; sleep hours: ${m('sleepHours')}.`,
    '',
    'GOALS:',
    ...(r.goals.length ? r.goals.map((g) => `- ${g.title}: ${g.current ?? 'not recorded'} of ${g.target ?? 'no target'}${g.metric ? ` ${g.metric}` : ''}${g.fraction === null ? ' (no percentage computable)' : ` (${Math.round(g.fraction * 100)}%)`}${g.deadline ? `, due ${g.deadline}` : ''}; milestones ${g.milestonesDone}/${g.milestonesTotal}`) : ['- none']),
    '',
    'PROJECTS:',
    ...(r.projects.length ? r.projects.map((p) => `- ${p.title} [${p.status}]: ${p.tasksDone}/${p.tasksTotal} tasks done${p.fraction === null ? '' : ` (${Math.round(p.fraction * 100)}%)`}, ${p.minutes} minutes in this period`) : ['- none']),
    '',
    'SKILLS:',
    ...(r.skills.length ? r.skills.map((s) => `- ${s.name}: ${s.level}, ${s.practiceMinutes} minutes on ${s.practiceDays} day(s), ${s.levelsGained} level change(s)`) : ['- none tracked']),
  ];
  if (r.gaps.length) lines.push('', 'STATED GAPS:', ...r.gaps.map((g) => `- ${g}`));
  return lines.join('\n');
}

/** CSV of the daily rows, plus a header block naming the range and the gaps. */
export function reportToCsv(r: Report): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(`AI-LifeHub ${r.period} report`);
  lines.push(`Range,${esc(`${r.range.from} to ${r.range.to}`)}`);
  lines.push(`Compared with,${esc(`${r.previousRange.from} to ${r.previousRange.to}`)}`);
  lines.push(`Generated,${esc(r.generatedAt)}`);
  lines.push('');
  lines.push('Metric,Value,Unit,Previous period,Change');
  for (const m of r.metrics) {
    lines.push([esc(m.label), esc(m.value === null ? 'not recorded' : m.value), esc(m.unit ?? ''), esc(m.previous ?? 'not recorded'), esc(m.change ?? '')].join(','));
  }
  lines.push('');
  lines.push('Date,Tasks completed,Tasks created,Focus minutes,Habit check-ins,Mood (1-5),Stress (1-5),Energy (1-5),Sleep quality (1-5),Sleep hours');
  for (const row of r.rows) {
    lines.push([row.date, row.tasksCompleted ?? '', row.tasksCreated ?? '', row.focusMinutes ?? '', row.habitCheckins ?? '', row.mood ?? '', row.stress ?? '', row.energy ?? '', row.sleepQuality ?? '', row.sleepHours ?? ''].join(','));
  }
  if (r.goals.length) {
    lines.push('');
    lines.push('Goal,Current,Target,Metric,Deadline,Percent,Milestones done,Milestones total');
    for (const g of r.goals) lines.push([esc(g.title), esc(g.current ?? ''), esc(g.target ?? ''), esc(g.metric ?? ''), esc(g.deadline ?? ''), esc(g.fraction === null ? '' : Math.round(g.fraction * 100)), g.milestonesDone, g.milestonesTotal].join(','));
  }
  if (r.projects.length) {
    lines.push('');
    lines.push('Project,Status,Tasks done,Tasks total,Minutes this period,Percent');
    for (const p of r.projects) lines.push([esc(p.title), esc(p.status), p.tasksDone, p.tasksTotal, p.minutes, esc(p.fraction === null ? '' : Math.round(p.fraction * 100))].join(','));
  }
  if (r.skills.length) {
    lines.push('');
    lines.push('Skill,Level,Practice minutes,Practice days,Level changes');
    for (const s of r.skills) lines.push([esc(s.name), esc(s.level), s.practiceMinutes, s.practiceDays, s.levelsGained].join(','));
  }
  if (r.gaps.length) {
    lines.push('');
    lines.push('Missing data');
    for (const g of r.gaps) lines.push(`"${g.replace(/"/g, '""')}"`);
  }
  return lines.join('\n');
}
