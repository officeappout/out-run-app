# 46 — Station-Approach Moment (item 4)

**Date:** 25.09.2026
**Branch:** `feat/station-approach-moment`
**Status:** implemented (station-side logic only — see "Not done" below). Not merged — David merges.

## The bug

`HybridStationLayer.tsx`'s aerobic-leg CTA ("📍 הגעתי לתחנה") was visible for the ENTIRE aerobic leg, with a code comment explicitly noting this was "convenient for testing." A button that's always there carries no information — David's framing.

## Decisions locked before building (see prior mapping report, this same chat)

1. **Distance:** real GPS distance to the station's actual coordinates, not cumulative route-km. Route-km accumulates GPS noise over a session (the gap grows with distance), and — separately — a user who's off-route (normal, unflagged per the item-1 deviation-mechanism removal) keeps accumulating route-km without actually approaching the station.
2. **Speed:** a fixed per-activity-type constant derived from ~40 seconds, NOT the runner's live pace — walking ≈ 1.4 m/s → 56m, running ≈ 3 m/s → 120m. Avoids bridging `useRunningPlayer`'s pace (a separate store from the hybrid controller's distance/duration) for a "get ready" cue where the difference is imperceptible.
3. **`tick()` wiring:** explicitly NOT bundled into this change — a separate item, David decides on it separately.
4. **`shouldArriveAtStation`:** left untouched. A new, separate pure function alongside it (different shape — arrival test vs. approach test).

## What was built

- **`compose-hybrid-session.service.ts`** — `HybridPlannedSegment` gets new optional `lat`/`lng` fields, populated from `HybridStopCandidate.lat/lng` (already resolved at stop-selection time — confirmed a field transfer, not a new computation, per the investigation).
- **`hybrid-orchestrator.ts`** — new pure function `isApproachingStation(userLat, userLng, stationLat, stationLng, aerobicType)`, using the existing `haversineMeters` (geoUtils.ts) against the `APPROACH_THRESHOLD_METERS` constants above. `shouldArriveAtStation` untouched.
- **`useHybridRun.ts`** — new `upcomingStation: { lat, lng, aerobicType } | null` field on the store, computed once per phase transition (same pattern as the existing `isFinalLeg` helper) — NOT a continuous subscription, since `tick()` isn't wired.
- **`HybridStationLayer.tsx`**:
  - CTA visibility now gated to `isFinalLeg || approaching` (was: unconditional for the whole leg). `approaching` is computed at render time from `upcomingStation` (useHybridRun) + `lastPosition` (useRunningPlayer, the same live-GPS field `checkRouteDeviation` already uses) via `isApproachingStation`.
  - Haptic (`hapticMedium`, existing wrapper — `src/lib/haptics.ts`) fires once on the rising edge into the approach window (a ref-tracked previous value prevents repeat-firing every render).
  - Button enlarged for the approach state (`px-8 py-5 min-h-[64px] text-[17px]`, thumb-height target). The final-leg finish CTA keeps its previous size — out of scope, not a station-approach moment.
  - New corner "✕" skip button, visible during approach (not only once at the station) — same de-emphasized styling as the existing at-station "דלג" button.

### `skipStation()` during approach — a deliberate design choice, not a literal reducer-gate loosening

The corner-X can now fire while `phase === 'aerobic'` (never arrived). Rather than loosening `hybrid-orchestrator.ts`'s `STATION_SKIPPED` case's `phase !== 'station'` guard directly, `useHybridRun.ts`'s `skipStation()` composes the two EXISTING, already-tested primitives: `controllerRef.arrive(...)` (closes out the current leg's actual distance/duration as of the skip moment — correct, since the run clock genuinely was running up to then) immediately followed by `controllerRef.skipStation(...)` (marks the just-entered station skipped with ~0 duration).

Why not loosen the reducer's phase gate directly: doing so correctly would require re-deriving "how far into the run has progressed" for the skipped station's leg without double-counting — and that needs `tick()`'s continuous `AEROBIC_TICK` feed, which is explicitly not part of this change. The composition above sidesteps that using events that already exist, is proven via real execution (`scripts/_verify-approach-skip-composition.ts`), and is byte-identical to the existing at-station skip when phase is already `'station'`.

**Flagging this explicitly for David** — this is a real engineering-judgment deviation from "loosen the condition in the reducer" as literally stated, and worth a second look before merge.

## Not done — needs David's go-ahead (map-file boundary)

The map-pin blink/pulse (requirement 3) touches `AppMap.tsx`'s station-marker rendering (both the photo and no-photo variants) — a real map file, inside the standing ownership boundary. Not built. See the chat message asking for explicit confirmation before touching it.

`tick()`/`AEROBIC_TICK` wiring — separate item per instruction, not bundled here.

## Regression — real execution, not just types

- `tsc --noEmit`: 445/445, zero new errors.
- `vitest run`: 232/234 files, 2237/2264 tests — same 2 pre-existing flaky-emulator files as every prior report this wave (`tests/firestore-rules.test.ts`, `logMultiCategoryWorkout.smoke.test.ts`), unrelated to this diff. All 132 hybrid-suite tests pass unchanged, including the orchestrator tests and both skip-station verification scripts already in the repo.
- `npx tsx scripts/_verify-station-approach-distance.ts` — new script, proves the 56m/120m thresholds trigger/release exactly at the boundary (using `destinationPoint`, the same geo-math helper already used elsewhere in the codebase) and that the two constants are independent (100m reads approaching for running, not for walking).
- `npx tsx scripts/_verify-approach-skip-composition.ts` — new script, proves the approach-skip composition against a real 3-segment sandwich plan: the in-progress leg's actual is recorded correctly as of the skip moment, the station is recorded `skipped:true` with 0 sets/~0 duration, cursor advances to the correct next segment, and the run finishes cleanly afterward.
