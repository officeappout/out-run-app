/**
 * route-adjacency.service.ts — Phase 2 of the corridor-following engine
 * (.claude/plans/build-the-phase-0-noble-kahn.md). Pure geometric-adjacency
 * detection between `official_routes` corridors: given two already-fetched
 * paths, is there a real, close (not necessarily walkable — see the
 * standing caveat below) contact point between them?
 *
 * This file is deliberately I/O-free — every export here takes plain
 * `[lng, lat][]` paths / small in-memory structs, never touches Firestore
 * or Mapbox, so it's directly unit-testable. The Firestore-facing
 * recompute/write step (`recomputeRouteAdjacencyForCity`) lives in
 * `inventory.service.ts`, next to the other `official_routes` mutators it
 * hooks into.
 *
 * Standing caveat (same one `computeTightenedDistanceWindow` lives with):
 * a geometric gap measurement can only prove "close," never "walkable" — a
 * fence, a highway, or train tracks can sit between two corridors that are
 * geometrically 50m apart. This is why `IS_ROUTE_ADJACENCY_ENABLED`'s
 * discovered connectors must be surfaced for human review before being
 * trusted, not auto-accepted purely because they clear the threshold.
 */
import { geohashForLocation, geohashQueryBounds } from 'geofire-common';
import { haversineMeters, pathLengthMeters, pointAtDistanceAlongPath, isSameCoord } from './geoUtils';

export interface AdjacencyCorridor {
  id: string;
  path: [number, number][];
}

export interface NearestContact {
  indexA: number;
  indexB: number;
  pointA: [number, number];
  pointB: [number, number];
  gapMeters: number;
}

export interface AdjacencyEdge {
  routeIdA: string;
  routeIdB: string;
  contactA: { lng: number; lat: number };
  contactB: { lng: number; lat: number };
  gapMeters: number;
}

/**
 * Caps a path's point count before O(n*m) pairwise comparison by resampling
 * at even arc-length intervals — protects against pathologically dense
 * stored paths (a long OSM way or a heavily-clicked RouteEditor path) making
 * the nearest-contact search slow. Real corridor paths (20-180 pts) never
 * hit this; it's a defensive ceiling, not a normal-path behavior.
 */
export function capPathForComparison(path: [number, number][], maxPoints: number = 60): [number, number][] {
  if (path.length <= maxPoints) return path;
  const totalMeters = pathLengthMeters(path);
  const intervalMeters = totalMeters / (maxPoints - 1);
  const resampled: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    const pt = pointAtDistanceAlongPath(path, i * intervalMeters);
    if (pt) resampled.push(pt);
  }
  return resampled;
}

/**
 * True nearest-contact search between two full paths — brute-force O(n*m),
 * fine for corridor-sized paths (after capPathForComparison). Checks EVERY
 * point, not just the 4 endpoint combinations: corridors are frequently
 * loops (start~=end), so the real closest approach is often interior, at
 * whatever arbitrary vertex the admin/importer happened to start recording
 * — endpoint-only checks silently miss real adjacency (verified live,
 * 15.08.2026 mechanism smoke-test: Park HaMesila<->Charles Clore measured
 * 481m at endpoints alone vs. the true 374m interior contact).
 */
export function findNearestContactPoint(
  pathA: [number, number][],
  pathB: [number, number][],
): NearestContact {
  const cappedA = capPathForComparison(pathA);
  const cappedB = capPathForComparison(pathB);
  let best: NearestContact = {
    indexA: 0,
    indexB: 0,
    pointA: cappedA[0],
    pointB: cappedB[0],
    gapMeters: Infinity,
  };
  for (let i = 0; i < cappedA.length; i++) {
    for (let j = 0; j < cappedB.length; j++) {
      const gapMeters = haversineMeters(cappedA[i][1], cappedA[i][0], cappedB[j][1], cappedB[j][0]);
      if (gapMeters < best.gapMeters) {
        best = { indexA: i, indexB: j, pointA: cappedA[i], pointB: cappedB[j], gapMeters };
      }
    }
  }
  return best;
}

/** Mean of all path points — a cheap "roughly where this corridor is" anchor for candidate-pair prefiltering. Not a precise centroid; not used for anything geometry-sensitive. */
export function corridorCentroid(path: [number, number][]): [number, number] {
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of path) { sumLng += lng; sumLat += lat; }
  return [sumLng / path.length, sumLat / path.length];
}

/**
 * Narrows an O(n^2) all-pairs corridor comparison down to candidate pairs
 * whose centroids are within `prefilterRadiusMeters` of each other, using
 * `geohashQueryBounds` — the SAME utility `fetchScoredWaypointsByProximity`
 * already uses for Firestore radius queries elsewhere in this codebase,
 * applied here in-memory instead. `prefilterRadiusMeters` must be generous
 * relative to the real adjacency threshold (default 5km vs. a ~150-300m
 * threshold) — two corridors' EDGES can be near-touching while their
 * CENTROIDS sit much farther apart for a large loop, so this prefilter only
 * needs to rule out corridors that are obviously in a different part of the
 * city, not approximate the real gap.
 */
