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
}

export interface DashboardResponse {
  today: string;
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
