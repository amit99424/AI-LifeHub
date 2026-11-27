import assert from 'node:assert/strict';
import { nextOccurrence } from '../routes/tasks.js';
import { projectProgress } from '../routes/projects.js';
import { goalProgress } from '../routes/goals.js';
import { computeFeatures } from '../services/features.js';
import { analyseLife, summarisePeriod } from '../services/lifeEngine.js';

const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// ── recurrence ────────────────────────────────────────────────
register('recurrence: daily advances by its interval', () => {
  assert.equal(nextOccurrence(d('2026-03-10'), 'DAILY', 1, null)?.toISOString().slice(0, 10), '2026-03-11');
  assert.equal(nextOccurrence(d('2026-03-10'), 'DAILY', 3, null)?.toISOString().slice(0, 10), '2026-03-13');
});

register('recurrence: weekdays skips the weekend', () => {
  // 2026-03-13 is a Friday.
  assert.equal(nextOccurrence(d('2026-03-13'), 'WEEKDAYS', 1, null)?.toISOString().slice(0, 10), '2026-03-16');
  // A Saturday rolls to Monday, not Sunday.
  assert.equal(nextOccurrence(d('2026-03-14'), 'WEEKDAYS', 1, null)?.toISOString().slice(0, 10), '2026-03-16');
});

register('recurrence: weekly and monthly advance by their interval', () => {
  assert.equal(nextOccurrence(d('2026-03-10'), 'WEEKLY', 2, null)?.toISOString().slice(0, 10), '2026-03-24');
  assert.equal(nextOccurrence(d('2026-03-10'), 'MONTHLY', 1, null)?.toISOString().slice(0, 10), '2026-04-10');
});

register('recurrence: the series stops at its until date', () => {
  const until = d('2026-03-12');
  assert.equal(nextOccurrence(d('2026-03-10'), 'DAILY', 1, until)?.toISOString().slice(0, 10), '2026-03-11');
  // A step landing exactly on the until date still runs -- the date is
  // inclusive, so "until 12 March" includes 12 March.
  assert.equal(nextOccurrence(d('2026-03-11'), 'DAILY', 1, until)?.toISOString().slice(0, 10), '2026-03-12');
  // The next step would land after it, so the series is finished.
  assert.equal(nextOccurrence(d('2026-03-12'), 'DAILY', 1, until), null);
});

register('recurrence: NONE never spawns a next instance', () => {
  assert.equal(nextOccurrence(d('2026-03-10'), 'NONE', 1, null), null);
});

register('recurrence: a late completion does not shift the series', () => {
  // The task was due on the 10th and is ticked off on the 15th. The next one
  // is still due on the 11th -- the series follows its own dates, not "now".
  assert.equal(nextOccurrence(d('2026-03-10'), 'DAILY', 1, null)?.toISOString().slice(0, 10), '2026-03-11');
});

// ── progress ──────────────────────────────────────────────────
register('project progress: no tasks means no percentage', () => {
  assert.equal(projectProgress({ total: 0, done: 0 }), null);
  assert.equal(projectProgress({ total: 4, done: 1 }), 25);
  assert.equal(projectProgress({ total: 3, done: 3 }), 100);
});

register('goal progress: a goal without a target has no percentage', () => {
  assert.equal(goalProgress({ current: 3, target: null }), null);
  assert.equal(goalProgress({ current: null, target: 10 }), null);
  assert.equal(goalProgress({ current: 0, target: 0 }), null);
  assert.equal(goalProgress({ current: 5, target: 10 }), 50);
  // Never over 100: overshooting a goal is not 140% of it.
  assert.equal(goalProgress({ current: 14, target: 10 }), 100);
});

// ── features: study/work and goals ────────────────────────────
/** computeFeatures takes (data, opts) -- the opts are not part of the data. */
function fixture(overrides: Record<string, unknown> = {}) {
  const from = d('2026-03-01');
  const to = d('2026-03-15');
  return {
    from,
    to,
    tz: 'UTC',
    todayKey: '2026-03-14',
    data: {
      tasks: [],
      completedTasks: [],
      habits: [],
      habitLogs: [],
      moodLogs: [],
      journalEntries: [],
      workSessions: [],
      dailyActivities: [],
      openTasks: [],
      projects: [],
      goals: [],
      ...overrides,
    },
  };
}

register('features: project time is grouped by container, unfiled time kept apart', () => {
  const { from, to, tz, data } = fixture({
    workSessions: [
      { startedAt: d('2026-03-02'), category: 'STUDYING', durationSec: 3600, focusScore: 4, projectId: 'p1', project: { title: 'Data Structures', kind: 'STUDY' } },
      { startedAt: d('2026-03-03'), category: 'STUDYING', durationSec: 1800, focusScore: 3, projectId: 'p1', project: { title: 'Data Structures', kind: 'STUDY' } },
      { startedAt: d('2026-03-04'), category: 'OTHER', durationSec: 1200, focusScore: null, projectId: null, project: null },
    ],
  });
  const f = computeFeatures(data as never, { from, to, tz, todayKey: '2026-03-14' });
  assert.equal(f.studyWork.byProject.length, 1);
  assert.equal(f.studyWork.byProject[0].project, 'Data Structures');
  assert.equal(f.studyWork.byProject[0].minutes, 90);
  assert.equal(f.studyWork.byProject[0].sessions, 2);
  // Time with no container cannot be attributed, so it is reported separately.
  assert.equal(f.studyWork.unfiledMinutes, 20);
});

