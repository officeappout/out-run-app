/**
 * enable_fast_startup_v1 — the full `programs` list behind memory + IndexedDB (30 min), so a
 * cold start's first home trio doesn't wait on the collection read. Used only by
 * getCachedPrograms (program-hierarchy.utils.ts) while the flag is on; flag off → that keeps
 * its own memory-only 5-minute cache, untouched. Same value/order as getAllPrograms().
 * Shared array, like getCachedPrograms' own cache (treat as read-only).
 *
 * Imports program.service lazily: program.service imports invalidateProgramCatalog from here.
 */
import type { Program } from './program.types';
import { createPersistentTtlCache, type PersistentTtlCache } from '@/lib/persistentTtlCache';
import { createIdbRecordStore } from '@/lib/idbRecordStore';
import { isFastStartupOn } from '@/lib/fast-startup/flag';

export const PROGRAM_CATALOG_TTL_MS = 30 * 60 * 1000;

let catalog: PersistentTtlCache<Program[]> | null = null;
function getCatalog(): PersistentTtlCache<Program[]> {
  return (catalog ??= createPersistentTtlCache<Program[]>({
    fetcher: async () => (await import('./program.service')).getAllPrograms(),
    ttlMs: PROGRAM_CATALOG_TTL_MS,
    store: createIdbRecordStore<Program[]>('programs:v1'),
    clone: (v) => v,
  }));
}

export function getProgramCatalogPersisted(): Promise<Program[]> {
  return getCatalog().get();
}

/** After any write to `programs` (program.service). No-op unless the cache is in use here. */
export function invalidateProgramCatalog(): void {
  if (catalog || isFastStartupOn()) getCatalog().invalidate();
}
