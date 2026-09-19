/**
 * Parks Service (Unified)
 * Handles CRUD operations and client fetching for parks
 * Merged from admin parks.service.ts and map parks.service.ts
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Park, ParkStatus } from '../types/park.types';

const PARKS_COLLECTION = 'parks';

/**
 * Convert Firestore timestamp, Unix epoch, or date string to Date.
 * Handles legacy CSV data where timestamps are stored as numbers.
 */
function toDate(timestamp: unknown): Date | undefined {
  if (timestamp == null) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  return undefined;
}

/**
 * Normalize park data with defaults
 */
function normalizePark(docId: string, data: any): Park {
  return {
    id: docId,
    name: data?.name ?? '',
    city: data?.city ?? '',
    description: data?.description ?? '',
    location: data?.location ?? { lat: 0, lng: 0 },
    image: data?.image ?? undefined,
    imageUrl: data?.imageUrl ?? undefined,
    images: Array.isArray(data?.images) ? data.images : undefined,
    facilityType: data?.facilityType ?? undefined,
    sportTypes: Array.isArray(data?.sportTypes) ? data.sportTypes : undefined,
    featureTags: Array.isArray(data?.featureTags) ? data.featureTags : undefined,
    natureType: data?.natureType ?? undefined,
    communityType: data?.communityType ?? undefined,
    urbanType: data?.urbanType ?? undefined,
    stairsDetails: data?.stairsDetails ?? undefined,
    benchDetails: data?.benchDetails ?? undefined,
    parkingDetails: data?.parkingDetails ?? undefined,
    isDogFriendly: data?.isDogFriendly ?? false,
    courtType: data?.courtType ?? undefined,
    hasWaterFountain: data?.hasWaterFountain ?? false,
    terrainType: data?.terrainType ?? undefined,
    environment: data?.environment ?? undefined,
    externalSourceId: data?.externalSourceId ?? undefined,
    facilities: Array.isArray(data?.facilities) ? data.facilities : [],
    gymEquipment: Array.isArray(data?.gymEquipment) ? data.gymEquipment : undefined,
    amenities: data?.amenities ?? undefined,
    authorityId: data?.authorityId ?? undefined,
    neighborhoodId: data?.neighborhoodId ?? undefined,
    neighborhoodName: data?.neighborhoodName ?? undefined,
    isFunctional: data?.isFunctional ?? undefined,
    rating: typeof data?.rating === 'number' ? data.rating : undefined,
    // Root cause of "ParkPreview shows no rating even when the doc has one"
    // (18.09.2026): this whitelist never carried these two fields, so
    // getPark() silently dropped them on every read — ParkDetailSheet never
    // noticed because its own rating display computes live from
    // getReviewsForPark(), a completely separate path that never touches
    // this function. Firestore always had the correct values (recomputeAndSaveParkRating
    // / the backfill script both write them directly via updatePark, which
    // does not go through normalizePark).
    ratingAvg: typeof data?.ratingAvg === 'number' ? data.ratingAvg : null,
    reviewCount: typeof data?.reviewCount === 'number' ? data.reviewCount : undefined,
    status: (data?.status as ParkStatus) ?? 'open',
    contentStatus: data?.contentStatus ?? undefined,
    published: data?.published ?? (data?.contentStatus === 'published'),
    createdByUser: data?.createdByUser ?? undefined,
    origin: data?.origin ?? undefined,
    publishedAt: toDate(data?.publishedAt),
    createdAt: toDate(data?.createdAt),
    updatedAt: toDate(data?.updatedAt),
  };
}

/**
 * Get all parks (admin only - no filtering)
 */
