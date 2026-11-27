# AI-LifeHub — Platform Audit and Build Plan

Audited against `main` at `0bc9452`. This is the state of the code, not a wish list.

---

## 1. Existing feature audit

### What is genuinely built

| Area | State | Where |
|---|---|---|
| Auth | Google OAuth (server-side code flow, PKCE, state double-submit cookie, JWKS ID-token verification) + email/password. Refresh-token rotation, per-device sessions, audit log. | `server/src/routes/auth.ts`, `googleAuth.ts`, `services/google.ts` |
| Session model | `lh_at` access cookie (15 min) / `lh_rt` refresh (`/api/auth`), same-origin proxy in production | `server/src/middleware/auth.ts`, `web/vercel.json` |
| Tasks | CRUD, priority, status, category, due date, `startedAt`/`completedAt`, `timeTakenSec` derived | `server/src/routes/tasks.ts`, model `Task` |
| Habits | DAILY/WEEKLY, target/week, per-day `HabitLog`, unique `(habitId, date)`, streak computation | `routes/habits.ts` |
| Mood | One `MoodLog` per day: level, score 1–5, energy, focus, note | `routes/moods.ts` |
| Journal | Entries per day, word count, AI sentiment + themes + summary fields | `routes/journal.ts` |
| Study/work sessions | Timer with pause accounting (`pausedMs`), category enum, focus score | `routes/sessions.ts`, model `WorkSession` |
| Daily activity | Sleep / exercise / screen / meditation / social minutes, steps, per day, `@@unique([userId, date])` | `routes/activity.ts`, model `DailyActivity` |
| Analytics | `buildAnalytics()` returns daily/weekly/monthly series, totals, streaks, 12-week heatmap, priority and category splits, hourly and weekday distributions | `services/analytics.ts` (448 lines) |
| AI | Gemini with fallback chain, `buildFeatureBundle()` → `computeFeatures()`, per-type insight specs with data-availability gates, journal analysis, assistant chat | `services/ai.ts`, `services/llm.ts`, `services/collector.ts`, `services/features.ts` |
| AI safety | System prompt already forbids inventing metrics, forbids causation language, forbids medical advice, and requires stating when data is sparse | `services/ai.ts` `BASE_SYSTEM` |
| Demo data | `isDemo` flag on every user-data model, `demoDataLoaded` on settings, seed service | `services/demo.ts` |
| UI | 13 pages, React Query, optimistic updates with rollback, loading/empty/error states | `web/src/pages/*` |

### What the audit found that changes the plan

1. **`DailyActivity` already is the wellness table.** It has sleep, exercise, screen, meditation, social minutes, steps, `source` (`manual|csv|device`) and `isDemo`. It needs no new table — it needs `stress` and `energy` and a UI.
2. **`AnalyticsPayload` already has hourly and weekday distributions.** "Best-performing days and times" is a presentation problem, not a data problem. The raw material for module 8 exists.
3. **AI already refuses to fabricate.** `BASE_SYSTEM` rule 1–3 and the `needs:` gates per insight type are exactly the discipline the brief asks for. Module 8 extends this, it does not replace it.
4. **`Profile.occupation` is a free-text string**, set in onboarding step 2. Nothing downstream reads it. That is the whole of module 10's gap.
5. **There is no `Project`, `Goal`, `Milestone` or `Reminder` model.** Module 2 (projects/subtasks/recurring) and module 6 (goals) are genuinely absent.
6. **Tasks have no parent.** No subtasks, no recurrence rule.
7. **`WorkSession` has no `subject` or `client` field.** Module 3's subject/client tracking needs one nullable column, not a new table.
8. **Habits have no weekly/monthly frequency.** `HabitFrequency` is `DAILY | WEEKLY`; a MONTHLY habit and a weekly target count are both missing.
9. **No report export.** Nothing generates a PDF or CSV of a period.
10. **Dashboard is one fixed layout.** Module 1's "customizable widgets" has no substrate.
11. **`/api/analytics` accepts only `7d|30d|90d|month|custom`** and computes everything on each request with no caching — fine at current volume, a problem once the dashboard reads six modules.

### What must not change

- Google OAuth and the `OAuthAccount` key on Google `sub`.
- `passwordHash` nullable, `409 use_google_signin` for Google-only accounts.
- Cookie names, paths and `SameSite=Lax` same-origin policy.
- Existing `isDemo` semantics.
- Every existing route and response shape. New fields are additive and optional.

