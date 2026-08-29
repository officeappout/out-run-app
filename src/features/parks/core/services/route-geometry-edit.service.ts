/**
 * route-geometry-edit.service.ts — the ONE safe-geometry-edit primitive
 * (route-editor-scoping-spec.md §3.5, §9.2): delete a contiguous point-range
 * from a route's path, recompute every derived field, and write it back
 * in-place. Every driver that mutates an official_routes path — the manual
 * editor (Phase 1, this build) and the future autonomous accuracy agent
 * (Phase 5) — calls this same function; neither is allowed its own
 * parallel write path.
 *
 * Phase 1 scope: trim-only (a removed range must touch the start and/or the
 * end of the path). A fully inset range is rejected here — mid-route
 * deletion + Directions-snap reconnection is Phase 2 (§3.3), not yet built.
 */
import { InventoryService } from './inventory.service';
import { pathLengthMeters } from './geoUtils';
import { computeGeneratorDifficulty } from './generator-elevation.service';
import type { Route } from '../types/route.types';

export interface GeometryEditRange {
  /** Inclusive index into the route's CURRENT path (as returned by
   *  InventoryService.getRouteById — [lng, lat] tuples). */
  startIdx: number;
  endIdx: number;
}

export interface SafeGeometryEditContext {
  initiatedBy: 'owner' | 'agent';
  /** Admin uid for a human edit, or a fixed sentinel like
   *  'system:accuracy-agent' once Phase 5 exists. */
  decidedBy: string;
}

export type SafeGeometryEditOutcome =
  | {
      ok: true;
      distance: number;
      duration: number;
      difficulty: 'easy' | 'medium' | 'hard';
      elevationGain?: number;
      maxGrade?: number;
      /** True if this edit force-unpublished a previously-published route
       *  (route-editor-scoping-spec.md §10 Q1 — David's decision: any
       *  geometry edit to a published route sends it back to `pending`
       *  rather than re-broadcasting in place). */
      unpublished: boolean;
    }
  | { ok: false; error: string };

const PACE_MIN_PER_KM: Record<string, number> = { cycling: 3, running: 6 };
const DEFAULT_PACE_MIN_PER_KM = 12; // walking / workout — matches RouteEditor.tsx's create-flow formula

/** [lng, lat] tuple (in-memory Route.path form) -> {lat, lng} object
 *  (documented persisted Firestore form — schemas.ts's PathSchema). */
function toPersistedPath(tuples: Array<[number, number]>): Array<{ lat: number; lng: number }> {
  return tuples.map(([lng, lat]) => ({ lat, lng }));
}

function validateRanges(ranges: GeometryEditRange[], pathLength: number): string | null {
  if (ranges.length === 0) return 'no ranges given';
  const sorted = [...ranges].sort((a, b) => a.startIdx - b.startIdx);
  let touchesStart = false;
  let touchesEnd = false;
  let prevEnd = -1;
  for (const r of sorted) {
    if (r.startIdx < 0 || r.endIdx >= pathLength || r.startIdx > r.endIdx) {
      return `invalid range [${r.startIdx}, ${r.endIdx}] for a path of length ${pathLength}`;
    }
    if (r.startIdx <= prevEnd) return 'ranges overlap';
    prevEnd = r.endIdx;
    if (r.startIdx === 0) touchesStart = true;
    if (r.endIdx === pathLength - 1) touchesEnd = true;
    const isEdgeRange = r.startIdx === 0 || r.endIdx === pathLength - 1;
    if (!isEdgeRange) {
      return 'range is fully inset (mid-route deletion) — not supported until Phase 2 (route-editor-scoping-spec.md §3.3)';
    }
  }
  if (sorted.length === 2 && !(touchesStart && touchesEnd)) {
    return 'two ranges given but they must be one start-trim + one end-trim';
  }
  if (sorted.length > 2) return 'at most one start-trim and one end-trim range supported in Phase 1';
  return null;
}

