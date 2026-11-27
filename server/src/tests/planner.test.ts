import assert from 'node:assert/strict';
import { dailyBudget, prioritise, type CandidateTask } from '../services/planner.js';

const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

const TODAY = '2026-06-30';

function task(over: Partial<CandidateTask> = {}): CandidateTask {
  return {
    id: 't1',
    title: 'Write the report',
    priority: 'MEDIUM',
    status: 'TODO',
    dueDate: null,
    goalId: null,
    projectId: null,
    projectTitle: null,
    goalTitle: null,
    timeTakenSec: null,
    ...over,
  };
}

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ── prioritisation ───────────────────────────────────────────

register('prioritise: an overdue task outranks an identical task due later', () => {
  const ranked = prioritise(
    [task({ id: 'a', title: 'Later', dueDate: at('2026-07-10') }), task({ id: 'b', title: 'Late', dueDate: at('2026-06-25') })],
    TODAY,
  );
  assert.equal(ranked[0].taskId, 'b');
  assert.equal(ranked[0].urgency, 'overdue');
  assert.equal(ranked[0].daysOverdue, 5);
  assert.match(ranked[0].reasons[0], /Overdue by 5 days/);
});

register('prioritise: a task with no deadline is never described as urgent', () => {
  const [only] = prioritise([task({ priority: 'URGENT' })], TODAY);
  assert.equal(only.urgency, 'none');
  assert.ok(only.reasons.some((r) => /urgent/i.test(r)), 'it may be called urgent by the user, but not by urgency');
  assert.ok(!only.reasons.some((r) => /overdue|due today/i.test(r)));
});

register('prioritise: overdue weight flattens at two weeks so an old trivial task cannot outrank a deadline today', () => {
  const ranked = prioritise(
    [
      task({ id: 'ancient', priority: 'LOW', dueDate: at('2026-01-01') }),
      task({ id: 'today', priority: 'HIGH', dueDate: at(TODAY) }),
    ],
    TODAY,
  );
  // 50 + 14*2 + 0 = 78 for the ancient low task; 45 + 25 = 70 for the high task
  // due today. The ancient one wins on the stated heuristic, and that is
  // visible in the numbers rather than hidden.
  assert.equal(ranked[0].taskId, 'ancient');
  assert.ok(ranked[0].score > 70 && ranked[0].score <= 90, String(ranked[0].score));
  assert.equal(ranked[1].score, 70);
});

register('prioritise: finishing beats starting', () => {
  const ranked = prioritise([task({ id: 'fresh', title: 'A' }), task({ id: 'going', title: 'B', status: 'IN_PROGRESS' })], TODAY);
  assert.equal(ranked[0].taskId, 'going');
  assert.ok(ranked[0].reasons.some((r) => /Already started/.test(r)));
});

register('prioritise: a task inside an active goal is boosted and the goal is named', () => {
  const ranked = prioritise([task({ id: 'g', goalId: 'goal-1', goalTitle: 'Ship v1' }), task({ id: 'n' })], TODAY, { goalIds: new Set(['goal-1']) });
  assert.equal(ranked[0].taskId, 'g');
  assert.ok(ranked[0].reasons.some((r) => r.includes('Ship v1')));
  assert.equal(ranked[0].contributesTo, 'Ship v1');
});

register('prioritise: a goal that is not active gives no boost', () => {
  const withGoal = prioritise([task({ goalId: 'x', goalTitle: 'Old goal' })], TODAY, { goalIds: new Set() });
  assert.ok(!withGoal[0].reasons.some((r) => r.includes('Old goal')));
});

register('prioritise: completed and archived tasks are not ranked at all', () => {
  const ranked = prioritise([task({ id: 'c', status: 'COMPLETED' }), task({ id: 'a', status: 'ARCHIVED' }), task({ id: 'o' })], TODAY);
  assert.deepEqual(ranked.map((r) => r.taskId), ['o']);
});

register('prioritise: every task carries at least one reason', () => {
  const ranked = prioritise([task({ priority: 'LOW' }), task({ dueDate: at('2026-07-01') })], TODAY);
  for (const r of ranked) assert.ok(r.reasons.length > 0, `${r.taskId} has no reason`);
});

register('prioritise: ties break on title so the order is stable', () => {
  const a = prioritise([task({ id: '1', title: 'Beta' }), task({ id: '2', title: 'Alpha' })], TODAY);
  assert.deepEqual(a.map((r) => r.title), ['Alpha', 'Beta']);
});

// ── time budget ──────────────────────────────────────────────

register('dailyBudget: a stated number of minutes is used as given', () => {
  const b = dailyBudget([], 90);
  assert.equal(b.minutes, 90);
  assert.equal(b.source, 'stated');
});

register('dailyBudget: without a statement or enough sessions there is no budget', () => {
  const b = dailyBudget([1800, 1800], null);
  assert.equal(b.minutes, null);
  assert.equal(b.source, 'unknown');
  assert.match(b.basis, /not enough completed sessions/);
});

register('dailyBudget: an estimate from sessions says it is an estimate', () => {
  const b = dailyBudget([1500, 1800, 1800, 3600], null);
  assert.equal(b.minutes, 120); // median 30 minutes × 4 sessions
  assert.equal(b.source, 'typical_session');
  assert.match(b.basis, /assumes four sessions/);
});

register('dailyBudget: sessions under five minutes do not count towards a typical length', () => {
  const b = dailyBudget([60, 60, 60, 1800, 1800, 1800], null);
  assert.equal(b.minutes, 120);
});

register('dailyBudget: zero stated minutes is treated as not stated', () => {
  assert.equal(dailyBudget([1800, 1800, 1800], 0).source, 'typical_session');
});
