/**
 * route-geometry-edit.service.ts — the ONE safe-geometry-edit primitive
 * (route-editor-scoping-spec.md §3.5, §9.2): delete a contiguous point-range
 * from a route's path, recompute every derived field, and write it back
 * in-place. Every driver that mutates an official_routes path — the manual
 * editor (Phase 1/2, this build) and the future autonomous accuracy agent
 * (Phase 5) — calls this same function; neither is allowed its own
 * parallel write path.
 *
 * Phase 1 scope (still exactly as shipped, unchanged below): trim-only — a
 * removed range must touch the start and/or the end of the path.
 *
 * Phase 2 scope (new): a SINGLE fully-inset range is now also accepted —
 * "interior cut". The two remaining halves are re-bridged with a real
 * Mapbox Directions connector (profile matched to the route's activity),
 * never a straight line — see fetchBridgeConnector below. Multi-cut in one
 * call is out of scope (route-editor-scoping-spec.md §3.3's own "apply
 * twice" note) — a call is either an edge-trim set (1-2 ranges, existing
 * Phase 1 logic, untouched) or a single interior cut (this new logic), not
 * both mixed in one call.
 */
import { InventoryService } from './inventory.service';
import { pathLengthMeters } from './geoUtils';
import { computeGeneratorDifficulty } from './generator-elevation.service';
import { auth } from '@/lib/firebase';
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

export interface BridgeConnector {
  /** Raw Mapbox Directions geometry, anchor-to-anchor INCLUSIVE, in the
   *  query's own from->to order (no reversal). */
  geometry: Array<[number, number]>;
  distanceMeters: number;
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
      /** True when this was an interior cut that got re-bridged (Phase 2),
       *  false for a plain trim (Phase 1). */
      bridged: boolean;
      /** Only present when bridged. */
      connectorDistanceMeters?: number;
    }
  | { ok: false; error: string };

const PACE_MIN_PER_KM: Record<string, number> = { cycling: 3, running: 6 };
const DEFAULT_PACE_MIN_PER_KM = 12; // walking / workout — matches RouteEditor.tsx's create-flow formula

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

function directionsProfileFor(route: Route): 'walking' | 'cycling' {
  return (route.activityType ?? route.type) === 'cycling' ? 'cycling' : 'walking';
}

/**
 * Fetch a real walkable/cyclable connector between two points via the SAME
 * Mapbox Directions endpoint RouteEditor.tsx's fetchSnappedRoute already
 * uses (identical URL/params) — but, deliberately, DIFFERENT failure
 * behavior. fetchSnappedRoute falls back to a straight `[from, to]` line on
 * any Directions failure; that fallback is explicitly wrong for a re-bridge
 * (route-editor-scoping-spec.md Phase 2 brief: "NEVER draw a straight-line
 * bridge"), so this function returns `null` instead — every caller must
 * treat null as "can't bridge this cut," never synthesize a substitute.
 *
 * Exported (not private to this module) so the editor UI can call the exact
 * same function for a live preview before the user commits to Apply — the
 * preview and the actual saved connector are then guaranteed to be the same
 * fetch, not two independent Directions calls that could silently disagree.
 */
