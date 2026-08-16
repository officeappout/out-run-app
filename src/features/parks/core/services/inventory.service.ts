import { db } from '@/lib/firebase';
import {
    collection,
    getDoc,
    getDocs,
    writeBatch,
    doc,
    query,
    where,
    orderBy,
    limit,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { Route } from '../types/route.types';
import { MapFacility } from '../types/facility.types';
import { normalizeStoredRoutePath } from '../utils/routePath';
import { getParksByAuthority } from './parks.service';
import {
    broadcastRouteToStreetSegments,
    broadcastRoutesToStreetSegments,
    deleteOfficialRouteSegments,
    deleteOfficialRouteSegmentsForMany,
} from './official-route-broadcaster';
import { IS_ROUTE_ADJACENCY_ENABLED } from '@/config/feature-flags';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { buildValidatedDoc, stripUndefined } from '@/lib/route-collections';

// ── Facilities client cache (stale-while-revalidate, localStorage, 6h TTL) ──
// Mirrors parks.service.ts's fetchRealParks/_inflightParksFetch pattern —
// same shape, same TTL, for the same reason: `fetchFacilities()` with no args
// hits the whole unscoped national `facilities` collection, and until now had
// no cache at all (unlike parks). Facilities are deliberately NOT scoped by
// authority (David's product call — users want to see ALL facilities on the
// map, see map-stability-oom.md §6), so caching the whole collection is the
// fix, not scoping it. See .claude/plans/cryptic-munching-gadget.md.
const FACILITIES_CACHE_KEY = 'outfit_cached_facilities';
const FACILITIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface FacilitiesCacheEntry {
    data: MapFacility[];
    cachedAt: number;
}

function readFacilitiesFromStorage(): MapFacility[] | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(FACILITIES_CACHE_KEY);
        if (!raw) return null;
        const parsed: FacilitiesCacheEntry = JSON.parse(raw);
        if (Date.now() - parsed.cachedAt > FACILITIES_CACHE_TTL_MS) return null;
        return parsed.data;
    } catch {
        return null;
    }
}

function writeFacilitiesToStorage(facilities: MapFacility[]): void {
    if (typeof window === 'undefined') return;
    try {
        const entry: FacilitiesCacheEntry = { data: facilities, cachedAt: Date.now() };
        localStorage.setItem(FACILITIES_CACHE_KEY, JSON.stringify(entry));
    } catch {
        // Storage quota exceeded or private browsing — non-fatal
    }
}

let _inflightFacilitiesFetch: Promise<MapFacility[]> | null = null;

function fetchAndCacheAllFacilities(): Promise<MapFacility[]> {
    if (_inflightFacilitiesFetch) return _inflightFacilitiesFetch;
    _inflightFacilitiesFetch = getDocs(collection(db, 'facilities'))
        .then((snapshot) => {
            const fresh = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as MapFacility));
            writeFacilitiesToStorage(fresh);
            return fresh;
        })
        .finally(() => { _inflightFacilitiesFetch = null; });
    return _inflightFacilitiesFetch;
}

/** Summary of an import batch for the management UI */
export interface ImportBatchSummary {
    batchId: string;
    sourceName: string;
    count: number;
    createdAt: Date | null;
    authorityId?: string;
}

// stripUndefined moved to src/lib/route-collections/validate.ts (Stage 1B) —
// imported above. Same implementation, shared instead of duplicated.

/**
 * The set of real authority doc ids, for buildValidatedDoc's "authorityId is
 * a REAL authority, not just a non-empty string" check. getAllAuthorities()
 * is already module-level-cached (authority.service.ts) — no extra caching
 * needed here.
 */
async function getKnownAuthorityIds(): Promise<Set<string>> {
    const authorities = await getAllAuthorities();
    return new Set(authorities.map((a) => a.id));
}

/**
 * Compute total distance in meters from a path of [lng, lat] coordinates
 * using the Haversine formula.
 */
