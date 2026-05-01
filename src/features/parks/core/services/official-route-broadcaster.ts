/**
 * Official Route → street_segments Broadcaster
 * ─────────────────────────────────────────────
 * Bridges the human-curated `official_routes` collection into the algorithmic
 * `street_segments` collection so that every published / saved official route
 * automatically becomes a top-priority waypoint corridor for:
 *   1. The dynamic generator (FreeRunRouteSelector) — score 10 segments win
 *      against OSM-imported segments (typical scores 5–8) when picking the
 *      top-12 candidates.
 *   2. The route-deviation orchestrator — when the user wanders off an
 *      official route, the orchestrator passes the original route's id back
 *      into the generator and segments tagged with a matching
 *      `officialRouteId` get a 5× score bonus, biasing the recovery loop to
 *      send the user back onto the original route's corridor.
 *
 * Doc shape (deliberately compatible with what the OSM importer writes —
 * `route-generator.service.ts → segmentMidpoint` already understands `path`
 * + `midpoint`):
 *
 *   {
 *     osmId:           null,                      // not from OSM
 *     isOfficial:      true,                      // discriminator
 *     officialRouteId: "<official_routes doc id>", // back-reference
 *     score:           10,                        // max priority
 *     cityName:        "<resolved city>",         // queryable
 *     authorityId:     "<authority>" | null,
 *     path:            [{lat, lng}, {lat, lng}],  // exactly 2 nodes
 *     midpoint:        {lat, lng},                // pre-computed
 *     lengthMeters:    <haversine>,
 *     tags:            { highway: 'official', surface: null, ... },
 *     importedAt:      <serverTimestamp>,
 *   }
 *
 * Doc id strategy: `official_${routeId}_seg_${idx}`. Stable + idempotent —
 * re-broadcasting the same route overwrites the previous segments rather
 * than duplicating them, and `deleteOfficialRouteSegments(routeId)` can
 * match by `where('officialRouteId', '==', routeId)` without needing the
 * caller to track ids.
 *
 * Performance guard: very long routes (>200 segments) are sub-sampled by
 * stride so we never write more than ~200 docs per route. Density still
 * comfortably exceeds the dynamic generator's `targetDistance / 2` km
 * search radius for any realistic urban route.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Route } from '../types/route.types';
import { getAuthority } from '@/features/admin/services/authority.service';

// ── Tuning constants ─────────────────────────────────────────────────────────

/**
 * Hard upper bound on segments emitted per route. A 5km route with default
 * Mapbox densification (~25m spacing) yields ~200 vertices → ~199 segments,
 * which fits perfectly. Routes with denser geometry (e.g. GIS imports with
 * 2,000+ vertices) get strided down so we never explode the segments
 * collection on a single save.
 */
const MAX_SEGMENTS_PER_ROUTE = 200;

/** Firestore batch hard limit. */
const FIRESTORE_BATCH_SIZE = 500;

/**
 * Score assigned to every official segment. Two design decisions baked in:
 *   1. 10 is the maximum score the OSM importer can produce — official
 *      segments tie (and beat, with the 5× bias) anything else.
 *   2. It is intentionally NOT a unique sentinel value (e.g. 99). The
 *      generator's `where('score', '>=', 6)` query stays fully compatible,
 *      and an admin tweaking the OSM scoring rubric tomorrow can't
 *      accidentally lock official segments out of consideration.
 */
