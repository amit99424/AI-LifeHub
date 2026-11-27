export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  profile: { onboarded: boolean; timezone: string; primaryGoal: string | null; occupation: string | null; avatarUrl: string | null };
  settings: {
    theme: 'light' | 'dark' | 'system';
    accent: string;
    aiEnabled: boolean;
    aiAutoInsights: boolean;
    moodTrackingOptIn: boolean;
    demoDataLoaded: boolean;
  };
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  timeTakenSec: number | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  overdue?: boolean;
  dueToday?: boolean;
  // Phase 4: container, parent and recurrence
  projectId?: string | null;
  parentId?: string | null;
  goalId?: string | null;
  recurrence?: RecurrenceRule;
  recurrenceEvery?: number;
  recurrenceUntil?: string | null;
  project?: { id: string; title: string; code: string | null } | null;
  goal?: { id: string; title: string } | null;
  _count?: { subtasks: number };
}

export interface TasksResponse {
  tasks: Task[];
  total: number;
  counts: Record<string, number>;
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: 'DAILY' | 'WEEKLY';
  targetPerWeek: number;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
  doneToday: boolean;
  streak: number;
  longestStreak: number;
  weekDone: number;
  weekTarget: number;
  weekRate: number;
  monthDone: number;
  monthRate: number;
  last30: { date: string; done: boolean }[];
}

export type MoodLevel = 'GREAT' | 'GOOD' | 'NEUTRAL' | 'BAD' | 'TERRIBLE';

export interface MoodLog {
  id: string;
  level: MoodLevel;
  score: number;
  note: string | null;
  energy: number | null;
  focus: number | null;
  date: string;
  isDemo: boolean;
  createdAt: string;
}

export interface MoodsResponse {
  today: MoodLog | null;
  logs: MoodLog[];
  distribution: Record<MoodLevel, number>;
  avgScore: number | null;
  weekly: { week: string; label: string; avg: number; entries: number }[];
  monthly: { month: string; label: string; avg: number; entries: number }[];
  series: { date: string; score: number | null; level: MoodLevel | null }[];
}

