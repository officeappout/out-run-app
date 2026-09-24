# 42 — Loop-Route Start Rotation (item 6 of the live-moment wave)

**Date:** 24.09.2026
**Branch:** `fix/loop-route-start-rotation`
**Scope:** loop routes only. Non-loop (linear, out-and-back) routes are explicitly untouched — investigation showed they already behave correctly starting mid-route.
**Status:** implemented, verified via real execution against production data. Not merged — David merges.

## Background

David's original ask: apply the hybrid path's `snapToVertex`/rotation pattern (`plan-from-point.ts`) to the general "start an existing curated route" flow, so starting mid-route uses the nearest point to the user, not the route's stored `path[0]`.

Investigation before implementation (per standing process) found the actual problem was narrower than the initial framing:

- `crossTrackDistanceMeters` (the deviation detector, `geoUtils.ts:149`) measures distance to the **nearest point on the entire path**, not `path[0]` specifically — a non-loop route already handles a mid-route start correctly today.
- `computeRouteTurns`/`TurnCarousel` already track the user's **live** position dynamically — no assumption that the user starts at index 0.
- The one **real, user-visible gap**: a loop route's raw array has no wrap-around signal. Starting at vertex 40 of an 88-vertex loop and walking to vertex 87 (the array's end) has no built-in continuation back to vertex 0 to close the loop at the entry point — turn-by-turn instructions for the second half are silently lost.

David confirmed: scope to loop rotation only. Non-loop routes are not touched — the raw path already works correctly, and (per his explicit decision) a regular route must never silently get shorter than what the user picked, which clip-based rotation would risk for a non-loop route.

## What changed

`useWorkoutSession.ts`'s `_doStartActiveWorkout` (the single canonical entry point for starting any curated-route session — confirmed via grep, no other call site seeds `activeRoutePath`/`guidedRouteTurns` for this flow):

- When the focused route is a real loop (`classifyRouteShape(path) === 'loop'`, **not** `plan-from-point.ts`'s own looser `detectTopology()` — see below) **and** a live user position is available, the route's path is rotated via `planFromPoint` (the same, unmodified, already-proven hybrid primitive) to start at the user's nearest vertex, cyclically wrapping around.
- The rotated path is computed **once** and reused for both `guidedRouteTurns` (turn-by-turn) and `setActiveRoutePath` (the deviation reference) — one stored path per session, never two parallel versions of "the route."
- Any non-loop route, or a loop route with no user position yet available, uses the raw path completely unchanged — byte-identical to today.

**`classifyRouteShape` vs. `detectTopology`, and why it matters:** `plan-from-point.ts`'s own `detectTopology()` only checks whether the path's endpoints are within 50m of each other — a **true out-and-back route** (walks out, retraces the exact same vertices in reverse) also has its endpoints meet, so `detectTopology()` would misclassify it as a cyclic loop and rotate it — nonsensical for a path that doubles back on itself. `classifyRouteShape()` (`geoUtils.ts:330`) checks the precise mirror-symmetry test first, correctly separating `'out_and_back'` from `'loop'`. This PR uses `classifyRouteShape` for exactly this reason — confirmed via a real production count (below) that this distinction, while it affects 0 routes today, is a real and not merely theoretical risk.

## David's two questions, answered

**Which cities have "sloppy loop" routes (endpoints 50-150m apart, classified `undefined`/linear by both functions)?** 5 total: 2 in Haifa, **3 in Sderot**. Given Sderot is the live pilot city, these 3 routes currently do **not** get the rotation fix — someone starting mid-route on one of them still loses second-half turn-by-turn instructions, exactly like every route did before this PR. Flagged per your instruction; not fixed here (the 50m threshold is explicitly not being touched, per your explicit instruction — widening it risks misclassifying a genuine linear route as a loop and wrongly rotating it, which is a worse failure mode).

**What happens today when a user completes a loop and returns to their start?** Nothing — confirmed via code read, no automatic trigger exists. `finishWorkout` is manual only (traced all 8+ real call sites — every one is a button/action handler, zero automatic triggers). The progress strip's percentage (`GuidedRouteProgressStrip.tsx`) clamps its display at 100% but doesn't reset or signal anything. A user who keeps moving past completing one lap simply continues accumulating distance into a second lap, silently, with no completion event, no reset, no announcement. This PR's rotation doesn't add or remove any lap-completion signal — it only fixes wrap-around continuity for the first lap between the entry point and closing back to it. Confirmed this is unrelated/unaffected by the rotation change itself.

## Verification (real execution against real production data)

`scripts/_verify-loop-rotation-preserves-vertices.ts` — proves, against the real 177-vertex production loop route "הקפת פארק חופי רידינג" (Reading Beach Park), at 3 different entry positions (near the start, near the middle, near the end vertex):

- Rotated path length = original + 1 in every case (the expected seam-closing duplicate that closes the cycle — not a dropped or spuriously duplicated vertex).
- Multiset comparison (after removing exactly the one seam-closer duplicate): **identical to the original vertex set** in all 3 positions — 100% of vertices preserved, zero dropped, zero unexpected duplicates.
- First and last rotated vertices are identical (the loop closes correctly at the entry point) in all 3 cases.

Also confirmed against real data: all 3 real Sderot "sloppy loop" candidates are correctly classified `undefined` by `classifyRouteShape` and therefore correctly left **unrotated** — proving the exclusion works as designed, not just in theory.

## Regression

`tsc --noEmit`: 445/445 (baseline match via stash-based comparison, zero new errors). `vitest run`: 232/234 files pass, same 2 pre-existing unrelated failures as every prior baseline this engagement (firestore-rules emulator, an activity-store test).
