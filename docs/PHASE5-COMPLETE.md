# Phase 5 complete — Growth Hub frontend

Commits: `b98f855` (backend), `c3002f0` (frontend).

## Screens

| Screen | What it does |
|---|---|
| Growth Hub → Overview | Improving skills, needs attention (with the reason), learning consistency, weekly practice bars, goal gaps, next steps, recent evidence |
| Growth Hub → Skills | Add / edit / pause / complete / archive, current and target level, level history with dates, notes and minutes, evidence management |
| Growth Hub → Plans | Generate a draft, review every item, apply one at a time or all, DRAFT / ACTIVE / COMPLETED states |
| Dashboard | New **Growth** widget, reorderable and hideable like every other widget |

Nav entry: **Growth Hub** (`Sprout`), route `/growth`.

## The rules the UI keeps

- **The server owns every number.** The page never sums its own totals.
- **A level change is a separate action.** Editing a name writes no history. The edit
  form shows the exact history row it is about to create and offers to cancel it.
- **Applying is always explicit.** Generating writes a `DRAFT`; each item has its own
  Apply button. Nothing reaches Goals, Milestones or Tasks without a click.
- **A fallback plan is labelled.** `AI draft` vs `Built from records` — arithmetic on
  the user's own figures is never presented as a recommendation.
- **Nothing recorded is said, not drawn.** "No skills recorded yet" instead of a `0`.

## Verified

- 108/108 unit tests; both typechecks clean; both production builds clean.
- Live on a real account: growth read returns a headline ("1 level gained in the last
  30 days") and a next step that names the record; dashboard payload carries the
  `growth` block and the widget id; `/growth` route serves 200 from the production
  build.
- Secret scan clean.

## Still to do

1. **Mobile Safari** check of the three tabs (not testable here — no iOS device).
2. **Deploy**: Render Manual Deploy of `main`, then `npx prisma migrate deploy` in the
   Render Shell (migrations `20261203090000_add_skills_and_growth_plans` and
   `20261203100000_add_growth_insight_type`). Vercel redeploys with the push.