export interface JournalEntry {
  id: string;
  title: string | null;
  content: string;
  date: string;
  wordCount: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  sentimentScore: number | null;
  summary: string | null;
  themes: string[];
  productivityNotes: string | null;
  analyzedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JournalResponse {
  entries: JournalEntry[];
  total: number;
  sentimentMix: Record<string, number>;
}

export type SessionCategory = 'STUDYING' | 'CODING' | 'OFFICE_WORK' | 'READING' | 'PERSONAL_PROJECTS' | 'OTHER';

export interface WorkSession {
  id: string;
  category: SessionCategory;
  label: string | null;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  pausedMs: number;
  durationSec: number;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED';
  focusScore: number | null;
  notes: string | null;
  date: string;
  isDemo: boolean;
  elapsedSec?: number;
  /** The container this session is filed under, if any. */
  projectId?: string | null;
  project?: { id: string; title: string; code: string | null } | null;
  /** One row per pause, so break length is measured rather than guessed. */
  breakCount?: number;
  breakMinutes?: number;
}

export interface SessionsResponse {
  active: WorkSession | null;
  history: WorkSession[];
  daily: { date: string; minutes: number }[];
  stats: {
    totalMinutes: number;
    totalSessions: number;
    avgSessionMinutes: number;
    todayMinutes: number;
    byCategory: Record<string, number>;
    avgFocus: number | null;
  };
}

export interface DailyActivity {
  id: string;
  date: string;
  sleepMinutes: number | null;
  exerciseMinutes: number | null;
  screenMinutes: number | null;
  meditationMinutes: number | null;
  socialMinutes: number | null;
  steps: number | null;
  source: string;
  notes: string | null;
  isDemo: boolean;
}

export interface ActivityResponse {
  today: DailyActivity | null;
  entries: DailyActivity[];
  series: { date: string; sleepHours: number | null; screenHours: number | null; exerciseMinutes: number | null; meditationMinutes: number | null }[];
  averages: Record<string, number | null>;
  daysLogged: number;
}

export interface Insight {
  id: string;
  type: 'PRODUCTIVITY' | 'HABIT' | 'OVERLOAD' | 'MOOD' | 'JOURNAL' | 'WEEKLY_SUMMARY' | 'ROUTINE';
  title: string;
  body: string;
  recommendations: string[];
  confidence: 'low' | 'medium' | 'high';
  provider?: string;
  model?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dismissed?: boolean;
  pinned: boolean;
  isDemo: boolean;
  createdAt: string;
}

export interface AiStatus {
  configured: boolean;
  provider: 'gemini' | 'openai' | 'unconfigured';
  model: string | null;
  missingEnv: string[];
  userEnabled: boolean;
  autoInsights: boolean;
  usage: {
    chatMessages: number;
    insights: number;
    journalAnalyses: number;
    tokensIn: number;
    tokensOut: number;
    limits: { chatMessages: number; insights: number };
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: ChatMessage[];
}

export interface DayStat {
  date: string;
  tasksCompleted: number;
  tasksCreated: number;
  habitsDone: number;
  habitsTotal: number;
  focusMinutes: number;
  moodScore: number | null;
  score: number;
  /** Self-reported wellness for the day. Null means "not reported". */
  wellness?: DayStatWellness;
}

export interface DayStatWellness {
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  stress: number | null;
  screenHours: number | null;
  exerciseMinutes: number | null;
  focus: number | null;
}

export interface AnalyticsResponse {
  range: { from: string; to: string; days: number };
  daily: DayStat[];
  weekly: { week: string; label: string; tasksCompleted: number; focusMinutes: number; habitsRate: number; avgMood: number | null; score: number }[];
  monthly: { month: string; label: string; tasksCompleted: number; focusMinutes: number; habitsRate: number; avgMood: number | null; score: number }[];
  totals: {
    tasksCreated: number;
    tasksCompleted: number;
    completionRate: number;
    overdueOpen: number;
    completedLate: number;
    focusMinutes: number;
    sessions: number;
    avgSessionMinutes: number;
    habitsRate: number;
    habitLogs: number;
    avgMood: number | null;
    moodDistribution: Record<string, number>;
    journalEntries: number;
    routineDays: number;
    avgSleepHours: number | null;
    avgScreenHours: number | null;
  };
  today: {
    date: string;
    tasksCompleted: number;
    tasksPending: number;
    habitsDone: number;
    habitsActive: number;
    habitRate: number;
    streak: number;
    focusMinutes: number;
    moodScore: number | null;
    moodLevel: MoodLevel | null;
    score: { score: number; band: string; components: Record<string, number>; explanation: string };
  };
  streaks: { current: number; longest: number; label: string };
  heatmap: { date: string; score: number; level: 0 | 1 | 2 | 3 | 4 }[];
  priorities: { priority: string; open: number; completed: number }[];
  categories: { category: string; completed: number; open: number }[];
  hourly: { hour: number; completions: number; focusMinutes: number }[];
  weekday: { day: string; completions: number; focusMinutes: number }[];
  /** The engine's read over the same window, so a chart and a claim cannot disagree. */
  life: LifeAnalysisDto;
  studyWork: StudyWorkDto;
  growth: GrowthWidgetDto;
}

export type OccupationType =
  | 'STUDENT'
  | 'WORKING_PROFESSIONAL'
  | 'FREELANCER'
  | 'BUSINESS_OWNER'
  | 'ENTREPRENEUR'
  | 'JOB_SEEKER'
  | 'TEACHER'
  | 'OTHER';


export interface OccupationProfile {
  type: OccupationType;
  label: string;
  description: string;
  icon: string;
  nouns: { project: string; projects: string; session: string; sessions: string; sessionLabel: string };
  taskCategories: string[];
  suggestedHabits: string[];
  widgets: WidgetId[];
  aiFocus: string;
  billableHours: boolean;
  /** The container kind a new project gets by default. */
  defaultKind?: ProjectKind;
  /** Kinds worth offering first, most likely first. */
  kinds?: ProjectKind[];
  /** What a goal measures: "Syllabus", "Deliverable", "Outcome". */
  goalNoun?: string;
}

// ── Phase 4: containers, goals, recurrence ────────────────────
export type ProjectKind = 'STUDY' | 'WORK' | 'CLIENT' | 'BUSINESS' | 'JOB_SEARCH' | 'PERSONAL';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
export type RecurrenceRule = 'NONE' | 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY';
export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'PAUSED' | 'ABANDONED';

export interface ProjectDto {
  id: string;
  title: string;
  description: string | null;
  kind: ProjectKind;
  status: ProjectStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  code: string | null;
  color: string | null;
  deadline: string | null;
  archivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  tasks: { total: number; done: number; open: number };
  /** null when the project has no tasks — there is no percentage of nothing. */
  progress: number | null;
  sessions: number;
  sessionMinutes: number;
  goals: number;
  isDemo: boolean;
}

export interface MilestoneDto {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  order: number;
}

export interface GoalDto {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  metric: string | null;
  target: number | null;
  current: number | null;
  /** null when there is no target to measure against. */
  progress: number | null;
  deadline: string | null;
  achievedAt: string | null;
  project: { id: string; title: string; kind: ProjectKind } | null;
  tasks: { total: number; done: number };
  milestones: MilestoneDto[];
  milestonesDone: number;
  milestonesTotal: number;
  isDemo: boolean;
  createdAt: string;
}

export interface OverdueAnalyticsDto {
  today: string;
  count: number;
  oldestDays: number;
  items: { id: string; title: string; dueDate: string; priority: string; category: string; project: string | null }[];
  ageBuckets: Record<string, number>;
  byProject: { projectId: string | null; title: string; count: number }[];
  byCategory: Record<string, number>;
}

export interface StudyWorkDto {
  overdueTasks: number;
  projects: { id: string; title: string; kind: ProjectKind; status: ProjectStatus; deadline: string | null; tasks: number; minutes: number }[];
  goals: { id: string; title: string; current: number | null; target: number | null; metric: string | null; deadline: string | null }[];
  minutesByProject: { id: string; title: string; minutes: number }[];
}

export interface ResolvedOccupation {
  type: OccupationType;
  profile: OccupationProfile;
  /** 'typed' = the user chose it; 'classified' = we guessed from old text; 'default' = nothing known. */
  source: 'typed' | 'classified' | 'default';
  displayName: string;
  needsConfirmation: boolean;
  customLabel?: string | null;
}

export interface LifeAnalysisDto {
  sufficiency: {
    daysTracked: number;
    enough: boolean;
    message: string;
    missing: string[];
  };
  correlations: {
    correlations: { key: string; xLabel: string; yLabel: string; r: number; n: number; strength: string; sentence: string }[];
    withheld: { key: string; xLabel: string; yLabel: string; n: number; need: number }[];
  };
  bestTime: {
    hour: { index: number; label: string; completions: number; focusMinutes: number; days: number; perDay: number } | null;
    weekday: { index: number; label: string; completions: number; focusMinutes: number; days: number; perDay: number } | null;
    lowConfidence: boolean;
    note: string;
  };
  deltas: DeltaDto[];
  improvements: { key: string; title: string; detail: string; suggestion: string; severity: string }[];
  strengths?: StrengthDto[];
  consistency?: ConsistencyDto;
  trend?: { date: string; score: number | null; hasData: boolean }[];
  current: PeriodSummaryDto;
  previous: PeriodSummaryDto;
}

export interface DashboardResponse {
  today: string;
  life?: LifeAnalysisDto;
  widgets?: WidgetId[];
  widgetLayout?: { order: WidgetId[] | null; hidden: WidgetId[]; available: WidgetId[] };
  comparisons?: { day: ComparisonDto; week: ComparisonDto; month: ComparisonDto };
  studyWork?: StudyWorkDto;
  growth?: GrowthWidgetDto;
  occupation: ResolvedOccupation;
  greetingName: string;
  onboarded: boolean;
  primaryGoal: string | null;
  summary: AnalyticsResponse['today'] & { date: string };
  streaks: AnalyticsResponse['streaks'];
  week: AnalyticsResponse['weekly'][number] | null;
  weekly: AnalyticsResponse['weekly'];
  daily: DayStat[];
  heatmap: AnalyticsResponse['heatmap'];
  totals: AnalyticsResponse['totals'];
  hourly: AnalyticsResponse['hourly'];
  weekday: AnalyticsResponse['weekday'];
  priorities: AnalyticsResponse['priorities'];
  mood: MoodLog | null;
  habitsToday: { total: number; done: number; items: { id: string; name: string; icon: string; color: string }[] };
  deadlines: { id: string; title: string; dueDate: string | null; priority: Priority; status: TaskStatus; overdue: boolean }[];
  insights: Insight[];
  counts: Record<string, number>;
  isEmpty: boolean;
}

export interface FeatureBundle {
  window: { from: string; to: string; days: number; tz: string };
  tasks: Record<string, unknown>;
  habits: Record<string, unknown>;
  mood: Record<string, unknown>;
  sessions: Record<string, unknown>;
  journal: Record<string, unknown>;
  routine: Record<string, unknown>;
  availability: {
    daysWithAnyActivity: number;
    tasksCompleted: number;
    habitLogs: number;
    moodEntries: number;
    journalEntries: number;
    completedSessions: number;
    routineDays: number;
    sufficientForPatterns: boolean;
    sufficientForMoodCorrelation: boolean;
    missing: string[];
  };
  derived: Record<string, unknown>;
}

// ── Phase 3: the dashboard reads the engine, not its own maths ──────────────

export type WidgetId =
  | 'today'
  | 'score'
  | 'tasks'
  | 'habits'
  | 'focus'
  | 'mood'
  | 'wellness'
  | 'deadlines'
  | 'insight'
  | 'week'
  | 'trend'
  | 'consistency'
  | 'strengths'
  | 'correlations'
  | 'timeofday'
  | 'studywork'
  | 'goals'
  | 'overdue'
  | 'growth'
  | 'quote';

export interface PeriodSummaryDto {
  days: number;
  daysWithData: number;
  score: number | null;
  tasksCompleted: number | null;
  focusMinutes: number | null;
  habitRate: number | null;
  mood: number | null;
  sleepHours: number | null;
  screenHours: number | null;
  stress: number | null;
  energy: number | null;
  sleepQuality: number | null;
  exerciseMinutes: number | null;
  moodDays: number;
  habitDays: number;
}

export interface DeltaDto {
  key: string;
  label: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  changePct: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  higherIsBetter: boolean;
  withinNoise: boolean;
}

export interface StrengthDto {
  key: string;
  title: string;
  detail: string;
  evidence: string;
}

export interface ConsistencyDto {
  streak: number;
  bestStreak: number;
  daysWithCheckin: number;
  days: number;
  thin: boolean;
  note: string;
}

export interface ComparisonDto {
  label: string;
  days: number;
  available: boolean;
  note: string;
  current: Record<string, number | null>;
  previous: Record<string, number | null>;
  changes: { key: string; current: number | null; previous: number | null; change: number | null; direction: 'up' | 'down' | 'flat' | 'unknown' }[];
}

// ─────────────────────────────────────────────────────────────
// Phase 5 — skills, growth and development plans
// ─────────────────────────────────────────────────────────────
// These mirror the server's payloads exactly. `null` always means "not
// recorded": a skill with no target has no distance to target, and a window
// with no practice has no consistency figure, rather than a zero that reads
// like a measurement.

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type SkillStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type SkillCategory = 'TECHNICAL' | 'COMMUNICATION' | 'LEADERSHIP' | 'BUSINESS' | 'ACADEMIC' | 'CREATIVE' | 'PERSONAL' | 'OTHER';
export type EvidenceKind = 'PRACTICE' | 'PROJECT' | 'COURSE' | 'CERTIFICATE' | 'FEEDBACK' | 'PORTFOLIO' | 'NOTE';
export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type PlanItemKind = 'OBJECTIVE' | 'ACTIVITY' | 'MILESTONE' | 'SKILL';

export interface SkillUpdateDto {
  id: string;
  at: string;
  fromLevel: SkillLevel | null;
  toLevel: SkillLevel;
  note: string | null;
  minutes: number | null;
}

export interface SkillEvidenceDto {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string | null;
  url: string | null;
  date: string | null;
  createdAt: string;
}

export interface SkillDto {
  id: string;
  name: string;
  category: SkillCategory;
  description: string | null;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel | null;
  status: SkillStatus;
  motivation: string | null;
  startedAt: string;
  achievedAt: string | null;
  archivedAt: string | null;
  updates: SkillUpdateDto[];
  evidence: SkillEvidenceDto[];
  goals: { id: string; title: string; status: string }[];
  isDemo?: boolean;
  createdAt: string;
}

export interface SkillProgressDto {
  skillId: string;
  name: string;
  category: string;
  status: SkillStatus;
  currentLevel: SkillLevel;
  targetLevel: SkillLevel | null;
  levelsGainedInWindow: number;
  levelAtWindowStart: SkillLevel | null;
  improvedInWindow: boolean;
  levelsToTarget: number | null;
  practiceMinutes: number;
  practiceDays: number;
  daysSinceActivity: number | null;
  evidenceCount: number;
  /** The plain-language basis for whatever the UI says about this skill. */
  evidence: string;
}

export interface GrowthAnalysisDto {
  window: { from: string; to: string; days: number };
  hasAnyRecord: boolean;
  totals: {
    skills: number;
    active: number;
    paused: number;
    completed: number;
    levelsGained: number;
    practiceMinutes: number;
    practiceDays: number;
    evidence: number;
    activePlans: number;
  };
  perSkill: SkillProgressDto[];
  improving: SkillProgressDto[];
  needingAttention: { skill: SkillProgressDto; reason: string }[];
  goals: {
    total: number;
    withTarget: number;
    achievedInWindow: number;
    milestonesDone: number;
    milestonesTotal: number;
    behind: { id: string; title: string; current: number | null; target: number | null; metric: string | null; deadline: string; fraction: number }[];
  };
  consistency: { activeDays: number; bestStreak: number; currentStreak: number; thin: boolean; note: string };
  weekly: { weekStart: string; minutes: number; days: number; levelsGained: number }[];
  recentEvidence: { id: string; skillId: string; skillName: string; kind: string; title: string; at: string }[];
  /** Deterministic next steps, each naming the record it came from. */
  nextSteps: { kind: 'skill' | 'goal' | 'consistency' | 'practice'; text: string; skillId?: string; goalId?: string }[];
  summary: { headline: string; detail: string };
  sufficiency: { enough: boolean; message: string };
}

/** The dashboard widget's slice of the growth read. */
export interface GrowthWidgetDto {
  hasAnyRecord: boolean;
  totals: GrowthAnalysisDto['totals'];
  improving: { name: string; from: SkillLevel | null; to: SkillLevel; gained: number }[];
  needingAttention: { name: string; reason: string }[];
  consistency: GrowthAnalysisDto['consistency'];
  weekly: { weekStart: string; minutes: number; days: number; levelsGained: number }[];
  summary: { headline: string; detail: string };
  window: { from: string; to: string; days: number };
}

export interface PlanItemDto {
  id: string;
  kind: PlanItemKind;
  title: string;
  detail: string | null;
  week: number;
  order: number;
  successCriteria: string | null;
  skillId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  taskId: string | null;
  appliedAt: string | null;
}

export interface DevelopmentPlanDto {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  status: PlanStatus;
  horizonWeeks: number;
  weeklyMinutes: number | null;
  goal: { id: string; title: string } | null;
  createdAt: string;
  items: PlanItemDto[];
  appliedCount: number;
  itemCount: number;
}

// ─────────────────────────────────────────────────────────────
// Phase 6 — assistant planning, review and actions
// ─────────────────────────────────────────────────────────────

export interface PlanBudget {
  minutes: number | null;
  source: 'stated' | 'typical_session' | 'unknown';
  basis: string;
}

export interface PlannedTaskScore {
  taskId: string;
  title: string;
  score: number;
  reasons: string[];
  headline: string;
  urgency: 'overdue' | 'today' | 'soon' | 'none';
  daysOverdue: number | null;
  daysUntilDue: number | null;
  contributesTo: string | null;
}

export interface DailyPlanDto {
  date: string;
  budget: PlanBudget;
  priorities: PlannedTaskScore[];
  blocks: { taskId: string; title: string; minutes: number; why: string }[];
  postponed: { taskId: string; title: string; reason: string }[];
  deadlines: { id: string; title: string; dueDate: string; daysUntil: number }[];
  breaks: string[];
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

export interface WeekFactsDto {
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

export interface WeeklyReviewDto {
  thisWeek: WeekFactsDto;
  previousWeek: WeekFactsDto | null;
  deltas: { key: string; label: string; thisWeek: number | null; previous: number | null; change: number | null }[];
  goals: { id: string; title: string; current: number | null; target: number | null; metric: string | null; deadline: string | null; fraction: number | null }[];
  behindGoals: WeeklyReviewDto['goals'];
  skillRead: GrowthAnalysisDto;
  obstacles: string[];
  caveats: string[];
  enoughData: boolean;
}

export interface SuggestionDto {
  id: string;
  text: string;
  why: string;
}

export interface ProposedActionDto {
  kind: 'create_task' | 'create_goal' | 'update_task_status' | 'complete_task' | 'create_milestone' | 'add_skill';
  summary: string;
  payload: Record<string, unknown>;
  references: {
    task?: { id: string; title: string };
    project?: { id: string; title: string };
    goal?: { id: string; title: string };
  };
}

// ─────────────────────────────────────────────────────────────
// Phase 7 — reports
// ─────────────────────────────────────────────────────────────

export type ReportPeriod = 'day' | 'week' | 'month';

export interface ReportMetricDto {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  previous: number | null;
  change: number | null;
  recorded: boolean;
}

export interface ReportRowDto {
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

export interface ReportDto {
  period: ReportPeriod;
  range: { from: string; to: string; label: string };
  previousRange: { from: string; to: string };
  generatedAt: string;
  metrics: ReportMetricDto[];
  rows: ReportRowDto[];
  goals: { id: string; title: string; current: number | null; target: number | null; metric: string | null; deadline: string | null; fraction: number | null; milestonesDone: number; milestonesTotal: number }[];
  projects: { id: string; title: string; status: string; tasksDone: number; tasksTotal: number; minutes: number; fraction: number | null }[];
  skills: { id: string; name: string; level: string; practiceMinutes: number; practiceDays: number; levelsGained: number }[];
  accomplishments: string[];
  needsAttention: string[];
  gaps: string[];
  thin: boolean;
  totals: { tasksCompleted: number; tasksCreated: number; focusMinutes: number; habitCheckins: number; daysWithData: number; days: number };
}

export interface MonthlyReviewDto {
  text: string;
  source: 'AI' | 'FALLBACK';
  provider: string | null;
  model: string | null;
  generatedAt: string;
  note: string | null;
}

// ─────────────────────────────────────────────────────────────
// Phase 7 — daily quote
// ─────────────────────────────────────────────────────────────

export interface QuoteDto {
  id: string;
  text: string;
  /** Author plus source when verified; the category when there is no attribution. */
  attribution: string;
  author: string | null;
  source: string | null;
  category: string;
  date: string;
}
