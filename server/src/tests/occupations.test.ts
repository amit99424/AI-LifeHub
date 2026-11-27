/**
 * Occupation profiles and legacy classification.
 *
 * The tests here are mostly about the migration: real users already have
 * free-text occupations like "Software Engineer" or "B.Tech student", and the
 * one thing we cannot do is mislabel them or lose their words. Each case below
 * is a string a real profile could plausibly hold.
 */
const register = (globalThis as unknown as { __lhTest: (name: string, fn: () => void | Promise<void>) => void }).__lhTest;

import assert from 'node:assert/strict';
import {
  DEFAULT_OCCUPATION,
  OCCUPATION_PROFILES,
  OCCUPATION_TYPES,
  aiFocusLine,
  classifyOccupation,
  mergeWidgetOrder,
  parseLayout,
  WIDGET_IDS,
  occupationDisplayName,
  parseOccupationType,
  resolveOccupation,
} from '../services/occupations.js';

// ── the eight profiles ───────────────────────────────────────

register('occupations: every one of the eight types has a complete profile', () => {
  assert.equal(OCCUPATION_TYPES.length, 8);
  for (const type of OCCUPATION_TYPES) {
    const p = OCCUPATION_PROFILES[type];
    assert.ok(p, `missing profile for ${type}`);
    assert.equal(p.type, type);
    assert.ok(p.label.length > 2, `${type} needs a label`);
    assert.ok(p.description.length > 10, `${type} needs a description`);
    assert.ok(p.nouns.project && p.nouns.session && p.nouns.sessionLabel, `${type} needs nouns`);
    assert.ok(p.taskCategories.length >= 4, `${type} needs at least four categories`);
    assert.ok(p.suggestedHabits.length >= 3, `${type} needs starter habits`);
    assert.ok(p.widgets.length >= 6, `${type} needs widgets`);
    assert.ok(p.aiFocus.length > 20, `${type} needs an AI focus line`);
    assert.equal(typeof p.billableHours, 'boolean');
  }
});

register('occupations: every profile is internally consistent', () => {
  const knownWidgets = new Set<string>(WIDGET_IDS);
  for (const type of OCCUPATION_TYPES) {
    const p = OCCUPATION_PROFILES[type];
    // Widgets must be ids the dashboard knows, with no duplicates.
    for (const w of p.widgets) assert.ok(knownWidgets.has(w), `${type} lists an unknown widget "${w}"`);
    assert.equal(new Set(p.widgets).size, p.widgets.length, `${type} repeats a widget`);
    // Categories are unique and non-empty, since they become a picker.
    assert.equal(new Set(p.taskCategories).size, p.taskCategories.length, `${type} repeats a category`);
    for (const c of p.taskCategories) assert.ok(c.trim().length > 0);
    // Habit names are unique, since they are deduped by name on create.
    assert.equal(new Set(p.suggestedHabits).size, p.suggestedHabits.length, `${type} repeats a habit`);
  }
});

register('occupations: only freelancers get billable hours', () => {
  const billable = OCCUPATION_TYPES.filter((t) => OCCUPATION_PROFILES[t].billableHours);
  assert.deepEqual(billable, ['FREELANCER']);
});

register('occupations: a student hears about subjects, a freelancer about clients', () => {
  assert.equal(OCCUPATION_PROFILES.STUDENT.nouns.project, 'Subject');
  assert.equal(OCCUPATION_PROFILES.STUDENT.nouns.session, 'Study session');
  assert.equal(OCCUPATION_PROFILES.FREELANCER.nouns.project, 'Client project');
  assert.equal(OCCUPATION_PROFILES.FREELANCER.nouns.sessionLabel, 'Client');
  assert.equal(OCCUPATION_PROFILES.TEACHER.nouns.project, 'Course');
  assert.equal(OCCUPATION_PROFILES.JOB_SEEKER.nouns.project, 'Application');
});

register('occupations: the AI focus line names the person and their vocabulary', () => {
  const line = aiFocusLine(OCCUPATION_PROFILES.STUDENT);
  assert.match(line, /Student/);
  assert.match(line, /academic load/);
  assert.match(line, /Subject/);
  const custom = aiFocusLine(OCCUPATION_PROFILES.OTHER, 'Medical student');
  assert.match(custom, /Medical student/);
});

// ── legacy free text → type ──────────────────────────────────

