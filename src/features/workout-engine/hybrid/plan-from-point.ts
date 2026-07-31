/**
 * plan-from-point — §7.3 Part 4, the "plan-from-here" engine (Axis ①).
 *
 * PURE ordering over the canonical route: (canonical path + entry + direction + topology + stops)
 * → an entry-relative traversal with stops ordered by distance-from-entry. It reads NO budget /
 * domains / SoT, does NO I/O, no store reads, and **counts nothing** (ordering + positioning only)
 * — so it sits under BOTH the SoT boundary and the ② set-counting boundary. Unwired for now.
 *
 * One primitive, two callers (Principle 2): `entry` = live GPS at session start; the SAME call
 * later serves recalc-on-deviation with `entry` = current mid-route position + remaining `stops`.
 *
 * THIS BUILD = Axis ①: `direction:'forward'` + `topology:'one_way'` (clip pre-entry, decision ①a) /
 * `'loop'` (cyclic). `'backward'`/`'auto'` (Axis ②) and `'out_and_back'`/`'laps'` (Axis ③) are
 * accepted (typed) but deferred — they resolve to the forward/one_way|loop ordering and are reported
 * transparently in `meta.deferredAxes` (no silent mis-handling). Segment-projection snap is a noted
 * refinement over the current nearest-vertex snap.
 */

import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import type { ResolvedRouteStop } from './route-stops.service';

/** Canonical route vertex `[lng, lat]` (matches RoutePath across the engine). */
export type RoutePath = [number, number][];
export interface LatLng { lat: number; lng: number; }

/** Principle 1 — the FIXED reference. `prefixKm` is optional (computed if absent). */
export interface CanonicalRoute {
  path: RoutePath;
  /** Cumulative km to each vertex (`prefixKm[i]` = distance path[0]→path[i]). */
  prefixKm?: number[];
}
export interface EntryPoint { position: LatLng; }

export type Direction = 'forward' | 'backward' | 'auto';
export type Topology = 'one_way' | 'out_and_back' | 'loop';

export interface PlannedStop {
  stop: ResolvedRouteStop;
  /** Distance-from-entry along the traversal — THE ordering key (replaces waypointIndex). */
  traversalKm: number;
  /** Index of the stop into `traversal` — the frame composeHybridSession's `waypointIndex`
   *  must be in (one_way: `wp − entryIndex`; loop: `(wp − entryIndex + N) % N`). */
  traversalIndex: number;
  /** Which pass the stop is on (1 for one_way/loop; >1 later for out_and_back/laps). */
  occurrence: number;
}

export interface SessionPlan {
  /** The path actually walked: rotated to the entry, clipped (one_way) or cyclic (loop). */
  traversal: RoutePath;
  /** Nearest canonical vertex to the entry, and its cumulative km. */
  entryIndex: number;
  entryKm: number;
  /** Resolved (auto → concrete). */
  direction: 'forward' | 'backward';
  topology: Topology;
  /** Stops in traversal order (ascending `traversalKm`). "Last" = the final element. */
  stops: PlannedStop[];
  meta: {
    totalKm: number;
    /** Axis values accepted but not yet implemented (resolved to the supported behavior). */
    deferredAxes: string[];
    /** one_way: stops behind the entry that were clipped (decision ①a). */
    clippedStops: number;
  };
}

export interface PlanFromPointInput {
  canonical: CanonicalRoute;
  entry: EntryPoint;
  direction: Direction;
  topology: Topology;
  /** POIs to place — keep their REAL canonical position (no pin move). */
  stops: ResolvedRouteStop[];
}

/** PURE: cumulative km along the path (`[0]=0`). */
export function buildPrefixKm(path: RoutePath): number[] {
  const km: number[] = new Array(path.length);
  km[0] = 0;
  for (let i = 1; i < path.length; i++) {
    const [aLng, aLat] = path[i - 1];
    const [bLng, bLat] = path[i];
    km[i] = km[i - 1] + haversineMeters(aLat, aLng, bLat, bLng) / 1000;
  }
  return km;
}

