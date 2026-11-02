import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...opts });
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(d, { year: 'numeric' });
}

export function formatMinutes(total: number | null | undefined) {
  if (!total || total < 0) return '0m';
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function todayIsoLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export const PRIORITY_STYLES: Record<string, string> = {
  URGENT: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20',
  HIGH: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20',
  MEDIUM: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20',
  LOW: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-700',
};

export const STATUS_STYLES: Record<string, string> = {
  TODO: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
  IN_PROGRESS: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  ARCHIVED: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
};

export const MOOD_META: Record<string, { label: string; emoji: string; color: string; score: number }> = {
  GREAT: { label: 'Great', emoji: '😄', color: '#10b981', score: 5 },
  GOOD: { label: 'Good', emoji: '🙂', color: '#3b82f6', score: 4 },
  NEUTRAL: { label: 'Neutral', emoji: '😐', color: '#a855f7', score: 3 },
  BAD: { label: 'Bad', emoji: '😕', color: '#f97316', score: 2 },
  TERRIBLE: { label: 'Terrible', emoji: '😣', color: '#ef4444', score: 1 },
};

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  STUDYING: { label: 'Studying', color: '#7f56ff' },
  CODING: { label: 'Coding', color: '#3b82f6' },
  OFFICE_WORK: { label: 'Office work', color: '#0ea5e9' },
  READING: { label: 'Reading', color: '#10b981' },
  PERSONAL_PROJECTS: { label: 'Personal projects', color: '#f59e0b' },
  OTHER: { label: 'Other', color: '#94a3b8' },
};

export const HABIT_COLORS: Record<string, string> = {
  violet: '#7f56ff',
  indigo: '#6366f1',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
};