register('occupations: classify the legacy values this app actually wrote', () => {
  // These are the option labels the old onboarding offered, plus the example
  // its placeholder suggested.
  const cases: [string, string | null][] = [
    ['Student', 'STUDENT'],
    ['Software Engineer', 'WORKING_PROFESSIONAL'],
    ['Designer', 'WORKING_PROFESSIONAL'],
    ['Freelancer', 'FREELANCER'],
    ['Manager', 'WORKING_PROFESSIONAL'],
    ['Researcher', 'WORKING_PROFESSIONAL'], // a real option the old form offered
    ['Other', null],
    ['Medical student', 'STUDENT'], // the old placeholder example
  ];
  for (const [input, expected] of cases) {
    assert.equal(classifyOccupation(input), expected, `"${input}" should classify as ${expected}`);
  }
});

register('occupations: classification prefers the specific over the generic', () => {
  assert.equal(classifyOccupation('B.Tech student'), 'STUDENT');
  assert.equal(classifyOccupation('MBA student'), 'STUDENT');
  assert.equal(classifyOccupation('freelance designer'), 'FREELANCER');
  assert.equal(classifyOccupation('self-employed consultant'), 'FREELANCER');
  assert.equal(classifyOccupation('co-founder'), 'ENTREPRENEUR');
  assert.equal(classifyOccupation('startup founder'), 'ENTREPRENEUR');
  assert.equal(classifyOccupation('shop owner'), 'BUSINESS_OWNER');
  assert.equal(classifyOccupation('school teacher'), 'TEACHER');
  assert.equal(classifyOccupation('Professor'), 'TEACHER');
  assert.equal(classifyOccupation('job seeker'), 'JOB_SEEKER');
  assert.equal(classifyOccupation('unemployed'), 'JOB_SEEKER');
  assert.equal(classifyOccupation('software developer'), 'WORKING_PROFESSIONAL');
});

register('occupations: a title that mentions both a student and a job stays a student', () => {
  // "Graduate trainee" is employment; "graduate student" is study. The rules
  // must not collapse the two.
  assert.equal(classifyOccupation('graduate student'), 'STUDENT');
  assert.equal(classifyOccupation('graduate trainee'), 'JOB_SEEKER');
});

register('occupations: unknown and empty values return null, never OTHER', () => {
  // null means "we do not know", which is a different claim from "the user
  // said Other" and the UI is allowed to ask about the first.
  assert.equal(classifyOccupation('Astronaut'), null);
  assert.equal(classifyOccupation(''), null);
  assert.equal(classifyOccupation('   '), null);
  assert.equal(classifyOccupation(null), null);
  assert.equal(classifyOccupation(undefined), null);
});

register('occupations: classification is case and spacing insensitive', () => {
  assert.equal(classifyOccupation('  FREELANCER  '), 'FREELANCER');
  assert.equal(classifyOccupation('Software  Engineer'), 'WORKING_PROFESSIONAL');
  assert.equal(classifyOccupation('BUSINESS OWNER'), 'BUSINESS_OWNER');
});

// ── parsing a stored enum ────────────────────────────────────

register('occupations: parseOccupationType accepts stored and human forms', () => {
  assert.equal(parseOccupationType('STUDENT'), 'STUDENT');
  assert.equal(parseOccupationType('student'), 'STUDENT');
  assert.equal(parseOccupationType('Working Professional'), 'WORKING_PROFESSIONAL');
  assert.equal(parseOccupationType('working_professional'), 'WORKING_PROFESSIONAL');
  assert.equal(parseOccupationType('BUSINESS-OWNER'), 'BUSINESS_OWNER');
  assert.equal(parseOccupationType('nonsense'), null);
  assert.equal(parseOccupationType(null), null);
  assert.equal(parseOccupationType(42), null);
});

// ── resolution precedence ───────────────────────────────────

register('occupations: a typed value wins over the legacy text', () => {
  const r = resolveOccupation({ occupationType: 'TEACHER', occupation: 'Software Engineer' });
  assert.equal(r.type, 'TEACHER');
  assert.equal(r.source, 'typed');
});

register('occupations: with no typed value, the legacy text is classified', () => {
  const r = resolveOccupation({ occupationType: null, occupation: 'Freelance designer' });
  assert.equal(r.type, 'FREELANCER');
  assert.equal(r.source, 'classified');
});

register('occupations: an unclassifiable legacy value falls back to OTHER but says so', () => {
  const r = resolveOccupation({ occupationType: null, occupation: 'Astronaut' });
  assert.equal(r.type, DEFAULT_OCCUPATION);
  assert.equal(r.source, 'default');
});

