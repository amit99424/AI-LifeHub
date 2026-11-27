# Phase 6 — Advanced AI Life Assistant

Status: **implemented, tested, verified locally.** Not yet deployed.

The Phase 6 brief asked for an intelligent, context-aware life assistant built on
top of the existing assistant rather than beside it. That constraint drove every
decision here: there is no new chat system, no new task store, and no second copy
of a number that already exists.

## 1. Audit — what was already there, and what was reused

| Piece | Where | Phase 6 used it for |
| --- | --- | --- |
| Gemini 2.5 Flash chain (`complete`, `parseJsonLoose`, `AIUnconfiguredError`) | `server/src/services/llm.ts` | Every model call. No new client was written. |
| `BASE_SYSTEM` + 10 honesty rules | `server/src/services/ai.ts` | Extended, not replaced — four planning rules were appended. |
| `askAssistant()` | `server/src/services/ai.ts` | Extended to carry the plan and the review into the prompt. |
| `buildFeatureBundle` / `computeFeatures` / `compactFeatures` | `server/src/services/ai.ts`, `features.ts` | Still the data block the assistant reads. |
| `lifeEngine.ts` (`analyseLife`, `summarisePeriod`, `comparePeriods`) | `server/src/services/lifeEngine.ts` | Not duplicated: the weekly review reads the same rows directly because it needs week-scoped counts the engine does not expose. No second definition of "consistency" was introduced. |
| `growth.ts` / `collectGrowth` | `server/src/services/growth.ts`, `routes/skills.ts` | The weekly review's skill figures come from `analyseGrowth`, so "levels gained" has exactly one definition. |
| `Conversation` / `Message` | Prisma | Conversation history is the existing table. |
| Tasks, Projects, Goals, Milestones, Skills, `DailyActivity`, `WorkSession`, `HabitLog` | Prisma | Read, and written **only** through the existing models. |
| `OCCUPATION_PROFILES` / `aiFocusLine` | `services/occupations.ts` | Already in the assistant prompt; unchanged. |
| `InsightType` (`GROWTH`, `FOCUS`, `GOALS`, …) | Prisma | Untouched. Phase 6 adds no insight type and no migration. |

**No database migration.** Phase 6 stores nothing new: plans and reviews are
computed on request from rows that already exist.

## 2. What was built

### `server/src/services/planner.ts` (new, deterministic — no model calls)

- **`prioritise(tasks, today, { goalIds })`** — ranks open work by overdue age
  (flattening at 14 days), declared priority, deadline proximity, in-progress
  state and active-goal link. Every score carries `reasons[]` naming the figures
  that produced it. **It never writes** — `Task.priority` and `Task.dueDate` are
  read-only inputs. A task with no deadline is never labelled urgent.
- **`dailyBudget(sessionSeconds, statedMinutes)`** — the time a day can hold.
  Stated minutes win; otherwise the median completed-session length × 4, and the
  `basis` string says out loud that this is an assumption. Too little data →
  `minutes: null` and the plan assumes nothing fits.