---

## 2. Proposed architecture

### Data flow

```
        ┌─────────────── web (Vite/React) ───────────────┐
        │  Dashboard widgets · module pages · reports    │
        └──────────────────────┬─────────────────────────┘
                               │ /api/* (same-origin proxy)
        ┌──────────────────────▼─────────────────────────┐
        │  server (Express)                              │
        │  routes/  → thin, validated, user-scoped        │
        │  services/lifeEngine.ts   ← NEW: the spine      │
        │      · aggregates the 8 life domains per period │
        │      · computes correlations WITH sample size   │
        │      · never states causation                   │
        │  services/ai.ts  → prompts consume the engine   │
        └──────────────────────┬─────────────────────────┘
                               │ Prisma
        ┌──────────────────────▼─────────────────────────┐
        │  PostgreSQL (Neon) — every row has userId       │
        └────────────────────────────────────────────────┘
```

The spine is one new service, `lifeEngine.ts`, that every module and the AI read from. That is what turns "a collection of disconnected tools" into a system: one definition of a day, one definition of a score, one place where "we don't have enough data" is decided.

### Module → implementation map

| Module | Build on | New work |
|---|---|---|
| 1 Life dashboard | `/api/analytics/dashboard`, `buildAnalytics` | Widget registry + user layout, time allocation donut, AI daily summary |
| 2 Tasks/projects | `Task` | `Project`, `Task.parentId`, `Task.recurrence`, `Task.remindAt` |
| 3 Study/work | `WorkSession` | `subject`, `client`, `billable`; Pomodoro presets; per-subject rollup |
| 4 Habits | `Habit`, `HabitLog` | `MONTHLY` frequency, `targetPerPeriod`, weekly-target semantics, consistency score |
| 5 Journal/mood | `JournalEntry`, `MoodLog` | `stress` on mood; sentiment↔productivity join; search |
| 6 Goals | — | `Goal`, `Milestone`, progress derivation from linked tasks/habits |
| 7 Wellness | `DailyActivity` | `stress`, `energy`, `sleepQuality`; wellness↔productivity panel |
| 8 Advanced analytics | `buildAnalytics`, `computeFeatures` | `lifeEngine` correlations with n and confidence, best-time analysis, week-over-week deltas |
| 9 Assistant | `askAssistant`, `buildFeatureBundle` | Tool-style retrieval over the engine, so answers cite real aggregates |
| 10 Occupation | `Profile.occupation` | `OccupationType` enum, per-occupation config (terminology, categories, widgets, prompts) |
| 11 Reports | `buildAnalytics` | `Report` generation service + PDF/CSV export |

### Occupation personalisation design

A single server-side config table, not scattered `if (occupation === ...)`:

```ts
OCCUPATION_PROFILES = {
  STUDENT: {
    label: 'Student',
    nouns: { project: 'Subject', session: 'Study session', ... },
    categories: ['Assignment', 'Exam prep', 'Reading', 'Lab', 'Thesis'],
    sessionKind: 'SUBJECT',
    widgets: ['exams', 'studyHours', 'assignmentLoad', ...],
    aiFocus: 'academic load, exam readiness, revision spacing',
  },
  ...
}
```

The dashboard, the task category picker, the session label and the AI prompt all read from it. Every occupation keeps the same eight-domain life dashboard underneath; the profile only changes emphasis and vocabulary.

---

## 3. Database changes

All additive. No column dropped, no table renamed, no data rewritten. One migration per phase.

