# Map suggestion-pipeline thrash — 11.08.2026

> Found via David's own question after the GPS idle-poll fix didn't resolve his reported
> freeze: "why does this run in the background if I didn't press build workout?" That
> question led directly to this — a second, independent root cause, unrelated to GPS
> accuracy. See also `idle-map-heat-gps-investigation.md` (the GPS fix, separate bug).

## What was actually happening

Live console capture (native Safari Web Inspector, connected via USB — the automated
`ios-webkit-debug-proxy` / `remotedebug-ios-webkit-adapter` bridge could not get event
streams working against iOS 18.6, confirmed dead end; native Safari's own Develop menu
worked immediately, no setup needed beyond `webContentsDebuggingEnabled: true` which was
already in `capacitor.config.ts`) showed **5,350+ console.log lines** and
`[useSuggestionEngineStore] runSuggestionEngine took 8966ms` on a single map load.

Traced to two compounding causes:

**Cause 1 — dedup key defeated by GPS jitter.** `DiscoverLayer.tsx`'s rec-engine effect
(`useEffect(..., [userLocation, slotActivity, hasEquippedPark, hasStrengthProgram, profile])`)
calls `useSuggestionEngineStore.getState().setContext(...)` on every `userLocation` change —
i.e. every accepted GPS fix. `buildContextKey` compared **raw, unrounded** lat/lng, and GPS
essentially never repeats the exact same value twice (jitter of a few metres even standing
still), so the store's "already have this exact context" guard was defeated almost every
tick — re-running the full pipeline continuously, worse while navigating (GPS fires more
often then). This is why it ran "in the background" with zero explicit user action, and why
navigation made it dramatically worse than idle browsing.

**Cause 2 — full real generation used just to rank cards, with no early exit for unassessed
users.** `runSuggestionEngine` runs 5 real `Generator`s in parallel
(`route/route-stops/full-park-workout/full-strength/anchor-loop`, `generator-registry.ts`) —
**not** a cheap heuristic ranking pass. `fullStrengthGenerator.generate()` calls
`generateHomeWorkoutTrio` directly — the exact same full builder used when a user taps "build
workout." For David's test profile (no assessed strength domain), `_buildSharedPipeline`
already detects this (`activeProgramFilters.length === 0` → `needsAssessmentDomains` set,
`console.warn('[home-workout] ⑨ compose reached with NO assessed domain...')`) but used to
keep running anyway — including `createPoolFactory().build()`, which calls
`getEffectiveLevelForExercise` (`shadow-level.utils.ts:453`) once per exercise in the DB
(372), each one resolving `UNASSESSED_DOMAIN_LEVEL` (`-Infinity`) and logging it. `
generateHomeWorkoutTrio` (the caller) already discards this entire result the moment it sees
`pipeline.needsAssessmentDomains` — so all of that scoring was proven, deterministic waste,
not just occasionally.

## Fix (SHIPPED and PUSHED to `main`, 11.08.2026, as `46c71cce`; local commit `df961656` on `work/free-run-build`)

1. `useSuggestionEngineStore.ts` `buildContextKey` — round lat/lng to 3 decimals (~110m) via
   new `roundCoord()`/`CONTEXT_KEY_COORD_PRECISION`. The `context` object actually passed to
   the 5 generators is untouched (still full-precision) — only the re-rank CADENCE is
   throttled, not ranking accuracy on a given run.
2. `home-workout.service.ts` `_buildSharedPipeline` — when `needsAssessmentDomains` is set,
   skip `createPoolFactory().build()` entirely (empty-safe `scoredExercises`/`filterResult`
   defaults instead). Everything downstream (protocol/goal Firestore lookups, budget math,
   metadata) is unchanged; the normal assessed-user path is byte-identical to before (same
   code, just moved into an `else` branch).

10-agent adversarial review (3 reviewers × independent verification per finding): **0
blocking issues**. One real low-impact note: the admin `workout-simulator` debug page's
"Exercises Considered/Excluded" panel now shows placeholder numbers (0 / full DB count) for
the needs-assessment case instead of real filter-stage numbers — admin-only tool, not
user-facing, not fixed (flagged as optional follow-up, David didn't ask for it). Other notes:
no automated test exercises either new branch end-to-end (tsc + manual trace only); the
110m grid can still flap at exact cell boundaries during continuous movement (inherent to
any static-grid dedup key, already called out as "revisit if this proves wrong" in the fix's
own comment).

## Explicitly NOT done (real, separate follow-up work David flagged, not started)

David's own architectural critique, validated against the code, still stands as future work:
- **Ranking uses full real generation instead of a cheap estimate.** All 5 generators do
  real work (route generation makes real Mapbox API calls with 1.5s rate-limit waits;
  full-strength runs the complete trio builder) just to decide display order. A lightweight
  scoring/estimate approach — deferring full generation to an explicit slot tap — would be
  the architecturally correct fix, but touches all 5 generators, not a quick patch.
- **No reuse between Home's already-computed trio and the map's full-strength suggestion.**
  Unverified whether Home caches its daily-workout result anywhere the map could read instead
  of recomputing independently — not investigated yet.
- **`fullStrengthGenerator` isn't scoped to nearby park equipment** the way
  `fullParkWorkoutGenerator` already is — for an unassessed user it's now cheap (returns
  fast via the needs-assessment skip), but for an assessed user it still scores the whole DB
  generically rather than just what's relevant to what's actually nearby.