- **`dailyPlan()`** — builds a day that fits: ordered blocks with an estimated
  duration (from the user's own recorded `timeTakenSec` when present),
  **postponed work listed with the reason it did not fit**, deadlines in the next
  14 days, breaks driven by recorded energy/stress, and `caveats[]` for every
  input that was absent.
- **`weeklyReview()`** — this week against the user's **own** previous week:
  tasks completed/created, still-overdue, focus minutes and sessions, habit
  coverage, mood, wellness days, milestones, skill levels gained. `obstacles[]`
  quotes a figure per line; `caveats[]` says "no comparison possible" instead of
  inventing one; `enoughData` is false on a thin week.
- `planForPrompt()` / `reviewForPrompt()` — compact, labelled prompt blocks.

### `server/src/services/actions.ts` (new)

Natural-language actions, with the model on a short leash:

1. `proposeAction()` asks the model for **one** action and passes it the user's
   own open tasks, projects and active goals as the only legal ids. Every field
   is then validated: unknown project/goal ids are dropped, unknown task ids
   reject the proposal, a missing `kind` is inferred from the fields returned
   (models omit it), and `AIUnconfiguredError` returns `null` rather than
   guessing.
2. The UI shows the summary and waits.
3. `executeAction()` re-checks ownership **from the database**, then writes
   through the existing Prisma models. Duplicate guards: same title + due date +
   links already open, an active goal of the same name, or a skill of the same
   name → `400` with a sentence saying so.

Supported kinds: `create_task`, `create_goal`, `create_milestone`,
`update_task_status`, `complete_task`, `add_skill`.

### `server/src/routes/ai.ts` (extended)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ai/daily-plan?availableMinutes&date` | The plan. No model call, so it always answers. |
| GET | `/api/ai/weekly-review` | Measured figures, week vs the user's previous week. |
| GET | `/api/ai/suggestions` | Up to 6 questions, each only offered when the data behind it exists. |
| POST | `/api/ai/actions/propose` | `{ message }` → `{ action \| null }`. Writes nothing. |
| POST | `/api/ai/actions/execute` | `{ kind, payload }` → the created/updated record. |

All sit behind the router's existing `requireAuth`; the two POSTs also take
`aiLimiter`.

### `server/src/services/ai.ts` (extended)

`askAssistant()` now computes the plan and the review in parallel with the
feature bundle (each `.catch(() => null)`, so a failure costs wording, not
facts), parses a stated time out of the question ("I have 90 minutes"), and adds
four prompt rules: how to answer planning and review questions, never invent a
record, and that it cannot change anything itself. Responses gained `plan` and
`review` fields — additive, so existing clients are unaffected.

### Frontend

- `web/src/lib/assistant.ts` — `useDailyPlan`, `useWeeklyReview`,
  `useAiSuggestions`, `useProposeAction`, `useExecuteAction`; every write
  invalidates `tasks`, `goals`, `projects`, `skills`, `growth`, `dashboard`,
  `ai-plan`, `ai-review`, `ai-suggestions`.
- `web/src/components/assistant/AssistantPanels.tsx` — `DailyPlanPanel`
  (set minutes, rebuild, ordered blocks with the *why*, breaks, deadlines,
  "Not today", caveats), `WeeklyReviewPanel` (stat grid with vs-last-week
  deltas, goals, obstacles, missing data), `ActionCard` (summary + Confirm +
  Cancel + "Nothing has been saved yet").
- `web/src/pages/Assistant.tsx` — two entry-point buttons above the thread,
  server-driven suggested questions in the empty state, and the confirmation
  card inline in the conversation. Still one assistant page, not a second
  chatbot.
- `web/src/lib/types.ts` — `DailyPlanDto`, `WeeklyReviewDto`, `SuggestionDto`,
  `ProposedActionDto`.
- `web/phase6-preview.html` — a standalone preview of the three panels against
  the local API, used for verification.

## 3. Verification

- Unit tests: **122/122** (`npm test` in `server/`), of which 14 are new
  planner tests covering ordering, the no-deadline rule, the flattening
  overdue weight, in-progress preference, goal boost, completed/archived
  exclusion, reason-per-task, stable tie-breaking, and all five budget paths.
- `tsc --noEmit` clean in both packages; `npm run build` clean in both.
- Live, against a seeded account on the local API:
  - `GET /daily-plan?availableMinutes=120` → budget `stated`, 4 blocks of 30
    minutes, 4 postponed with reasons, wellness caveat.
  - `GET /weekly-review` → all deltas `0` vs last week, `enoughData: false`,
    caveats for missing wellness and habits (not zeros).
  - `GET /suggestions` → only the questions the account supports.
  - `POST /actions/propose` "mark Document API Contracts as done" → a proposal
    naming that exact task; nothing written.
  - `POST /actions/execute` → `201` and the task created; the same request a
    second time → `400` "already open, so it was not created again".

## 4. Deployment

No migration. Deploy the backend (`main` → Render Manual Deploy) and the
frontend (Vercel), then open `/assistant`.
