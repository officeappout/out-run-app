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
    startAt,
    endAt,
    limit,
    updateDoc,
    serverTimestamp,
    arrayUnion,
} from 'firebase/firestore';
import { geohashQueryBounds } from 'geofire-common';
import { Route, type RouteFeatureTag } from '../types/route.types';
import { MapFacility } from '../types/facility.types';
import { normalizeStoredRoutePath } from '../utils/routePath';
import { getParksByAuthority } from './parks.service';
import {
    broadcastRouteToStreetSegments,
    broadcastRoutesToStreetSegments,
    deleteOfficialRouteSegments,
    deleteOfficialRouteSegmentsForMany,
} from './official-route-broadcaster';
import { IS_ROUTE_ADJACENCY_ENABLED, IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED, ROUTE_ENRICHMENT_PILOT_CITIES } from '@/config/feature-flags';
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
 * post-creation by default (RouteEditor's updateRoute strips `path` from
 * updates unless the caller opts in via `{ allowPathUpdate: true }` — see
 * route-editor-scoping-spec.md §3.5.6/§9.5) so only create/delete needs to
 * trigger this today, never an edit — a future path-editing caller that
 * skips the pending→re-approve cycle (route-editor-scoping-spec.md §10 Q1)
 * would need to add its own recompute call here too.
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
 * Fire-and-forget helper for the 10 real `official_routes` mutation sites
 * below (saveRoutes, saveCuratedRoutes, approveRoute, rejectRoute,
 * bulkDeleteRoutes, bulkApproveRoutes, bulkRejectRoutes, deleteRoutesByCity,
 * deleteImportBatch, deleteAllRoutesByAuthority — count corrected 17.08.2026,
 * Stage 3: the bulkApprove/bulkRejectRoutes pair was added in Stage 2 after
 * this comment was originally written) — dedupes city names and kicks off
 * `recomputeRouteAdjacencyForCity` for each without blocking the caller.
 * Gated on IS_ROUTE_ADJACENCY_ENABLED so this is a true no-op (not even the
 * dedupe/import cost) while the flag is off.
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

/**
 * Generous prefilter radius for the street_segments side of the enrichment
 * join — must exceed CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS (40m) by a
 * wide margin, same "prefilter radius >> real threshold" reasoning as
 * findCandidatePairsByGeohash's own 5000m default vs. its ~150-300m real
 * gap (route-adjacency.service.ts:118-128): the geohash box only needs to
 * rule out segments obviously far away, never approximate the real cutoff —
 * the precise findNearestAssociations pass does the actual filtering.
 */
const CLIMB_ROUTE_QUERY_RADIUS_METERS = 500;

/**
 * Stage 3 of the route-enrichment-pipeline plan (17.08.2026): full per-city
 * recompute of the climb_segments ↔ official_routes/street_segments spatial
 * join. Structural sibling of recomputeRouteAdjacencyForCity immediately
 * above — same "full replace, not incremental patch" strategy, same
 * fire-and-forget-from-every-mutator convention, same try/catch non-fatal
 * shape. Also doubles as the backfill entry point (Stage 3 Phase 3.3's
 * scripts/backfill-route-enrichment-tlv.ts calls this directly with
 * `{dryRun: true}`) — one implementation serves both the live dispatcher and
 * the one-time backfill, matching the adjacency engine's own history (its
 * original 88-edge backfill and its live per-mutation recompute are the same
 * function, not two).
 *
 * Query shape deliberately mirrors recomputeRouteAdjacencyForCity's proven
 * pattern rather than inventing a new one — see inline comments below for
 * where and why it diverges (climb_segments' authorityId guard; street_segments'
 * geohash-bounded query instead of a cityName filter, to sidestep that
 * collection's known cityName alias bug).
 */