export async function getAllParks(): Promise<Park[]> {
  try {
    const q = query(collection(db, PARKS_COLLECTION), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizePark(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching parks:', error);
    throw error;
  }
}

/**
 * Get parks by authority ID or tenant ID (for Authority Managers).
 * Prefers tenantId when provided; falls back to authorityId for legacy support.
 * Gracefully handles missing Firebase index errors.
 */
export async function getParksByAuthority(authorityId: string, tenantId?: string): Promise<Park[]> {
  try {
    const scopeField = tenantId ? 'tenantId' : 'authorityId';
    const scopeValue = tenantId ?? authorityId;
    const q = query(
      collection(db, PARKS_COLLECTION),
      where(scopeField, '==', scopeValue),
      orderBy('name', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizePark(doc.id, doc.data()));
  } catch (error: any) {
    if (error?.code === 'failed-precondition' || error?.code === 'unavailable') {
      console.warn('[Parks Service] Firebase index not ready yet. Returning empty array.');
      return [];
    }
    console.error('Error fetching parks by authority:', error);
    return [];
  }
}

/**
 * Get parks by neighborhood/settlement (leaf sub-location) ID.
 * Filters on the denormalized `neighborhoodId` field. `authorityId` stays the
 * top authority (city/council), so this is the ONLY query keyed off the leaf.
 * Gracefully handles missing Firebase index errors (same pattern as getParksByAuthority).
 */
export async function getParksByNeighborhood(neighborhoodId: string): Promise<Park[]> {
  try {
    const q = query(
      collection(db, PARKS_COLLECTION),
      where('neighborhoodId', '==', neighborhoodId),
      orderBy('name', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizePark(doc.id, doc.data()));
  } catch (error: any) {
    if (error?.code === 'failed-precondition' || error?.code === 'unavailable') {
      console.warn('[Parks Service] Firebase index not ready yet (neighborhood query). Returning empty array.');
      return [];
    }
    console.error('Error fetching parks by neighborhood:', error);
    return [];
  }
}

// ── Park data client cache (stale-while-revalidate, localStorage, 6-hour TTL) ─
// Shared cache key: any consumer (AppMap, useRouteGeneration, useRouteFilter,
// useSearchNavigation, useRouteDeviationOrchestrator) that calls fetchRealParks
// hits this same bucket, so there is at most one Firestore round-trip per
// browser session regardless of how many hooks call in parallel.
export const PARKS_CACHE_KEY = 'outfit_cached_parks';
const PARKS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface ParksCacheEntry {
  data: Park[];
  cachedAt: number;
}

function readParksFromStorage(): Park[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PARKS_CACHE_KEY);
    if (!raw) return null;
    const parsed: ParksCacheEntry = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt > PARKS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeParksToStorage(parks: Park[]): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: ParksCacheEntry = { data: parks, cachedAt: Date.now() };
    localStorage.setItem(PARKS_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded or private browsing — non-fatal
  }
}

/**
 * Fetch every park's FULL record (client-side) with stale-while-revalidate
 * localStorage caching — the pre-SPEC-07 fetchRealParks implementation,
 * preserved verbatim under this name.
 *
 * SPEC-07 (16.09.2026, redesigned 17.09.2026 post-revert): fetchRealParks
 * itself is the lean, catalog-backed fetch below (id/name/location/
 * facilityType/isFunctional/imageUrl + hasUsableEquipment/isPrimaryFitness/
 * isMinor/stopRole — no gymEquipment, sportTypes, urbanType, courtType,
 * natureType, description, city, status, featureTags, etc). isMinor
 * replaces raw urbanType; stopRole replaces the natureType/urbanType
 * branches route-stops.service.ts used to read raw (see src/lib/
 * park-stop-role.ts). This full-record fetch exists SPECIFICALLY for
 * location-utils.ts's fetchNearbyFacilities, the one confirmed consumer
 * that filters on fields the catalog doesn't carry (courtType, sportTypes,
 * natureType) — see that file's own comment at the call site for why it
 * stays on this path. Everything else that needs more than the catalog
 * fields does its OWN getPark() point-fetch at the point of use
 * (ParkDetailSheet, ParkPreview, compose-park-strength-workout.service.ts)
 * rather than trusting whatever shape its caller happened to pass in —
 * that per-caller-remembers-to-fetch discipline is exactly what silently
 * broke once already (16.09.2026 regression, reverted; see the SPEC-07
 * doc's 17.09.2026 redesign section for the full principle).
 *
 * Behaviour (unchanged from before SPEC-07):
 *   - Cold start (no cache or stale >6h): fetches from Firestore, persists to
 *     localStorage, resolves with the fresh data.
 *   - Warm start (valid cache): resolves with cached data instantly (0 ms), then
 *     fires a background Firestore sync. If the data has changed the optional
 *     `onRefresh` callback is invoked so callers can update their React state
 *     without blocking the initial render.
 */
// Shared in-flight promise so that N callers mounting together coalesce into
// ONE Firestore getDocs instead of firing one each. Cleared when the
// round-trip settles.
let _inflightFullParksFetch: Promise<Park[]> | null = null;

function fetchAndCacheFullParks(): Promise<Park[]> {
  if (_inflightFullParksFetch) return _inflightFullParksFetch;
  _inflightFullParksFetch = getDocs(collection(db, PARKS_COLLECTION))
    .then((snapshot) => {
      const fresh = snapshot.docs.map((d) => normalizePark(d.id, d.data()));
      writeParksToStorage(fresh);
      return fresh;
    })
    .finally(() => { _inflightFullParksFetch = null; });
  return _inflightFullParksFetch;
}

export async function fetchAllParksFullRecords(
  onRefresh?: (parks: Park[]) => void,
): Promise<Park[]> {
  const cached = readParksFromStorage();

  if (cached) {
    // Return stale data instantly; refresh in background via the shared
    // (de-duped) fetch so concurrent warm callers don't each fire a getDocs.
    fetchAndCacheFullParks()
      .then((fresh) => { onRefresh?.(fresh); })
      .catch(() => { /* background refresh failure is non-fatal */ });
    return cached;
  }

  // Cold fetch — no valid cache. Concurrent cold callers share one getDocs.
  try {
    return await fetchAndCacheFullParks();
  } catch (error) {
    console.error('[Parks Service] Error fetching full park records:', error);
    return [];
  }
}

// ── SPEC-07 park catalog (16.09.2026): lean, edge-cached fetch ─────────────
// IndexedDB, not localStorage — the OLD fetchAllParksFullRecords above still
// uses localStorage on purpose (unchanged, own concern); this path exists
// specifically because localStorage forced the WHOLE collection through
// JSON.stringify on the main thread on every open (a real, measured memory
// spike — the data existed twice at once, as objects AND as one giant
// string) and silently failed past its 5-10MB cap. IndexedDB stores objects
// directly, async, with no such ceiling for this size. `idb` is an existing
// dependency (package.json), not a new one.
interface CatalogParkEntry {
  id: string;
  name: string;
  lat: number;
  lng: number;
  facilityType: string;
  isFunctional: boolean;
  imageUrl: string | null;
  hasUsableEquipment: boolean;
  isPrimaryFitness: boolean;
  isMinor: boolean;
  stopRole: import('@/lib/park-stop-role').ParkStopRole | null;
}

interface CatalogIdbRecord {
  etag: string;
  data: CatalogParkEntry[];
  fetchedAt: number;
}

const CATALOG_IDB_NAME = 'outfit-park-catalog';
const CATALOG_IDB_VERSION = 1;
const CATALOG_STORE = 'catalog';
const CATALOG_KEY = 'parks';
const CATALOG_ENDPOINT = '/api/catalog/parks';

let _catalogDbPromise: Promise<import('idb').IDBPDatabase> | null = null;
function getCatalogDb() {
  if (typeof window === 'undefined') return null;
  if (!_catalogDbPromise) {
    _catalogDbPromise = import('idb').then(({ openDB }) =>
      openDB(CATALOG_IDB_NAME, CATALOG_IDB_VERSION, {
        upgrade(idb) {
          if (!idb.objectStoreNames.contains(CATALOG_STORE)) {
            idb.createObjectStore(CATALOG_STORE);
          }
        },
      }),
    );
  }
  return _catalogDbPromise;
}

async function readCatalogFromIdb(): Promise<CatalogIdbRecord | null> {
  try {
    const dbPromise = getCatalogDb();
    if (!dbPromise) return null;
    const idb = await dbPromise;
    const record = await idb.get(CATALOG_STORE, CATALOG_KEY);
    return (record as CatalogIdbRecord | undefined) ?? null;
  } catch {
    return null;
  }
}

async function writeCatalogToIdb(record: CatalogIdbRecord): Promise<void> {
  try {
    const dbPromise = getCatalogDb();
    if (!dbPromise) return;
    const idb = await dbPromise;
    await idb.put(CATALOG_STORE, record, CATALOG_KEY);
  } catch {
    // Storage unavailable (private browsing, quota) — non-fatal, next fetch just re-downloads.
  }
}

function catalogEntryToPark(e: CatalogParkEntry): Park {
  return {
    id: e.id,
    name: e.name,
    location: { lat: e.lat, lng: e.lng },
    facilityType: e.facilityType as Park['facilityType'],
    isFunctional: e.isFunctional,
    imageUrl: e.imageUrl ?? undefined,
    hasUsableEquipment: e.hasUsableEquipment,
    isPrimaryFitness: e.isPrimaryFitness,
    isMinor: e.isMinor,
    stopRole: e.stopRole,
    published: true, // the catalog is already published-filtered server-side
    status: 'open', // placeholder only — SPEC-07 17.09.2026: any consumer
    // that renders this needs the real value now point-fetches its own
    // full record (ParkDetailSheet), so this never reaches a display.
  };
}

// Shared in-flight promise — same coalescing purpose as
// _inflightFullParksFetch above, separate variable since these are two
// independent fetch paths now.
let _inflightCatalogFetch: Promise<Park[]> | null = null;

async function fetchAndCacheCatalog(): Promise<Park[]> {
  if (_inflightCatalogFetch) return _inflightCatalogFetch;

  _inflightCatalogFetch = (async () => {
    const cached = await readCatalogFromIdb();
    const headers: Record<string, string> = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;

    let res: Response;
    try {
      res = await fetch(CATALOG_ENDPOINT, { headers });
    } catch (err) {
      // Offline / network failure — serve whatever's cached, matching the
      // full-records path's "cache hit, background refresh, never throw to
      // the caller" shape. If there's nothing cached either, this is a
      // genuine cold-start-with-no-network case — empty array, same as the
      // full-records path's catch-all.
      if (cached) return cached.data.map(catalogEntryToPark);
      console.error('[Parks Service] Catalog fetch failed, offline and no cache:', err);
      return [];
    }

    if (res.status === 304 && cached) {
      return cached.data.map(catalogEntryToPark);
    }

    if (!res.ok) {
      if (cached) return cached.data.map(catalogEntryToPark);
      console.error('[Parks Service] Catalog fetch returned', res.status);
      return [];
    }

    const etag = res.headers.get('etag');
    const data: CatalogParkEntry[] = await res.json();
    if (etag) {
      await writeCatalogToIdb({ etag, data, fetchedAt: Date.now() });
    }
    return data.map(catalogEntryToPark);
  })().finally(() => { _inflightCatalogFetch = null; });

  return _inflightCatalogFetch;
}

/**
 * Fetch parks for map display — lean catalog fields only (SPEC-07). See
 * fetchAllParksFullRecords above for the full-record path location-utils.ts
 * still uses.
 *
 * Behaviour: resolves instantly from IndexedDB if a cached catalog exists
 * (serving stale data while a background fetch — with If-None-Match — either
 * confirms it's still current via 304 or replaces it), otherwise awaits a
 * cold fetch. Never throws — a fetch failure with no cache resolves to [].
 * Airplane mode with a warm cache: resolves from IndexedDB, no network
 * attempt needed for the synchronous return (the background refresh still
 * fires and fails silently).
 */
export async function fetchRealParks(
  onRefresh?: (parks: Park[]) => void,
): Promise<Park[]> {
  const cached = await readCatalogFromIdb();

  if (cached) {
    fetchAndCacheCatalog()
      .then((fresh) => { onRefresh?.(fresh); })
      .catch(() => { /* background refresh failure is non-fatal */ });
    return cached.data.map(catalogEntryToPark);
  }

  return fetchAndCacheCatalog();
}

/**
 * Get a single park by ID
 */
export async function getPark(parkId: string): Promise<Park | null> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    return normalizePark(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching park:', error);
    throw error;
  }
}

/**
 * Create a new park
 */
export async function createPark(data: Omit<Park, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const parkData = {
      name: data.name ?? '',
      city: data.city ?? '',
      description: data.description ?? '',
      location: data.location ?? { lat: 0, lng: 0 },
      image: data.image ?? null,
      facilityType: data.facilityType ?? null,
      sportTypes: Array.isArray(data.sportTypes) ? data.sportTypes : [],
      featureTags: Array.isArray(data.featureTags) ? data.featureTags : [],
      natureType: data.natureType ?? null,
      communityType: data.communityType ?? null,
      urbanType: data.urbanType ?? null,
      stairsDetails: data.stairsDetails ?? null,
      benchDetails: data.benchDetails ?? null,
      parkingDetails: data.parkingDetails ?? null,
      isDogFriendly: data.isDogFriendly ?? false,
      courtType: data.courtType ?? null,
      hasWaterFountain: data.hasWaterFountain ?? false,
      terrainType: data.terrainType ?? null,
      environment: data.environment ?? null,
      externalSourceId: data.externalSourceId ?? null,
      facilities: Array.isArray(data.facilities) ? data.facilities : [],
      gymEquipment: Array.isArray(data.gymEquipment) ? data.gymEquipment : [],
      amenities: data.amenities ?? null,
      authorityId: data.authorityId ?? null,
      neighborhoodId: data.neighborhoodId ?? null,
      neighborhoodName: data.neighborhoodName ?? null,
      status: data.status ?? 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, PARKS_COLLECTION), parkData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating park:', error);
    throw error;
  }
}

/**
 * Update a park
 */
export async function updatePark(
  parkId: string,
  data: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.image !== undefined) updateData.image = data.image ?? null;
    if (data.facilityType !== undefined) updateData.facilityType = data.facilityType ?? null;
    if (data.sportTypes !== undefined) {
      updateData.sportTypes = Array.isArray(data.sportTypes) ? data.sportTypes : [];
    }
    if (data.featureTags !== undefined) {
      updateData.featureTags = Array.isArray(data.featureTags) ? data.featureTags : [];
    }
    if (data.natureType !== undefined) updateData.natureType = data.natureType ?? null;
    if (data.communityType !== undefined) updateData.communityType = data.communityType ?? null;
    if (data.urbanType !== undefined) updateData.urbanType = data.urbanType ?? null;
    if (data.stairsDetails !== undefined) updateData.stairsDetails = data.stairsDetails ?? null;
    if (data.benchDetails !== undefined) updateData.benchDetails = data.benchDetails ?? null;
    if (data.parkingDetails !== undefined) updateData.parkingDetails = data.parkingDetails ?? null;
    if (data.isDogFriendly !== undefined) updateData.isDogFriendly = data.isDogFriendly ?? false;
    if (data.courtType !== undefined) updateData.courtType = data.courtType ?? null;
    if (data.hasWaterFountain !== undefined) updateData.hasWaterFountain = data.hasWaterFountain ?? false;
    if (data.terrainType !== undefined) updateData.terrainType = data.terrainType ?? null;
    if (data.environment !== undefined) updateData.environment = data.environment ?? null;
    if (data.externalSourceId !== undefined) updateData.externalSourceId = data.externalSourceId ?? null;
    if (data.facilities !== undefined) updateData.facilities = Array.isArray(data.facilities) ? data.facilities : [];
    if (data.gymEquipment !== undefined) {
      updateData.gymEquipment = Array.isArray(data.gymEquipment) ? data.gymEquipment : [];
    }
    if (data.amenities !== undefined) updateData.amenities = data.amenities ?? null;
    if (data.authorityId !== undefined) updateData.authorityId = data.authorityId ?? null;
    if (data.neighborhoodId !== undefined) updateData.neighborhoodId = data.neighborhoodId ?? null;
    if (data.neighborhoodName !== undefined) updateData.neighborhoodName = data.neighborhoodName ?? null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.ratingAvg !== undefined) updateData.ratingAvg = data.ratingAvg;
    if (data.reviewCount !== undefined) updateData.reviewCount = data.reviewCount;

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating park:', error);
    throw error;
  }
}

/**
 * Delete a park
 */
export async function deletePark(parkId: string): Promise<void> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting park:', error);
    throw error;
  }
}

/**
 * Approve a pending park — sets published:true, contentStatus:'published'.
 */
export async function approvePark(parkId: string): Promise<void> {
  try {
    const docRef = doc(db, PARKS_COLLECTION, parkId);
    await updateDoc(docRef, {
      published: true,
      contentStatus: 'published',
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error approving park:', error);
    throw error;
  }
}