const OFFICIAL_SEGMENT_SCORE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineMeters(
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Resolves the city name for an official route. Priority:
 *   1. `route.city`      — canonical, set in RouteEditor.
 *   2. Authority lookup  — falls back to the authority's `name` field, which
 *      doubles as the city name for `type: 'city'` authorities. This handles
 *      legacy routes saved before the `city` column was added.
 *
 * Returns `null` when nothing usable can be derived — broadcaster will skip
 * the route entirely (a segment without `cityName` would never match the
 * generator's `where('cityName', '==', X)` filter, so emitting one is just
 * stale data waiting to happen).
 */
async function resolveCityName(route: Route): Promise<string | null> {
  if (typeof route.city === 'string' && route.city.trim().length > 0) {
    return route.city.trim();
  }
  if (route.authorityId) {
    try {
      const authority = await getAuthority(route.authorityId);
      const name = authority?.name?.trim();
      if (name && name.length > 0) return name;
    } catch (err) {
      console.warn(
        `[OfficialBroadcaster] Authority lookup failed for ${route.authorityId}; route ${route.id} will be skipped.`,
        err,
      );
    }
  }
  return null;
}

/**
 * Builds the `street_segments` doc shape for one (A, B) coordinate pair.
 * `path` is in [lng, lat] order (the project-wide convention used by Mapbox
 * and Route.path). The doc stores {lat, lng} objects to match what the OSM
 * importer writes, so consumers can use a single `segmentMidpoint` reader.
 */
function buildSegmentDoc(
  routeId: string,
  cityName: string,
  authorityId: string | null,
  a: [number, number],
  b: [number, number],
): Record<string, unknown> {
  const aLat = a[1];
  const aLng = a[0];
  const bLat = b[1];
  const bLng = b[0];

  return {
    osmId: null,
    isOfficial: true,
    officialRouteId: routeId,
    score: OFFICIAL_SEGMENT_SCORE,
    cityName,
    authorityId,
    path: [
      { lat: aLat, lng: aLng },
      { lat: bLat, lng: bLng },
    ],
    midpoint: {
      lat: (aLat + bLat) / 2,
      lng: (aLng + bLng) / 2,
    },
    lengthMeters: Math.round(haversineMeters(aLat, aLng, bLat, bLng)),
    tags: {
      highway: 'official',
      surface: null,
      lit: null,
      smoothness: null,
      maxspeed: null,
      sidewalk: null,
    },
    importedAt: serverTimestamp(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface BroadcastResult {
  /** Number of segment docs written. 0 if the route was skipped. */
  written: number;
  /** Skip reason (only present when written === 0). Useful for logging. */
  skipped?:
    | 'no_path'
    | 'no_city'
    | 'unpublished'
    | 'error';
}

/**
 * Broadcast a single official route into `street_segments`. Idempotent —
 * re-running the same route overwrites the previous segments thanks to the
 * deterministic doc-id scheme. Safe to call from `saveRoutes`, `approveRoute`,
 * or any future "publish" action without first deleting the old segments.
 *
 * `respectPublishedFlag` (default true) skips routes where `published === false`
 * so pending / rejected drafts never bleed into the dynamic generator.
 */
export async function broadcastRouteToStreetSegments(
  route: Route,
  options: { respectPublishedFlag?: boolean } = {},
): Promise<BroadcastResult> {
  const respectPublishedFlag = options.respectPublishedFlag ?? true;

  if (respectPublishedFlag && route.published === false) {
    return { written: 0, skipped: 'unpublished' };
  }
  if (!route.path || route.path.length < 2) {
    return { written: 0, skipped: 'no_path' };
  }

  const cityName = await resolveCityName(route);
  if (!cityName) {
    console.warn(
      `[OfficialBroadcaster] Skipping route ${route.id} ("${route.name}") — no city derivable. ` +
        'Set route.city or assign an authority with a name.',
    );
    return { written: 0, skipped: 'no_city' };
  }

  // ── Sub-sample very long paths ───────────────────────────────────────────
  // For a typical 5km route at ~25m vertex spacing this is a no-op (path
  // length < MAX_SEGMENTS_PER_ROUTE + 1). For dense GIS imports we walk in
  // strides of `step` so the OUTPUT count stays ≤ MAX_SEGMENTS_PER_ROUTE.
  // The first and last vertex are always preserved so the broadcast covers
  // the full route corridor end-to-end.
  const path = route.path;
  const segmentCount = path.length - 1;
  const step = Math.max(1, Math.ceil(segmentCount / MAX_SEGMENTS_PER_ROUTE));

  const sampledPairs: Array<[[number, number], [number, number]]> = [];
  for (let i = 0; i < segmentCount; i += step) {
    const a = path[i];
    // Bind the trailing vertex of each stride to the next stride's start
    // (or the final vertex on the last iteration) so the broadcast covers
    // the full corridor without gaps.
    const bIdx = Math.min(i + step, path.length - 1);
    const b = path[bIdx];
    if (
      Array.isArray(a) && Array.isArray(b) &&
      typeof a[0] === 'number' && typeof a[1] === 'number' &&
      typeof b[0] === 'number' && typeof b[1] === 'number' &&
      Number.isFinite(a[0]) && Number.isFinite(a[1]) &&
      Number.isFinite(b[0]) && Number.isFinite(b[1])
    ) {
      sampledPairs.push([a as [number, number], b as [number, number]]);
    }
  }

  if (sampledPairs.length === 0) {
    return { written: 0, skipped: 'no_path' };
  }

  // ── Wipe any previous broadcast for this route, then write fresh ─────────
  // We delete first so a path edit (e.g. admin redrew a section) cannot
  // leave orphan segments at the old geometry. The two-step write costs an
  // extra round trip but keeps the segments collection a true mirror of
  // the current published path.
  try {
    await deleteOfficialRouteSegments(route.id);
  } catch (err) {
    console.warn(
      `[OfficialBroadcaster] Pre-broadcast cleanup failed for ${route.id}; continuing.`,
      err,
    );
  }

  const segmentsRef = collection(db, 'street_segments');
  const authorityId = route.authorityId ?? null;
  let written = 0;

  try {
    for (let i = 0; i < sampledPairs.length; i += FIRESTORE_BATCH_SIZE) {
      const batch = writeBatch(db);
      const slice = sampledPairs.slice(i, i + FIRESTORE_BATCH_SIZE);
      slice.forEach(([a, b], localIdx) => {
        const docId = `official_${route.id}_seg_${i + localIdx}`;
        batch.set(
          doc(segmentsRef, docId),
          buildSegmentDoc(route.id, cityName, authorityId, a, b),
        );
      });
      await batch.commit();
      written += slice.length;
    }
    console.log(
      `[OfficialBroadcaster] ✅ Broadcast ${written} segments for route "${route.name}" ` +
        `(id=${route.id}, city="${cityName}", scored=${OFFICIAL_SEGMENT_SCORE})`,
    );
    return { written };
  } catch (err) {
    console.error(
      `[OfficialBroadcaster] ❌ Broadcast failed for ${route.id}:`,
      err,
    );
    return { written, skipped: 'error' };
  }
}

/**
 * Convenience: broadcast a list of routes sequentially. Errors on individual
 * routes are logged but DO NOT abort the whole list — partial success is
 * better than all-or-nothing because the original `saveRoutes` write has
 * already committed and we can't roll it back.
 */
export async function broadcastRoutesToStreetSegments(
  routes: Route[],
  options: { respectPublishedFlag?: boolean } = {},
): Promise<{ totalWritten: number; routesProcessed: number }> {
  let totalWritten = 0;
  let routesProcessed = 0;
  for (const route of routes) {
    try {
      const result = await broadcastRouteToStreetSegments(route, options);
      totalWritten += result.written;
      routesProcessed += 1;
    } catch (err) {
      console.error(
        `[OfficialBroadcaster] Unexpected error broadcasting "${route.name}":`,
        err,
      );
    }
  }
  return { totalWritten, routesProcessed };
}

/**
 * Delete every `street_segments` doc whose `officialRouteId === routeId`.
 * Used when a route is deleted, rejected, or about to be re-broadcast.
 *
 * Single-field equality query → no composite index needed; Firestore's
 * automatic single-field index covers it.
 */
export async function deleteOfficialRouteSegments(routeId: string): Promise<number> {
  if (!routeId) return 0;
  try {
    const q = query(
      collection(db, 'street_segments'),
      where('officialRouteId', '==', routeId),
    );
    const snap = await getDocs(q);
    if (snap.empty) return 0;

    let deleted = 0;
    for (let i = 0; i < snap.docs.length; i += FIRESTORE_BATCH_SIZE) {
      const batch = writeBatch(db);
      const slice = snap.docs.slice(i, i + FIRESTORE_BATCH_SIZE);
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += slice.length;
    }
    if (deleted > 0) {
      console.log(
        `[OfficialBroadcaster] 🧹 Deleted ${deleted} street_segments for routeId=${routeId}`,
      );
    }
    return deleted;
  } catch (err) {
    console.error(
      `[OfficialBroadcaster] Failed to delete segments for routeId=${routeId}:`,
      err,
    );
    return 0;
  }
}

/**
 * Bulk delete: convenience wrapper for `bulkDeleteRoutes` and
 * `deleteAllRoutesByAuthority`. Sequential so we don't spike Firestore.
 */
export async function deleteOfficialRouteSegmentsForMany(
  routeIds: string[],
): Promise<number> {
  let total = 0;
  for (const id of routeIds) {
    total += await deleteOfficialRouteSegments(id);
  }
  return total;
}
