# OUTRUN Event Taxonomy — Journey Hub Phase 1

**Status:** Taxonomy defined, first instrumentation pair shipped (this PR)
**Builds on:** `docs/analytics/growth-analytics-plan.md` §4 (Phase 1 keystone)

This is the detailed, implementation-level version of the plan doc's §4 — same decisions, but with the real field shapes confirmed against the actual `Suggestion` type and the actual `logEvent()`/`Analytics` calling convention, not the plan's illustrative sketch. Where this doc and the plan doc's §4 differ, **this one is the corrected, grounded version** (see §2 below for exactly what changed and why).

---

## 1. Naming convention

Extends the existing 16-value `AnalyticsEventType` union (`src/features/analytics/AnalyticsService.ts:14-37`) — same file, same union, not a parallel system. Confirmed pattern already in use:

- `{object}_{past-tense-state}` for state transitions — matches existing `onboarding_completed`, `profile_created`. New: `recommendation_shown`, `workout_detail_viewed`.
- `{object}_{action}_pressed` for discrete UI interactions — new suffix, needed to distinguish "user tapped something" from "something happened to the user's state". New: `workout_play_pressed`.
- `screen_view`, `session_start`, `session_end` — flat, GA4-conventional, describe navigation/lifecycle rather than a product object.

All 5 names are now declared in the `AnalyticsEventType` union. Only 2 are wired (§3) — the other 3 are type-only declarations, same status `app_open`/`app_close` already had before this change (present in the type, not necessarily called anywhere).

## 2. Context fields — what's already automatic vs. caller-supplied

**Correction from the plan doc's §4.2**: the plan proposed designing a new "context fields" standard from scratch. On inspection, `logEvent()` (`AnalyticsService.ts:237-298`) **already auto-injects** `userId`, `eventName`, `timestamp` (server-side `new Date()`, not client-adjustable), and `sessionId` (from `sessionStorage`, one id per browser session) on every call — this is not new infrastructure to build, it's already there and every event already gets it for free.

What's still **caller-supplied**, because `logEvent()` has no way to infer it:

| Field | Status |
|---|---|
| `platform` (ios/android/web) | Not implemented — no existing helper in this codebase was found to detect it reliably in the time available. Deferred — not needed for the 2 events wired in this PR (both are Capacitor-app-only surfaces, so platform is implicitly "app" until this is built) |
| `appVersion` | Same — deferred, not blocking |
| `screen` / `surface` | **Caller-supplied, used in this PR.** `RecommendationShownEvent`/`WorkoutPlayPressedEvent` both take `surface: string` as a required field. Reuses the **already-existing** `UserContextSurface` vocabulary (`'map' \| 'home' \| 'park_page' \| 'post_workout' \| 'nudge'`, `src/features/workout-engine/core/types/user-context.types.ts:20`) rather than inventing a new one — both wired call sites already pass `surface: 'home'` to `buildHomeUserContext` a few lines away, so the event uses the exact same literal, not a second vocabulary for the same concept |

**Scope note**: a full `platform`/`appVersion` standard is real, useful work, just not done in this PR — flagged here rather than silently skipped, per the "flag, don't fake" rule the whole journey-hub plan follows. Add it when the next event (likely `screen_view`, the one event that most needs device/version segmentation) gets built.

## 3. The 2 wired seed events (this PR)

### `recommendation_shown`