export async function recomputeRouteEnrichmentForCity(
    cityName: string | undefined | null,
    opts?: { dryRun?: boolean },
): Promise<{
    climbsUpdated: number;
    routesUpdated: number;
    segmentsUpdated: number;
    pairings?: Array<{ climbId: string; targetId: string; targetType: 'route' | 'segment'; distanceMeters: number }>;
}> {
    if (!cityName) return { climbsUpdated: 0, routesUpdated: 0, segmentsUpdated: 0 };
    const dryRun = opts?.dryRun ?? false;
    try {
        const {
            findNearestAssociations,
            computeClimbRouteAssociations,
            buildEnrichmentWritesFromAssociations,
            CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS,
        } = await import('./route-enrichment.service');

        // ── climb_segments: published + city-scoped (same filter shape as
        // official_routes below), plus hard rule 1's authority guard — a
        // climb missing authorityId is skipped + counted, never force-joined.
        // Defensive only: Stage 2.4 already backfilled all 180 TLV docs. ──
        const climbsSnap = await getDocs(
            query(collection(db, 'climb_segments'), where('city', '==', cityName), where('status', '==', 'published')),
        );
        interface ClimbRow { id: string; path: [number, number][]; type: 'terrain' | 'structure' | 'stairs'; climbType: string; avgGrade: number | null; maxGrade: number | null; center?: { lat: number; lng: number }; authorityId?: string; existingCity?: string }
        const climbs: ClimbRow[] = [];
        let climbsSkippedNoAuthority = 0;
        for (const d of climbsSnap.docs) {
            const data = d.data();
            if (!data.authorityId) { climbsSkippedNoAuthority++; continue; }
            const rawGeometry = Array.isArray(data.geometry) ? data.geometry : [];
            const path: [number, number][] = rawGeometry.length > 0
                ? rawGeometry.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number])
                : data.center ? [[Number(data.center.lng) || 0, Number(data.center.lat) || 0] as [number, number]] : [];
            if (path.length === 0) continue;
            climbs.push({
                id: d.id, path, type: data.type, climbType: data.climbType,
                avgGrade: data.avgGrade ?? null, maxGrade: data.maxGrade ?? null,
                center: data.center, authorityId: data.authorityId, existingCity: data.city,
            });
        }

        // ── official_routes: published + city-scoped — identical filter to
        // recomputeRouteAdjacencyForCity's own proven query (no city-alias
        // issue reported for official_routes.city, unlike street_segments). ──
        const routesSnap = await getDocs(
            query(collection(db, 'official_routes'), where('city', '==', cityName), where('published', '==', true)),
        );
        interface RouteRow { id: string; path: [number, number][]; authorityId?: string; existingCity?: string }
        const routes: RouteRow[] = [];
        for (const d of routesSnap.docs) {
            const data = d.data();
            const rawPath = data.path;
            if (!Array.isArray(rawPath) || rawPath.length < 2) continue;
            const path = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]);
            routes.push({ id: d.id, path, authorityId: data.authorityId, existingCity: data.city });
        }

        const climbJoinInputs = climbs.map((c) => ({ id: c.id, path: c.path, type: c.type, climbType: c.climbType as any, avgGrade: c.avgGrade, maxGrade: c.maxGrade }));

        // ── Routes side: full cross-product — TLV scale (~180 climbs × a few
        // dozen routes) makes geohash prefiltering unnecessary here (same
        // "brute-force is fine at this scale" call recomputeRouteAdjacencyForCity
        // itself already makes for 189 official_routes total). ──
        const routeAssociations = computeClimbRouteAssociations(climbJoinInputs, routes, CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS);

        // ── Segments side: per-climb geohash-bounded query — avoids loading
        // the whole (potentially thousands-of-docs) street_segments
        // collection, AND sidesteps street_segments.cityName's documented
        // alias bug entirely by never filtering on cityName — geo-bounding
        // around each climb's own center instead (same reasoning
        // fetchScoredWaypointsByProximity's own doc comment gives). ──
        const segmentAssociations: typeof routeAssociations = [];
        const segmentExistingById = new Map<string, { authorityId?: string; cityName?: string }>();
        for (const climb of climbs) {
            if (!climb.center) continue;
            const bounds = geohashQueryBounds([climb.center.lat, climb.center.lng], CLIMB_ROUTE_QUERY_RADIUS_METERS);
            const seenSegmentIds = new Set<string>();
            const candidates: Array<{ id: string; path: [number, number][] }> = [];
            const snaps = await Promise.all(
                bounds.map(([start, end]) =>
                    getDocs(query(collection(db, 'street_segments'), orderBy('geohash'), startAt(start), endAt(end))),
                ),
            );
            for (const snap of snaps) {
                for (const d of snap.docs) {
                    if (seenSegmentIds.has(d.id)) continue;
                    seenSegmentIds.add(d.id);
                    const data = d.data();
                    segmentExistingById.set(d.id, { authorityId: data.authorityId, cityName: data.cityName });
                    const rawPath = Array.isArray(data.path) ? data.path : null;
                    const path: [number, number][] = rawPath
                        ? rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number])
                        : data.midpoint ? [[Number(data.midpoint.lng) || 0, Number(data.midpoint.lat) || 0] as [number, number]] : [];
                    if (path.length === 0) continue;
                    candidates.push({ id: d.id, path });
                }
            }
            const climbInput = { id: climb.id, path: climb.path, type: climb.type, climbType: climb.climbType as any, avgGrade: climb.avgGrade, maxGrade: climb.maxGrade };
            segmentAssociations.push(...findNearestAssociations(climbInput, candidates, 'segment', CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS));
        }

        const allAssociations = [...routeAssociations, ...segmentAssociations];
        const climbsById = new Map(climbJoinInputs.map((c) => [c.id, c]));
        const { climbUpdates, routeUpdates, segmentUpdates } = buildEnrichmentWritesFromAssociations(allAssociations, climbsById);

        if (dryRun) {
            console.log(
                `[route-enrichment] DRY RUN "${cityName}": ${climbs.length} climbs (${climbsSkippedNoAuthority} skipped, no authorityId), ` +
                `${routes.length} routes → ${allAssociations.length} pairings (${routeAssociations.length} route, ${segmentAssociations.length} segment); ` +
                `${climbUpdates.size} climbs / ${routeUpdates.size} routes / ${segmentUpdates.size} segments would be updated`,
            );
            return { climbsUpdated: climbUpdates.size, routesUpdated: routeUpdates.size, segmentsUpdated: segmentUpdates.size, pairings: allAssociations };
        }

        // ── Write, chunked writeBatch (500 ops/batch), through the Stage 1B
        // chokepoint. `existing` for the lock-check comes from data already
        // fetched above — no redundant getDoc round-trips. None of these
        // three payloads ever touch authorityId/city, so the chokepoint's
        // lock-check is a no-op regardless — `existing` is still passed
        // faithfully for defensiveness/correctness if a future edit changes
        // that. ──
        const knownAuthorityIds = await getKnownAuthorityIds();
        const routeExistingById = new Map(routes.map((r) => [r.id, { authorityId: r.authorityId, city: r.existingCity }]));
        const climbExistingById = new Map(climbs.map((c) => [c.id, { authorityId: c.authorityId, city: c.existingCity }]));

        const batches: ReturnType<typeof writeBatch>[] = [writeBatch(db)];
        let opsInBatch = 0;
        const addOp = (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => {
            if (opsInBatch >= 500) { batches.push(writeBatch(db)); opsInBatch = 0; }
            batches[batches.length - 1].update(ref, data);
            opsInBatch++;
        };

        // .forEach() rather than for-of over the Map — matches this repo's
        // existing TS2802 workaround pattern elsewhere (direct Map iteration
        // needs --downlevelIteration/es2015+, which this tsconfig doesn't set).
        climbUpdates.forEach((upd, climbId) => {
            const existing = climbExistingById.get(climbId) ?? {};
            const validated = buildValidatedDoc(
                'climb_segments',
                { routeIds: upd.routeIds, streetSegmentIds: upd.streetSegmentIds, updatedAt: serverTimestamp() },
                { mode: 'update', knownAuthorityIds, existing },
            );
            addOp(doc(db, 'climb_segments', climbId), validated);
        });
        routeUpdates.forEach((features, routeId) => {
            const existing = routeExistingById.get(routeId) ?? {};
            const validated = buildValidatedDoc(
                'official_routes',
                { terrainFeatures: features, updatedAt: serverTimestamp() },
                { mode: 'update', knownAuthorityIds, existing },
            );
            addOp(doc(db, 'official_routes', routeId), validated);
        });
        segmentUpdates.forEach((climbIds, segmentId) => {
            const existing = segmentExistingById.get(segmentId) ?? {};
            const validated = buildValidatedDoc(
                'street_segments',
                { nearbyClimbSegmentIds: climbIds, updatedAt: serverTimestamp() },
                { mode: 'update', knownAuthorityIds, existing },
            );
            addOp(doc(db, 'street_segments', segmentId), validated);
        });

        for (const batch of batches) await batch.commit();

        console.log(
            `[route-enrichment] Recomputed "${cityName}": ${climbUpdates.size} climbs, ${routeUpdates.size} routes, ${segmentUpdates.size} segments updated`,
        );
        return { climbsUpdated: climbUpdates.size, routesUpdated: routeUpdates.size, segmentsUpdated: segmentUpdates.size };
    } catch (error) {
        console.warn('[route-enrichment] recomputeRouteEnrichmentForCity failed (non-fatal):', error);
        return { climbsUpdated: 0, routesUpdated: 0, segmentsUpdated: 0 };
    }
}

