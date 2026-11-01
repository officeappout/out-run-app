/**
 * Client half of GET /api/catalog/routes (data-exposure plan phase 1.3, 01.11.2026).
 *
 * Replaces the app's direct Firestore reads of `official_routes`
 * (InventoryService.fetchOfficialRoutes(undefined, true) and the former fetchOfficialRoutesScoped)
 * with the edge-cached catalog. The server selects the same docs with the same
 * caps; this side applies the same path normaliser those reads applied, so
 * callers get the same Route[] as before.
 *
 * Never throws, same contract as the reads it replaces. Offline / a failed
 * request falls back to the last catalog stored in IndexedDB for the same
 * authority set (the Firestore SDK's persistent cache used to cover this),
 * otherwise [].
 */
import type { Route } from '../types/route.types';
import { normalizeStoredRoutePath } from '../utils/routePath';

export const ROUTES_CATALOG_ENDPOINT = '/api/catalog/routes';

const IDB_NAME = 'outfit-route-catalog';
const IDB_STORE = 'catalog';

/** null → the legacy read (fetchOfficialRoutes(undefined, true)); an array → the scoped read. */
export function routesCatalogUrl(authorityIds: string[] | null): string {
  return authorityIds === null
    ? ROUTES_CATALOG_ENDPOINT
    : `${ROUTES_CATALOG_ENDPOINT}?scoped=1&authorityIds=${authorityIds.map(encodeURIComponent).join(',')}`;
}

/** Same normalisation fetchOfficialRoutes / fetchOfficialRoutesScoped applied per doc. */
export function catalogDocsToRoutes(docs: unknown): Route[] {
  if (!Array.isArray(docs)) return [];
  const out: Route[] = [];
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue;
    const data = d as Record<string, unknown>;
    if (data.published === false) continue;
    const path = normalizeStoredRoutePath(data.path);
    if (path.length < 2) continue;
    out.push({ ...data, id: String(data.id), path } as Route);
  }
  return out;
}

let _dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
function getDb() {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  _dbPromise ??= import('idb').then(({ openDB }) =>
    openDB(IDB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      },
    }),
  );
  return _dbPromise;
}

async function readStored(key: string): Promise<unknown> {
  try {
    const p = getDb();
    return p ? await (await p).get(IDB_STORE, key) : undefined;
  } catch {
    return undefined;
  }
}

async function writeStored(key: string, docs: unknown): Promise<void> {
  try {
    const p = getDb();
    if (p) await (await p).put(IDB_STORE, docs, key);
  } catch {
    // Storage unavailable (private browsing, quota): non-fatal, next load re-downloads.
  }
}

export async function fetchOfficialRoutesCatalog(authorityIds: string[] | null): Promise<Route[]> {
  const url = routesCatalogUrl(authorityIds);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const docs = await res.json();
    void writeStored(url, docs);
    return catalogDocsToRoutes(docs);
  } catch (error) {
    console.error('❌ Error fetching official routes catalog:', error);
    return catalogDocsToRoutes(await readStored(url));
  }
}
