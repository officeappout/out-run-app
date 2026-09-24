# 47 — Station-Approach Map-Pin Blink (item 4, part 2)

**Date:** 25.09.2026
**Branch:** `feat/station-pin-approach-blink`
**Status:** implemented. Not merged — David merges.

## Scope — explicit go-ahead from David, with a fence

PR #58 (item 4, station-side logic — CTA gating, haptic, corner-X skip) shipped without the map-pin blink, since that touches `AppMap.tsx` — a real map file inside the standing ownership boundary. Asked in chat before touching it; David approved with an explicit fence:
- Only a new `approachingStationId` prop and the pulse condition built on it.
- Both pin variants (with photo, without photo) — the no-photo variant already had an unconditional pulse; the photo variant had none at all.
- No new component, no pin styling changes, nothing else in the file touched.

## What was built

- **`useHybridRun.ts`** — `UpcomingStationInfo` gets a `parkId?: string` field (join key), populated in `computeUpcomingStation` from `HybridPlannedSegment.parkId` (already there). Needed because `AppMap`'s `hybridStations` markers come from a SEPARATE compose pipeline (`start-hybrid-session.ts`'s `ComposedHybridSession`, attached to the route object as `.stationMarkers`) than `HybridPlan.segments` — `parkId` is the field both sides already populate for the same real stop, so it's the natural join key, not a new computation.
- **`FreeRunLayer.tsx`** — the one file that already threads `hybridStations` to `AppMap` AND mounts `HybridStationLayer` (same live-run map instance). Computes `approachingStationId` using the exact same `isApproachingStation` call `HybridStationLayer`'s CTA gate uses (`useHybridRun`'s `phase`/`upcomingStation` + `useRunningPlayer`'s `lastPosition`), passes it to `<AppMap approachingStationId={...} />` alongside the existing `hybridStations` prop. `MapShell.tsx` (the OTHER file that feeds `hybridStations` to a different `AppMap` instance, for route preview — no live run there) was NOT touched; the prop is optional and simply omitted there.
- **`AppMap.tsx`** — new optional `approachingStationId` prop. In the hybrid-stop-marker block: both variants now gate their pulse ring on `stop.parkId === approachingStationId` (no-photo: was unconditional, now conditional; photo: added the same pulse ring style, wrapped in a `relative` container so it centers behind `ParkPhotoMarker`, which itself is untouched). No new component, no other line in the file touched.

## Regression

- `git fetch origin main` + `merge-base --is-ancestor`: clean ancestor before and after this change — no conflict with the nav chat's separate, unmerged `useWalkToRoute` dashed-line deletion (lines 1816-1830, a different part of the same file) at the time of this diff.
- `tsc --noEmit`: 445/445, zero new errors — confirmed zero errors specifically in the 3 touched files.
- `vitest run`: 232/234 files, same 2 pre-existing flaky-emulator files as every prior report this wave, unrelated to this diff.
- Diff is contained: 3 files, 54 insertions / 5 deletions total.

## Not done

`MapShell.tsx` — untouched, not needed (route-preview map instance has no live "approaching" concept).
`TurnCarousel.tsx` — untouched, out of scope for this item.