```prisma
// Phase A — occupation and wellness
enum OccupationType { STUDENT WORKING_PROFESSIONAL FREELANCER BUSINESS_OWNER
                      ENTREPRENEUR JOB_SEEKER TEACHER OTHER }
// Profile.occupation stays a String (existing rows keep working);
// Profile.occupationType is the new enum, backfilled by the migration.

model DailyActivity {
  stressLevel   Int?   // 1-5, NEW
  energyLevel   Int?   // 1-5, NEW
  sleepQuality  Int?   // 1-5, NEW
}

model MoodLog {
  stress  Int?   // 1-5, NEW — mood already has energy and focus
}

// Phase B — projects, subtasks, recurrence
model Project {
  id, userId, name, description, category, color,
  status (ACTIVE|PAUSED|COMPLETED|ARCHIVED), dueDate,
  progressMode (MANUAL|FROM_TASKS), isDemo, timestamps
}
model Task {
  projectId  String?  // NEW
  parentId   String?  // NEW — subtasks
  recurrence String?  // NEW — 'daily' | 'weekly:1,3,5' | 'monthly:15' | null
  remindAt   DateTime? // NEW
  estimateMin Int?    // NEW
}

// Phase C — goals
model Goal {
  id, userId, title, description, category (EDUCATION|CAREER|HEALTH|
  PERSONAL|FINANCE), horizon (SHORT|LONG), targetDate, status,
  progressPct Int @default(0), isDemo, timestamps
}
model Milestone {
  id, goalId, title, dueDate, completedAt, order
}

// Phase D — sessions by subject/client
model WorkSession {
  subject String?   // NEW
  client  String?   // NEW
  billable Boolean @default(false)  // NEW
}

// Phase E — habits
enum HabitFrequency { DAILY WEEKLY MONTHLY }  // MONTHLY added
model Habit {
  targetPerPeriod Int?  // NEW — replaces targetPerWeek semantics for WEEKLY/MONTHLY
}

// Phase F — dashboard layout
model UserSettings {
  dashboardWidgets Json?  // NEW — ordered array of widget ids
}
```

Backfill in the same migration: `occupationType` derived from the existing `occupation` string by a `CASE` on lowercased matches, defaulting to `OTHER`. Existing `targetPerWeek` values are copied into `targetPerPeriod` for `WEEKLY` habits.

---

## 4. Implementation phases

| Phase | Delivers | Migration | Risk |
|---|---|---|---|
| **0** | This audit + `lifeEngine` skeleton + dataset ingestion as `isDemo` seed | none | none |
| **1** | Occupation enum + profiles + onboarding + terminology across UI | A | low |
| **2** | Wellness inputs (sleep/screen/exercise/stress/energy) — the data foundation | A | low |
| **3** | Life dashboard rebuild: widgets, registry, time allocation, AI daily summary | F | medium |
| **4** | Projects, subtasks, recurrence, overdue tracking | B | low |
| **5** | Goals + milestones | C | low |
| **6** | Study/work: subject & client tracking, Pomodoro, per-subject rollup | D | low |
| **7** | Habits: monthly, targets, consistency scoring | E | low |
| **8** | Advanced analytics: correlations with n and confidence, best-time, deltas | none | medium |
| **9** | Assistant grounded in the engine | none | medium |
| **10** | Reports + export | none | medium |

Each phase: `tsc --noEmit`, unit + OAuth e2e suites, production build, secret scan, then push. The app stays deployable at the end of every phase.

---

## 5. Important missing functionality

Not in the brief, but a "personal operating system" needs them. Listed so the gaps are explicit rather than discovered later.

1. **No data export / account deletion.** GDPR-shaped expectation; `AuditLog` exists but nothing is user-facing.
2. **No timezone-correct "day" for users who travel.** `Profile.timezone` exists and is used, but nothing updates it.
3. **No background jobs.** Streaks and heatmaps are computed on read. At scale the dashboard becomes the slowest page. A nightly `DailyRollup` table is the eventual answer.
4. **No notification channel.** `remindAt` needs either an email job or push; neither exists.
5. **No rate limiting per AI feature.** `UserUsage` meters chat, insights and analyses per day, but there is no per-feature budget.
6. **No accessibility pass.** Focus states exist; no systematic audit has been run.
7. **The dataset has 100 synthetic users × 60 days, Jan 1 – Mar 1 2026.** Three occupations only (Student, Freelancer, Working Professional). It is a prototyping and demo asset, and it must never be blended into a real user's analytics — hence `isDemo`.

### What the dataset actually says (measured, not assumed)

Correlation of `productivity_score_0_100` against each field, n = 6000:

| Field | Pearson r |
|---|---|
| focus_score_1_10 | +0.732 |
| stress_score_1_10 | −0.639 |
| mood_score_1_10 | +0.597 |
| screen_time_hours | −0.547 |
| overdue_tasks | −0.511 |
| exercise_minutes | +0.394 |
| sleep_hours | +0.389 |
| habit_completion_pct | +0.128 |
| study_work_hours | +0.018 |

`study_work_hours` being almost uncorrelated with the productivity score is worth knowing before building any "hours studied → productivity" panel: on this dataset, hours alone predict nothing. That is exactly the kind of unsupported claim the brief forbids, and the engine must be able to say so.
