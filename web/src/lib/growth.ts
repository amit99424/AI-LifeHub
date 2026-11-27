import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DevelopmentPlanDto, GrowthAnalysisDto, SkillDto, SkillLevel } from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Skills, development plans and the growth read.
// ─────────────────────────────────────────────────────────────
// The server owns every number here: a level, a minute count or an
// "improved" flag is never computed in the browser. These hooks only move
// records in and out, and invalidate the growth read whenever a record
// changes, so the page can never show a total that no longer matches its rows.

export interface SkillListResponse {
  skills: SkillDto[];
  levels: SkillLevel[];
  categories: string[];
}

export function useSkills(params: { status?: string; category?: string; archived?: 'exclude' | 'only' | 'all' } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.archived) qs.set('archived', params.archived);
  return useQuery({
    queryKey: ['skills', params],
    queryFn: () => api.get<SkillListResponse>(`/api/skills?${qs.toString()}`),
  });
}

export function useGrowth(days = 30) {
  return useQuery({
    queryKey: ['growth', days],
    queryFn: () => api.get<{ growth: GrowthAnalysisDto }>(`/api/skills/growth/summary?days=${days}`),
  });
}

function useInvalidateGrowth() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['skills'] });
    void qc.invalidateQueries({ queryKey: ['growth'] });
    void qc.invalidateQueries({ queryKey: ['plans'] });
    // Applying a plan item creates a real goal, milestone or task, so those
    // lists are stale too.
    void qc.invalidateQueries({ queryKey: ['goals'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useSkillMutations() {
  const invalidate = useInvalidateGrowth();
  const create = useMutation({
    mutationFn: (body: {
      name: string;
      category?: string;
      description?: string | null;
      currentLevel?: SkillLevel;
      targetLevel?: SkillLevel | null;
      status?: string;
      motivation?: string | null;
    }) => api.post<{ skill: SkillDto }>('/api/skills', body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch<{ skill: SkillDto }>(`/api/skills/${id}`, body),
    onSuccess: invalidate,
  });
  /**
   * Recording a level change is its own call: it writes the history row that
   * makes "improved" a fact. An edit of the name or the notes must not.
   */
  const recordUpdate = useMutation({
    mutationFn: ({ id, ...body }: { id: string; toLevel?: SkillLevel; note?: string | null; minutes?: number | null }) =>
      api.post<{ skill: SkillDto }>(`/api/skills/${id}/updates`, body),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/api/skills/${id}`),
    onSuccess: invalidate,
  });
  const addEvidence = useMutation({
    mutationFn: ({ id, ...body }: { id: string; kind?: string; title: string; detail?: string | null; url?: string | null; date?: string | null }) =>
      api.post(`/api/skills/${id}/evidence`, body),
    onSuccess: invalidate,
  });
  const removeEvidence = useMutation({
    mutationFn: ({ id, evidenceId }: { id: string; evidenceId: string }) => api.delete(`/api/skills/${id}/evidence/${evidenceId}`),
    onSuccess: invalidate,
  });
  return { create, update, recordUpdate, archive, addEvidence, removeEvidence };
}

export function usePlans(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: ['plans', status ?? 'ALL'],
    queryFn: () => api.get<{ plans: DevelopmentPlanDto[] }>(`/api/plans${qs}`),
  });
}

export function usePlanMutations() {
  const invalidate = useInvalidateGrowth();
  const generate = useMutation({
    mutationFn: (body: { horizonWeeks?: number; weeklyMinutes?: number | null; intent?: string | null }) =>
      api.post<{ plan: DevelopmentPlanDto; generatedBy: 'ai' | 'fallback' }>('/api/plans', body),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status, title }: { id: string; status?: string; title?: string }) =>
      api.patch<{ plan: DevelopmentPlanDto }>(`/api/plans/${id}`, { status, title }),
    onSuccess: invalidate,
  });
  const applyItem = useMutation({
    mutationFn: ({ planId, itemId }: { planId: string; itemId: string }) =>
      api.post<{ plan: DevelopmentPlanDto; goalId?: string; milestoneId?: string; taskId?: string }>(`/api/plans/${planId}/items/${itemId}/apply`, {}),
    onSuccess: invalidate,
  });
  const applyAll = useMutation({
    mutationFn: (planId: string) => api.post<{ plan: DevelopmentPlanDto }>(`/api/plans/${planId}/apply-all`, {}),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/plans/${id}`),
    onSuccess: invalidate,
  });
  return { generate, setStatus, applyItem, applyAll, remove };
}

// ── labels ────────────────────────────────────────────────────

export const LEVEL_LABEL: Record<SkillLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

export const CATEGORY_LABEL: Record<string, string> = {
  TECHNICAL: 'Technical',
  COMMUNICATION: 'Communication',
  LEADERSHIP: 'Leadership',
  BUSINESS: 'Business',
  ACADEMIC: 'Academic',
  CREATIVE: 'Creative',
  PERSONAL: 'Personal',
  OTHER: 'Other',
};

export const SKILL_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
};

export const EVIDENCE_LABEL: Record<string, string> = {
  PRACTICE: 'Practice',
  PROJECT: 'Project',
  COURSE: 'Course',
  CERTIFICATE: 'Certificate',
  FEEDBACK: 'Feedback',
  PORTFOLIO: 'Portfolio',
  NOTE: 'Note',
};

export const PLAN_ITEM_LABEL: Record<string, string> = {
  OBJECTIVE: 'Objective',
  ACTIVITY: 'Activity',
  MILESTONE: 'Milestone',
  SKILL: 'Skill',
};

export const PLAN_STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'warning',
  ACTIVE: 'brand',
  COMPLETED: 'success',
  ARCHIVED: 'neutral',
};

export const SKILL_STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'info'> = {
  ACTIVE: 'brand',
  PAUSED: 'warning',
  COMPLETED: 'success',
};

export function fmtMinutes(minutes: number): string {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
