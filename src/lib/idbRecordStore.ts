/**
 * idbRecordStore — a single-key IndexedDB record store for createPersistentTtlCache.
 * SSR-safe (no window → every op is a no-op / null) and failure-tolerant (private mode,
 * quota, blocked upgrade → swallowed). IndexedDB, not localStorage/sessionStorage, because
 * the catalogs it holds are large: structured clone keeps Dates intact, works off the main
 * thread's JSON.stringify path, and has no 5MB ceiling (same reasoning as the SPEC-07 park
 * catalog in parks.service.ts). `idb` is an existing dependency.
 */
import type { AsyncRecordStore, CacheRecord } from './persistentTtlCache';

const DB_NAME = 'outfit-catalog-cache';
const DB_VERSION = 1;
const STORE = 'entries';

let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
function getDb(): Promise<import('idb').IDBPDatabase> | null {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = import('idb').then(({ openDB }) =>
      openDB(DB_NAME, DB_VERSION, {
        upgrade(idb) {
          if (!idb.objectStoreNames.contains(STORE)) idb.createObjectStore(STORE);
        },
      }),
    );
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

/** `key` should carry a schema version (e.g. 'exercises:v1') — bump it when the cached shape changes. */
export function createIdbRecordStore<T>(key: string): AsyncRecordStore<T> {
  return {
    async read(): Promise<CacheRecord<T> | null> {
      try {
        const p = getDb();
        if (!p) return null;
        const rec = (await (await p).get(STORE, key)) as CacheRecord<T> | undefined;
        return rec ?? null;
      } catch {
        return null;
      }
    },
    async write(record: CacheRecord<T>): Promise<void> {
      try {
        const p = getDb();
        if (!p) return;
        await (await p).put(STORE, record, key);
      } catch { /* non-fatal */ }
    },
    async clear(): Promise<void> {
      try {
        const p = getDb();
        if (!p) return;
        await (await p).delete(STORE, key);
      } catch { /* non-fatal */ }
    },
  };
}
