# Analytics / Retention Dashboard — Data Audit (04.10.2026)

**Scope:** read-only. No code written, no data written, nothing deployed. Every claim below was verified by reading live source on `origin/main` (not inferred from memory/docs) — file:line citations throughout.

**Why this doc exists:** before building the requested Analytics v2 panels (North-Star row, active-users hero, cohort retention, push→action funnel, conversion funnel, economy/segment breakdowns), map exactly what's queryable today vs what needs new computation or new instrumentation — same discipline as the push-notifications audit (`.claude/knowledge/push-notifications-audit-2026-10-04.md`).

**The single most important finding:** the target surface isn't empty. `/admin/statistics` (CPO dashboard) and `/admin/analytics` (Growth Hub funnel) are two DIFFERENT existing pages, and a THIRD service (`analytics.service.ts`, authority-manager-scoped) already contains working, Firestore-read-cost-optimized implementations of DAU/MAU/activity-trend that nothing platform-wide has adapted yet. Most of this task is "generalize an existing pattern to platform scope," not "build from zero."

---

## 1. What's already on screen today

### `/admin/statistics` — the page this task enhances
`src/app/admin/statistics/page.tsx` (171 lines). Renders, in order: `ExecutiveSummary` (totalUsers, weeklyGrowthPercent, overallCompletionRate, activeAuthorities, activeClients, totalPlatformAdmins), `AuthorityPerformanceTable` (userCount/activeParks/engagementScore per authority), `ProductInsights` (top base movements, location distribution), `HealthWakeUpChart`, `EquipmentGapAnalysis`, `SleepyNeighborhoodsList`, `MaintenanceOverview`, `PremiumConversion` (hardcoded 0 — no billing yet, confirmed intentional in `[[retention-conversion-metrics-audit]]`).

Data comes from two server routes, not client Firestore reads: `/api/admin/statistics-summary` and `/api/admin/insights-summary`, both resolving a `platform | vertical | authority` scope server-side via `src/lib/adminAnalyticsScope.ts` (`resolveAdminAnalyticsScope(uid)`), verified ID token only. **This is the architecture pattern any new panel on this page must follow** — the page itself documents why (`00-MASTER-PLAN.md §13.11 P1`: the old client-side full-`users`-collection scan was a real scoping bug, fixed 23.09.2026).

### `/admin/analytics` — a SEPARATE existing page, NOT what this task touches
`src/app/admin/analytics/page.tsx` (759 lines) + `funnel-analytics.service.ts` (344 lines). "Growth Hub — Dynamic Conversion Funnel Dashboard": a real 6-stage funnel (registered → midpoint-onboarding → completed-onboarding → activation/first-workout → retention(3+ workouts) → revenue-placeholder), filterable by campaign/source/medium/gender/date, server-aggregated via `getCountFromServer` (one count per stage, not full scans), rendered as a `recharts` `FunnelChart`. **This already IS the "conversion funnel" panel in the brief.** Don't rebuild it — link to it or summarize its output as a card on `/admin/statistics`, per "enhance, don't build parallel."

