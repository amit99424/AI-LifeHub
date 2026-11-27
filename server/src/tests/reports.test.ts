import assert from 'node:assert/strict';
import { monthEndKey, monthStartKey, periodRange, reportToCsv, type Report } from '../services/reports.js';

const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

// ── period windows ──────────────────────────────────────────

register('periodRange: a day is the day itself, compared with yesterday', () => {
  const r = periodRange('day', '2026-06-17');
  assert.equal(r.from, '2026-06-17');
  assert.equal(r.to, '2026-06-17');
  assert.deepEqual(r.previous, { from: '2026-06-16', to: '2026-06-16' });
});

register('periodRange: a week is the user\'s own week, and the previous week sits directly before it', () => {
  // 2026-06-17 is a Wednesday.
  const r = periodRange('week', '2026-06-17');
  assert.equal(r.from, '2026-06-15'); // Monday
  assert.equal(r.to, '2026-06-21'); // Sunday
  assert.deepEqual(r.previous, { from: '2026-06-08', to: '2026-06-14' });
});

register('periodRange: a Sunday week-start moves the window back a day', () => {
  const r = periodRange('week', '2026-06-17', 0);
  assert.equal(r.from, '2026-06-14');
  assert.equal(r.to, '2026-06-20');
});

register('periodRange: a month is the calendar month, compared with the previous calendar month', () => {
  const r = periodRange('month', '2026-06-17');
  assert.equal(r.from, '2026-06-01');
  assert.equal(r.to, '2026-06-30');
  assert.deepEqual(r.previous, { from: '2026-05-01', to: '2026-05-31' });
  assert.match(r.label, /June 2026/);
});

register('periodRange: January compares with the previous December, across the year boundary', () => {
  const r = periodRange('month', '2027-01-05');
  assert.equal(r.from, '2027-01-01');
  assert.equal(r.to, '2027-01-31');
  assert.deepEqual(r.previous, { from: '2026-12-01', to: '2026-12-31' });
});

register('monthEndKey: February is 28 days in a common year and 29 in a leap year', () => {
  assert.equal(monthEndKey('2026-02-10'), '2026-02-28');
  assert.equal(monthEndKey('2028-02-10'), '2028-02-29');
  assert.equal(monthStartKey('2026-02-10'), '2026-02-01');
});

register('monthEndKey: a 31-day month ends on the 31st', () => {
  assert.equal(monthEndKey('2026-07-04'), '2026-07-31');
});

// ── CSV ─────────────────────────────────────────────────────

function fakeReport(over: Partial<Report> = {}): Report {
  return {
    period: 'week',
    range: { from: '2026-06-15', to: '2026-06-21', label: '2026-06-15 to 2026-06-21' },
    previousRange: { from: '2026-06-08', to: '2026-06-14' },
    generatedAt: '2026-06-21T10:00:00.000Z',
    metrics: [
      { key: 'tasksCompleted', label: 'Tasks completed', value: 4, unit: null, previous: 6, change: -2, recorded: true },
      { key: 'stress', label: 'Stress (1–5)', value: null, unit: null, previous: null, change: null, recorded: false },
    ],
    rows: [
      { date: '2026-06-15', tasksCompleted: 2, tasksCreated: 1, focusMinutes: 60, habitCheckins: 3, mood: 4, stress: null, energy: null, sleepQuality: null, sleepHours: null },
    ],
    goals: [],
    projects: [],
    skills: [],
    accomplishments: [],
    needsAttention: [],
    gaps: ['No wellness check-ins in this period, so stress and energy are absent rather than zero.'],
    thin: false,
    totals: { tasksCompleted: 4, tasksCreated: 1, focusMinutes: 60, habitCheckins: 3, daysWithData: 1, days: 7 },
    ...over,
  };
}

register('reportToCsv: a missing value is written as "not recorded", never as 0', () => {
  const csv = reportToCsv(fakeReport());
  assert.match(csv, /Stress \(1–5\),not recorded/);
  assert.ok(!/Stress \(1–5\),0/.test(csv), 'a missing stress value must not become 0');
});

register('reportToCsv: the range and generation date are in the file', () => {
  const csv = reportToCsv(fakeReport());
  assert.match(csv, /Range,2026-06-15 to 2026-06-21/);
  assert.match(csv, /Generated,2026-06-21T10:00:00.000Z/);
  assert.match(csv, /Compared with,2026-06-08 to 2026-06-14/);
});

register('reportToCsv: gaps are written out so a blank column is explained', () => {
  const csv = reportToCsv(fakeReport());
  assert.match(csv, /Missing data/);
  assert.match(csv, /absent rather than zero/);
});

register('reportToCsv: commas and quotes in a title are escaped, not split into columns', () => {
  const csv = reportToCsv(
    fakeReport({ goals: [{ id: 'g', title: 'Ship "v1", quietly', current: 1, target: 4, metric: 'releases', deadline: null, fraction: 0.25, milestonesDone: 0, milestonesTotal: 0 }] }),
  );
  assert.match(csv, /"Ship ""v1"", quietly",1,4,releases,,25,0,0/);
});

register('reportToCsv: an empty period still produces a readable file', () => {
  const csv = reportToCsv(fakeReport({ metrics: [], rows: [], gaps: [] }));
  assert.match(csv, /Date,Tasks completed/);
  assert.ok(csv.split('\n').length > 4);
});