function splicePath(path: Array<[number, number]>, ranges: GeometryEditRange[]): Array<[number, number]> {
  const removed = new Set<number>();
  for (const r of ranges) for (let i = r.startIdx; i <= r.endIdx; i++) removed.add(i);
  return path.filter((_, idx) => !removed.has(idx));
}

/**
 * Delete `removedRanges` from `routeId`'s path, recompute every derived
 * field, and write it back in-place (same doc id, moderation state
 * preserved except for the published->pending downgrade below).
 *
 * Never throws on a validation/business-logic failure — returns
 * `{ok:false, error}` so a caller (UI or, later, the agent) can surface it
 * without a try/catch. Firestore/network errors from InventoryService still
 * propagate as real exceptions — those are infrastructure failures, not
 * validation outcomes.
 *
 * `ctx` is accepted but not yet read by this function — it exists so both
 * drivers (manual editor now, the accuracy agent once Phase 5 exists) share
 * one call signature from day one. Phase 3 (route_decisions logging,
 * route-editor-scoping-spec.md §5/§9.7) is what will start consuming it.
 */
export async function applySafeGeometryEdit(
  routeId: string,
  removedRanges: GeometryEditRange[],
  ctx: SafeGeometryEditContext,
): Promise<SafeGeometryEditOutcome> {
  const route = await InventoryService.getRouteById(routeId);
  if (!route) return { ok: false, error: 'route not found' };

  const currentPath = route.path;
  const rangeError = validateRanges(removedRanges, currentPath.length);
  if (rangeError) return { ok: false, error: rangeError };

  const newPath = splicePath(currentPath, removedRanges);
  if (newPath.length < 2) {
    return { ok: false, error: `edit would leave only ${newPath.length} point(s) — a route needs at least 2` };
  }

  const distanceKm = pathLengthMeters(newPath) / 1000;
  const paceMinPerKm = PACE_MIN_PER_KM[route.activityType ?? route.type] ?? DEFAULT_PACE_MIN_PER_KM;
  const duration = Math.round(distanceKm * paceMinPerKm);

  // computeGeneratorDifficulty never throws — it degrades to
  // {difficulty:'easy', elevationGain:undefined, maxGrade:undefined} on any
  // DEM cache miss (route-editor-scoping-spec.md §10 Q2's Haifa-first scope
  // means most routes today have NO cached DEM tiles at all — TLV is the
  // only city warmed so far). Only trust its difficulty/elevation/grade
  // when it actually found real coverage (elevationGain !== undefined) —
  // otherwise leave those three fields OUT of the update payload entirely
  // so the route's existing (possibly real, already-backfilled) values
  // survive Firestore's partial-update semantics untouched. Silently
  // stamping every DEM-cache-miss edit with a hardcoded 'easy' would be a
  // real, silent difficulty downgrade, not a recompute.
  const demResult = await computeGeneratorDifficulty(newPath);
  const hasRealDemData = demResult.elevationGain !== undefined;

  const unpublished = route.published === true;

  const payload: Partial<Route> = {
    path: toPersistedPath(newPath) as unknown as Route['path'],
    distance: Number(distanceKm.toFixed(2)),
    duration,
    ...(hasRealDemData
      ? { difficulty: demResult.difficulty, elevationGain: demResult.elevationGain, maxGrade: demResult.maxGrade }
      : {}),
    ...(unpublished ? { status: 'pending' as const, published: false } : {}),
  };

  await InventoryService.updateRoute(routeId, payload, { allowPathUpdate: true });

  return {
    ok: true,
    distance: payload.distance!,
    duration,
    difficulty: hasRealDemData ? demResult.difficulty : route.difficulty,
    elevationGain: hasRealDemData ? demResult.elevationGain : route.elevationGain,
    maxGrade: hasRealDemData ? demResult.maxGrade : route.maxGrade,
    unpublished,
  };
}