- **Type**: `RecommendationShownEvent` (`AnalyticsService.ts`)
- **Correction from the plan doc**: the plan's illustrative shape was `{workout_id, level, type, equipment}`. The real `Suggestion` type (`src/features/workout-engine/core/types/suggestion.types.ts:44-85`) has no `level` or `equipment` field — `equipment` would require reaching into the optional, sometimes-absent `preview` field, not reliable at the shown moment. Real shape uses what's actually there: `id` → `workout_id`, `type` → `suggestion_type` (`daily_workout | post_workout | program_recommendation | micro_nudge`), `generatorId` → `generator_id`, `difficulty` (`1|2|3`) as the real available proxy for "level".
- **Call site**: `src/app/home/page.tsx`, `handlePreWorkoutSettle` (confirmed live at the time of this change — `useCallback` wrapping `setActivePreWorkoutSuggestion`). Fires via `Analytics.logRecommendationShown(...)`, called unconditionally at the top of the function, matching where `setActivePreWorkoutSuggestion` already sits — the card is visually shown at that point regardless of whether `profile` has loaded yet (the subsequent `if (!profile) return` only gates the ranking-refresh side effect, not the display itself).
- **"Shown" semantics**: this handler is `SuggestionCarousel`'s `onSettle` callback, which the carousel itself fires ~300ms after a card becomes the centered/active one (`SuggestionCarousel.tsx`'s own `SETTLE_DELAY_MS`) — not on every render/scroll frame. One event per real "this card was presented to the user" moment, not one per re-render.
- **Second surface, not yet instrumented**: `WorkoutLocationSuggestions.tsx` (map/park suggestions) has no settle/shown hook at all — out of scope for this PR, sequenced for later once the home-carousel pattern is validated (plan doc §3 Phase 2).

### `workout_play_pressed`

- **Type**: `WorkoutPlayPressedEvent`
- **Shape**: `{workout_id, generator_id, surface}` — the plan doc's `ms_since_shown` field is **deliberately cut** from this PR's shape: computing it would need tracking a "shown at" timestamp alongside `activePreWorkoutSuggestion` state, which is extra state-threading beyond what "ship the first instrumentation pair" calls for. Can be added later without a breaking change (additive field) once it's actually needed for an analysis.
- **Call site**: `src/app/home/page.tsx`, `handlePreWorkoutCardTap` — fires right after `setStartingPreWorkoutSuggestionId`, inside the function's existing `if (!profile) return` guard (a tap that can't proceed because profile isn't loaded isn't a meaningful "pressed play" moment in the sense this event is meant to capture).

## 4. The 3 declared-but-unwired events (taxonomy only, this PR)

Per the plan doc's own phasing — these are declared in the type union now so the taxonomy is complete and future work extends rather than re-designs it, but none are instrumented yet:

- **`workout_detail_viewed`** — `{workout_id, surface, ...}` proposed. No instrumentation point identified; needs a short scan to confirm whether OUTRUN's flow has a distinct detail/preview screen at all between "shown" and "played", or goes straight from card to play (in which case this event may not apply).
- **`screen_view`** — `{screen, previous_screen, ...}` proposed. 100% capture, no sampling (owner decision, plan doc §3/§4.4). Needs a top-level navigation/router listener — not designed in this PR.
- **`session_start` / `session_end`** — `{session_id, duration_ms, screens_visited, ...}` proposed. Confirmed `app_open`/`app_close` (already in the type union) never fire anywhere in the codebase today — this is net-new work, not an extension of a working mechanism. Likely a Capacitor `App` plugin foreground/background listener; not designed in this PR.

## 5. Happy-path journeys

Unchanged from the plan doc's §4.5 — reproduced here for one-stop reference:

1. **First Workout**: register → `onboarding_start` → `onboarding_step_complete` (×N) → `onboarding_completed` → `recommendation_shown` → `workout_play_pressed` → `workout_session_started` → `workout_start` → `workout_complete`.
2. **Push Re-engagement**: `push_sent` → `push_opened` → `landing_screen` → `recommendation_shown` → `workout_play_pressed` → `workout_start` → `workout_complete`.
3. **Habit Formation**: `workout_complete` (day 0) → repeated activity across days 1–7 → `workout_complete` (day 7) — maps to the journey hub's D1/D7 retention stages (growth-analytics-plan.md §3 Phase 0).
4. **Warm Non-Converter**: `onboarding_completed` → activity with no `recommendation_shown`/`workout_play_pressed` → no `workout_start` within N days.
5. **Recommendation Rejected**: `recommendation_shown` → no `workout_play_pressed` in the same session → session end.

With `recommendation_shown`/`workout_play_pressed` now live, journeys 1, 2, and 5 are partially instrumentable today — journey 4 still needs `session_start`/`session_end` to define "N days of activity with no interaction" precisely, and journey 3 doesn't depend on these events at all (it's a `workouts`-collection computation, already covered by the journey hub's Phase 0 D1/D7 work).