function computePathDistanceMeters(path: [number, number][]): number {
    if (!path || path.length < 2) return 0;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const [lng1, lat1] = path[i - 1];
        const [lng2, lat2] = path[i];
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        total += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return Math.round(total);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function routePassesNearPoint(
    route: Route,
    destLat: number,
    destLng: number,
    thresholdKm = 1.5,
): boolean {
    if (!route.path || route.path.length < 2) return false;
    const indices = [0, Math.floor(route.path.length / 2), route.path.length - 1];
    return indices.some((i) => {
        const [lng, lat] = route.path[i];
        return haversineKm(lat, lng, destLat, destLng) < thresholdKm;
    });
}

let _officialCache: Route[] | null = null;

/** Split an array into chunks of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

export async function getCachedOfficialRoutes(): Promise<Route[]> {
    if (!_officialCache) _officialCache = await InventoryService.fetchOfficialRoutes(undefined, true);
    return _officialCache;
}

/** Invalidate the in-memory official-routes cache so the next read re-fetches from Firestore. */
export function invalidateOfficialRoutesCache(): void {
    _officialCache = null;
}

/**
 * Precompute net for `route_adjacency` candidate detection — deliberately
 * WIDER than the real connector-length reject cap (CONNECTOR_REJECT_METERS
 * = 650m in route-generator.service.ts's chain assembly, raised 15.08.2026
 * from 300m — see that constant's comment). A candidate edge here only
 * means "close enough to be worth trying a real Mapbox connector for" — the
 * actual accept/reject decision always happens later, against the REAL
 * routed connector's length, never this straight-line proxy alone. Raised
 * 500m -> 1000m alongside the cap, keeping roughly the same ~1.5-1.7x
 * margin (real street distance is consistently longer than straight-line —
 * verified: Park HaMesila<->Charles Clore measured 374m straight-line vs.
 * 554-1301m real-walked, depending on approach direction) so a candidate
 * near the new 650m cap doesn't get pre-filtered out before ever getting a
 * real connector attempt.
 */
const ROUTE_ADJACENCY_DETECTION_THRESHOLD_METERS = 1000;

/**
 * Phase 2 of the corridor-following engine
 * (.claude/plans/build-the-phase-0-noble-kahn.md): full per-city recompute
 * of the `route_adjacency` collection — replaces (not incrementally
 * patches) every edge for `cityName` with a freshly computed set. Simpler
 * and always-correct at this data scale (189 official_routes total) versus
 * tracking incremental deltas; `official_routes.path` is immutable
 * post-creation (verified, RouteEditor's updateRoute strips `path` from
 * updates) so only create/delete needs to trigger this, never an edit.
 *
 * Fire-and-forget from every real `official_routes` mutator below (both
 * create and delete sides) — never awaited by the caller, matching the
 * existing `broadcastRouteToStreetSegments`/`deleteOfficialRouteSegments*`
 * fire-and-forget convention right next to each call site.
 */
export async function recomputeRouteAdjacencyForCity(cityName: string | undefined | null): Promise<{ edgesWritten: number }> {
    if (!cityName) return { edgesWritten: 0 };
    try {
        const { computeCorridorAdjacency } = await import('./route-adjacency.service');

        const routesSnap = await getDocs(
            query(collection(db, 'official_routes'), where('city', '==', cityName), where('published', '==', true)),
        );
        const corridors: Array<{ id: string; path: [number, number][] }> = [];
        for (const d of routesSnap.docs) {
            const data = d.data();
            const rawPath = data.path;
            if (!Array.isArray(rawPath) || rawPath.length < 2) continue;
            const path = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]);
            corridors.push({ id: d.id, path });
        }

        const edges = computeCorridorAdjacency(corridors, ROUTE_ADJACENCY_DETECTION_THRESHOLD_METERS);

        const existingSnap = await getDocs(query(collection(db, 'route_adjacency'), where('cityName', '==', cityName)));
        const batch = writeBatch(db);
        for (const d of existingSnap.docs) batch.delete(d.ref);
        for (const edge of edges) {
            const edgeId = [edge.routeIdA, edge.routeIdB].sort().join('_');
            batch.set(doc(db, 'route_adjacency', edgeId), {
                routeIdA: edge.routeIdA,
                routeIdB: edge.routeIdB,
                contactA: edge.contactA,
                contactB: edge.contactB,
                gapMeters: edge.gapMeters,
                cityName,
                updatedAt: serverTimestamp(),
            });
        }
        await batch.commit();

        console.log(`[route-adjacency] Recomputed "${cityName}": ${corridors.length} corridors → ${edges.length} candidate edges`);
        return { edgesWritten: edges.length };
    } catch (error) {
        console.warn('[route-adjacency] recomputeRouteAdjacencyForCity failed (non-fatal):', error);
        return { edgesWritten: 0 };
    }
}

/**
 * Fire-and-forget helper for the 8 real `official_routes` mutation sites
 * below — dedupes city names and kicks off `recomputeRouteAdjacencyForCity`
 * for each without blocking the caller. Gated on IS_ROUTE_ADJACENCY_ENABLED
 * so this is a true no-op (not even the dedupe/import cost) while the flag
 * is off.
 */
function recomputeAdjacencyForCities(cityNames: Array<string | undefined | null>): void {
    if (!IS_ROUTE_ADJACENCY_ENABLED) return;
    const distinct = Array.from(new Set(cityNames.filter((c): c is string => !!c)));
    for (const cityName of distinct) {
        recomputeRouteAdjacencyForCity(cityName).catch((err) => {
            console.warn('[route-adjacency] recomputeAdjacencyForCities failed (non-fatal):', err);
        });
    }
}