### `analytics.service.ts` — authority-scoped, proven patterns, not platform-wide
`src/features/admin/services/analytics.service.ts` (1224 lines, header: "Analytics Service for Authority Managers — privacy-first, aggregated/anonymized only"). Already has `getDailyActiveUsers(authorityId, date)`, `getMonthlyActiveUsers(authorityId, year, month)`, and — most relevant — `getActivityTrend(authorityId, days)` returning `{date, dau}[]`, computed with **one range query per 30-user batch, not one query per day** (the file's own comment: "30 days × n users: was ~420 sequential reads → now 6 parallel reads"). All of it is scoped to a single `authorityId` (expanded to child neighborhoods via `getAuthorityWithChildrenIds`) — there is no platform-wide equivalent today. Every function has a documented `permission-denied` fallback path to a pre-computed `dashboard-summary` doc for authority-manager callers who can't read `users`/`workouts` directly.

---

## 2. Event/data sources that exist

| Source | What's in it | Where |
|---|---|---|
| `analytics_events` (client-writable firehose) | 16 event types: `app_open/close`, `login/logout`, `onboarding_start`, `onboarding_step_complete(d)`, `onboarding_completed`, `workout_start`, `workout_session_started`, `workout_complete`, `workout_abandoned`, `profile_created/updated`, `permission_location_status`, `error_occurred` | `src/features/analytics/AnalyticsService.ts:14-30` (type), `:306` `getUserEvents`, `:363` `getAllEvents` |
| `push_events` (server-only, Admin SDK writes) | `push_sent` / `push_opened` / `post_push_outcome` / `landing_screen`, doc id `{pushId}_{uid}_{eventType}`. `push_sent` carries `variantId, category, persona, activityType, framing, timeOfDay, channel, delivered, sentAt, openedAt, checkAfter, outcomeChecked`. `post_push_outcome` carries `outcomeAchieved` (bool), `outcomeType: 'daily_step_goal' \| 'workout_started'` | `functions/src/services/push-events.service.ts` (full schema), `functions/src/pushOutcomeSweeper.ts:60,78` (outcome types) |
| `workouts` | `userId, date, workoutType, earnedCoins, duration, distance, segments[]` — no `authorityId` field (joins via `users.core.authorityId`) | established throughout `[uid]`/`all` admin pages (PR #116/#118/#120) |
| `users` | `createdAt` (join date), `core.authorityId`, `progression.coins`, `progression.workoutCount`, `progression.currentStreak`, `onboardingStatus`, `onboardingCompletedAt`, `marketingAttribution.*` | `funnel-analytics.service.ts`, `statistics-summary/route.ts` |
| Firebase Analytics (GA4) | Initialized, consent-gated, **zero `logEvent()` calls anywhere** — wired but functionally inert | confirmed in `[[streak-system-and-behavioral-analytics-map]]`, re-verified: no 3rd-party behavioral tool (Mixpanel/Amplitude/PostHog) integrated either |

No composite index is needed for a platform-wide `workouts` date-range query without a `userId` filter — Firestore auto-indexes single fields, and `firestore.indexes.json` already carries 3 `userId+date`-family composite indexes for the per-user queries (`:565-588,1011`), none of which block a bare `date` range scan.

---

## 3. Gap table

Legend: **EXISTS** = already computed and visible somewhere today · **PARTIAL** = the raw data/pattern exists but no function/panel computes this exact shape yet · **MISSING** = no code, and for 2 items, no instrumentation either.

### North-Star row

| Metric | Status | Detail + cheapest path |
|---|---|---|
| Weekly active exercisers | **PARTIAL** | `getActivityTrend(authorityId, days)` already does this per-authority with the cheap batched-range-query pattern (`analytics.service.ts:526-584`). Platform-wide: don't batch by `userId` at all — just query `workouts where date >= 7d-ago`, dedupe `userId` in memory. Cheaper than the existing per-authority version, not harder. |
| Workouts per active user | **PARTIAL** | `authorityPerformance.engagementScore` (`statistics-summary/route.ts:177`) computes totalWorkouts ÷ ALL registered users, all-time — wrong denominator (should be *active* users) and wrong window (should be weekly, matching the NSM). Same underlying data (`workoutsByUser` map, already built in that route for a different purpose), different arithmetic. |
| D7 retention | **MISSING** | No code anywhere (grepped `D7`, `d7Retention`, `sevenDayRetention` — zero real matches). Confirmed still-open from `[[retention-conversion-metrics-audit]]` (26.08.2026) Gap 1: the funnel's "retention" stage is `workoutCount >= 3` all-time, not a 7-day cohort window. Needs: for users who joined ≥7d ago, did they have a workout both in days 0-1 (activation) and again in days 5-9 (a D7-ish window)? Computable from `users.createdAt` + `workouts.date`, but it's a real per-user join+scan, not a single aggregate query — a batch/scheduled computation, not a live page load. |
| Resurrected (reactivated) users | **MISSING** | No code (grepped `resurrect`, `reactivat` — all matches are unrelated, e.g. workout-selection "regression" logic). Needs scanning each user's full workout-date sequence for "gap > N days, then a workout inside the reporting window" — a real aggregation job over `workouts`, not a query. Cheapest version: a scheduled function (daily/weekly) that writes a small rollup doc, not computed live on page load. |

### Hero: active-users-over-time + intervention markers

| Metric | Status | Detail + cheapest path |
|---|---|---|
| Active-users-over-time line | **PARTIAL** | `getActivityTrend` is this exact shape (`{date, dau}[]`), per-authority only today. Platform variant = the same function with the `userId in batch` constraint dropped (see North-Star row above) — cheaper, not a new pattern. |
| Push-campaign markers | **PARTIAL** | Derivable from `push_events`: group `push_sent` docs by `category`/`variantId`, take the date of first send as a campaign-start marker. Real data, just needs a small aggregation, not new instrumentation. Scoped to the 3 of 12 senders currently measured (per `[[push-notifications-audit-2026-10-04]]`) — campaigns from the other 9 senders won't appear as markers until they're measured too. |
| Municipality-launch markers | **MISSING**, no instrumentation | Grepped `authorities` fields and `src/types`: no `launchDate`/`goLiveDate`/`activatedAt` field exists anywhere. `authorities.status` transitions through `active` (per `pipeline-statuses.md`) but that transition isn't timestamped on the doc. Cheapest fix: a tiny manually-entered log (admin types "Haifa went live" + a date into a small new collection) — not derivable from existing data without adding a write at the moment status flips to `active`. |
| Feature-release markers | **MISSING**, no instrumentation | No deploy/release event exists in Firestore at all (this is version-control/CI state, never written to the DB). Same cheapest fix as above: a manually-entered log, OR a `CHANGELOG`-style doc committed to git and read at render time (simpler, no new collection, no write path, matches this repo's "docs go in git" convention) — worth asking David which he'd rather maintain before building either. |

### Cohort retention curve (retention % by days-since-join, split by join-month cohort)

**MISSING entirely** — confirmed via grep, zero "cohort" matches relate to users (the 2 hits are `runningRules.ts` and `useLeaderboard.ts`, unrelated domains). The raw data exists (`users.createdAt` for cohort assignment, `workouts.date` for activity), but this is a genuine new aggregation: bucket users by join-month, then for each cohort compute % with ≥1 workout at day-offset N for N = 1,7,14,30... This is the most expensive MISSING item on the list — it's an O(users × workouts) join, not a single query, and should be a scheduled batch job writing a small rollup collection (e.g. `analytics_rollups/cohort_retention`), not live-computed per page load. Flagging, not building — this is the one panel where "cheapest way" is still a real engineering task, not a quick aggregation.

### Push → action funnel (sent → delivered → opened → started-workout → retained-7d)

| Stage | Status | Detail |
|---|---|---|
| sent, delivered, opened | **EXISTS** | Direct counts on `push_sent` docs (`delivered` bool, `openedAt != null`) — `push-events.service.ts` schema above. |
| started-workout | **EXISTS**, for measured senders only | `post_push_outcome` docs where `outcomeType === 'workout_started' && outcomeAchieved === true` — this is the live `resolveOutcomeType` path (`pushOutcomeSweeper.ts:60,78`), already computing exactly this. |
| retained-7d | **MISSING** | No code joins a successful `post_push_outcome` back to "did this user have a workout 7+ days later." Computable (cross-reference the outcome's `uid` + `checkedAt` against `workouts.date`), but it's a new derived query, not stored anywhere today. |

**Scope caveat that applies to the whole funnel**: only 3 of 12 push senders currently call `sendPush()` with `measurement` (confirmed live by David's message, matches `[[push-notifications-audit-2026-10-04]]`'s PR #114 count exactly). This funnel will only ever cover those 3 sender types until more senders are measured — a real, current data limitation, not a bug to fix in this task.

### Conversion funnel (started onboarding → finished → opened a workout → first workout → retained 3+)

**EXISTS, in full, already shipped** — this is `/admin/analytics`'s 6-stage funnel verbatim (`funnel-analytics.service.ts:225-332`). The one known defect, unchanged since 26.08.2026: the "retention" stage is `progression.workoutCount >= 3` **all-time**, not time-windowed — same root issue as the North-Star D7 gap above. No new panel needed here; at most, a summary card on `/admin/statistics` linking to the existing page, per "enhance don't duplicate."

### Economy (coins) + municipality/segment breakdowns

| Metric | Status | Detail |
|---|---|---|
| Coins balance / earned totals, platform-wide | **PARTIAL** | Per-user coins trend chart exists (`src/app/admin/users/charts.tsx`, shipped in PR #120) but nothing aggregates across users. `statistics-summary/route.ts` already builds a `workoutsByUser` map by reading `workouts` filtered to `userId in [...]` in batches of 30 (`:142-153`) — the exact same join pattern, summing `earnedCoins` instead of counting docs, gives coins-by-authority almost for free. |
| Municipality/segment breakdown generally | **PARTIAL** | `core.authorityId` is already the join key used everywhere (`authorityPerformance` table, `getUserIdsForAuthority`). Any new platform-wide metric can slice by it the same way — this is a wiring question, not a missing-data question. |

---

## 4. Cross-cutting notes (apply to whatever gets built next)

1. **Follow the server-route + scope-resolver pattern**, not a client Firestore scan — `statistics-summary/route.ts` + `src/lib/adminAnalyticsScope.ts` is the established, security-reviewed precedent (replaced a real scoping bug 23.09.2026). A new panel that reads `users`/`workouts` directly from the browser would be reintroducing the exact pattern that got fixed.
2. **Streak-field data-quality bug is still open** (`[[streak-system-and-behavioral-analytics-map]]`): 47% of sampled `streaks/{uid}` docs don't match real `workouts` data. Don't build any retention/engagement metric on top of the `streak` field without re-verifying that number first — `progression.currentStreak` inherits the same risk.
3. **Chart components to reuse, not rebuild**: `src/app/admin/users/charts.tsx`'s `DailyTrendChart` (single-series daily bar, dataviz-skill-validated palette) is a direct fit for the Hero line and any new trend panel — same `bucketWorkoutsByDay`-style pattern in `shared.utils.ts` generalizes to "bucket by day, sum/count a field."
4. **GA4/Firebase Analytics is inert** — don't assume it as a data source for anything; it logs nothing today.

---

## 5. Explicitly not done in this task
No code written. No Firestore reads beyond `git grep`/file reads of already-committed source — no live queries run, no data touched. Per the brief: audit only.
