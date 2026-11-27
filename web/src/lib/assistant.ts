import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DailyPlanDto, ProposedActionDto, SuggestionDto, WeeklyReviewDto } from '@/lib/types';

/** The deterministic daily plan. Cheap enough to refetch on demand. */
export function useDailyPlan(availableMinutes: number | null) {
  return useQuery({
    queryKey: ['ai-plan', availableMinutes],
    queryFn: () =>
      api.get<{ plan: DailyPlanDto }>(`/api/ai/daily-plan${availableMinutes ? `?availableMinutes=${availableMinutes}` : ''}`),
    select: (r) => r.plan,
    staleTime: 60_000,
  });
}

/** This week measured against the user's own previous week. */
export function useWeeklyReview() {
  return useQuery({
    queryKey: ['ai-review'],
    queryFn: () => api.get<{ review: WeeklyReviewDto }>('/api/ai/weekly-review'),
    select: (r) => r.review,
    staleTime: 60_000,
  });
}

/** Suggested questions, generated from what the account actually holds. */
export function useAiSuggestions() {
  return useQuery({
    queryKey: ['ai-suggestions'],
    queryFn: () => api.get<{ suggestions: SuggestionDto[] }>('/api/ai/suggestions'),
    select: (r) => r.suggestions,
    staleTime: 5 * 60_000,
  });
}

/**
 * Asking for an action never writes. The server returns a proposal, the UI
 * shows exactly what would happen, and only a confirmation posts it back.
 */
export function useProposeAction() {
  return useMutation({
    mutationFn: (message: string) => api.post<{ action: ProposedActionDto | null }>('/api/ai/actions/propose', { message }),
  });
}

export function useExecuteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: { kind: string; payload: Record<string, unknown> }) =>
      api.post<{ result: { kind: string; message: string } }>('/api/ai/actions/execute', action),
    onSuccess: () => {
      // Every write the assistant can make lands in one of these.
      for (const key of ['tasks', 'goals', 'projects', 'skills', 'growth', 'dashboard', 'ai-plan', 'ai-review', 'ai-suggestions']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export const URGENCY_TONE: Record<DailyPlanDto['priorities'][number]['urgency'], 'rose' | 'amber' | 'brand' | 'neutral'> = {
  overdue: 'rose',
  today: 'amber',
  soon: 'brand',
  none: 'neutral',
};

export const URGENCY_LABEL: Record<DailyPlanDto['priorities'][number]['urgency'], string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'Due soon',
  none: 'No deadline',
};