/**
 * Fire-and-forget helper for the SAME 10 `official_routes` mutation sites as
 * `recomputeAdjacencyForCities` immediately above — structural sibling, not
 * a rewrite (route-enrichment-pipeline plan, Stage 3, 17.08.2026). Two
 * independent gates, both required: the flag (byte-identical no-op when
 * off) AND the pilot-city allowlist (a mutation in any city outside
 * ROUTE_ENRICHMENT_PILOT_CITIES is silently skipped even with the flag on —
 * see the flag's own doc comment in feature-flags.ts for why this is
 * deliberately two layers, not one). Fires independently of
 * recomputeAdjacencyForCities — one failing must never affect the other.
 */
function recomputeEnrichmentForCities(cityNames: Array<string | undefined | null>): void {
    if (!IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED) return;
    const distinct = Array.from(new Set(cityNames.filter((c): c is string => !!c)))
        .filter((cityName) => ROUTE_ENRICHMENT_PILOT_CITIES.includes(cityName));
    for (const cityName of distinct) {
        recomputeRouteEnrichmentForCity(cityName).catch((err) => {
            console.warn('[route-enrichment] recomputeEnrichmentForCities failed (non-fatal):', err);
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
            recomputeEnrichmentForCities(persistedRoutes.map((r) => r.city));

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
            recomputeEnrichmentForCities(deletedCities);

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
            recomputeEnrichmentForCities(deletedOfficialCities);

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
            recomputeEnrichmentForCities(persistedRoutes.map((r) => r.city));

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
     * Fetch a single route by ID for deep-linking (e.g. a push notification's
     * ?openRoute=<id>, see src/app/map/MapShell.tsx). Checks curated_routes
     * first (the collection PlannedActivityComposeSheet's route picker
     * writes routeId from), falling back to official_routes. Returns null —
     * not a throw — when the id exists in neither collection (e.g. an
     * ad-hoc generated route from RouteDetailSheet's contextRoute prefill
     * that was never persisted anywhere); callers must treat that as a
     * valid "nothing to show", same fail-soft posture as getPark's own
     * not-found path in parks.service.ts.
     *
     * Deliberately NOT named getRouteById — that name is already taken
     * (official_routes-only, ~1290 below, 5+ existing callers assume that
     * scope). Extending the existing one to also check curated_routes
     * risked changing behavior for those unrelated callers (city
     * resolution, broadcast, admin approval) — safer to add a distinctly-
     * named sibling than to widen a function other code already depends on.
     */
    async getRouteByIdAnyCollection(routeId: string): Promise<Route | null> {
        if (!routeId) return null;
        for (const collectionName of ['curated_routes', 'official_routes'] as const) {
            try {
                const snap = await getDoc(doc(db, collectionName, routeId));
                if (!snap.exists()) continue;
                const data = snap.data();
                const rawPath = data.path;
                if (!Array.isArray(rawPath) || rawPath.length < 2) continue;
                const path = rawPath.map(
                    (p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number],
                );
                return {
                    ...data,
                    id: snap.id,
                    path,
                    distance: typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0,
                    rating: typeof data.rating === 'number' && !isNaN(data.rating) ? data.rating : 0,
                    duration: typeof data.duration === 'number' && !isNaN(data.duration) ? data.duration : 0,
                    score: typeof data.score === 'number' && !isNaN(data.score) ? data.score : 0,
                } as Route;
            } catch (error) {
                console.error(`❌ Error fetching route ${routeId} from ${collectionName}:`, error);
            }
        }
        return null;
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
     * Does NOT touch path geometry by default — only name, description, difficulty,
     * activityType, etc. Pass `{ allowPathUpdate: true }` to also write `path` (route-editor-
     * scoping-spec.md §3.5.6) — the caller is then responsible for having already recomputed
     * distance/elevationGain/maxGrade/duration/difficulty to match the new path; this function
     * does not derive them.
     */
    updateRoute: async (routeId: string, data: Partial<Route>, options?: { allowPathUpdate?: boolean }): Promise<void> => {
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
                ...(options?.allowPathUpdate ? { path } : {}),
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
                recomputeEnrichmentForCities([route.city]);
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
            if (IS_ROUTE_ADJACENCY_ENABLED || IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED) {
                // Outer if is purely an optimization to skip the getRouteById
                // fetch when BOTH flags are off — each dispatcher below still
                // internally no-ops on its own flag, so this must OR the two
                // flags, not gate on adjacency's alone (that would incorrectly
                // tie enrichment's firing to a different feature's flag).
                InventoryService.getRouteById(routeId).then((route) => {
                    if (!route) return;
                    recomputeAdjacencyForCities([route.city]);
                    recomputeEnrichmentForCities([route.city]);
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
            recomputeEnrichmentForCities(deletedCities);

            return deleted;
        } catch (error) {
            console.error('❌ Error bulk-deleting routes:', error);
            throw error;
        }
    },

    /**
     * Approve (publish) multiple routes by their document IDs — Stage 2 of
     * the route-enrichment-pipeline plan. Modeled directly on bulkDeleteRoutes
     * above: 500-chunked writeBatch, fire-and-forget broadcast + adjacency
     * recompute. Fixed-shape payload (same as single approveRoute) — no
     * arbitrary caller-supplied fields, so this doesn't need the Stage 1B
     * chokepoint (nothing to validate beyond what approveRoute already is).
     * Does NOT touch single approveRoute — that stays exactly as-is.
     */
    bulkApproveRoutes: async (routeIds: string[]): Promise<number> => {
        if (routeIds.length === 0) return 0;
        try {
            let approved = 0;
            const payload = {
                published: true,
                status: 'published',
                publishedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            for (let i = 0; i < routeIds.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = routeIds.slice(i, i + 500);
                chunk.forEach(id => batch.update(doc(db, 'official_routes', id), payload));
                await batch.commit();
                approved += chunk.length;
            }
            console.log(`✅ Bulk-approved ${approved} routes`);
            invalidateOfficialRoutesCache();

            // ── Broadcast on publish ───────────────────────────────────────
            // Same "approve → broadcast" logic as single approveRoute. No
            // broadcastRoutesToStreetSegmentsForMany exists — reuse the
            // single-route broadcaster via Promise.all rather than inventing
            // a bulk variant. Fire-and-forget so the admin UI returns
            // immediately.
            const routes = await Promise.all(routeIds.map(id => InventoryService.getRouteById(id)));
            const validRoutes = routes.filter((r): r is Route => r !== null);
            Promise.all(validRoutes.map(r => broadcastRouteToStreetSegments(r)))
                .then((results) => {
                    const totalWritten = results.reduce((sum, res) => sum + (res?.written ?? 0), 0);
                    console.log(`📡 Bulk-approve broadcast: ${totalWritten} segments across ${validRoutes.length} routes.`);
                })
                .catch((err) => {
                    console.warn('[InventoryService] Bulk-approve broadcast failed (non-fatal):', err);
                });
            recomputeAdjacencyForCities(validRoutes.map(r => r.city));
            recomputeEnrichmentForCities(validRoutes.map(r => r.city));

            return approved;
        } catch (error) {
            console.error('❌ Error bulk-approving routes:', error);
            throw error;
        }
    },

    /**
     * Reject (un-publish) multiple routes by their document IDs — soft
     * "back to pending", same semantics as single rejectRoute (the inventory
     * tab's draft/publish toggle, NOT Approval Center's harder "archived"
     * reject in moderation.service.ts — those are different operations
     * despite the shared name, see route-enrichment-pipeline-scoping.md).
     * Does NOT touch single rejectRoute — that stays exactly as-is.
     */
    bulkRejectRoutes: async (routeIds: string[]): Promise<number> => {
        if (routeIds.length === 0) return 0;
        try {
            let rejected = 0;
            const payload = {
                published: false,
                status: 'pending',
                updatedAt: serverTimestamp(),
            };
            for (let i = 0; i < routeIds.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = routeIds.slice(i, i + 500);
                chunk.forEach(id => batch.update(doc(db, 'official_routes', id), payload));
                await batch.commit();
                rejected += chunk.length;
            }
            console.log(`✅ Bulk-rejected ${rejected} routes`);
            invalidateOfficialRoutesCache();

            // ── Pull broadcast on reject ─────────────────────────────────────
            deleteOfficialRouteSegmentsForMany(routeIds).catch((err) => {
                console.warn('[InventoryService] Bulk-reject broadcast cleanup failed (non-fatal):', err);
            });
            if (IS_ROUTE_ADJACENCY_ENABLED || IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED) {
                // Same OR-the-two-flags reasoning as rejectRoute above — the
                // outer if only optimizes away the getRouteById fan-out when
                // BOTH flags are off; each dispatcher still no-ops on its own.
                Promise.all(routeIds.map(id => InventoryService.getRouteById(id))).then((routes) => {
                    const cities = routes.filter((r): r is Route => r !== null).map(r => r.city);
                    recomputeAdjacencyForCities(cities);
                    recomputeEnrichmentForCities(cities);
                });
            }

            return rejected;
        } catch (error) {
            console.error('❌ Error bulk-rejecting routes:', error);
            throw error;
        }
    },

    /**
     * Bulk-assign RouteFeatureTag values to multiple routes — Stage 2.2 of
     * the route-enrichment-pipeline plan. 'add' (default) is non-destructive
     * to a route's existing tags (arrayUnion); 'replace' overwrites the
     * whole array — callers should confirm with the admin before using it.
     *
     * `tags` is TypeScript-constrained to RouteFeatureTag[] (a closed enum),
     * and the payload is otherwise fixed-shape (just featureTags +
     * updatedAt) — same reasoning as bulkApprove/bulkReject above for why
     * this doesn't need the Stage 1B chokepoint: there's no free-form,
     * caller-coercible field here for it to catch.
     */
    bulkTagRoutes: async (
        routeIds: string[],
        tags: RouteFeatureTag[],
        mode: 'add' | 'replace' = 'add',
    ): Promise<number> => {
        if (routeIds.length === 0 || tags.length === 0) return 0;
        try {
            let tagged = 0;
            for (let i = 0; i < routeIds.length; i += 500) {
                const batch = writeBatch(db);
                const chunk = routeIds.slice(i, i + 500);
                chunk.forEach(id => {
                    const payload = mode === 'add'
                        ? { featureTags: arrayUnion(...tags), updatedAt: serverTimestamp() }
                        : { featureTags: tags, updatedAt: serverTimestamp() };
                    batch.update(doc(db, 'official_routes', id), payload);
                });
                await batch.commit();
                tagged += chunk.length;
            }
            console.log(`✅ Bulk-tagged ${tagged} routes (mode: ${mode}, tags: ${tags.join(', ')})`);
            invalidateOfficialRoutesCache();
            return tagged;
        } catch (error) {
            console.error('❌ Error bulk-tagging routes:', error);
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
            recomputeEnrichmentForCities([city]);

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
