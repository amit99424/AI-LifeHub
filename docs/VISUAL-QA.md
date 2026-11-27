# Visual QA report — Phase 7

**Method:** the production build (`web/dist`) served on `127.0.0.1:4321` behind a small
`/api` proxy to the local API on `4001`, driven by **real Chrome** (Chrome 158, headless)
through the DevTools Protocol — not a simulated viewport. Each page was loaded logged in
as a real account, given time to settle, measured for horizontal overflow, and captured.
Driver: `docs/qa-shots/cdp.cjs`. Screenshots: `docs/qa-shots/*.png`.

**Viewports:** 1440 × 1000 (desktop), 820 × 1180 (tablet), 390 × 844 (narrowest practical).

**Not verified:** real mobile Safari (no iOS device or simulator). Everything below was
verified in Chromium only; Safari's rendering of the same CSS is not claimed.

---

## Pages covered

| # | Page | 1440 | 820 | 390 | Notes |
|---|---|---|---|---|---|
| 1 | Login | ✅ | — | ✅ | Unauthenticated, centred card, no overflow |
| 2 | Dashboard + widgets | ✅ | ✅ | ✅ | 15 widgets, quote card, comparison strip |
| 3 | Daily Quotes | ✅ | ✅ | ✅ | Card renders with attribution; refresh present |
| 4 | Tasks + task modal | ✅ | — | ✅ | Modal opens, fields aligned, no clipping |
| 5 | Projects | ✅ | — | — | List + empty state |
| 6 | Goals | ✅ | — | ✅ | Target/percentage honesty intact |
| 7 | Growth Hub / Skills | ✅ | — | ✅ | Overview, Skills, Plans tabs |
| 8 | Wellness, Habits, Mood | ✅ | — | ✅ | Wellness grid, habit list, mood picker |
| 9 | AI Assistant + daily plan | ✅ | — | ✅ | Plan panel, recommended order, caveats |
| 10 | Reports (daily/weekly/monthly) | ✅ | ✅ | ✅ | Tabs switch, metrics, CSV/Print buttons |
| 11 | Insights + charts | ✅ | ✅ | ✅ | 7/30/90 + Daily/Weekly/Monthly filters |
| 12 | Settings, Profile, Journal, Sessions, Routine, Analytics | ✅ | — | ✅ | Settings and Profile at both widths |

Horizontal overflow measured at **0 px** on every page at every viewport tested.

---

## Issues found and fixed

### 1. Sidebar clipped its own account section (desktop) — most serious
At 1440 × 1000 the 16 nav items plus the "Low-effort tracking" card pushed the
**Account** heading off the bottom: the word was cut in half and **Profile and Settings
were not reachable from the sidebar at all**. The nav scrolls, but with no visible cue,
so it read as a truncated menu.
**Fix:** nav rows `py-2.5` → `py-2`, and the promo card is hidden below 1000 px of window
height (`[@media(max-height:1000px)]:hidden`). Both account links now sit above the
account row. Verified at 1440 × 1000.

### 2. Analytics rollup axis labels missing and colliding
The weekly rollup showed only every other week label (W45, W47 …) and the first and last
ticks overlapped the plot edge.
**Fix:** smaller ticks with `minTickGap={12}` and `interval="preserveStartEnd"` on both
the weekly and monthly rollups.

### 3. Tasks quick-add placeholder truncated (mobile)
At 390 px the placeholder was clipped mid-word — "Add a task and press Enter — tir".
**Fix:** shortened to "Add a task — press Enter", which fits.

### 4. Reports period pill wrapped onto two lines (mobile)
"1 of 7 days recorded" broke across two lines once the range above it wrapped.
**Fix:** `shrink-0 whitespace-nowrap` on the badge.

### 5. Growth Hub stat tiles stacked four-high (mobile)
Four full-width tiles pushed the actual skills below the fold.
**Fix:** `grid-cols-2` from the smallest width, four columns from `lg`.

### 6. Mood trend subtitle read "Average — / 5 across 0 entries"
A dash and a zero presented as a figure where nothing was recorded.
**Fix:** "No mood recorded in this range" when there is no average, and "1 entry" in the
singular.

### 7. Header title could disagree with the page heading
The header used a prefix match on the nav, so a nested route kept its parent's label
while the page's own `h1` said something else.
**Fix:** the longest matching route now wins, so the two always agree.

### 8. Create-action buttons were three different sizes
"Habits" used the small button while Projects and Goals used the default.
**Fix:** all three primary create actions are the default size.

### 9. Comparison cards misaligned at tablet width
At 820 px, three "not comparable yet" cards sit in a row and the label wrapped to two
lines beside the badge, so the three cards had different heights.
**Fix:** the badge drops under the label.

### 10. Assistant showed two different quotas
The header said "76 messages left today" from a stale read while the strip under the
composer said "4/80 messages today".
**Fix:** the header no longer repeats the quota; the usage strip is the one place for it.

### 11. Task descriptions were clamped to one line on mobile
**Fix:** `line-clamp-2` on small screens, one line from `sm` up.

---

## Checked and correct (no change)

- **Dark mode** is the app's default theme and was what every screenshot was taken in;
  surfaces, borders, badges and chart grids all use the `ink`/`brand` tokens, and no
  panel showed a light-mode artefact.
- **Empty and insufficient-data states** are honest everywhere they appear: Mood,
  Insights, Reports and Growth all say "Not recorded" / "No entries yet" with the reason,
  rather than drawing a zero.
- **Charts** are readable at all three widths; the Insights tooltips print "not recorded"
  for a null point rather than 0.
- **Navigation** (sidebar, mobile drawer, header) has no broken links; all 16 routes
  render.
- **Modals** (New task) centre correctly, trap nothing behind an overflow, and their
  footer buttons stay visible.

---

## Commits

| Hash | Description |
|---|---|
| `401b55e` | Sidebar footer clip, Tasks placeholder, Reports pill, Growth tiles |
| `75b3651` | Sidebar fits at 1000px, Analytics ticks, Mood copy, Habits button, header label |
| `0aadfb9` | Tablet comparison cards, Assistant quota |

**Final commit: `0aadfb9`**, pushed to `main`.

Checks after the fixes: web `tsc --noEmit` clean, web `npm run build` clean,
server unit suite **149 / 149** passing.
