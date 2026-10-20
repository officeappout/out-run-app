/**
 * Walk hand-off markers (enable_home_v2, owner 20.10.2026) — sessionStorage only,
 * never Firestore. Written by the walk start actions (startWalk.ts, v2 paths only):
 *
 *  - AUTO ROUTE (read-once at the map, 10′ TTL): the free walk drawer opens straight
 *    on the route step — a loop from the user's position that fits the walk's goal
 *    ("like the generator: 20′ walk → a route → walk along it"). The user can still go
 *    back and start a free walk without a route.
 *  - PENDING ENTRY (read-once when a walk is saved, 6 h TTL): the planned walk this
 *    walk came from → its userSchedule entry is marked completed (walkComplete.service).
 *
 * Both take an injectable store for tests; any storage error → no marker.
 */

export const WALK_AUTO_ROUTE_KEY = 'pending_walk_auto_route';
export const WALK_PENDING_ENTRY_KEY = 'pending_walk_entry';

const AUTO_ROUTE_TTL_MS = 10 * 60 * 1000;
const PENDING_ENTRY_TTL_MS = 6 * 60 * 60 * 1000;

export type KVStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionStore(): KVStore | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function write(store: KVStore | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Read-once: the parsed value (always cleared), or null. */
function take(store: KVStore | null, key: string): Record<string, unknown> | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
    store.removeItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const fresh = (savedAt: unknown, now: number, ttl: number) =>
  typeof savedAt === 'number' && now - savedAt <= ttl && savedAt <= now + 60_000;

export function markWalkAutoRoute(store: KVStore | null = sessionStore(), now = Date.now()): boolean {
  return write(store, WALK_AUTO_ROUTE_KEY, { savedAt: now });
}

export function consumeWalkAutoRoute(store: KVStore | null = sessionStore(), now = Date.now()): boolean {
  const v = take(store, WALK_AUTO_ROUTE_KEY);
  return !!v && fresh(v.savedAt, now, AUTO_ROUTE_TTL_MS);
}

export interface PendingWalkEntry {
  date: string;
  entryId: string;
}

export function markPendingWalkEntry(
  entry: Partial<PendingWalkEntry>,
  store: KVStore | null = sessionStore(),
  now = Date.now(),
): boolean {
  if (typeof entry.date !== 'string' || typeof entry.entryId !== 'string' || !entry.date || !entry.entryId) {
    // A start without an entry (short walk) must not leave an older marker behind.
    try {
      store?.removeItem(WALK_PENDING_ENTRY_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }
  return write(store, WALK_PENDING_ENTRY_KEY, { date: entry.date, entryId: entry.entryId, savedAt: now });
}

export function consumePendingWalkEntry(store: KVStore | null = sessionStore(), now = Date.now()): PendingWalkEntry | null {
  const v = take(store, WALK_PENDING_ENTRY_KEY);
  if (!v || !fresh(v.savedAt, now, PENDING_ENTRY_TTL_MS)) return null;
  if (typeof v.date !== 'string' || typeof v.entryId !== 'string' || !v.date || !v.entryId) return null;
  return { date: v.date, entryId: v.entryId };
}
