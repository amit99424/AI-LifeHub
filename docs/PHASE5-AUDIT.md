# Phase 5 audit — personal development and growth intelligence

Written before any code was changed. The point is to say exactly what already
exists, so Phase 5 extends the product instead of rebuilding it.

## What already exists and must not be recreated

| Area | Where it lives | What it already does |
| --- | --- | --- |
| Goals | `Goal` model, `server/src/routes/goals.ts`, `web/src/pages/Goals.tsx` | title, description, status (ACTIVE/ACHIEVED/PAUSED/ABANDONED), metric, target, current, deadline, `projectId`, derived progress (`null` without a target, capped at 100) |
| Milestones | `Milestone` model, same route file | title, dueDate, completedAt, order; owned by a goal; `userId` denormalised for isolation |
| Projects / subjects / clients | `Project` model, `routes/projects.ts`, `pages/Projects.tsx` | kind, status, priority, deadline, code, progress derived from tasks, archive, time logged |
| Tasks | `Task` model, `routes/tasks.ts`, `pages/Tasks.tsx` | priority, status, due date, `projectId`, `parentId` (one level), `goalId`, recurrence with materialised next instance, overdue analytics |
| Life engine | `server/src/services/lifeEngine.ts` | pure spine: correlations with `MIN_SAMPLE`, `summarisePeriod`, `comparePeriods`, `improvementAreas`, `strengthAreas`, `habitConsistency`, `sufficiency`, `analyseLife`, `analysisForPrompt` |
| Feature engineering | `server/src/services/features.ts` | `computeFeatures` → `FeatureBundle` (tasks, habits, mood, sessions, journal, routine, `studyWork`, `goals`, availability, derived tables), `compactFeatures` for prompts |
| AI | `server/src/services/ai.ts` | `INSIGHT_SPECS` per `InsightType`, `generateInsight`, `generateInsightSet`, `askAssistant`, `analyzeJournalEntry`, usage metering, `BASE_SYSTEM` honesty rules |
| Occupations | `server/src/services/occupations.ts` | 8 profiles, nouns, task categories, widget order, `aiFocus`, `kinds`, `goalNoun`, `WIDGET_IDS` |
| Dashboard | `routes/analytics.ts` `/dashboard`, `pages/Dashboard.tsx`, `components/dashboard/Widgets.tsx` | server-built payload: widgets, life analysis, comparisons, `studyWork`; customiser persists a layout |
| Wellness | `DailyActivity` + `routes/wellness.ts` | sleep, stress, energy, sleep quality, screen, exercise |

## What is genuinely absent

1. **No skill entity at all.** Nothing records what a person can do, at what
   level, or that it changed.
2. **No evidence trail for a claim of improvement.** A goal's `current` is a
   single number the user maintains; it has no history, so "improved" cannot be
   shown from it, only "differs from what you typed before".
3. **No development plan.** The AI can write prose about study/work, but there
   is no record that a plan exists, no link from a recommendation to the goal,
   milestone or task that carries it out, and no way to see whether a plan was
   followed.
4. **No growth read.** The engine has no concept of a skill, a learning
   activity or a development goal, so nothing in `lifeEngine` can speak about
   growth.

## Decisions taken for Phase 5

- **One new domain object, `Skill`**, plus a small history table
  (`SkillUpdate`) and an evidence table (`SkillEvidence`). A skill's level is
  never inferred: every change is a row the user made, with the level before and
  after, so "improved" is a fact about records rather than a guess.
- **Plans are records, not prose.** A `DevelopmentPlan` stores the AI's
  recommendation *and* the ids of the goal, milestones and tasks that carry it
  out. The AI never creates a parallel task system: it proposes, the user
  applies, and applying writes into the existing `Goal`/`Milestone`/`Task`
  tables.
- **Recommendations are labelled as recommendations.** Every plan row carries
  its `source` (`AI` or `MANUAL`) and the measured evidence that produced it, so
  the UI can separate "we suggest" from "we measured" everywhere.
- **No population comparison.** Growth is measured against the person's own
  baseline: their own earlier level, their own earlier week.
- **Reuse, do not duplicate:** the growth read is computed by a new pure module
  and fed to the existing `lifeEngine`-style rules; the dashboard widget reads
  the same payload the Growth Hub does; the AI prompt gets the same feature
  bundle with a `growth` block added.
