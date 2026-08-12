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

## Cause 3 — ranking used full real generation instead of a cheap estimate (SHIPPED + PUSHED,
`bdf84fdd` on `main`; local commit `1fc0b309` on `work/free-run-build`, 11.08.2026)

David's own architectural critique after the fixes above still left ~9s per rank (evidence:
live console showed 2 real sequential Mapbox route-generation sequences, each with several
1.5s artificial rate-limit waits, dominating the remaining wall-clock time). Traced by reading
the code, not assumed: the ranked `Suggestion[]`'s ONLY consumer
(`apply-ranked-slot-order.ts`) reads just `generatorId` off the winner — title/structure/
methodsUsed are always discarded, cards' visible content always comes from `resolveSlots()`
regardless of ranking. The score itself (`rank-suggestions.ts`) only reads difficulty/
goalTags/stepContribution/requiresLocation. So all 5 generators building for real (real
Mapbox calls, real `generateHomeWorkoutTrio` exercise scoring) bought nothing.

Before implementing, David raised a sharp, correct concern: does the current "build all 5"
double as the prefetch that makes tap-to-open instant? Traced directly: **no** — a separate,
pre-existing system (`DiscoverLayer.tsx`'s `handleSettleSlot` + module-level `hybridPlanCache`)
already composes the real plan for the ONE currently-focused card on carousel settle, and
`handleSelectSlot` (tap) reuses that cache — completely disconnected from the 5 ranking
generators' output (different file, different cache, never exported/shared). This was the
green light to proceed.

**Fix:** new flag `IS_CHEAP_SUGGESTION_RANKING_ENABLED` (default true) — each of the 5
generators returns an instant, near-zero-I/O estimate instead of a real compose. Two still do
one cheap check each to preserve a real self-exclusion: full-park-workout checks
`nearestEquippedPark()` against the already-cached park list (no Mapbox); full-strength checks
whether the user has assessed ANY domain/track (cheap profile read, no exercise scoring).
Flag-off is byte-identical to before in all 5 files.

8-agent adversarial review, one lens specifically re-verifying the tap-to-open decoupling
claim: **0 findings** on that lens — claim holds. 2 related "note" findings (both addressed via
doc comments, not code changes): (1) all 5 cheap paths use a static `difficulty:2`, which would
flatten `rank-suggestions.ts`'s `recoveryMatch`/`preferenceMatch` factors once
`recoveryState`/`preferences` ever get wired to real data on this surface — currently a no-op
either way since `build-map-user-context.ts` already hardcodes both to neutral; flagged inline
in `rank-suggestions.ts` for whoever wires them. (2) Cheap ranking's near-instant resolution
can make the carousel's settle-effect re-fire sooner after mount than before — harmless, fully
deduped by the existing cache, cost unaffected, just noted for accuracy in the flag comment.

**Still not done:**
- **No reuse between Home's already-computed trio and the map's full-strength suggestion.**
  Unverified whether Home caches its daily-workout result anywhere the map could read instead
  of recomputing independently — not investigated yet.
- **`fullStrengthGenerator`'s real (flag-off) path isn't scoped to nearby park equipment** the
  way `fullParkWorkoutGenerator` already is — not relevant while the cheap flag is on (it now
  only checks assessed-domain existence), but still true of the real path if the flag is ever
  flipped off.

**NOT device-tested yet** — needs verification per the checklist below, especially the explicit
tap-to-open-still-instant check (not just that ranking is faster), matching what David asked
for before approving.
