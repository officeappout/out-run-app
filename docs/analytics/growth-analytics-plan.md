# OUTRUN Growth Analytics Plan

**Status:** Approved direction, decisions baked in below (05.10.2026) — Phase 0/1 execution still needs a fresh go from the owner per standing rules
**Owner:** David
**Author:** Analytics/Admin platform workstream
**Builds on:** PR #122 (`43444cd7`, merged) — data audit; PR #123 (`f13f1fb3`, merged) — Analytics v2 Phase 1

---

## 1. Context

OUTRUN today has two separate admin analytics surfaces that grew independently:

- `/admin/statistics` — the CPO dashboard, recently extended by PR #123 with a North-Star row and a Hero chart.
- `/admin/analytics` — a self-contained conversion-funnel page that already informally calls itself "Growth Hub" in its own UI.

The owner set a direction: collapse both into **one analytics hub at `/admin/journey`**, organized as **three tabs along the user lifecycle — Acquisition → Activation → Retention** — rather than continuing to grow two disconnected screens. This document is the work plan for that consolidation and for the instrumentation work the owner was told is roughly half the value: a meaningful chunk of the metrics the hub should eventually show require event data that does not exist in the product today and cannot be backfilled, so the earlier that instrumentation lands, the sooner it starts accumulating history.

This plan explicitly builds on, and does not duplicate:

- **PR #122** — the read-only audit at `.claude/knowledge/analytics-retention-dashboard-audit-2026-10-04.md`, source of several hard constraints used throughout (e.g. the streak-field warning, §2.3).
- **PR #123** — which already shipped real, working infrastructure reused rather than rebuilt: the North-Star row, the Hero chart, the push→action funnel, the economy-by-authority table, and the two server routes behind them (`/api/admin/growth-metrics`, `/api/admin/push-funnel-summary`), plus the `adminAnalyticsScope` secure-scoping pattern they're built on.

**UI language, every page this plan touches:** every user-facing label in the admin panel is Hebrew — matching this codebase's existing convention everywhere else in the admin panel (every page/table/button referenced in this doc already renders in Hebrew). Internal event names, code identifiers, routes, and metric keys (`recommendation_shown`, `/admin/journey`, `dauMauRatio`, etc.) stay English — this document itself is written in English for the engineering audience, but nothing in it should be read as a literal UI string. §4.2 gives a translation table for the new terms this plan introduces.

---

## 2. Current-state findings

### 2.1 What's computed today, and where

