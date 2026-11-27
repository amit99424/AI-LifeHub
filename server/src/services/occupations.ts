// ─────────────────────────────────────────────────────────────
// Occupation profiles: the one place personalisation is defined.
// ─────────────────────────────────────────────────────────────
import type { ProjectKind } from '@prisma/client';
// Every surface that should feel different for a student versus a freelancer
// reads from here: the onboarding copy, the task category picker, the session
// label, the dashboard widget order, and the AI prompt's focus.
//
// Deliberately NOT a pile of `if (occupation === 'STUDENT')` scattered through
// the app. One table, one resolver, no drift.
//
// The rule for content: a profile changes EMPHASIS and VOCABULARY, never the
// data model. A freelancer and a student record the same tasks, habits, moods,
// sessions and wellness days. Only the words around them differ, which is what
// keeps every occupation on the same life dashboard underneath.

export const OCCUPATION_TYPES = [
  'STUDENT',
  'WORKING_PROFESSIONAL',
  'FREELANCER',
  'BUSINESS_OWNER',
  'ENTREPRENEUR',
  'JOB_SEEKER',
  'TEACHER',
  'OTHER',
] as const;

export type OccupationType = (typeof OCCUPATION_TYPES)[number];

/** Which widget ids a dashboard may show, in the profile's preferred order. */
export const WIDGET_IDS = [
  'today',
  'score',
  'tasks',
  'habits',
  'focus',
  'mood',
  'wellness',
  'deadlines',
  'insight',
  'week',
  'trend',
  'consistency',
  'strengths',
  'correlations',
  'timeofday',
  // Phase 4: study and work containers, their goals, and the overdue backlog.
  'studywork',
  'goals',
  'overdue',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export interface OccupationProfile {
  type: OccupationType;
  /** Card title in onboarding and the settings picker. */
  label: string;
  /** One line under the label. Says what the app will do differently. */
  description: string;
  /** Lucide icon name, resolved on the client. */
  icon: string;
  /** What a unit of work is called: "Subject", "Client project", "Course". */
  nouns: {
    /** The container a task belongs to. */
    project: string;
    /** Plural of that container. */
    projects: string;
    /** What a tracked block of time is. */
    session: string;
    /** Plural of that. */
    sessions: string;
    /** What the label on a session is chosen from. */
    sessionLabel: string;
  };
  /** Task categories offered by default, replacing "General". */
  taskCategories: string[];
  /** Sensible starter habits, one click each in onboarding. */
  suggestedHabits: string[];
  /** Preferred dashboard widgets, most important first. */
  widgets: WidgetId[];
  /** What the AI should pay attention to for this person. */
  aiFocus: string;
  /** Whether "billable hours" is a meaningful concept. */
  billableHours: boolean;
  /** The container kind a new project gets by default for this person. */
  defaultKind?: ProjectKind;
  /** Kinds worth offering first in the picker, most likely first. */
  kinds?: ProjectKind[];
  /** A word for what a goal measures, e.g. "Syllabus", "Client deliverables". */
  goalNoun?: string;
}

const COMMON_HABITS = ['Sleep before 11pm', 'Walk 20 minutes', 'Drink 3L water', 'Write journal'];

export const OCCUPATION_PROFILES: Record<OccupationType, OccupationProfile> = {
  STUDENT: {
    type: 'STUDENT',
    label: 'Student',
    description: 'Subjects, assignments and exam preparation.',
    icon: 'GraduationCap',
    nouns: { project: 'Subject', projects: 'Subjects', session: 'Study session', sessions: 'Study sessions', sessionLabel: 'Subject' },
    taskCategories: ['Assignment', 'Exam prep', 'Reading', 'Lab work', 'Project', 'Revision'],
    suggestedHabits: ['Study 2 hours', 'Revise notes', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'focus', 'tasks', 'goals', 'deadlines', 'habits', 'score', 'mood', 'insight', 'week', 'wellness', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'academic load, exam readiness, revision spacing and the balance between study hours and rest',
    billableHours: false,
    defaultKind: 'STUDY',
    kinds: ['STUDY', 'PERSONAL', 'WORK'],
    goalNoun: 'Syllabus',
  },

  WORKING_PROFESSIONAL: {
    type: 'WORKING_PROFESSIONAL',
    label: 'Working professional',
    description: 'Work projects, deadlines and a life outside them.',
    icon: 'Briefcase',
    nouns: { project: 'Project', projects: 'Projects', session: 'Work session', sessions: 'Work sessions', sessionLabel: 'Project' },
    taskCategories: ['Work', 'Meetings', 'Deep work', 'Admin', 'Learning', 'Personal'],
    suggestedHabits: ['Plan tomorrow', 'No work after 7pm', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'tasks', 'focus', 'overdue', 'goals', 'deadlines', 'habits', 'wellness', 'mood', 'insight', 'week', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'workload against deadlines, meeting load, focus blocks and signs of work bleeding into rest',
    billableHours: false,
    defaultKind: 'WORK',
    kinds: ['WORK', 'PERSONAL', 'STUDY'],
    goalNoun: 'Outcome',
  },

  FREELANCER: {
    type: 'FREELANCER',
    label: 'Freelancer',
    description: 'Client projects, deadlines and billable hours.',
    icon: 'Laptop',
    nouns: { project: 'Client project', projects: 'Client projects', session: 'Work session', sessions: 'Work sessions', sessionLabel: 'Client' },
    taskCategories: ['Client work', 'Prospecting', 'Admin', 'Invoicing', 'Portfolio', 'Learning'],
    suggestedHabits: ['Send one outreach', 'Log billable hours', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'focus', 'overdue', 'deadlines', 'tasks', 'goals', 'habits', 'week', 'insight', 'mood', 'wellness', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'billable hours against time spent, deadline risk across clients, and the gap between busy and productive',
    billableHours: true,
    defaultKind: 'CLIENT',
    kinds: ['CLIENT', 'WORK', 'PERSONAL'],
    goalNoun: 'Deliverable',
  },

  BUSINESS_OWNER: {
    type: 'BUSINESS_OWNER',
    label: 'Business owner',
    description: 'Operations, priorities and the health of the business.',
    icon: 'Store',
    nouns: { project: 'Initiative', projects: 'Initiatives', session: 'Work session', sessions: 'Work sessions', sessionLabel: 'Area' },
    taskCategories: ['Operations', 'Finance', 'Team', 'Sales', 'Growth', 'Admin'],
    suggestedHabits: ['Review the numbers', 'One growth action', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'score', 'overdue', 'goals', 'tasks', 'deadlines', 'week', 'focus', 'habits', 'insight', 'wellness', 'mood', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'where your attention is going versus what moves the business, delegation load, and personal recovery',
    billableHours: false,
    defaultKind: 'BUSINESS',
    kinds: ['BUSINESS', 'WORK', 'PERSONAL'],
    goalNoun: 'Initiative',
  },

  ENTREPRENEUR: {
    type: 'ENTREPRENEUR',
    label: 'Entrepreneur',
    description: 'Building something new, one priority at a time.',
    icon: 'Rocket',
    nouns: { project: 'Venture', projects: 'Ventures', session: 'Build session', sessions: 'Build sessions', sessionLabel: 'Venture' },
    taskCategories: ['Build', 'Validate', 'Talk to users', 'Fundraising', 'Growth', 'Admin'],
    suggestedHabits: ['Talk to one user', 'Ship something small', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'tasks', 'focus', 'goals', 'score', 'insight', 'deadlines', 'habits', 'week', 'mood', 'wellness', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'whether effort is going to validated work, context switching between ventures, and burnout risk from long hours',
    billableHours: false,
    defaultKind: 'BUSINESS',
    kinds: ['BUSINESS', 'WORK', 'PERSONAL'],
    goalNoun: 'Milestone',
  },

  JOB_SEEKER: {
    type: 'JOB_SEEKER',
    label: 'Job seeker',
    description: 'Applications, interviews and keeping momentum.',
    icon: 'Search',
    nouns: { project: 'Application', projects: 'Applications', session: 'Prep session', sessions: 'Prep sessions', sessionLabel: 'Role' },
    taskCategories: ['Application', 'Interview prep', 'Networking', 'Skill practice', 'Portfolio', 'Follow-up'],
    suggestedHabits: ['One application a day', 'Practice 30 minutes', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'tasks', 'goals', 'habits', 'score', 'focus', 'deadlines', 'insight', 'mood', 'week', 'wellness', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'application volume and consistency, interview preparation, momentum through rejections and mood over time',
    billableHours: false,
    defaultKind: 'JOB_SEARCH',
    kinds: ['JOB_SEARCH', 'STUDY', 'PERSONAL'],
    goalNoun: 'Search goal',
  },

  TEACHER: {
    type: 'TEACHER',
    label: 'Teacher',
    description: 'Lessons, marking and the energy it takes.',
    icon: 'Presentation',
    nouns: { project: 'Course', projects: 'Courses', session: 'Teaching prep', sessions: 'Teaching prep', sessionLabel: 'Course' },
    taskCategories: ['Lesson prep', 'Marking', 'Classes', 'Admin', 'Student support', 'Planning'],
    suggestedHabits: ['Prep tomorrow', 'Leave work at work', ...COMMON_HABITS],
    widgets: ['today', 'studywork', 'tasks', 'focus', 'goals', 'habits', 'score', 'wellness', 'deadlines', 'mood', 'insight', 'week', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'preparation load, marking backlog, and how term-time pressure affects sleep and recovery',
    billableHours: false,
    defaultKind: 'WORK',
    kinds: ['WORK', 'STUDY', 'PERSONAL'],
    goalNoun: 'Goal',
  },

  OTHER: {
    type: 'OTHER',
    label: 'Something else',
    description: 'Tell us what you do and we will use your words.',
    icon: 'Users',
    nouns: { project: 'Project', projects: 'Projects', session: 'Session', sessions: 'Sessions', sessionLabel: 'Area' },
    taskCategories: ['Work', 'Personal', 'Learning', 'Health', 'Admin', 'Other'],
    suggestedHabits: COMMON_HABITS,
    widgets: ['today', 'studywork', 'tasks', 'habits', 'score', 'goals', 'focus', 'mood', 'deadlines', 'week', 'wellness', 'insight', 'trend', 'consistency', 'strengths', 'correlations', 'timeofday'],
    aiFocus: 'the balance across your tasks, habits, focus, mood and sleep',
    billableHours: false,
    defaultKind: 'WORK',
    kinds: ['WORK', 'STUDY', 'PERSONAL', 'CLIENT', 'BUSINESS', 'JOB_SEARCH'],
    goalNoun: 'Goal',
  },
};

export const DEFAULT_OCCUPATION: OccupationType = 'OTHER';

/**
 * Text → type. Used by the migration's rules at runtime too, so a profile the
 * SQL backfill could not classify (or one set through the old free-text field)
 * still resolves to something sensible without a database write.
 *
 * Kept in the same order as the migration's CASE branches. If you change one,
 * change both, or an existing user will read differently before and after a
 * migration.
 */
const CLASSIFY_RULES: { type: OccupationType; re: RegExp }[] = [
  // "graduate student" is study; "graduate trainee" is employment. The
  // negative lookahead keeps the two apart without reordering the rules.
  { type: 'STUDENT', re: /student|scholar|undergrad|graduate(?!\s+trainee)|pupil|learner|b\.?tech|m\.?tech|bca|mca|mba|b\.?sc|m\.?sc|neet|jee|upsc|gate|class 1[0-2]/i },
  { type: 'TEACHER', re: /teacher|tutor|professor|lecturer|educator|instructor|faculty|coach/i },
  { type: 'FREELANCER', re: /freelanc|self[- ]?employ|contractor|consultant|independent/i },
  { type: 'ENTREPRENEUR', re: /founder|co-?founder|entrepreneur|startup|start-up/i },
  { type: 'BUSINESS_OWNER', re: /business owner|businessman|businesswoman|shop owner|proprietor|merchant|trader|retailer|manufacturer/i },
  { type: 'JOB_SEEKER', re: /job seek|jobseek|unemploy|between jobs|looking for work|fresher|graduate trainee/i },
  {
    type: 'WORKING_PROFESSIONAL',
    re: /engineer|developer|programmer|designer|manager|analyst|researcher|scientist|architect|accountant|lawyer|doctor|nurse|officer|executive|specialist|administrator|clerk|technician|marketing|sales|hr |human resources|product|operations|banker|pharmacist|writer|editor|journalist|artist|photographer|chef|pilot|government|civil service|employee|professional|working/i,
  },
];

/**
 * Classify a free-text occupation. Returns null when nothing matches, which
 * means "unknown", not "Other" — the two are different claims and the UI
 * should ask rather than assume.
 */
export function classifyOccupation(text: string | null | undefined): OccupationType | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  for (const rule of CLASSIFY_RULES) {
    if (rule.re.test(t)) return rule.type;
  }
  return null;
}

/** A valid stored type, or null if the value is not one we know. */
export function parseOccupationType(value: unknown): OccupationType | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase().replace(/[-\s]+/g, '_');
  return (OCCUPATION_TYPES as readonly string[]).includes(upper) ? (upper as OccupationType) : null;
}

/**
 * Resolve what a user should actually see.
 *
 * Precedence: the typed column, then the free-text label classified, then the
 * default. `source` says which rule decided, so the UI can offer a correction
 * when it guessed rather than being told.
 */
export function resolveOccupation(input: {
  occupationType?: OccupationType | null;
  occupation?: string | null;
  customLabel?: string | null;
}): { type: OccupationType; profile: OccupationProfile; source: 'typed' | 'classified' | 'default'; customLabel: string | null } {
  const stored = parseOccupationType(input.occupationType);
  if (stored) {
    return { type: stored, profile: OCCUPATION_PROFILES[stored], source: 'typed', customLabel: input.customLabel ?? null };
  }
  const classified = classifyOccupation(input.occupation) ?? classifyOccupation(input.customLabel);
  if (classified) {
    return { type: classified, profile: OCCUPATION_PROFILES[classified], source: 'classified', customLabel: input.customLabel ?? null };
  }
  return { type: DEFAULT_OCCUPATION, profile: OCCUPATION_PROFILES[DEFAULT_OCCUPATION], source: 'default', customLabel: input.customLabel ?? null };
}

/** The display name: the person's own words if they gave any, else the label. */
export function occupationDisplayName(profile: OccupationProfile, customLabel?: string | null): string {
  const custom = (customLabel ?? '').trim();
  if (custom && profile.type === 'OTHER') return custom;
  return profile.label;
}

/**
 * Merge a stored widget order with the profile's preferred order.
 *
 * The profile decides what a good default looks like; a user's saved order
 * wins where it overlaps. Widgets the user hid stay hidden; new widgets the
 * profile prefers are appended rather than dropped, so an app update never
 * makes a feature invisible.
 */
export function mergeWidgetOrder(preferred: WidgetId[], saved: string[] | null | undefined): WidgetId[] {
  const known = new Set<string>(preferred);
  const cleanSaved = (saved ?? []).filter((w): w is WidgetId => known.has(w));
  const missing = preferred.filter((w) => !cleanSaved.includes(w));
  return [...cleanSaved, ...missing];
}

export interface DashboardLayout {
  /** Null means "use the profile's order". */
  order: WidgetId[] | null;
  hidden: WidgetId[];
}

/**
 * Read a stored layout without trusting it.
 *
 * The column is text, so it can hold anything: a value from a newer build, a
 * half-written row, or something a person pasted in. Anything unrecognised is
 * dropped rather than thrown, because a broken layout must never take the
 * dashboard down with it.
 */
export function parseLayout(raw: string | null | undefined): DashboardLayout {
  if (!raw) return { order: null, hidden: [] };
  try {
    const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown };
    const known = new Set<string>(WIDGET_IDS);
    const asIds = (v: unknown): WidgetId[] =>
      Array.isArray(v) ? Array.from(new Set(v.filter((x): x is WidgetId => typeof x === 'string' && known.has(x)))) : [];
    const order = asIds(parsed.order);
    return { order: order.length ? order : null, hidden: asIds(parsed.hidden) };
  } catch {
    return { order: null, hidden: [] };
  }
}

/** The block appended to the AI system prompt for this person. */
export function aiFocusLine(profile: OccupationProfile, customLabel?: string | null): string {
  const who = occupationDisplayName(profile, customLabel);
  return `This person's context is: ${who}. Pay particular attention to ${profile.aiFocus}. Use their vocabulary: "${profile.nouns.project}", "${profile.nouns.session}".`;
}