export const InventoryService = {
    /**
     * Save multiple facilities to Firestore.
     * Each facility object may carry an `authorityId` for multi-tenancy.
     * An optional `defaultAuthorityId` is merged into any facility that omits its own.
     */
    saveFacilities: async (facilities: MapFacility[], defaultAuthorityId?: string) => {
        try {
            const facilitiesRef = collection(db, 'facilities');

            for (let i = 0; i < facilities.length; i += 500) {
                const batch = writeBatch(db);
                facilities.slice(i, i + 500).forEach((f) => {
                const newDocRef = doc(facilitiesRef);
                    batch.set(newDocRef, stripUndefined({
                    ...f,
                    authorityId: f.authorityId ?? defaultAuthorityId ?? null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                    }));
                });
            await batch.commit();
            }

            console.log(`✅ Saved ${facilities.length} facilities to Firestore`);
            return true;
        } catch (error) {
            console.error('❌ Error saving facilities:', error);
            throw error;
        }
    },

    /**
     * Fetch facilities from Firestore.
     * Scoped by tenantId (preferred) or authorityId (legacy fallback).
     * Without either, all facilities are returned (super-admin view).
     */
    fetchFacilities: async (authorityId?: string, tenantId?: string): Promise<MapFacility[]> => {
        try {
            const facilitiesRef = collection(db, 'facilities');
            let q;
            if (tenantId) {
                q = query(facilitiesRef, where('tenantId', '==', tenantId));
            } else if (authorityId) {
                q = query(facilitiesRef, where('authorityId', '==', authorityId));
            } else {
                q = facilitiesRef;
            }
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(d => ({
                ...d.data(),
                id: d.id
            } as MapFacility));
        } catch (error) {
            console.error('❌ Error fetching facilities:', error);
            return [];
        }
    },

    /**
     * Cached whole-national-collection facilities fetch — stale-while-revalidate
     * via localStorage (6h TTL) + in-flight-dedup, same pattern as parks.service.ts's
     * fetchRealParks(). Use this instead of `fetchFacilities()` (no args) for any
     * caller that needs the WHOLE collection without authority scoping — that raw
     * call has no cache and re-hits Firestore for the whole collection every time.
     */
    fetchAllFacilitiesCached: async (): Promise<MapFacility[]> => {
        const cached = readFacilitiesFromStorage();
        if (cached) {
            // Return stale data instantly; refresh in background so concurrent
            // warm callers don't each fire a getDocs.
            fetchAndCacheAllFacilities().catch(() => { /* background refresh failure is non-fatal */ });
            return cached;
        }
        try {
            return await fetchAndCacheAllFacilities();
        } catch (error) {
            console.error('❌ Error fetching cached facilities:', error);
            return [];
        }
    },

    /**
     * Fetch facilities within a viewport bounding box — the LIVE MAP browse path.
     * Replaces the whole-national-collection getDocs (a dense-city OOM driver) so
     * facilities stream per-area as the user pans instead of all at once; the user
     * still sees every facility while exploring. Ranges server-side on the single
     * field `location.lat` (Firestore auto single-field index — NO composite index
     * to deploy) and filters `location.lng` client-side, capped by `max`.
     *
     * ⚠️ Precision/limits: Firestore ranges on ONE field only, so lat is bounded
     * server-side and lng client-side; docs with a missing/non-numeric
     * `location.lat` are excluded by the range (they don't render anyway). With
     * `limit(max)` an implicit orderBy(location.lat) applies, so a viewport holding
     * >max facilities would clip its northern edge — `max` is generous to avoid it.
     * A true 2-D bounds query (lat AND lng both server-bounded) needs a geohash
     * field + index on `facilities` (not present today) — that is the follow-up for
     * full-fidelity bounds-fetch.
     */
    fetchFacilitiesInBounds: async (
        bounds: { swLat: number; neLat: number; swLng: number; neLng: number },
        max = 400,
    ): Promise<MapFacility[]> => {
        try {
            const facilitiesRef = collection(db, 'facilities');
            const q = query(
                facilitiesRef,
                where('location.lat', '>=', bounds.swLat),
                where('location.lat', '<=', bounds.neLat),
                limit(max),
            );
            const snap = await getDocs(q);
            return snap.docs
                .map((d) => ({ ...d.data(), id: d.id } as MapFacility))
                .filter(
                    (f) =>
                        !!f.location &&
                        Number.isFinite(f.location.lng) &&
                        f.location.lng >= bounds.swLng &&
                        f.location.lng <= bounds.neLng,
                );
        } catch (error) {
            console.error('❌ Error fetching facilities in bounds:', error);
            return [];
        }
    },

    /**
     * Save multiple routes to Firestore.
     * Handles chunking (500 per batch) and strips undefined fields.
     */
    saveRoutes: async (routes: Route[]) => {
        try {
            const routesRef = collection(db, 'official_routes');
            let saved = 0;

            // Stage 1B chokepoint: fetched once per call, not per-route.
            const knownAuthorityIds = await getKnownAuthorityIds();

            // Tracks the Firestore-assigned doc id for every successfully
            // prepared route. Used downstream to broadcast each route to
            // `street_segments` keyed by its REAL doc id (the in-memory
            // `r.id` field is often empty / placeholder for fresh routes).
            const persistedRoutes: Array<Route & { id: string }> = [];

            // Firestore batch limit is 500
            for (let i = 0; i < routes.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = routes.slice(i, i + 500);

                chunk.forEach((r, idx) => {
                    try {
                const newDocRef = doc(routesRef);
                const transformedPath = r.path.map(p => ({
                    lng: p[0],
                    lat: p[1]
                }));

                const distance = r.distance > 0 ? r.distance : computePathDistanceMeters(r.path);
                const durationEstimate = r.duration > 0
                    ? r.duration
                    : Math.round(distance / ((r.activityType === 'cycling' || r.type === 'cycling') ? 250 : 100));

                        // buildValidatedDoc strips undefineds internally — replaces the
                        // former bare stripUndefined() call. A validation failure here
                        // (e.g. no authorityId, an invalid difficulty) throws
                        // RouteDocValidationError, caught below same as any other
                        // per-route prep error — this route is skipped, logged, and
                        // the rest of the batch proceeds.
                        const routeDoc = buildValidatedDoc('official_routes', {
                    ...r,
                    path: transformedPath,
                    distance,
                    duration: durationEstimate,
                            activityType: r.activityType || r.type,
                            activityTypes: r.activityTypes || [r.activityType || r.type],
                    createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }, { mode: 'create', knownAuthorityIds });

                        batch.set(newDocRef, routeDoc);

                        // Capture the route + its newly-assigned doc id with
                        // the ORIGINAL [lng,lat] path (not the {lat,lng}
                        // Firestore form) so the broadcaster can iterate
                        // pairs without an additional shape transform.
                        persistedRoutes.push({ ...r, id: newDocRef.id });
                    } catch (innerErr) {
                        console.error(`❌ Error preparing route #${i + idx} ("${r.name}"):`, innerErr, r);
                    }
            });

            await batch.commit();
                saved += chunk.length;
            }

            console.log(`✅ Saved ${saved} routes to official_routes collection`);
            invalidateOfficialRoutesCache();

            // ── Broadcast to street_segments ────────────────────────────────
            // Each saved route now becomes a top-priority waypoint corridor
            // for the dynamic generator. Failure here is non-fatal — the
            // primary save already succeeded, so we log and move on rather
            // than rolling back the user's hard-won admin work. Fire and
            // forget so the admin's UI doesn't wait on a multi-second
            // segment-write storm before returning.
            broadcastRoutesToStreetSegments(persistedRoutes)
                .then(({ totalWritten, routesProcessed }) => {
                    console.log(
                        `📡 Broadcast ${totalWritten} segments across ${routesProcessed} routes to street_segments.`,
                    );
                })
                .catch((err) => {
                    console.warn('[InventoryService] Broadcast to street_segments failed (non-fatal):', err);
                });
            recomputeAdjacencyForCities(persistedRoutes.map((r) => r.city));

            return true;
        } catch (error) {
            console.error('❌ Error saving routes:', error);
            throw error;
        }
    },

    /**
     * Fetch all official routes from Firestore.
     * If authorityIds are provided, only returns routes associated with parks in those authorities.
     *
     * @param publishedOnly  When true (default for app), filters out unpublished/pending routes.
     *                       Admin inventory passes false to see all routes including pending.
     */
    fetchOfficialRoutes: async (authorityIds?: string[], publishedOnly = false): Promise<Route[]> => {
        const normalise = (docSnap: any): Route | null => {
            const data = docSnap.data();
            if (publishedOnly && data.published === false) return null;
            // Shared stored-path normaliser (handles {lng,lat} objects + [lng,lat]
            // tuples, drops non-finite points) — single source of truth.
            const path = normalizeStoredRoutePath(data.path);
            if (path.length < 2) return null;
            return { ...data, id: docSnap.id, path } as Route;
        };

        try {
            if (authorityIds && authorityIds.length > 0) {
                // Authority-manager path: only fetch routes belonging to their
                // own authorities using Firestore `where('authorityId', 'in', …)`.
                // Firestore limits 'in' to 30 values per query, so we batch.
                const BATCH_SIZE = 30;
                const snapshots = await Promise.all(
                    chunk(authorityIds, BATCH_SIZE).map((batch) =>
                        getDocs(
                            query(
                                collection(db, 'official_routes'),
                                where('authorityId', 'in', batch),
                            ),
                        ),
                    ),
                );
                return snapshots
                    .flatMap((snap) => snap.docs)
                    .map(normalise)
                    .filter((r): r is Route => r !== null);
            } else {
                // Super-admin path: full collection, capped at 200 to avoid
                // transferring unbounded geometry data in a single request.
                const querySnapshot = await getDocs(
                    query(collection(db, 'official_routes'), limit(200)),
                );
                return querySnapshot.docs.map(normalise).filter((r): r is Route => r !== null);
            }
        } catch (error) {
            console.error('❌ Error fetching official routes:', error);
            return [];
        }
    },

    /**
     * Fetch all import batches grouped by importBatchId
     */
    fetchImportBatches: async (): Promise<ImportBatchSummary[]> => {
        try {
            const querySnapshot = await getDocs(collection(db, 'official_routes'));
            const batchMap = new Map<string, ImportBatchSummary>();

            querySnapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const batchId = data.importBatchId as string | undefined;
                if (!batchId) return; // skip routes without a batch ID (manual routes, legacy)

                if (batchMap.has(batchId)) {
                    batchMap.get(batchId)!.count++;
                } else {
                    batchMap.set(batchId, {
                        batchId,
                        sourceName: (data.importSourceName as string) || batchId,
                        count: 1,
                        createdAt: data.createdAt?.toDate?.() || null,
                        authorityId: data.authorityId as string | undefined,
                    });
                }
            });

            return Array.from(batchMap.values()).sort(
                (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
            );
        } catch (error) {
            console.error('❌ Error fetching import batches:', error);
            return [];
        }
    },

    /**
     * Delete all routes belonging to a specific importBatchId
     */
    deleteImportBatch: async (batchId: string): Promise<number> => {
        try {
            const q = query(
                collection(db, 'official_routes'),
                where('importBatchId', '==', batchId)
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) return 0;

            // Capture ids BEFORE the delete so the broadcast cleanup can
            // still match by `officialRouteId == X` — once the docs are
            // gone we'd lose the reference list.
            const deletedIds = snapshot.docs.map((d) => d.id);
            const deletedCities = snapshot.docs.map((d) => d.data().city);

            // Firestore batch limit is 500, so chunk if needed
            const docs = snapshot.docs;
            let deleted = 0;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deleted += chunk.length;
            }

            console.log(`✅ Deleted ${deleted} routes from batch "${batchId}"`);

            deleteOfficialRouteSegmentsForMany(deletedIds).catch((err) => {
                console.warn('[InventoryService] Batch-delete broadcast cleanup failed (non-fatal):', err);
            });
            recomputeAdjacencyForCities(deletedCities);

            return deleted;
        } catch (error) {
            console.error('❌ Error deleting import batch:', error);
            throw error;
        }
    },

    /**
     * Bulk-assign authorityId + city to routes that currently lack an authorityId.
     * If batchId is provided, only affects that batch; otherwise affects ALL unassigned routes.
     */
    bulkAssignAuthority: async (
        authorityId: string,
        cityName: string,
        batchId?: string
    ): Promise<number> => {
        try {
            const routesRef = collection(db, 'official_routes');
            const snapshot = await getDocs(routesRef);

            // Filter docs that need updating
            const toUpdate = snapshot.docs.filter(d => {
                const data = d.data();
                const hasNoAuthority = !data.authorityId;
                const matchesBatch = batchId ? data.importBatchId === batchId : true;
                return hasNoAuthority && matchesBatch;
            });

            if (toUpdate.length === 0) return 0;

            let updated = 0;
            for (let i = 0; i < toUpdate.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = toUpdate.slice(i, i + 500);
                chunk.forEach(d => {
                    batch.update(d.ref, {
                        authorityId,
                        city: cityName,
                        updatedAt: serverTimestamp(),
                    });
                });
                await batch.commit();
                updated += chunk.length;
            }

            console.log(`✅ Assigned authority "${cityName}" to ${updated} routes`);
            return updated;
        } catch (error) {
            console.error('❌ Error bulk-assigning authority:', error);
            throw error;
        }
    },

    /**
     * Delete ALL routes for a specific authority (official_routes + curated_routes).
     * Used for a clean re-upload / fresh start.
     */
    deleteAllRoutesByAuthority: async (authorityId: string): Promise<number> => {
        try {
            let totalDeleted = 0;

            // 1️⃣ Delete from official_routes
            const officialQ = query(
                collection(db, 'official_routes'),
                where('authorityId', '==', authorityId)
            );
            const officialSnap = await getDocs(officialQ);

            // Capture ids first — broadcast cleanup needs them to match
            // by `officialRouteId == X`, and these refs are about to die.
            const deletedOfficialIds = officialSnap.docs.map((d) => d.id);
            const deletedOfficialCities = officialSnap.docs.map((d) => d.data().city);

            for (let i = 0; i < officialSnap.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = officialSnap.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                totalDeleted += chunk.length;
            }

            // 2️⃣ Delete from curated_routes
            const curatedQ = query(
                collection(db, 'curated_routes'),
                where('authorityId', '==', authorityId)
            );
            const curatedSnap = await getDocs(curatedQ);
            for (let i = 0; i < curatedSnap.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = curatedSnap.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                totalDeleted += chunk.length;
            }

            console.log(`✅ Deleted ${totalDeleted} routes (official + curated) for authority "${authorityId}"`);

            deleteOfficialRouteSegmentsForMany(deletedOfficialIds).catch((err) => {
                console.warn('[InventoryService] Authority-wide broadcast cleanup failed (non-fatal):', err);
            });
            recomputeAdjacencyForCities(deletedOfficialCities);

            return totalDeleted;
        } catch (error) {
            console.error('❌ Error deleting routes by authority:', error);
            throw error;
        }
    },

    // ══════════════════════════════════════════════════
    // Curated Routes — pre-calculated onboarding routes
    // ══════════════════════════════════════════════════

    /**
     * Save curated routes to both `curated_routes` (fast lookup) AND `official_routes` (unified).
     * Handles chunking and strips undefined fields.
     */
    saveCuratedRoutes: async (routes: Route[]): Promise<boolean> => {
        try {
            // Stage 1B chokepoint: fetched once per call, not per-route/collection.
            const knownAuthorityIds = await getKnownAuthorityIds();

            // Helper to build a clean, validated Firestore document from a
            // route. `collectionName` matters — official_routes and
            // curated_routes are validated against their own schema even
            // though they share the same input shape here.
            const buildDoc = (r: Route, collectionName: 'curated_routes' | 'official_routes') => {
                const transformedPath = r.path.map(p => ({ lng: p[0], lat: p[1] }));
                return buildValidatedDoc(collectionName, {
                    ...r,
                    path: transformedPath,
                    activityType: r.activityType || r.type,
                    isInfrastructure: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { mode: 'create', knownAuthorityIds });
            };

            // 1️⃣ Save to curated_routes collection (indexed by authorityId for instant fetch)
            const curatedRef = collection(db, 'curated_routes');
            for (let i = 0; i < routes.length; i += 500) {
                const batch = writeBatch(db);
                routes.slice(i, i + 500).forEach(r => batch.set(doc(curatedRef), buildDoc(r, 'curated_routes')));
                await batch.commit();
            }

            // 2️⃣ Also save to official_routes (so they appear in inventory)
            // Capture each route's official_routes doc id so the broadcaster
            // below uses the canonical Firestore id (consistent with what
            // fetchOfficialRoutes returns to the client).
            const officialRef = collection(db, 'official_routes');
            const persistedRoutes: Array<Route & { id: string }> = [];
            for (let i = 0; i < routes.length; i += 500) {
                const batch = writeBatch(db);
                routes.slice(i, i + 500).forEach(r => {
                    const ref = doc(officialRef);
                    batch.set(ref, buildDoc(r, 'official_routes'));
                    persistedRoutes.push({ ...r, id: ref.id });
                });
                await batch.commit();
            }

            console.log(`✅ Saved ${routes.length} curated routes to both collections`);
            invalidateOfficialRoutesCache();

            // ── Broadcast curated routes to street_segments ─────────────────
            // Curated routes are auto-published from the moment they land,
            // so they go through the same broadcast path as super-admin saves
            // (see saveRoutes for the full rationale). Fire-and-forget so the
            // curated-generation flow doesn't block on segment writes.
            broadcastRoutesToStreetSegments(persistedRoutes)
                .then(({ totalWritten, routesProcessed }) => {
                    console.log(
                        `📡 Broadcast ${totalWritten} curated segments across ${routesProcessed} routes.`,
                    );
                })
                .catch((err) => {
                    console.warn('[InventoryService] Curated broadcast failed (non-fatal):', err);
                });
            recomputeAdjacencyForCities(persistedRoutes.map((r) => r.city));

            return true;
        } catch (error) {
            console.error('❌ Error saving curated routes:', error);
            throw error;
        }
    },

    /**
     * Fetch curated routes for a specific authority — ultra-fast (<1s).
     * Used by onboarding to instantly show 3 stitched experience routes.
     *
     * @param publishedOnly  When true (default), only returns routes where
     *                       published !== false. Set to false for admin views
     *                       that need to show pending routes too.
     */
    fetchCuratedRoutesByAuthority: async (
        authorityId: string,
        publishedOnly = true,
    ): Promise<Route[]> => {
        try {
            const q = query(
                collection(db, 'curated_routes'),
                where('authorityId', '==', authorityId),
                orderBy('curatedTier')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data();
                    // Filter out unpublished routes for app-side requests
                    if (publishedOnly && data.published === false) return null;
                    // Null-safe path handling
                    const rawPath = data.path;
                    if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
                    const path = rawPath.map(
                        (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]
                    );
                    return {
                        ...data,
                        id: docSnap.id,
                        path,
                        // Null-safe numeric fields
                        distance: typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0,
                        rating: typeof data.rating === 'number' && !isNaN(data.rating) ? data.rating : 0,
                        duration: typeof data.duration === 'number' && !isNaN(data.duration) ? data.duration : 0,
                        score: typeof data.score === 'number' && !isNaN(data.score) ? data.score : 0,
                    } as Route;
                })
                .filter((r): r is Route => r !== null);
        } catch (error) {
            console.error('❌ Error fetching curated routes:', error);
            return [];
        }
    },

    /**
     * Fetch raw infrastructure segments for a specific authority.
     * Used by the stitching engine on the admin side.
     */
    fetchInfrastructureByAuthority: async (authorityId: string): Promise<Route[]> => {
        try {
            const q = query(
                collection(db, 'official_routes'),
                where('authorityId', '==', authorityId),
                where('isInfrastructure', '==', true)
            );
            const snapshot = await getDocs(q);
            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data();
                    // Null-safe path handling
                    const rawPath = data.path;
                    if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
                    const path = rawPath.map(
                        (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]
                    );
                    return {
                        ...data,
                        id: docSnap.id,
                        path,
                        // Null-safe numeric fields
                        distance: typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0,
                        rating: typeof data.rating === 'number' && !isNaN(data.rating) ? data.rating : 0,
                    } as Route;
                })
                .filter((r): r is Route => r !== null);
        } catch (error) {
            console.error('❌ Error fetching infrastructure:', error);
            return [];
        }
    },

    /**
     * Calculate total infrastructure stats for an authority (total KM, segment count).
     *
     * IMPORTANT: Computes distance from path coordinates (Haversine) — NOT from the
     * stored `distance` field — because GIS imports may use inconsistent units.
     * Uses a fresh Set on every call to prevent double-counting across re-renders.
     */
    fetchInfrastructureStats: async (authorityId: string): Promise<{ totalKm: number; segmentCount: number }> => {
        // Reset everything — fresh calculation each time
        let totalKm = 0;
        const seen = new Set<string>();

        try {
            const routes = await InventoryService.fetchInfrastructureByAuthority(authorityId);

            for (const r of routes) {
                const key = r.id || `${r.name}_${r.path?.length}`;
                if (seen.has(key)) continue;
                seen.add(key);

                // Compute distance from actual path coordinates, not stored field
                if (r.path && r.path.length >= 2) {
                    let segmentMeters = 0;
                    for (let i = 1; i < r.path.length; i++) {
                        const [lng1, lat1] = r.path[i - 1];
                        const [lng2, lat2] = r.path[i];
                        const R = 6371e3;
                        const p1 = (lat1 * Math.PI) / 180;
                        const p2 = (lat2 * Math.PI) / 180;
                        const dp = ((lat2 - lat1) * Math.PI) / 180;
                        const dl = ((lng2 - lng1) * Math.PI) / 180;
                        const a =
                            Math.sin(dp / 2) ** 2 +
                            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
                        segmentMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    }
                    totalKm += segmentMeters / 1000;
                }
            }

            return { totalKm: Math.round(totalKm * 10) / 10, segmentCount: seen.size };
        } catch (error) {
            console.error('❌ Error fetching infrastructure stats:', error);
            return { totalKm: 0, segmentCount: 0 };
        }
    },

    /**
     * Fetch ALL routes (official + curated) for a specific authority by
     * directly querying the `authorityId` field.
     * Unlike fetchOfficialRoutes(), this works for manually-drawn routes
     * and seeded routes that have no `visitingParkId`.
     *
     * Used by the Authority Manager routes list page.
     * Returns both pending and published routes so the admin can see all their tracks.
     */
    fetchRoutesByAuthorityId: async (authorityId: string): Promise<Route[]> => {
        try {
            const q = query(
                collection(db, 'official_routes'),
                where('authorityId', '==', authorityId)
            );
            const snapshot = await getDocs(q);

            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data();
                    const rawPath = data.path;
                    if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
                    const path = rawPath.map(
                        (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]
                    );
                    return {
                        ...data,
                        id: docSnap.id,
                        path,
                        distance: typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0,
                        rating:   typeof data.rating   === 'number' && !isNaN(data.rating)   ? data.rating   : 0,
                        duration: typeof data.duration === 'number' && !isNaN(data.duration) ? data.duration : 0,
                    } as Route;
                })
                .filter((r): r is Route => r !== null);
        } catch (error) {
            console.error('❌ Error fetching routes by authorityId:', error);
            return [];
        }
    },

    /**
     * Update metadata fields on an existing route.
     * Does NOT touch path geometry — only name, description, difficulty, activityType, etc.
     */
    updateRoute: async (routeId: string, data: Partial<Route>): Promise<void> => {
        try {
            const { id, path, createdAt, ...rest } = data as any;

            // Stage 1B chokepoint, UPDATE mode — grandfather clause: fetch the
            // existing doc's authorityId/city so buildValidatedDoc can tell a
            // legacy authority-less doc (existing value empty — no lock, this
            // update must not be blocked just because a route predates this
            // rule) from one that already had a resolved authority (existing
            // value set — locked, can't silently change). If the doc doesn't
            // exist, `existing` is empty — updateDoc below will fail on its
            // own with Firestore's own not-found error either way.
            const existingSnap = await getDoc(doc(db, 'official_routes', routeId));
            const existingData = existingSnap.exists() ? existingSnap.data() : {};
            const knownAuthorityIds = await getKnownAuthorityIds();

            const payload = buildValidatedDoc('official_routes', {
                ...rest,
                updatedAt: serverTimestamp(),
            }, {
                mode: 'update',
                knownAuthorityIds,
                existing: { authorityId: existingData?.authorityId, city: existingData?.city },
            });
            await updateDoc(doc(db, 'official_routes', routeId), payload);
        } catch (error) {
            console.error('❌ Error updating route:', error);
            throw error;
        }
    },

    /**
     * Fetch a single route by its document ID.
     */
    getRouteById: async (routeId: string): Promise<Route | null> => {
        try {
            const docRef = doc(db, 'official_routes', routeId);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return null;
            const data = docSnap.data();
            const rawPath = data.path;
            if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
            const path = rawPath.map(
                (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]
            );
            return { ...data, id: docSnap.id, path } as Route;
        } catch (error) {
            console.error('❌ Error fetching route by ID:', error);
            return null;
        }
    },

    /**
     * Approve a pending route — sets published:true + status:'published'.
     * Also mirrors the update to curated_routes if the doc exists there too.
     */
    approveRoute: async (routeId: string): Promise<void> => {
        try {
            const payload = {
                published: true,
                status: 'published',
                publishedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            await updateDoc(doc(db, 'official_routes', routeId), payload);
            invalidateOfficialRoutesCache();

            // ── Broadcast on publish ───────────────────────────────────────
            // Pending routes were SKIPPED by the broadcaster on save (the
            // `published === false` guard). Now that the admin has approved
            // them they need to enter the dynamic generator's pool. Fetch
            // the freshly-published route and broadcast it.
            const route = await InventoryService.getRouteById(routeId);
            if (route) {
                broadcastRouteToStreetSegments(route)
                    .then((res) => {
                        console.log(
                            `📡 Approve broadcast: ${res.written} segments for route ${routeId} (${res.skipped ?? 'ok'}).`,
                        );
                    })
                    .catch((err) => {
                        console.warn('[InventoryService] Approve broadcast failed (non-fatal):', err);
                    });
                recomputeAdjacencyForCities([route.city]);
            }
        } catch (error) {
            console.error('❌ Error approving route:', error);
            throw error;
        }
    },

    /**
     * Reject / un-publish a route — sets published:false + status:'pending'.
     */
    rejectRoute: async (routeId: string): Promise<void> => {
        try {
            await updateDoc(doc(db, 'official_routes', routeId), {
                published: false,
                status: 'pending',
                updatedAt: serverTimestamp(),
            });
            invalidateOfficialRoutesCache();

            // ── Pull broadcast on reject ───────────────────────────────────
            // Rejected routes must NOT keep feeding the dynamic generator.
            // Best-effort delete; orphans are harmless (they just keep
            // showing up as score-10 candidates) but worth cleaning up.
            deleteOfficialRouteSegments(routeId).catch((err) => {
                console.warn('[InventoryService] Reject cleanup failed (non-fatal):', err);
            });
            if (IS_ROUTE_ADJACENCY_ENABLED) {
                InventoryService.getRouteById(routeId).then((route) => {
                    if (route) recomputeAdjacencyForCities([route.city]);
                });
            }
        } catch (error) {
            console.error('❌ Error rejecting route:', error);
            throw error;
        }
    },

    /**
     * Delete multiple routes by their document IDs.
     */
    bulkDeleteRoutes: async (routeIds: string[]): Promise<number> => {
        if (routeIds.length === 0) return 0;
        try {
            // Only fetched when the flag is on — bulkDeleteRoutes otherwise never
            // reads these docs at all (blind-deletes by id), so this is pure
            // added cost gated on the same flag as the recompute it feeds.
            const deletedCities: Array<string | undefined> = IS_ROUTE_ADJACENCY_ENABLED
                ? await Promise.all(routeIds.map(async (id) => (await InventoryService.getRouteById(id))?.city))
                : [];

            let deleted = 0;
            for (let i = 0; i < routeIds.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = routeIds.slice(i, i + 500);
                chunk.forEach(id => batch.delete(doc(db, 'official_routes', id)));
                await batch.commit();
                deleted += chunk.length;
            }
            console.log(`✅ Bulk-deleted ${deleted} routes`);

            // Pull each deleted route's broadcast — fire-and-forget so the
            // admin UI returns immediately. Each deleteOfficialRouteSegments
            // is its own query+batch so a single bad id can't poison the
            // whole bulk.
            deleteOfficialRouteSegmentsForMany(routeIds).catch((err) => {
                console.warn('[InventoryService] Bulk-delete broadcast cleanup failed (non-fatal):', err);
            });
            recomputeAdjacencyForCities(deletedCities);

            return deleted;
        } catch (error) {
            console.error('❌ Error bulk-deleting routes:', error);
            throw error;
        }
    },

    /**
     * Delete ALL routes that have a specific city value.
     * Returns the number of deleted documents.
     */
    deleteRoutesByCity: async (city: string): Promise<number> => {
        try {
            const q = query(
                collection(db, 'official_routes'),
                where('city', '==', city),
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) return 0;

            // Capture ids before deletion for broadcast cleanup.
            const deletedIds = snapshot.docs.map((d) => d.id);

            let deleted = 0;
            for (let i = 0; i < snapshot.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deleted += chunk.length;
            }
            console.log(`✅ Deleted ${deleted} routes for city "${city}"`);

            deleteOfficialRouteSegmentsForMany(deletedIds).catch((err) => {
                console.warn('[InventoryService] City-wide broadcast cleanup failed (non-fatal):', err);
            });
            recomputeAdjacencyForCities([city]);

            return deleted;
        } catch (error) {
            console.error('❌ Error deleting routes by city:', error);
            throw error;
        }
    },

    /**
     * Recalculate distances for ALL routes in official_routes using Haversine
     * on the actual path geometry. Saves distance in **kilometers**.
     *
     * Returns { updated, skipped, errors } counts. Fires onProgress for UI feedback.
     */
    recalculateAllDistances: async (
        onProgress?: (done: number, total: number, current: string) => void,
    ): Promise<{ updated: number; skipped: number; errors: number }> => {
        const stats = { updated: 0, skipped: 0, errors: 0 };
        try {
            const snapshot = await getDocs(collection(db, 'official_routes'));
            const total = snapshot.docs.length;

            for (let i = 0; i < snapshot.docs.length; i++) {
                const docSnap = snapshot.docs[i];
                const data = docSnap.data();
                const rawPath = data.path;
                const routeName = (data.name as string) || docSnap.id;

                onProgress?.(i + 1, total, routeName);

                if (!Array.isArray(rawPath) || rawPath.length < 2) {
                    stats.skipped++;
                    continue;
                }

                const path: [number, number][] = rawPath.map(
                    (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0],
                );

                const distanceKm = computePathDistanceMeters(path) / 1000;
                const roundedKm = Math.round(distanceKm * 100) / 100;

                const activityType = (data.activityType || data.type || 'running') as string;
                const speedMpm = activityType === 'cycling' ? 250 : 100;
                const durationMinutes = Math.round((roundedKm * 1000) / speedMpm);

                try {
                    await updateDoc(docSnap.ref, {
                        distance: roundedKm,
                        duration: durationMinutes,
                        updatedAt: serverTimestamp(),
                    });
                    stats.updated++;
                } catch {
                    stats.errors++;
                }
            }

            console.log(`✅ Recalculated distances: ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`);
            return stats;
        } catch (error) {
            console.error('❌ Error recalculating distances:', error);
            throw error;
        }
    },

    /**
     * Delete all curated routes for an authority (before regenerating).
     */
    deleteCuratedRoutesByAuthority: async (authorityId: string): Promise<number> => {
        try {
            const q = query(
                collection(db, 'curated_routes'),
                where('authorityId', '==', authorityId)
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) return 0;

            let deleted = 0;
            for (let i = 0; i < snapshot.docs.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + 500);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
                deleted += chunk.length;
            }

            console.log(`✅ Deleted ${deleted} curated routes for authority "${authorityId}"`);
            return deleted;
        } catch (error) {
            console.error('❌ Error deleting curated routes:', error);
            throw error;
        }
    },
};
