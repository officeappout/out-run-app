/**
 * route-enrichment.service.ts — Stage 3 of the route-enrichment-pipeline
 * plan (.claude/plans/route-enrichment-pipeline-kickoff-vast-pelican.md,
 * David-approved 17.08.2026): the `climb_segments` ↔ `official_routes`/
 * `street_segments` spatial join.
 *
 * Structural sibling of `route-adjacency.service.ts` (same directory, same
 * discipline): deliberately I/O-free — every export here takes plain
 * `[lng,lat][]` paths / small in-memory structs, never touches Firestore.
 * The Firestore-facing recompute/write step (`recomputeRouteEnrichmentForCity`)
 * lives in `inventory.service.ts`, next to `recomputeRouteAdjacencyForCity`
 * and the other `official_routes` mutators it hooks into.
 *
 * Reuses `findNearestContactPoint` from route-adjacency.service.ts directly —
 * no new geometric primitive. A climb's own `geometry` (ordered path, not
 * just its single `center`) is passed as one "path," the route's/segment's
 * `path` as the other; the function already handles two arbitrary-length
 * point arrays and finds the true nearest vertex pair, which degenerates
 * cleanly to a point-to-polyline check for a short/point-like climb and to a
 * real polyline-to-polyline check for a longer one. Same vertex-density
 * approximation the shipped corridor-adjacency engine already relies on at
 * its own (much larger, 1000m) threshold.
 */
import type { RouteTerrainFeatureRef } from '../types/route.types';
import type { ClimbType } from '../types/climb-segment.types';
import { findNearestContactPoint, type AdjacencyCorridor } from './route-adjacency.service';

/**
 * Default max gap between a climb's geometry and a route/segment's path for
 * them to be considered associated. Climbs sit directly on/beside a path —
 * unlike ROUTE_ADJACENCY_DETECTION_THRESHOLD_METERS's 1000m (route-to-route
 * proximity), this is a much tighter, David-approved starting default
 * (17.08.2026). Flag for re-tuning if TLV verification (Stage 3 Phase 3.4)
 * surfaces systematically too-few or too-many matches — same "surface for
 * review, don't silently pick" discipline as the adjacency threshold's own
 * calibration history.
 */
export const CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS = 40;

export interface ClimbJoinInput {
  id: string;
  /** [lng, lat] tuples — same convention as AdjacencyCorridor.path, mapped
   *  from ClimbSegment.geometry's {lat,lng} objects by the caller. */
  path: [number, number][];
  type: 'terrain' | 'structure' | 'stairs';
  climbType: ClimbType;
}

export interface ClimbRouteAssociation {
  climbId: string;
  targetId: string;
  targetType: 'route' | 'segment';
  distanceMeters: number;
}

/**
 * Checks one climb against a candidate list (routes OR segments — the
 * caller decides scope/prefiltering; this function doesn't care which
 * collection candidates came from). Kept single-climb-at-a-time rather than
 * accepting all climbs at once because the segments side needs a DIFFERENT
 * candidate list per climb (a Firestore geohash-bounding-box query around
 * each climb's own center — I/O, so it lives in inventory.service.ts, not
 * here) while the routes side can reuse the same full list for every climb
 * (TLV scale — a few dozen routes — makes prefiltering unnecessary there).
 */
export function findNearestAssociations(
  climb: ClimbJoinInput,
  candidates: AdjacencyCorridor[],
  targetType: 'route' | 'segment',
  thresholdMeters: number = CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS,
): ClimbRouteAssociation[] {
  const results: ClimbRouteAssociation[] = [];
  for (const candidate of candidates) {
    if (climb.path.length === 0 || candidate.path.length === 0) continue;
    const contact = findNearestContactPoint(climb.path, candidate.path);
    if (contact.gapMeters <= thresholdMeters) {
      results.push({ climbId: climb.id, targetId: candidate.id, targetType, distanceMeters: contact.gapMeters });
    }
  }
  return results;
}

/**
 * Convenience wrapper for the routes side of the join: every climb against
 * every route, full cross-product (see findNearestAssociations' doc comment
 * for why the segments side can't share this shape). Structural sibling of
 * computeCorridorAdjacency (route-adjacency.service.ts) — same "pure,
 * caller fetches + writes" split.
 */
export function computeClimbRouteAssociations(
  climbs: ClimbJoinInput[],
  routes: AdjacencyCorridor[],
  thresholdMeters: number = CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS,
): ClimbRouteAssociation[] {
  const associations: ClimbRouteAssociation[] = [];
  for (const climb of climbs) {
    associations.push(...findNearestAssociations(climb, routes, 'route', thresholdMeters));
  }
  return associations;
}

export interface ClimbEnrichmentWrites {
  climbUpdates: Map<string, { routeIds: string[]; streetSegmentIds: string[] }>;
  routeUpdates: Map<string, RouteTerrainFeatureRef[]>;
  segmentUpdates: Map<string, string[]>;
}

/**
 * Groups a flat association list (routes + segments, accumulated by the
 * caller across both sides of the join) into the three write-shapes
 * `recomputeRouteEnrichmentForCity` needs — one entry per doc that gets an
 * actual Firestore update. Pure data transformation, no I/O. Needs
 * `climbsById` to look up each climb's `type`/`climbType` for
 * RouteTerrainFeatureRef — associations themselves only carry ids+distance.
 */
export function buildEnrichmentWritesFromAssociations(
  associations: ClimbRouteAssociation[],
  climbsById: Map<string, ClimbJoinInput>,
): ClimbEnrichmentWrites {
  const climbUpdates = new Map<string, { routeIds: string[]; streetSegmentIds: string[] }>();
  const routeUpdates = new Map<string, RouteTerrainFeatureRef[]>();
  const segmentUpdates = new Map<string, string[]>();

  for (const assoc of associations) {
    const climb = climbsById.get(assoc.climbId);
    if (!climb) continue;

    if (!climbUpdates.has(assoc.climbId)) {
      climbUpdates.set(assoc.climbId, { routeIds: [], streetSegmentIds: [] });
    }
    const climbEntry = climbUpdates.get(assoc.climbId)!;

    if (assoc.targetType === 'route') {
      climbEntry.routeIds.push(assoc.targetId);
      if (!routeUpdates.has(assoc.targetId)) routeUpdates.set(assoc.targetId, []);
      routeUpdates.get(assoc.targetId)!.push({
        climbSegmentId: assoc.climbId,
        type: climb.type,
        climbType: climb.climbType,
        distanceFromPathMeters: assoc.distanceMeters,
      });
    } else {
      climbEntry.streetSegmentIds.push(assoc.targetId);
      if (!segmentUpdates.has(assoc.targetId)) segmentUpdates.set(assoc.targetId, []);
      segmentUpdates.get(assoc.targetId)!.push(assoc.climbId);
    }
  }

  return { climbUpdates, routeUpdates, segmentUpdates };
}