| Capability | Where | Pattern |
|---|---|---|
| 6-stage conversion funnel (registered → onboarding midpoint → onboarding completed → activation (1st workout) → retention (workoutCount ≥ 3, all-time) → revenue (placeholder)) | `src/features/admin/services/funnel-analytics.service.ts:225-332` | Server-aggregated via `getCountFromServer` on `users`, filtered by marketing attribution / gender / date |
| `/admin/analytics` page (hosts the funnel above) | `src/app/admin/analytics/page.tsx` (877 lines as of PR #123) | Self-contained — its own **client-side** Firestore reads, filters/debounce/KPI-strip/table all inline, plus the push→action funnel section PR #123 appended. NOT the newer server-route pattern, NOT an embeddable component today. Already informally self-titled "Growth Hub" (`page.tsx:4-6`) — this title is retired/renamed once absorbed into `/admin/journey` (§3) |
| North-Star row (weekly active exercisers + workouts-per-active-user) | PR #123, via `src/app/api/admin/growth-metrics/route.ts` | One `workouts` date-range query, last 30 days, **no `userId` filter** (no composite index needed) |
| Hero chart (active-users-over-time + push-campaign markers) | Same route | `pushCampaignMarkers` sourced from `push_events`, grouped by category; discriminated union `type: 'push_campaign'` deliberately left extensible |
| Economy-by-authority (coins balance + 7-day earned) | Same route | Part of `growth-metrics` response |
| Push → action funnel (sent → delivered → opened → started workout) | PR #123, `src/app/api/admin/push-funnel-summary/route.ts` | Platform-only, reads `push_events` (`push_sent` / `post_push_outcome` docs), overall + per-category breakdown |
| CPO dashboard shell (`ExecutiveSummary`, `AuthorityPerformanceTable`, `ProductInsights`, maintenance, premium placeholder) | `src/app/admin/statistics/page.tsx` (203 lines as of PR #123) | `ExecutiveSummary` = totalUsers, weeklyGrowthPercent (**registration** growth, not activity growth), completionRate, platform-wide authority/client/admin counts. `AuthorityPerformanceTable` = userCount, activeParks, `engagementScore = totalWorkouts / ALL-registered-users` (all-time). `ProductInsights`/`HealthWakeUpChart`/`EquipmentGapAnalysis`/`SleepyNeighborhoodsList` via `/api/admin/insights-summary`. `PremiumConversion` is hardcoded `0` — no billing integration exists |
| Secure platform/vertical/authority/denied scoping | `src/lib/adminAnalyticsScope.ts` | The established secure pattern behind both PR #123 routes — replaced a real client-side-scoping bug fixed 23.09.2026 (`00-MASTER-PLAN.md §13.11 P1`). The pattern new routes should follow, not the client-side reads in `/admin/analytics` |
| Per-authority DAU / MAU / activity trend | `analytics.service.ts` (1224 lines) — `getDailyActiveUsers`, `getMonthlyActiveUsers`, `getActivityTrend` | Authority-manager-scoped, batched `userId in [...]` queries — the proven pattern PR #123 already generalized to platform-wide for the Hero chart. Also separately re-computed in `src/app/api/authority-manager/dashboard-summary/route.ts` and `AnalyticsDashboard.tsx` |
| DAU/MAU "stickiness" ratio | **Nowhere** | Zero matches for `dauMauRatio` repo-wide (grep-confirmed) |
| `users.createdAt` + per-user workout join (for D1/D7 computation, §3) | `src/app/api/admin/statistics-summary/route.ts` (`workoutsByUser`, `engagementScore`) | Already the established pattern for "read all real users + their workouts, compute in memory" at this codebase's current scale — the same shape Phase 0's new D1/D7 retention windows reuse, not a new query type |

### 2.2 Gap analysis — requested metrics vs. what exists

| Metric | Status | Source / Gap |
|---|---|---|
| WAE + workouts-per-active-user (North-Star) | **EXISTS** | PR #123, `src/app/api/admin/growth-metrics/route.ts` |
| DAU / WAU / MAU | **PARTIAL** | DAU/MAU computed separately per-authority (`analytics.service.ts`, `src/app/api/authority-manager/dashboard-summary/route.ts`, `AnalyticsDashboard.tsx`); no single platform-wide DAU+WAU+MAU view |
| DAU/MAU stickiness ratio | **MISSING** | Zero code anywhere computes this (grep-confirmed). Cheap to add — one division once platform-wide DAU+MAU exist (reuse `growth-metrics`'s `activeUsersTrend`: WAU = distinct users in last 7 of 30 days, MAU = distinct users across all 30) |
| Acquisition funnel stages (registered → onboarding mid/complete) | **EXISTS** | `funnel-analytics.service.ts:225-332`, stages 1–3 |
| Activation funnel stage (1st workout) | **EXISTS** | Same service, stage 4 |
| Retention funnel stage | **DECIDED — being fixed in Phase 0 (not deferred).** Today: `workoutCount ≥ 3`, all-time | Owner decision: replace with real rolling **Day-1** and **Day-7** retention windows, with the raw completed-workout count kept alongside as a separate stat (not the funnel's pass/fail criterion). See §3 Phase 0 and the distinction from the full cohort curve below |
| Revenue funnel stage | **OUT OF SCOPE** (owner decision) | Placeholder until a billing integration exists (§2.3) |
| Push → action funnel | **EXISTS** | PR #123, `src/app/api/admin/push-funnel-summary/route.ts` |
| Push measurement coverage | **PARTIAL** | Only 3 of 12 `sendPush()` call sites pass `measurement:` — `onPlannedActivityCreated.ts`, `stepGoalNudgeScheduler.ts`, `trainingReminderScheduler.ts`. Unmeasured: `chatMessageNotification`, `onContributionApproved`, `onKudosCreated`, `onGroupMemberJoin` (2 sites), `onLevelUp`, `onboardingDropoffDispatcher`, `retentionScheduler`, `sendPushFromQueue`. (Schema: `functions/src/services/push-events.service.ts`.) Confirmed current as of 2026-10-05 |
| Economy by authority | **EXISTS** | PR #123, same `growth-metrics` route |
| Municipality / B2G eligible-population data | **OPEN — owner supplying the numbers directly** | See §2.3 and §5 |
| **Full** cohort-by-join-month retention curve (many day-offsets, segmented by join month) | **MISSING, still Phase 3** | Distinct from the Phase-0 D1/D7 retention-stage fix above — this is the bigger, multi-cohort, multi-day-offset analysis, confirmed by prior audit, unchanged. Do not conflate the two: Phase 0 ships two fixed day-offsets platform-wide; Phase 3 ships the full curve segmented by cohort |
| Recommendation funnel (shown → played → completed) | **MISSING** | `recommendation_shown` doesn't exist as a concept anywhere; the generator files (`route-stops.generator.ts`, `full-strength.generator.ts`, `recovery-follow-up.generator.ts`, etc.) have **zero logging of any kind**, not even `console.log` |
| Session / screen events (`screen_view`, `session_start`, `session_end`) | **MISSING** | Confirmed zero matches repo-wide — not in `AnalyticsEventType`, no Firebase `logEvent`, no native analytics plugin. `app_open`/`app_close` **exist** in the type union but are confirmed to **never actually fire** anywhere in the codebase (zero call sites beyond the type definition) — not a working substitute today |
| `workout_detail_viewed` / `workout_play_pressed` | **MISSING** | Confirmed zero matches; natural instrumentation points already identified (§4) |
| Firebase/GA4 Analytics SDK | **WIRED BUT INERT** | `getAnalytics(app)` initialized at `src/lib/firebase.ts:508`, but zero actual `logEvent()` calls anywhere — not a usable data source today |
| Warm-non-converter segment | **MISSING** | No cohort/segment mechanism in the admin users list beyond `isTestData`/`isMockData`/`onboardingStatus` filters (`src/app/admin/users/all/page.tsx`, `users.service.ts`) |

### 2.3 Called-out flags and decisions

> **Streak-system doc — approved to merge, pending a fresh go on Phase 1 execution.** The hard rule this plan relies on — "never use the `streaks/{uid}` field for activity/retention metrics," which PR #123 already follows — comes from a prior finding that ~47% of `streaks/{uid}` docs don't match real `workouts` data. The *finding* is treated as real (an established owner constraint). Its write-up, `streak-system-and-behavioral-analytics-map.md`, sits on an **unmerged branch** (`worktree-streak-system-mapping`, commit `4288ea2c`) — confirmed via `git merge-base --is-ancestor`, not on `origin/main`. **Decision: merge it as a docs-only Phase 1 prerequisite.** Per standing rules this still waits for an explicit go to execute — it is not done by this plan document landing.

> **`population` field — owner supplying clean numbers directly; this flag explains why the existing fields aren't used as-is.** The municipality "eligible population" field **exists** (`population?: number`, `src/types/admin-types.ts:195`, documented as "populated manually or via external import") but isn't sanitized or defaulted when read (`authority.service.ts`) — likely sparse or inconsistent. Separately, `insights-summary/route.ts:239` already improvises a confound — `populationEstimate = authority.userCount` (app users, **not** municipal population) — which must not be conflated with the real `population` field or with the owner-supplied numbers once they arrive. A third candidate, `totalResidents` (`src/app/admin/dashboard/page.tsx:119,234,391,394`), comes from a different `residents` query. The B2G scorecard build does not need to wait for this — it proceeds against whatever denominator source the owner specifies when the numbers arrive (§5).

> **Revenue stage — out of scope (owner decision).** The funnel's revenue stage stays a placeholder and `PremiumConversion` stays hardcoded `0`; no billing integration exists, and none is planned by this document. Out of scope until a billing integration exists as a prerequisite of some future, separate plan.

> **Leftover widgets — decided OUT of the journey hub (owner decision).** `ProductInsights`, `HealthWakeUpChart`, `EquipmentGapAnalysis`, `SleepyNeighborhoodsList`, `MaintenanceOverview`, and `PremiumConversion` are ops/B2G content, not lifecycle metrics — they stay out of `/admin/journey`'s three tabs and are earmarked for a separate ops dashboard, not detailed further in this plan.

---

## 2.4 Display-context benchmarks (given by the owner — not re-derived here)

Industry reference bands, shown alongside the hub's own metrics as context (e.g. "your D7 is X%, industry top-quartile is 15-20%"), not targets this plan validates:

| Metric | Benchmark | Where it applies | Hebrew display label |
|---|---|---|---|
| D1 retention | 30-35% (top performers 45%) | New Phase-0 retention stage | שימור יום 1 |
| D7 retention | 15-20% (top performers 30%) | New Phase-0 retention stage | שימור יום 7 |
| D30 retention | 8-12% (top performers 25%) | Future Phase-3 cohort curve | שימור יום 30 |
| DAU/MAU ratio ("stickiness") | 20-30% solid; >50% = daily-habit product | Phase 0's new stickiness computation | דביקות (פעילים יומי/חודשי) |
| Session length | >5 min correlates with 35% D30 retention vs. 22% below | Phase 3 session-length analysis (needs `session_start`/`session_end`, Phase 2) | משך סשן |
| Workout completion rate | >70% correlates with +43% LTV | Candidate context for the Activation tab once completion-rate is surfaced there | שיעור השלמת אימון |
| Strong social engagement | correlates with +30% retention | No OUTRUN metric maps to this yet | — |
| Premium conversion within D30 | correlates with 72% annual retention | Not actionable — revenue stage out of scope (§2.3) | — |
| B2G/wellness-sponsor KPI shape | activation rate, verified-active rate, sustained engagement, cost-per-verified-engaged-member | Parallel Track B2G scorecard (§3) | — |

**Flag for the owner (standing, unresolved):** these numbers were supplied, not re-researched in this pass — worth a source/recency check before they're printed on a live dashboard as authoritative benchmarks. "Fitness app retention benchmarks" is a space where numbers vary by report vintage and app category (casual vs. serious-training apps skew differently). Not blocking Phase 0, but worth doing before the bands go live.

---

## 3. Phased plan

**Hub: `/admin/journey`**, three tabs:

- **Acquisition tab:** funnel stages 1–3 (registered → onboarding midpoint → onboarding completed), marketing-attribution filters, `weeklyGrowthPercent`, platform-wide user/authority counts.
- **Activation tab:** North-Star row, Hero chart, funnel stage 4 (1st workout), push → action funnel, DAU/WAU/MAU + stickiness (with §2.4 benchmark bands), recommendation funnel (Phase 2+).
- **Retention tab:** new D1/D7 rolling-window retention stages + completed-workout-count stat (replacing the old all-time-only stage), `AuthorityPerformanceTable`/`engagementScore`, economy-by-authority, full cohort retention curve (Phase 3), warm-non-converter segment (Phase 3).
- **Explicitly out:** `ProductInsights`/`HealthWakeUpChart`/`EquipmentGapAnalysis`/`SleepyNeighborhoodsList`/`MaintenanceOverview`/`PremiumConversion` — ops/B2G content, destined for a separate ops dashboard (§2.3).

### Phase 0 — Ship on existing data (consolidate, don't rebuild)

| Item | Effort | Dependency | Why sequenced here |
|---|---|---|---|
| Scaffold `/admin/journey` hub shell (routing/layout, 3 tabs) | M | None — name is decided | Everything else nests inside it |
| Migrate PR #123 panels (North-Star row, Hero chart, push funnel, economy table) into Activation/Retention tabs | S | Shell exists | Already-built, already-correct components/routes — just reposition. Lowest risk, fastest visible progress |
| Add DAU/WAU/MAU + stickiness ratio, shown against the §2.4 benchmark band | S | `growth-metrics` route (exists) | Cheap win — one division over data already being fetched |
| **Compute real rolling D1 + D7 retention windows, replacing the all-time `workoutCount ≥ 3` stage; keep completed-workout-count as a separate stat alongside** | S–M | `users.createdAt` + `workouts` join (same pattern as `statistics-summary/route.ts`'s existing `workoutsByUser`, §2.1) | Owner decision — do not ship the old all-time-only stage on its own. Cheap at current scale (same read-all-and-join-in-memory cost class this codebase already pays elsewhere on this exact page); no scheduled job needed yet. Distinct from, and does not block on, Phase 3's full multi-cohort curve |
| Refactor `/admin/analytics` funnel into an embeddable component, **full UI-extraction + migration onto the `adminAnalyticsScope` server-route pattern (recommended, not the lighter embed-only option)** | M–L | Shell exists | Recommended because it closes the one remaining instance of the old client-side-scoping pattern this codebase has otherwise already moved away from (§2.1) — flagged as the larger of two options; see §5 for the effort tradeoff this still needs an explicit go on |
| Funnel detailed/trapezoid view toggle | S | Funnel component refactor | Cheap UX add once the funnel is already being touched for extraction |
| Rename `/admin/analytics`'s internal "Growth Hub" title (`page.tsx:4-6`) since it's being absorbed into `/admin/journey` | S | Funnel refactor | Avoids two things informally called "Growth Hub" existing at once |
| Retire `/admin/statistics` and `/admin/analytics`, add redirects to `/admin/journey` | S | All of the above migrated and validated | Closes the loop — don't do this until the hub actually covers what the old screens showed |

### Phase 1 — Measurement foundation (keystone, urgent)

Events can't be backfilled, so this phase should start **in parallel with Phase 0**, not after it.

| Item | Effort | Dependency | Why sequenced here |
|---|---|---|---|
| Merge `streak-system-and-behavioral-analytics-map.md` from `worktree-streak-system-mapping` (`4288ea2c`) | S (<1h, docs-only) | Fresh go (approved in principle, §2.3) | Zero-risk prerequisite so the streak hard-rule this plan relies on is traceable in `main` |
| Event naming convention + taxonomy (§4) | S | None | Must exist before any instrumentation is written |
| Common context-field standard (§4) | S | Taxonomy | Every event needs the same envelope or cross-event analysis breaks |
| Design the 5 seed events' exact shapes + instrumentation points (§4) | M | Taxonomy + context fields | Turns the taxonomy into something Phase 2 can implement against |
| Define 3–5 happy-path journeys (§4) | S | Taxonomy | Gives Phase 2/3 a concrete target to validate instrumentation against |

*(Sampling/privacy design is no longer a Phase 1 item — decided below, §3 Phase 2.)*

### Phase 2 — Incremental instrumentation rollout

Sequenced by effort/value, cheapest high-value pair first.

| Item | Effort | Dependency | Why sequenced here |
|---|---|---|---|
| `recommendation_shown` + `workout_play_pressed` on the home-screen carousel | S–M | Phase 1 taxonomy/shapes | Single, precisely identified surface (`SuggestionCarousel.tsx:123-127` → `src/app/home/page.tsx:1367`; `SuggestionCard.tsx:64-72` → `src/app/home/page.tsx:1820`), existing `Suggestion` object already in scope at both points — the cheapest high-value pair by a wide margin |
| `workout_detail_viewed` | M | After the above lands | Its instrumentation point was **not** identified in research — needs a short scan before work starts; may turn out not to apply if no distinct detail screen exists |
| `screen_view` — **100% capture, no sampling** (owner decision) | M | Taxonomy/shapes only | Highest-volume candidate event; decided to ship uncapped given current scale — revisit sampling if volume grows |
| `session_start` / `session_end` | M | Taxonomy/shapes only; confirmed NOT covered by `app_open`/`app_close` (§2.2) | Net-new work, not an extension of a working mechanism — `app_open`/`app_close` never fire today |
| Expand push `measurement:` to the remaining 9 `sendPush()` call sites | S each (~M total) | None | Directly improves the statistical power of the already-shipped push funnel — historical open-rate ~9% (64 sent/6 opened) is a real but tiny sample |
| Instrument the second recommendation surface (`WorkoutLocationSuggestions.tsx:49`) | S | Home-screen pattern proven first | Extend the validated pattern once it's known to work |

### Phase 3 — Analysis unlocked

| Item | Effort | Dependency | Why sequenced here |
|---|---|---|---|
| Micro-funnel (shown → detail → play → start → complete) | M | Phase 2 events live + a few weeks of data | Needs real event volume to be meaningful |
| Activation "magic number" (PostHog method) | M–L | Activation + funnel + retention data | Needs stable Activation-tab metrics as input |
| Recommendation-fit analysis | M | `recommendation_shown` instrumented + data window | Depends entirely on the new event |
| Session length analysis | M | `session_start`/`session_end` live | Same reasoning |
| **Full** cohort-by-join-month retention curve (many day-offsets, segmented by cohort) | M–L | No new events needed — computation gap, not a data gap | Distinct from Phase 0's two fixed D1/D7 points (§2.2) — a bigger, multi-cohort aggregation, likely a scheduled job once volume grows past what a live join can handle |
| Warm-non-converter segment on users list | M | Funnel definitions stable | Net-new mechanism, reuses funnel stage definitions once settled in the hub |

### Parallel Track — B2G municipality scorecard

Runs independently of Phases 1–3 since it serves a different stakeholder and its blocker is data, not engineering.

| Item | Effort | Dependency | Why sequenced here |
|---|---|---|---|
| Scorecard build: activation rate, verified-active rate, sustained engagement (M6 vs. M1), cost-per-verified-engaged-resident | M | Activation-tab engagement metrics (reused) | Reuses metrics the hub already computes |
| Wire in owner-supplied per-city eligible-population numbers as the denominator | Owner input (data), not engineering effort | None | Build proceeds without waiting; the number just needs to land before the cost-per-resident figure is trustworthy. §2.3 flags why the existing `population`/`userCount`/`totalResidents` fields aren't used as a substitute |

---

## 4. Event taxonomy + happy-paths (Phase 1 detail)

### 4.1 Naming convention

The existing 16-value `AnalyticsEventType` union (`src/features/analytics/AnalyticsService.ts:14-30`) establishes a pattern: lowercase `snake_case`, generally `{object}_{state-or-action}` (`workout_start`, `onboarding_completed`, `profile_created`, `workout_session_started`). New events extend this union rather than create a parallel one.

- `{object}_{past-tense-state}` for state transitions — e.g. `recommendation_shown`, `workout_detail_viewed`.
- `{object}_{action}_pressed` for discrete UI interactions (new suffix, needed to distinguish "user tapped something" from "something happened to the user's state") — e.g. `workout_play_pressed`.
- `screen_view`, `session_start`, `session_end` as flat, GA4-conventional names.

These are internal/code identifiers only — see §4.2 for the Hebrew display-label mapping.

### 4.2 Context fields + UI-language mapping

Context fields (new standard being proposed — verify against `AnalyticsService.ts`'s actual write path before implementation):

| Field | Purpose |
|---|---|
| `eventType` | The event name (extends the existing union) |
| `userId` | From auth; events written under the existing client-writable, generic `isAuthenticated()` create rule |
| `timestamp` | Prefer server-set (`serverTimestamp()`) over client clock to avoid skew in funnel ordering |
| `platform` | `ios` / `android` / `web-admin` |
| `appVersion` | For filtering out bad data after bugfixes |
| `sessionId` | Ties an event to a session once `session_start`/`session_end` exist |
| `screen` / `route` | Current screen name, for screen-level funnels |
| `surface` | Which UI surface triggered the event (`home_carousel` vs. `map_suggestions` — two distinct recommendation surfaces, §4.3) |

**Hebrew display-label mapping** (code/keys stay English; this is for the admin-panel UI only):

| English concept | Hebrew UI label |
|---|---|
| D1 retention | שימור יום 1 |
| D7 retention | שימור יום 7 |
| Stickiness (DAU/MAU ratio) | דביקות |
| DAU | פעילים יומי |
| WAU | פעילים שבועי |
| MAU | פעילים חודשי |
| Acquisition (tab) | רכישה |
| Activation (tab) | הפעלה |
| Retention (tab) | שימור |
| Recommendation shown | המלצה הוצגה |
| Completed workout count | אימונים שהושלמו |

### 4.3 The 5 seed events

**1. `recommendation_shown`**
- Shape: `{ eventType: 'recommendation_shown', workout_id, level, type, equipment, surface, ...context }`
- Instrumentation point: `SuggestionCarousel.tsx:123-127`'s `onSettle` callback — fires ~300ms after a card becomes centered, **not per-render**, the correct "shown" semantics. Maps to `handlePreWorkoutSettle` at `src/app/home/page.tsx:1367`, which already has the full `Suggestion` object (id/type/generatorId/difficulty/methodsUsed — schema at `src/features/workout-engine/core/types/suggestion.types.ts:14-60`) in scope. Rendered over `readyPreWorkoutSuggestions` at `src/app/home/page.tsx:3046-3069`.
- A second surface — `WorkoutLocationSuggestions.tsx:49` (map/park suggestions) — has no "shown" hook at all today; sequenced for Phase 2 after the home-carousel surface is proven.

**2. `workout_play_pressed`**
- Shape: `{ eventType: 'workout_play_pressed', workout_id, generator_id, type, level, surface, ms_since_shown, ...context }`
- Instrumentation point: `SuggestionCard.tsx:64-72`'s `onClick={onStart}` → `handlePreWorkoutCardTap` at `src/app/home/page.tsx:1820`.

**3. `workout_detail_viewed`**
- Shape (proposed): `{ eventType: 'workout_detail_viewed', workout_id, surface, ...context }`
- Instrumentation point: **not identified in research.** Needs a short codebase scan before Phase 2 implementation starts — may not apply if the flow goes straight from card to play.

**4. `screen_view`** — 100% capture, no sampling (§3 Phase 2)
- Shape (proposed): `{ eventType: 'screen_view', screen, previous_screen, ...context }`
- Instrumentation point: not identified in research — needs a top-level navigation/router listener, designed in Phase 2.

**5. `session_start` / `session_end`**
- Shape (proposed): `{ eventType: 'session_start' | 'session_end', session_id, duration_ms (on end), screens_visited (on end), ...context }`
- Instrumentation point: not identified — likely a Capacitor `App` plugin foreground/background listener.
- Confirmed: `app_open`/`app_close` exist in the type union but never fire anywhere (zero call sites beyond the type definition) — this is net-new work, not an extension.

### 4.4 Volume

`screen_view` is the clear highest-volume candidate (fires on every navigation). **Decided: 100% capture, no sampling, at current scale** — revisit if/when volume grows enough to matter for cost or performance. No sampling infrastructure needs building in Phase 1 as a result.

### 4.5 Happy-path journeys

1. **First Workout** (Acquisition → Activation): register → `onboarding_start` → `onboarding_step_complete` (×N) → `onboarding_completed` → session start → `recommendation_shown` → `workout_play_pressed` → `workout_session_started` → `workout_start` → `workout_complete`. Today the funnel-stage counts are visible (`funnel-analytics.service.ts:225-332`) but not *why* a user does or doesn't activate.
2. **Push Re-engagement**: `push_sent` → `push_opened` → `landing_screen` → `recommendation_shown` → `workout_play_pressed` → `workout_start` → `workout_complete`. Ties the push-events schema (`functions/src/services/push-events.service.ts`) and push-funnel route to the new recommendation events.
3. **Habit Formation**: `workout_complete` (day 0) → repeated sessions across days 1–7 → `workout_complete` (day 7). Maps directly to the new Phase-0 D1/D7 retention stages.
4. **Warm Non-Converter**: `onboarding_completed` → session activity with no `recommendation_shown`/`workout_play_pressed` interaction → no `workout_start` within N days. The exact segment the Phase 3 warm-non-converter mechanism targets.
5. **Recommendation Rejected**: `recommendation_shown` → no `workout_play_pressed` within the same session → session end. Feeds the Phase 3 recommendation-fit analysis.

---

## 5. Open questions — the only two left (everything else above is decided)

1. **B2G population denominator timing.** The owner is supplying per-city eligible-population numbers directly. Open item: when do these arrive, and in what shape (a one-time import, or a maintained field the owner keeps updating)? The scorecard build (§3) doesn't block on this, but the cost-per-resident figure isn't trustworthy until the numbers land.
2. **Funnel-refactor effort commitment.** This plan recommends the fuller UI-extraction + server-route migration (closes the last instance of the old client-side-scoping pattern) over a lighter embed-only option, because it's the architecturally cleaner outcome given everything else has already moved to `adminAnalyticsScope`. That recommendation adds real effort (M–L vs. a lighter M) to Phase 0. Needs an explicit go before Phase 0 execution starts, since it changes the Phase 0 timeline.

Standing, not blocking: the benchmark source/recency check (§2.4) should happen before the bands go live on a real dashboard, but doesn't block Phase 0 development.

---

## 6. Recommended first 2 weeks

*(Sequence below assumes a fresh go to begin Phase 0/1 execution — not implied by this document landing, per standing rules.)*

**Week 1**
1. Merge `streak-system-and-behavioral-analytics-map.md` from `worktree-streak-system-mapping` (`4288ea2c`) — docs-only, <1 hour.
2. Scaffold the `/admin/journey` hub shell (routing/layout) with the 3 tabs.
3. Migrate PR #123's existing panels (North-Star row, Hero chart, push funnel, economy table) into the Activation/Retention tabs.
4. Add the DAU/WAU/MAU + stickiness computation, with the §2.4 benchmark band shown alongside.
5. Build the D1/D7 rolling retention-window computation (replacing the all-time stage), reusing the existing users+workouts join pattern already used elsewhere in this codebase — low enough cost to ship this week, not deferred.

**Week 2**
6. Refactor the `/admin/analytics` funnel into an embeddable component (full extraction + `adminAnalyticsScope` migration, per the §5 recommendation pending its go), migrate into the Acquisition/Activation tabs, rename its old "Growth Hub" internal title.
7. In parallel: finalize the Phase 1 taxonomy — naming convention, context-field standard, Hebrew label mapping, and exact shapes for all 5 seed events.
8. Run the short codebase scan needed to pin down instrumentation points for `workout_detail_viewed` and `screen_view`/`session_start`/`session_end`.
9. Ship the first real instrumentation: `recommendation_shown` + `workout_play_pressed` on the home-screen carousel — the cheapest high-value pair, and the one with a fully identified surface.
10. Only once the hub fully covers the old screens' content: retire `/admin/statistics` and `/admin/analytics` with redirects. Last step, not a week-2 deadline.
