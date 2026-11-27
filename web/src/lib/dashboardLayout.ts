import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { WidgetId } from '@/lib/types';

/**
 * The dashboard layout: which widgets, in which order, and which are hidden.
 *
 * The order the server sends is already merged with the occupation profile and
 * filtered by what the person hid, so this hook never re-derives it. It only
 * knows how to save a new one.
 */
export interface DashboardLayout {
  order: WidgetId[] | null;
  hidden: WidgetId[];
  available: WidgetId[];
}

export function useDashboardLayout() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard-layout'],
    queryFn: () => api.get<{ layout: { order: WidgetId[] | null; hidden: WidgetId[] } }>('/api/users/dashboard-layout'),
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: (next: { order: WidgetId[] | null; hidden: WidgetId[] }) =>
      api.put<{ layout: { order: WidgetId[] | null; hidden: WidgetId[] } }>('/api/users/dashboard-layout', next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard-layout'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const reset = useMutation({
    mutationFn: () => api.put('/api/users/dashboard-layout', { order: null, hidden: [] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard-layout'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return { ...query, save, reset };
}

/** Human names for each widget, used by the customiser. */
export const WIDGET_META: Record<WidgetId, { title: string; description: string }> = {
  today: { title: 'Daily overview', description: 'The headline sentence for today' },
  score: { title: 'Daily score', description: 'Today’s 0–100 score and what makes it up' },
  tasks: { title: 'Tasks', description: 'Completed and pending, with your categories' },
  habits: { title: 'Habits', description: 'One-tap check-ins for today' },
  focus: { title: 'Focus time', description: 'Minutes tracked in sessions' },
  mood: { title: 'Mood', description: 'Today’s mood and the recent mix' },
  wellness: { title: 'Wellness', description: 'Sleep, energy, stress and screen time' },
  deadlines: { title: 'Deadlines', description: 'What is coming up, and what is overdue' },
  insight: { title: 'AI insights', description: 'Generated from your records' },
  week: { title: 'Recent activity', description: 'The last 14 days at a glance' },
  trend: { title: 'Score trend', description: 'Your daily score over time' },
  consistency: { title: 'Consistency', description: 'Habit streaks and the activity heatmap' },
  strengths: { title: 'What is working', description: 'Supported strengths, with the figures behind them' },
  correlations: { title: 'Patterns', description: 'Relationships between two domains, always with sample size' },
  timeofday: { title: 'Best time', description: 'Your strongest hours and weekdays' },
  studywork: { title: 'Study & work', description: 'Your containers, their progress and time logged' },
  goals: { title: 'Goals', description: 'Active goals against their targets and deadlines' },
  overdue: { title: 'Overdue work', description: 'How old your overdue tasks are, and where they sit' },
};
