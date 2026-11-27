import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { GoalDto, MilestoneDto, ProjectDto, ProjectKind, ProjectStatus, RecurrenceRule } from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Study & work: projects (subjects / clients / initiatives) and goals.
// ─────────────────────────────────────────────────────────────
// Every mutation invalidates both its own list and the dashboard, because the
// dashboard payload carries the same numbers these lists show. Two caches
// disagreeing is how an app starts lying to its user.

export interface ProjectListResponse {
  projects: ProjectDto[];
  /** The word this person's occupation uses for the container. */
  noun: string;
  kinds: ProjectKind[];
  goalNoun: string;
}

export function useProjects(params: { archived?: 'exclude' | 'only' | 'all'; kind?: ProjectKind } = {}) {
  const qs = new URLSearchParams();
  if (params.archived) qs.set('archived', params.archived);
  if (params.kind) qs.set('kind', params.kind);
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () => api.get<ProjectListResponse>(`/api/projects?${qs.toString()}`),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<{ project: ProjectDto; tasks: TaskRow[]; goals: GoalDto[] }>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
  dueDate: string | null;
  completedAt: string | null;
  projectId: string | null;
  parentId: string | null;
  goalId: string | null;
  recurrence: RecurrenceRule;
  recurrenceEvery: number;
  project?: { id: string; title: string; code: string | null } | null;
  goal?: { id: string; title: string } | null;
  _count?: { subtasks: number };
  overdue?: boolean;
}

function useInvalidateWork() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['project'] });
    void qc.invalidateQueries({ queryKey: ['goals'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  };
}

export function useProjectMutations() {
  const invalidate = useInvalidateWork();
  const create = useMutation({
    mutationFn: (body: Partial<ProjectDto> & { title: string }) => api.post<{ project: ProjectDto }>('/api/projects', body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<ProjectDto> & { archived?: boolean }) =>
      api.patch<{ project: ProjectDto }>(`/api/projects/${id}`, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export function useGoals(params: { status?: string; projectId?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.projectId) qs.set('projectId', params.projectId);
  return useQuery({
    queryKey: ['goals', params],
    queryFn: () => api.get<{ goals: GoalDto[] }>(`/api/goals?${qs.toString()}`),
  });
}

export function useGoalMutations() {
  const invalidate = useInvalidateWork();
  const create = useMutation({
    mutationFn: (body: { title: string; description?: string | null; target?: number | null; metric?: string | null; current?: number | null; deadline?: string | null; projectId?: string | null }) =>
      api.post<{ goal: GoalDto }>('/api/goals', body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch<{ goal: GoalDto }>(`/api/goals/${id}`, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/goals/${id}`),
    onSuccess: invalidate,
  });
  const addMilestone = useMutation({
    mutationFn: ({ goalId, title, dueDate }: { goalId: string; title: string; dueDate?: string | null }) =>
      api.post<{ milestone: MilestoneDto }>(`/api/goals/${goalId}/milestones`, { title, dueDate }),
    onSuccess: invalidate,
  });
  const toggleMilestone = useMutation({
    mutationFn: ({ goalId, id, completed }: { goalId: string; id: string; completed: boolean }) =>
      api.patch<{ milestone: MilestoneDto }>(`/api/goals/${goalId}/milestones/${id}`, { completed }),
    onSuccess: invalidate,
  });
  const removeMilestone = useMutation({
    mutationFn: ({ goalId, id }: { goalId: string; id: string }) => api.delete(`/api/goals/${goalId}/milestones/${id}`),
    onSuccess: invalidate,
  });
  return { create, update, remove, addMilestone, toggleMilestone, removeMilestone };
}

// ── labels ────────────────────────────────────────────────────
// The kind is the one place the vocabulary branches: a STUDY container is a
// "Subject" for a student and a "Course" for a teacher, and both are the same
// column. Nouns for the container itself come from the occupation profile.

export const KIND_LABEL: Record<ProjectKind, string> = {
  STUDY: 'Study',
  WORK: 'Work',
  CLIENT: 'Client',
  BUSINESS: 'Business',
  JOB_SEARCH: 'Job search',
  PERSONAL: 'Personal',
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

export const STATUS_TONE: Record<ProjectStatus, 'neutral' | 'brand' | 'warning' | 'success'> = {
  PLANNING: 'neutral',
  ACTIVE: 'brand',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
};

export const RECURRENCE_LABEL: Record<RecurrenceRule, string> = {
  NONE: 'Does not repeat',
  DAILY: 'Every day',
  WEEKDAYS: 'Every weekday',
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
};

/** "Every 2 weeks" / "Every weekday" — the rule and its interval in one line. */
export function recurrenceText(rule: RecurrenceRule, every: number): string {
  if (rule === 'NONE') return RECURRENCE_LABEL.NONE;
  if (rule === 'WEEKDAYS') return 'Every weekday';
  const unit = rule === 'DAILY' ? 'day' : rule === 'WEEKLY' ? 'week' : 'month';
  return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
}