export async function fetchBridgeConnector(
  anchorA: [number, number],
  anchorB: [number, number],
  profile: 'walking' | 'cycling',
): Promise<BridgeConnector | null> {
  try {
    const coords = `${anchorA[0]},${anchorA[1]};${anchorB[0]},${anchorB[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const primary = data?.routes?.[0];
    const geometry = primary?.geometry?.coordinates as Array<[number, number]> | undefined;
    if (!geometry || geometry.length < 2) return null;
    return { geometry, distanceMeters: primary.distance ?? 0 };
  } catch {
    return null;
  }
}

/** [lng, lat] tuple (in-memory Route.path form) -> {lat, lng} object
 *  (documented persisted Firestore form — schemas.ts's PathSchema). */
function toPersistedPath(tuples: Array<[number, number]>): Array<{ lat: number; lng: number }> {
  return tuples.map(([lng, lat]) => ({ lat, lng }));
}

function isEdgeRange(range: GeometryEditRange, pathLength: number): boolean {
  return range.startIdx === 0 || range.endIdx === pathLength - 1;
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
    if (!isEdgeRange(r, pathLength)) {
      // Only reachable when ranges.length > 1 (a lone interior range is
      // intercepted in applySafeGeometryEdit before this function is even
      // called) — i.e. an interior range mixed together with another range
      // in the same call, which Phase 2's v1 doesn't support either.
      return 'an interior range cannot be combined with another range in the same call — apply the interior cut on its own';
    }
  }
  if (sorted.length === 2 && !(touchesStart && touchesEnd)) {
    return 'two ranges given but they must be one start-trim + one end-trim';
  }
  if (sorted.length > 2) return 'at most one start-trim and one end-trim range supported';
  return null;
}

function splicePath(path: Array<[number, number]>, ranges: GeometryEditRange[]): Array<[number, number]> {
  const removed = new Set<number>();
  for (const r of ranges) for (let i = r.startIdx; i <= r.endIdx; i++) removed.add(i);
  return path.filter((_, idx) => !removed.has(idx));
}

/**
 * Splice a re-bridged interior cut: [prefix through anchorA] + [connector
 * interior points, endpoints dropped since prefix/suffix already supply
 * them] + [suffix from anchorB]. No reversal — connector.geometry is
 * already oriented anchorA->anchorB because that's the order it was
 * queried in, so straight concatenation keeps the whole path continuous
 * and single-direction, exactly as required.
 */
function spliceWithBridge(
  path: Array<[number, number]>,
  range: GeometryEditRange,
  connector: BridgeConnector,
): Array<[number, number]> {
  const prefix = path.slice(0, range.startIdx); // ...through anchorA (index startIdx-1)
  const suffix = path.slice(range.endIdx + 1); // anchorB (index endIdx+1) onward
  const connectorInterior = connector.geometry.slice(1, -1); // drop duplicate anchors
  return [...prefix, ...connectorInterior, ...suffix];
}

interface ServerDemResult {
  elevationGain: number;
  maxGrade: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Fallback DEM source for cities the browser cache never warmed (Haifa/
 * Ashkelon/Zichron-Yaakov — confirmed by scripts/audit-city-coverage.ts to
 * have real DEM coverage via geo-discovery-routes.ts's own import-time
 * computation, just not in the browser cache). Calls the server route
 * (src/app/api/admin/routes/dem-recompute), which live-fetches the SAME
 * Mapbox Terrain-RGB source discovery uses — see that route + its
 * fetchLiveDemProfile helper for why this is reachable from app runtime,
 * not a discovery-only dependency.
 *
 * Returns null on ANY failure — network error, non-200, missing auth token,
 * or the server itself reporting no coverage. Never throws, never guesses.
 * `newPath` is [lng, lat] tuples (Route.path's in-memory convention); the
 * server route converts to [lat, lng] itself.
 */
async function fetchServerDemFallback(newPath: Array<[number, number]>): Promise<ServerDemResult | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;
    const res = await fetch('/api/admin/routes/dem-recompute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path: newPath }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.coverage) return null;
    if (typeof data.elevationGain !== 'number' || typeof data.maxGrade !== 'number') return null;
    return { elevationGain: data.elevationGain, maxGrade: data.maxGrade, difficulty: data.difficulty };
  } catch {
    return null;
  }
}

/** Shared recompute + write tail for both the trim path and the re-bridge
 *  path — identical to Phase 1's logic, now called from two branches
 *  instead of inlined once. */
async function recomputeAndWrite(
  routeId: string,
  route: Route,
  newPath: Array<[number, number]>,
  extra: { bridged: boolean; connectorDistanceMeters?: number },
): Promise<SafeGeometryEditOutcome> {
  if (newPath.length < 2) {
    return { ok: false, error: `edit would leave only ${newPath.length} point(s) — a route needs at least 2` };
  }

  const distanceKm = pathLengthMeters(newPath) / 1000;
  const paceMinPerKm = PACE_MIN_PER_KM[route.activityType ?? route.type] ?? DEFAULT_PACE_MIN_PER_KM;
  const duration = Math.round(distanceKm * paceMinPerKm);

  // computeGeneratorDifficulty never throws — it degrades to
  // {difficulty:'easy', elevationGain:undefined, maxGrade:undefined} on a
  // browser-cache miss (the client-side dem-tile-cache/ was only ever
  // warmed for the TLV pilot). Historically that miss meant "no real DEM
  // data available" and this function stopped there. It DOESN'T mean that
  // anymore for discovery-imported cities (Haifa/Ashkelon/Zichron-Yaakov) —
  // scripts/audit-city-coverage.ts confirmed those routes already have 100%
  // real DEM coverage from geo-discovery-routes.ts's own import-time
  // computation, just not cached in the browser. So on a browser-cache
  // miss, fall through to the server-side live fetch (same Mapbox
  // Terrain-RGB source, proven reachable from app runtime) before giving
  // up. Only when BOTH the browser cache AND the server fetch come back
  // empty do difficulty/elevation/maxGrade get left OUT of the update
  // payload entirely — never a guess, never the hardcoded 'easy' fallback,
  // and the route's existing (possibly real) values survive Firestore's
  // partial-update semantics untouched rather than being overwritten wrong.
  let demResult: { difficulty: 'easy' | 'medium' | 'hard'; elevationGain?: number; maxGrade?: number } =
    await computeGeneratorDifficulty(newPath);
  let hasRealDemData = demResult.elevationGain !== undefined;

  if (!hasRealDemData) {
    const serverResult = await fetchServerDemFallback(newPath);
    if (serverResult) {
      demResult = serverResult;
      hasRealDemData = true;
    }
  }

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

  // allowPathUpdate:true, and nothing else — no street_segments/route_adjacency
  // broadcast call here (deliberately). Re-broadcasting a shortened/re-bridged
  // path hits the documented ghost-segment bug (official-route-broadcaster.ts's
  // index-keyed overwrite doesn't clean up trailing stale docs past the new,
  // shorter count). The unpublished/pending downgrade above is what removes
  // this route from live visibility instead — re-approval (approveRoute) is
  // the ONLY path that's allowed to re-broadcast, and only that path does.
  await InventoryService.updateRoute(routeId, payload, { allowPathUpdate: true });

  return {
    ok: true,
    distance: payload.distance!,
    duration,
    difficulty: hasRealDemData ? demResult.difficulty : route.difficulty,
    elevationGain: hasRealDemData ? demResult.elevationGain : route.elevationGain,
    maxGrade: hasRealDemData ? demResult.maxGrade : route.maxGrade,
    unpublished,
    ...extra,
  };
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
 * `precomputedBridge`: when the caller (the editor UI) already fetched a
 * connector for a live preview via fetchBridgeConnector, pass it here so
 * Apply reuses that EXACT geometry instead of re-querying Directions — the
 * user then always gets exactly what they previewed, never a second,
 * possibly-different route from a redundant call. Only meaningful when
 * `removedRanges` resolves to a single interior cut; ignored otherwise.
 * When omitted for an interior cut, this function fetches the connector
 * itself (the path the future accuracy agent, which has no preview step,
 * will use).
 *
 * `ctx` is accepted but not yet read by this function — it exists so both
 * drivers (manual editor now, the accuracy agent once Phase 5 exists) share
 * one call signature from day one. Phase 3 (route_decisions logging,
 * route-editor-scoping-spec.md §5/§9.7) is what will start consuming it —
 * NOT built yet as of Phase 2 either; see Phase 2's own delivery notes.
 */
export async function applySafeGeometryEdit(
  routeId: string,
  removedRanges: GeometryEditRange[],
  ctx: SafeGeometryEditContext,
  precomputedBridge?: BridgeConnector,
): Promise<SafeGeometryEditOutcome> {
  const route = await InventoryService.getRouteById(routeId);
  if (!route) return { ok: false, error: 'route not found' };

  const currentPath = route.path;

  // Interior-cut dispatch: exactly one range, and it touches neither the
  // start nor the end -> re-bridge path (Phase 2). Everything else
  // (0 ranges, 2 ranges, or a single edge-touching range) falls through to
  // the untouched Phase 1 trim validation/splice below.
  if (
    removedRanges.length === 1 &&
    removedRanges[0].startIdx >= 0 &&
    removedRanges[0].endIdx < currentPath.length &&
    removedRanges[0].startIdx <= removedRanges[0].endIdx &&
    !isEdgeRange(removedRanges[0], currentPath.length)
  ) {
    const range = removedRanges[0];
    const anchorA = currentPath[range.startIdx - 1];
    const anchorB = currentPath[range.endIdx + 1];

    const connector = precomputedBridge ?? (await fetchBridgeConnector(anchorA, anchorB, directionsProfileFor(route)));
    if (!connector) {
      return { ok: false, error: "couldn't build a real connector for this cut" };
    }

    const newPath = spliceWithBridge(currentPath, range, connector);
    return recomputeAndWrite(routeId, route, newPath, { bridged: true, connectorDistanceMeters: connector.distanceMeters });
  }

  const rangeError = validateRanges(removedRanges, currentPath.length);
  if (rangeError) return { ok: false, error: rangeError };

  const newPath = splicePath(currentPath, removedRanges);
  return recomputeAndWrite(routeId, route, newPath, { bridged: false });
}
