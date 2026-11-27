# Phase 5 — status

Commit `b98f855` — backend complete and verified; frontend (Growth Hub UI) not started.

## Done

| Area | File | What it does |
|---|---|---|
| Schema | `server/prisma/schema.prisma` | `Skill`, `SkillUpdate`, `SkillEvidence`, `DevelopmentPlan`, `DevelopmentPlanItem`; `Goal.skillId` (nullable, `SetNull`); 6 new enums |
| Migration | `20261203090000_add_skills_and_growth_plans` | Additive only — no `DROP TABLE`, no `DROP COLUMN`, no `ALTER COLUMN` |
| Migration | `20261203100000_add_growth_insight_type` | `InsightType += GROWTH` |
| Growth read | `server/src/services/growth.ts` | Pure module: per-skill progress, improving, needing attention, goal gaps, consistency, weekly series |
| Plans | `server/src/services/growthPlans.ts` | AI generation + deterministic fallback + apply into Goal / Milestone / Task |
| Skills API | `server/src/routes/skills.ts` | CRUD, level updates, evidence, archive, `GET /api/skills/growth/summary` |
| Plans API | `server/src/routes/plans.ts` | Generate, apply one, apply all |
| Prompt | `server/src/services/ai.ts`, `features.ts`, `collector.ts` | Growth block, `GROWTH` insight, measured-vs-recommended rules, skill activity counted |

## The rule everything follows

A skill's level is never inferred. Every change is a `SkillUpdate` row with the
level before, the level after, a note and the minutes practised. So:

- "improved" is true only when a recorded change inside the window went **up**;
- a level recorded **before** the window is reported as the baseline, never as progress;
- a level that went **down** is not counted as improvement;
- minutes and days come from the recorded updates only — one source, so the
  figure the UI shows cannot drift from the history the user can see.

## Verified against a live server and database

- Skill CRUD, level history, evidence, growth read.
- AI plan: 13 items generated, applied to **1 goal, 4 milestones, 8 tasks** — through
  the existing models, no parallel task system.
- Isolation: a second account gets **404** on read, patch and delete of another
  account's skill and plan; its own list is empty.
- Duplicate skill name → 400; rename creates **no** history row; archive hides
  from the default list and appears under `?archived=only`.
- Existing modules unaffected: dashboard, projects, sessions, wellness all 200.
- Assistant, on a skill-only account: *"you recorded 120 practice minutes across
  1 day in this 30-day window, resulting in 1 level gained to reach Intermediate"*
  — measured, and it says the other areas are sparse instead of guessing.
- **108/108** unit tests; both typechecks clean.

## Not done yet

1. **Frontend** — `GrowthHub.tsx`, skills UI, plans UI, dashboard widget, nav entry,
   `web/src/lib/growth.ts` hooks, `types.ts` additions.
2. **Mobile Safari** verification of the new screens.
3. **Deploy** — Render Manual Deploy of `main`, then `npx prisma migrate deploy`
   in the Render Shell (the two migrations above).

## Migration command (production)

```
npx prisma migrate deploy
```