export function findCandidatePairsByGeohash(
  corridors: AdjacencyCorridor[],
  prefilterRadiusMeters: number = 5000,
): Array<[AdjacencyCorridor, AdjacencyCorridor]> {
  const centroids = new Map(corridors.map((c) => [c.id, corridorCentroid(c.path)] as const));
  const geohashes = new Map(
    corridors.map((c) => {
      const [lng, lat] = centroids.get(c.id)!;
      return [c.id, geohashForLocation([lat, lng], 9)] as const;
    }),
  );

  const pairs: Array<[AdjacencyCorridor, AdjacencyCorridor]> = [];
  const seenPairKeys = new Set<string>();
  for (const a of corridors) {
    const [lngA, latA] = centroids.get(a.id)!;
    const bounds = geohashQueryBounds([latA, lngA], prefilterRadiusMeters);
    for (const b of corridors) {
      if (a.id === b.id) continue;
      const pairKey = [a.id, b.id].sort().join('|');
      if (seenPairKeys.has(pairKey)) continue;
      const bGeohash = geohashes.get(b.id)!;
      const inBounds = bounds.some(([start, end]) => bGeohash >= start && bGeohash <= end);
      if (inBounds) {
        pairs.push([a, b]);
        seenPairKeys.add(pairKey);
      }
    }
  }
  return pairs;
}

/**
 * Full adjacency pass over a set of corridors (normally: every published
 * official_routes doc in one city): candidate-pair prefilter, then a
 * precise nearest-contact check per candidate pair, keeping only pairs
 * within `thresholdMeters`. Pure — no Firestore I/O; the caller
 * (`recomputeRouteAdjacencyForCity` in inventory.service.ts) fetches the
 * corridors and writes the result.
 */
export function computeCorridorAdjacency(
  corridors: AdjacencyCorridor[],
  thresholdMeters: number,
  prefilterRadiusMeters: number = 5000,
): AdjacencyEdge[] {
  const candidatePairs = findCandidatePairsByGeohash(corridors, prefilterRadiusMeters);
  const edges: AdjacencyEdge[] = [];
  for (const [a, b] of candidatePairs) {
    const contact = findNearestContactPoint(a.path, b.path);
    if (contact.gapMeters <= thresholdMeters) {
      edges.push({
        routeIdA: a.id,
        routeIdB: b.id,
        contactA: { lng: contact.pointA[0], lat: contact.pointA[1] },
        contactB: { lng: contact.pointB[0], lat: contact.pointB[1] },
        gapMeters: contact.gapMeters,
      });
    }
  }
  return edges;
}

/**
 * Rotates a CLOSED loop (path[0] ~= path[last], within 5m — see
 * `isSameCoord`) so it starts AND ends at index `i`. Mathematically free —
 * a loop's total distance is unchanged by where its array happens to
 * "start" — used to make a loop's far end land next to a connector's start
 * for a clean splice, instead of at whatever vertex the original recording
 * happened to begin. Returns the path unchanged if it isn't a closed loop
 * (chaining at an interior point of a genuine point-to-point corridor is a
 * harder case, out of scope for this pass — see plan's Phase 3 note).
 */
export function orientCorridorForSplice(
  path: [number, number][],
  contactIndex: number,
): [number, number][] {
  if (!isSameCoord(path[0], path[path.length - 1])) return path;
  return [...path.slice(contactIndex), ...path.slice(1, contactIndex + 1)];
}

/**
 * Orients a corridor for a "flow through" traversal starting at
 * `entryIndex` (16.08.2026, user-anchored corridor-flow build) — distinct
 * job from `orientCorridorForSplice`'s "rotate a loop to meet another
 * corridor": here there's no second corridor yet, just a user arriving at
 * an interior point and needing to walk SOME direction.
 *
 * Closed loop: delegates to `orientCorridorForSplice` — walking the entry
 * point all the way around back to itself is well-defined regardless of
 * why the loop was entered, no separate logic needed.
 *
 * Genuine point-to-point corridor: picks whichever direction (toward the
 * end, or back toward the start) has MORE remaining real distance —
 * maximizes room for the caller's eventual distance-trim to work with.
 */
export function orientCorridorForFlow(
  path: [number, number][],
  entryIndex: number,
): [number, number][] {
  if (isSameCoord(path[0], path[path.length - 1])) {
    return orientCorridorForSplice(path, entryIndex);
  }
  const forward = path.slice(entryIndex);
  const backward = [...path.slice(0, entryIndex + 1)].reverse();
  return pathLengthMeters(forward) >= pathLengthMeters(backward) ? forward : backward;
}

/**
 * Splices an ordered sequence of corridor paths with connector paths
 * between them: `corridors.length` must be `connectors.length + 1`. Each
 * connector's first point is dropped (duplicate of the preceding corridor's
 * last point) before concatenation. Pure — callers are expected to have
 * already oriented each corridor (via `orientCorridorForSplice`) so
 * consecutive paths actually meet end-to-start.
 */
export function spliceCorridorChain(
  corridors: [number, number][][],
  connectors: [number, number][][],
): [number, number][] {
  if (corridors.length === 0) return [];
  if (connectors.length !== corridors.length - 1) {
    throw new Error(`spliceCorridorChain: expected ${corridors.length - 1} connectors for ${corridors.length} corridors, got ${connectors.length}`);
  }
  const result: [number, number][] = [...corridors[0]];
  for (let i = 0; i < connectors.length; i++) {
    result.push(...connectors[i].slice(1));
    result.push(...corridors[i + 1]);
  }
  return result;
}