register('occupations: a custom label alone is enough to classify', () => {
  const r = resolveOccupation({ occupationType: null, occupation: null, customLabel: 'B.Tech student' });
  assert.equal(r.type, 'STUDENT');
  assert.equal(r.source, 'classified');
});

register('occupations: an OTHER user is shown their own words', () => {
  const r = resolveOccupation({ occupationType: 'OTHER', occupation: null, customLabel: 'Farmer' });
  assert.equal(r.type, 'OTHER');
  assert.equal(occupationDisplayName(r.profile, 'Farmer'), 'Farmer');
  // A non-OTHER type ignores a stale custom label rather than mislabelling.
  assert.equal(occupationDisplayName(OCCUPATION_PROFILES.STUDENT, 'Farmer'), 'Student');
  // An empty custom label falls back to the profile's own name.
  assert.equal(occupationDisplayName(OCCUPATION_PROFILES.OTHER, '   '), 'Something else');
});

// ── widget order ────────────────────────────────────────────

register('occupations: a saved widget order wins, new widgets are appended', () => {
  const preferred = OCCUPATION_PROFILES.STUDENT.widgets;
  const saved = ['focus', 'tasks', 'today'];
  const merged = mergeWidgetOrder(preferred, saved);
  assert.deepEqual(merged.slice(0, 3), ['focus', 'tasks', 'today']);
  // Nothing from the profile is dropped, so an update never hides a feature.
  assert.equal(merged.length, preferred.length);
  assert.deepEqual([...merged].sort(), [...preferred].sort());
});

register('occupations: unknown ids in a saved order are ignored', () => {
  const merged = mergeWidgetOrder(OCCUPATION_PROFILES.STUDENT.widgets, ['focus', 'not-a-widget']);
  assert.ok(!(merged as string[]).includes('not-a-widget'));
  assert.equal(merged.length, OCCUPATION_PROFILES.STUDENT.widgets.length);
});

register('occupations: no saved order yields the profile default untouched', () => {
  const preferred = OCCUPATION_PROFILES.FREELANCER.widgets;
  assert.deepEqual(mergeWidgetOrder(preferred, null), preferred);
  assert.deepEqual(mergeWidgetOrder(preferred, []), preferred);
});

// ── phase 3: dashboard layout ───────────────────────────────

register('layout: an empty or missing layout falls back to the profile order', () => {
  assert.deepEqual(parseLayout(null), { order: null, hidden: [] });
  assert.deepEqual(parseLayout(''), { order: null, hidden: [] });
  assert.deepEqual(parseLayout('not json at all'), { order: null, hidden: [] });
  assert.deepEqual(parseLayout('{}'), { order: null, hidden: [] });
});

register('layout: unknown widget ids are dropped, never thrown on', () => {
  // A layout saved by a newer build, or hand-edited, must not break the page.
  const parsed = parseLayout(JSON.stringify({ order: ['tasks', 'from-the-future', 'habits', 42], hidden: ['gone'] }));
  assert.deepEqual(parsed.order, ['tasks', 'habits']);
  assert.deepEqual(parsed.hidden, []);
});

register('layout: duplicate ids collapse and order is preserved', () => {
  const parsed = parseLayout(JSON.stringify({ order: ['habits', 'tasks', 'habits'] }));
  assert.deepEqual(parsed.order, ['habits', 'tasks']);
});

register('layout: hidden widgets are kept separate from order', () => {
  const parsed = parseLayout(JSON.stringify({ order: ['tasks'], hidden: ['mood', 'week'] }));
  assert.deepEqual(parsed.order, ['tasks']);
  assert.deepEqual(parsed.hidden, ['mood', 'week']);
});

register('layout: mergeWidgetOrder appends profile widgets the saved layout omits', () => {
  const merged = mergeWidgetOrder(['today', 'score', 'tasks', 'habits'], ['tasks']);
  assert.equal(merged[0], 'tasks');
  assert.deepEqual(new Set(merged), new Set(['today', 'score', 'tasks', 'habits']));
  assert.equal(merged.length, 4);
});

register('layout: every occupation profile names only widgets that exist', () => {
  const known = new Set<string>(WIDGET_IDS);
  for (const type of OCCUPATION_TYPES) {
    for (const w of OCCUPATION_PROFILES[type].widgets) {
      assert.ok(known.has(w), `${type} references unknown widget "${w}"`);
    }
  }
});