register('features: open and overdue tasks are counted per container', () => {
  const { from, to, tz, data } = fixture({
    openTasks: [
      { id: '1', title: 'a', priority: 'HIGH', dueDate: d('2026-02-20'), createdAt: d('2026-02-01'), status: 'TODO', projectId: 'p1', project: { title: 'Data Structures' }, parentId: null },
      { id: '2', title: 'b', priority: 'LOW', dueDate: null, createdAt: d('2026-02-01'), status: 'TODO', projectId: 'p1', project: { title: 'Data Structures' }, parentId: null },
      { id: '3', title: 'c', priority: 'LOW', dueDate: null, createdAt: d('2026-02-01'), status: 'TODO', projectId: null, project: null, parentId: null },
    ],
  });
  const f = computeFeatures(data as never, { from, to, tz, todayKey: '2026-03-14' });
  assert.equal(f.studyWork.openByProject.length, 1, 'tasks with no project are not a container');
  assert.equal(f.studyWork.openByProject[0].open, 2);
  assert.equal(f.studyWork.openByProject[0].overdue, 1);
});

register('features: only goals with a real target and a deadline can be behind', () => {
  const { from, to, tz, data } = fixture({
    goals: [
      { id: 'g1', title: 'Finish syllabus', target: 13, current: 4, metric: 'chapters', deadline: d('2026-03-20'), projectId: null },
      { id: 'g2', title: 'Read more', target: null, current: null, metric: null, deadline: d('2026-03-20'), projectId: null },
      { id: 'g3', title: 'Ship app', target: 10, current: 8, metric: 'features', deadline: d('2026-03-20'), projectId: null },
      { id: 'g4', title: 'No deadline', target: 10, current: 1, metric: 'x', deadline: null, projectId: null },
    ],
  });
  const f = computeFeatures(data as never, { from, to, tz, todayKey: '2026-03-14' });
  assert.equal(f.goals.active, 4);
  assert.equal(f.goals.withTarget, 3);
  assert.deepEqual(f.goals.behind.map((g) => g.title), ['Finish syllabus']);
});

// ── engine: project minutes reach the summary ─────────────────
register('engine: project minutes and days are summarised', () => {
  const days = [
    { date: '2026-03-01', score: 50, tasksCompleted: 1, projectMinutes: 60, projectTasksDone: 1 },
    { date: '2026-03-02', score: 50, tasksCompleted: 0, projectMinutes: 0, projectTasksDone: 0 },
    { date: '2026-03-03', score: 50, tasksCompleted: 0, projectMinutes: 45, projectTasksDone: 0 },
  ] as never[];
  const s = summarisePeriod(days);
  assert.equal(s.projectMinutes, 105);
  assert.equal(s.projectDays, 2);
  // Every day here reports tasksCompleted: 0 -- a recorded value -- so all
  // three count as tracked. The point of the test is the project totals.
  assert.equal(s.daysWithData, 3);
});

register('engine: project time alone does not create correlations', () => {
  const days = Array.from({ length: 20 }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, score: 40, projectMinutes: i * 5 }));
  const a = analyseLife({ days: days as never, hourly: [], weekday: [], domainsPresent: { tasks: false, habits: false, focus: false, mood: false, wellness: false } });
  assert.equal(a.correlations.correlations.length, 0);
  assert.ok(a.correlations.withheld.length > 0);
});

register('features: container progress is done over total, null with no tasks', () => {
  const { from, to, tz, data } = fixture({
    projects: [
      { id: 'p1', title: 'Data Structures', kind: 'STUDY', status: 'ACTIVE', deadline: d('2026-04-01'), tasks: [{ status: 'COMPLETED' }, { status: 'TODO' }, { status: 'TODO' }] },
      { id: 'p2', title: 'Empty subject', kind: 'STUDY', status: 'ACTIVE', deadline: null, tasks: [] },
      { id: 'p3', title: 'Finished', kind: 'WORK', status: 'COMPLETED', deadline: null, tasks: [{ status: 'COMPLETED' }] },
    ],
  });
  const f = computeFeatures(data as never, { from, to, tz, todayKey: '2026-03-14' });
  const ds = f.studyWork.progress.find((p) => p.title === 'Data Structures');
  assert.equal(ds?.tasksDone, 1);
  assert.equal(ds?.tasksTotal, 3);
  assert.equal(ds?.progressPct, 33);
  // No tasks is not 0%: there is nothing to measure.
  const empty = f.studyWork.progress.find((p) => p.title === 'Empty subject');
  assert.equal(empty?.progressPct, null);
  // A completed container is history, not open work.
  assert.equal(f.studyWork.progress.some((p) => p.title === 'Finished'), false);
});