/** PURE: index of the canonical vertex nearest to `p`. (Segment-projection = future refinement.) */
export function snapToVertex(path: RoutePath, p: LatLng): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = haversineMeters(p.lat, p.lng, path[i][1], path[i][0]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Endpoint proximity (metres) at/below which a route's two ends are treated as meeting → a
 * closed loop. A real loop (generator "back to user" / curated diamond) closes within a few m;
 * a linear promenade's ends sit hundreds of m apart — 50 m separates them with GPS/geometry slack.
 */
export const LOOP_ENDPOINT_THRESHOLD_M = 50;

/** PURE: classify a canonical route as a cyclic `loop` (ends meet) or a linear `one_way` path. */
export function detectTopology(path: RoutePath): Topology {
  if (!path || path.length < 3) return 'one_way';
  const [aLng, aLat] = path[0];
  const [bLng, bLat] = path[path.length - 1];
  return haversineMeters(aLat, aLng, bLat, bLng) <= LOOP_ENDPOINT_THRESHOLD_M ? 'loop' : 'one_way';
}

/**
 * Order a set of stops relative to an entry point on a canonical route. PURE — no I/O, no SoT,
 * counts nothing. See file header for the axis scope of this build.
 */
export function planFromPoint(input: PlanFromPointInput): SessionPlan {
  const { canonical, entry, direction, topology, stops } = input;
  const path = canonical.path;
  const deferredAxes: string[] = [];

  // Degenerate route → empty, well-formed plan.
  if (!path || path.length < 2) {
    return {
      traversal: path ?? [], entryIndex: 0, entryKm: 0, direction: 'forward', topology,
      stops: [], meta: { totalKm: 0, deferredAxes, clippedStops: 0 },
    };
  }

  const prefixKm = canonical.prefixKm && canonical.prefixKm.length === path.length
    ? canonical.prefixKm
    : buildPrefixKm(path);
  const totalKm = prefixKm[prefixKm.length - 1];

  // ── Axis ① entry: snap to the nearest canonical vertex ──────────────────────────────────
  const entryIndex = snapToVertex(path, entry.position);
  const entryKm = prefixKm[entryIndex];

  // ── Axis ② direction: only 'forward' built; backward/auto deferred (→ forward for now) ────
  const resolvedDirection: 'forward' | 'backward' = 'forward';
  if (direction !== 'forward') deferredAxes.push(`direction:${direction}→forward (Axis ②)`);

  // ── Axis ③ topology: one_way (clip, ①a) + loop (cyclic) built; out_and_back/laps deferred ─
  const isLoop = topology === 'loop';
  if (topology === 'out_and_back' || (topology as string) === 'laps') {
    deferredAxes.push(`topology:${topology}→${isLoop ? 'loop' : 'one_way'} (Axis ③)`);
  }

  // Per-stop distance-from-entry (`traversalKm`) + index into the traversal (`traversalIndex`),
  // keeping each stop's real canonical position (no pin move).
  const N = path.length;
  const planned: PlannedStop[] = [];
  let clippedStops = 0;
  for (const s of stops) {
    const wp = Math.max(0, Math.min(N - 1, s.waypointIndex));
    const canonicalKm = prefixKm[wp];
    let traversalKm: number;
    let traversalIndex: number;
    if (isLoop) {
      // cyclic distance-from-entry around the loop (every stop is reachable)
      traversalKm = (((canonicalKm - entryKm) % totalKm) + totalKm) % totalKm;
      traversalIndex = (((wp - entryIndex) % N) + N) % N;
    } else {
      // one_way + clip (decision ①a): a stop behind the entry is dropped
      if (canonicalKm < entryKm) { clippedStops++; continue; }
      traversalKm = canonicalKm - entryKm;
      traversalIndex = Math.max(0, wp - entryIndex);
    }
    planned.push({ stop: s, traversalKm, traversalIndex, occurrence: 1 });
  }
  planned.sort((a, b) => a.traversalKm - b.traversalKm);

  // Traversal geometry (for the map/run): rotate to entry — cyclic for a loop, clipped otherwise.
  const traversal: RoutePath = isLoop
    ? [...path.slice(entryIndex), ...path.slice(0, entryIndex + 1)]
    : path.slice(entryIndex);

  return {
    traversal,
    entryIndex,
    entryKm,
    direction: resolvedDirection,
    topology,
    stops: planned,
    meta: { totalKm, deferredAxes, clippedStops },
  };
}
