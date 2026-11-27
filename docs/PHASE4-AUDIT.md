# Phase 4 audit — what already exists

Inspected on `main` at 312a759 before writing anything.

## Reusable as-is
- `Task` — title, description, category (occupation default), priority, status,
  dueDate, startedAt, completedAt, timeTakenSec. Full CRUD, optimistic UI,
  filters (status/priority/category/search/due/sort), overdue analytics.
- `WorkSession` — category, label, notes, startedAt/endedAt/pausedAt/pausedMs,
  durationSec, status (RUNNING|PAUSED|COMPLETED), focusScore, date.
  Start/pause/resume/stop/manual/delete, one-active-session guard.
- `lifeEngine.ts` — correlations, best time, deltas, improvements, strengths,
  consistency, trend. Single source of truth.
- `OCCUPATION_PROFILES` — nouns (project/projects/session/sessions/sessionLabel),
  taskCategories, suggestedHabits, widgets, aiFocus, billableHours.
- Dashboard widget registry + saved layout (`UserSettings.dashboardLayout`).

## Genuinely absent (this phase)
- Project / Subject / Client — no container entity at all. Tasks are flat.
- Milestones, Goals — nothing.
- Subtasks — `Task` has no parent.
- Recurrence — no RRULE, no completion roll-forward.
- Session→project link — `WorkSession` has `label` text only.
- Break tracking — `pausedMs` exists but breaks are not recorded as records.
- Session notes at stop — accepted but only on the stop call.
- Study/Work analytics per subject/project — impossible without the link.

## Design decisions for this phase
1. **One container model, not four.** `Project` with `ProjectKind`
   (STUDY | WORK | CLIENT | BUSINESS | JOB_SEARCH | PERSONAL). A student's
   "subject", a freelancer's "client project" and a job seeker's "application
   track" are the same shape; only the vocabulary differs, and that already
   comes from OCCUPATION_PROFILES. Four tables would be four copies of the
   same queries.
2. **`Project.code`** carries a subject code ("CS101") or a client name, so the
   student and freelancer workflows are the same column.
3. **Subtasks = `Task.parentId`**, one level deep, enforced in the route. Not a
   separate table: a subtask has the same fields and the same overdue logic.
4. **Recurrence = fields on `Task`** (rule, interval, nextDueAt), materialised
   on completion. Not a background job: the host is a free tier and there is no
   scheduler; the completion handler creates the next instance inside the same
   transaction.
5. **`SessionBreak`** — a real row per pause, so break time is analysable
   rather than a single accumulated integer.
6. **`Goal` + `Milestone`** with an optional `projectId` and a `Task.goalId`.
7. Every migration additive; no existing column changes type or is dropped.
8. All new analytics read through `lifeEngine` inputs — `LifeDay` gains
   `projectBreakdown`-free scalar fields only (no per-project logic in the
   engine; per-project aggregation is a query, not a claim).
