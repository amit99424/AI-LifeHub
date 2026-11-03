/**
 * Unit tests for the deterministic parts of the AI pipeline.
 * These do not need a database or an API key:
 *   - date/timezone helpers
 *   - productivity scoring
 *   - feature engineering (task/habit/mood aggregation)
 *   - prompt compaction
 */
const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

import assert from 'node:assert/strict';
import { addDaysKey, dateKey, hourBucket, localDateKey, localHour, rangeKeys, startOfWeekKey } from '../lib/dates.js';
import { scoreBand, scoreDay } from '../services/analytics.js';
import { compactFeatures, computeFeatures } from '../services/features.js';
import type { ActivityData } from '../services/collector.js';

const TZ = 'Asia/Kolkata';

register('localDateKey and localHour respect the timezone offset', () => {
  const at = new Date('2026-10-20T20:30:00.000Z'); // 02:00 next day in IST
  assert.equal(localDateKey(at, TZ), '2026-10-21');
  assert.equal(localHour(at, TZ), 2);
  assert.equal(localDateKey(at, 'UTC'), '2026-10-20');
});

register('hourBucket maps hours into four buckets', () => {
  assert.equal(hourBucket(6), 'morning');
  assert.equal(hourBucket(13), 'afternoon');
  assert.equal(hourBucket(19), 'evening');
  assert.equal(hourBucket(2), 'night');
});

register('rangeKeys and addDaysKey handle month boundaries', () => {
  assert.deepEqual(rangeKeys('2026-01-30', '2026-02-02'), ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  assert.equal(addDaysKey('2026-12-31', 1), '2027-01-01');
  assert.equal(startOfWeekKey('2026-11-01', 1), '2026-10-26'); // Sunday -> previous Monday
});

register('scoreDay weights only the components that have data', () => {
  const full = scoreDay({ tasksCompleted: 4, tasksDueOrPlanned: 4, habitsDone: 3, habitsActive: 3, focusMinutes: 120 });
  assert.equal(full.score, 100);
  assert.equal(full.components.tasks, 100);
  assert.equal(full.components.habits, 100);

  const habitsOnly = scoreDay({ tasksCompleted: 0, tasksDueOrPlanned: 0, habitsDone: 1, habitsActive: 2, focusMinutes: 0 });
  assert.ok(habitsOnly.score > 0 && habitsOnly.score <= 100, 'habits-only users still get a score');
  assert.equal(habitsOnly.components.tasks, 0);

  const nothing = scoreDay({ tasksCompleted: 0, tasksDueOrPlanned: 0, habitsDone: 0, habitsActive: 0, focusMinutes: 0 });
  assert.equal(nothing.score, 0);
});

register('scoreBand maps score ranges to labels', () => {
  assert.equal(scoreBand(90, true), 'excellent');
  assert.equal(scoreBand(65, true), 'good');
  assert.equal(scoreBand(45, true), 'fair');
  assert.equal(scoreBand(10, true), 'low');
  assert.equal(scoreBand(90, false), 'no-data');
});

function emptyData(): ActivityData {
  return {
    tasks: [],
    completedTasks: [],
    habits: [],
    habitLogs: [],
    moodLogs: [],
    journalEntries: [],
    workSessions: [],
    dailyActivities: [],
    openTasks: [],
  } as unknown as ActivityData;
}

register('computeFeatures aggregates real rows without inventing data', () => {
  const data = emptyData();
  const completedAt = new Date('2026-10-20T10:30:00.000Z'); // 16:00 IST -> afternoon
  (data.completedTasks as unknown[]).push({
    id: 't1',
    title: 'Ship feature',
    priority: 'HIGH',
    category: 'Work',
    dueDate: new Date('2026-10-20T23:59:00.000Z'),
    completedAt,
    createdAt: new Date('2026-10-20T06:00:00.000Z'),
    timeTakenSec: 3600,
  });
  (data.tasks as unknown[]).push({
    id: 't1',
    title: 'Ship feature',
    priority: 'HIGH',
    status: 'COMPLETED',
    category: 'Work',
    dueDate: new Date('2026-10-20T23:59:00.000Z'),
    completedAt,
    createdAt: new Date('2026-10-20T06:00:00.000Z'),
    timeTakenSec: 3600,
  });
  (data.openTasks as unknown[]).push({ id: 't2', title: 'Overdue thing', priority: 'URGENT', dueDate: new Date('2026-10-01T00:00:00.000Z'), createdAt: new Date('2026-09-30T00:00:00.000Z'), status: 'TODO' });

  const from = new Date('2026-10-14T00:00:00.000Z');
  const to = new Date('2026-10-21T00:00:00.000Z');
  const f = computeFeatures(data, { from, to, tz: TZ, todayKey: '2026-10-20' });

  assert.equal(f.tasks.totalCompleted, 1);
  assert.equal(f.tasks.completionRate, 1);
  assert.equal(f.tasks.completionsByBucket.afternoon, 1);
  assert.equal(f.tasks.completionsByBucket.morning, 0);
  assert.equal(f.tasks.overdueOpen, 1);
  assert.equal(f.tasks.highPriorityOpen, 1);
  assert.equal(f.availability.sufficientForPatterns, false, 'one task is not enough history');
  assert.ok(f.availability.missing.length > 0);
});

register('compactFeatures drops nulls so prompts stay small', () => {
  const data = emptyData();
  const from = new Date('2026-10-14T00:00:00.000Z');
  const to = new Date('2026-10-21T00:00:00.000Z');
  const f = computeFeatures(data, { from, to, tz: TZ, todayKey: '2026-10-20' });
  const json = compactFeatures(f);
  assert.ok(!json.includes(': null'), 'no null values in the prompt payload');
  assert.ok(json.length < 6000, 'payload stays compact');
});

register('retry policy: transient failures retry, deterministic ones do not', () => {
  // Mirrors isTransientError() in web/src/lib/api.ts and the TanStack Query retry.
  const transient = (e: { status?: number; code?: string }) => {
    if (e.status === 0) return true;
    if (e.status === 502 || e.status === 503 || e.status === 504 || e.status === 408) return true;
    if (e.code === 'ai_provider_error' || e.code === 'upstream_error') return true;
    return false;
  };
  assert.equal(transient({ status: 0 }), true, 'network / Render cold start is retryable');
  assert.equal(transient({ status: 503 }), true, 'service unavailable while booting');
  assert.equal(transient({ status: 504 }), true, 'gateway timeout');
  assert.equal(transient({ status: 401 }), false, 'auth failure is final');
  assert.equal(transient({ status: 400 }), false, 'validation error is final');
  assert.equal(transient({ status: 429, code: 'rate_limited' }), false, 'user rate limit is final');
});

register('dateKey round-trips a stored @db.Date value', () => {
  assert.equal(dateKey(new Date('2026-10-20T00:00:00.000Z')), '2026-10-20');
});
