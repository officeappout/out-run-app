/**
 * A per-device, per-user, per-DAY record in IndexedDB (enable_fast_startup_v1) — used to paint
 * the home workout carousel instantly on a cold start while a fresh one is computed behind it.
 *
 * One record per cache (one signed-in user per device): { uid, date (local YYYY-MM-DD),
 * ctxKey, value }. A record is usable only for the SAME uid, the SAME local date and the SAME
 * context key — never a previous day's content. saveWorkout / deleteWorkout clear it (a
 * finished workout changes what home should suggest) and every fresh result overwrites it.
 *
 * Generic over the value so src/lib stays free of feature imports. IndexedDB via
 * idbRecordStore (structured clone keeps Dates; failures degrade to "no cache").
 */
import { createIdbRecordStore } from '@/lib/idbRecordStore';
import type { AsyncRecordStore } from '@/lib/persistentTtlCache';

export interface DailyRecord<T> {
  uid: string;
  date: string;
  ctxKey: string;
  value: T;
}

export interface DailyWant {
  uid: string;
  date: string;
  ctxKey: string;
}

/** Local calendar date (the user's day, not UTC) — same shape as toISODate(new Date()). */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDailyRecordUsable<T>(
  rec: DailyRecord<T> | null | undefined,
  want: DailyWant,
): rec is DailyRecord<T> {
  return (
    !!rec &&
    rec.value != null &&
    !!want.uid &&
    rec.uid === want.uid &&
    rec.date === want.date &&
    rec.ctxKey === want.ctxKey
  );
}

export interface DailyRecordCache<T> {
  /** Start loading the record into memory (idempotent). Call as early as possible. */
  prefetch(): Promise<DailyRecord<T> | null>;
  /** Synchronous: the value if already in memory and usable, else null. */
  peek(want: DailyWant): T | null;
  read(want: DailyWant): Promise<T | null>;
  write(rec: DailyRecord<T>): void;
  /** Drop memory + IndexedDB. Cheap no-op when nothing was ever cached on this device. */
  clear(): void;
}

function markerGet(key: string): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(key) === '1'; } catch { return false; }
}
function markerSet(key: string, on: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function createDailyRecordCache<T>(opts: {
  storeKey: string;
  /** localStorage key set while a record may exist — lets clear() skip IndexedDB otherwise. */
  markerKey: string;
  store?: AsyncRecordStore<DailyRecord<T>>;
  now?: () => number;
}): DailyRecordCache<T> {
  let store = opts.store ?? null;
  const getStore = () => (store ??= createIdbRecordStore<DailyRecord<T>>(opts.storeKey));
  const now = opts.now ?? Date.now;

  /** undefined = not loaded yet; null = loaded, nothing stored. */
  let memory: DailyRecord<T> | null | undefined;
  let pending: Promise<DailyRecord<T> | null> | null = null;
  /** Bumped by write/clear — a read that started earlier can't overwrite newer state. */
  let epoch = 0;

  const prefetch = (): Promise<DailyRecord<T> | null> => {
    if (memory !== undefined) return Promise.resolve(memory);
    if (!pending) {
      const myEpoch = epoch;
      const p: Promise<DailyRecord<T> | null> = getStore()
        .read()
        .then((r) => {
          const rec = r?.value ?? null;
          if (myEpoch === epoch) memory = rec;
          return myEpoch === epoch ? rec : (memory ?? null);
        })
        .catch(() => (myEpoch === epoch ? null : (memory ?? null)))
        .finally(() => { if (pending === p) pending = null; });
      pending = p;
    }
    return pending;
  };

  return {
    prefetch,
    peek(want) {
      return isDailyRecordUsable(memory, want) ? memory.value : null;
    },
    async read(want) {
      const rec = await prefetch();
      return isDailyRecordUsable(rec, want) ? rec.value : null;
    },
    write(rec) {
      try {
        // Only plain data goes to IndexedDB — a non-cloneable value is simply not cached.
        if (typeof structuredClone === 'function') structuredClone(rec);
      } catch {
        return;
      }
      epoch += 1;
      memory = rec;
      pending = null;
      markerSet(opts.markerKey, true);
      getStore().write({ at: now(), value: rec }).catch(() => { /* non-fatal */ });
    },
    clear() {
      if (!memory && !pending && !markerGet(opts.markerKey)) return;
      epoch += 1;
      memory = null;
      pending = null;
      markerSet(opts.markerKey, false);
      getStore().clear().catch(() => { /* non-fatal */ });
    },
  };
}

// ── the app's instance ──────────────────────────────────────────────────────

export const HOME_CAROUSEL_STORE_KEY = 'home-carousel:v1';
export const HOME_CAROUSEL_MARKER_KEY = 'out:fast-start:carousel-cached';

/**
 * Today's home pre-workout carousel (suggestions + the hero workouts they rendered). The value
 * type is owned by src/features/home (fast-startup/useHomeCarouselStartupCache) — `unknown`
 * here keeps src/lib import-free.
 */
export const homeCarouselCache: DailyRecordCache<unknown> = createDailyRecordCache<unknown>({
  storeKey: HOME_CAROUSEL_STORE_KEY,
  markerKey: HOME_CAROUSEL_MARKER_KEY,
});

/** Called from saveWorkout / deleteWorkout: a finished (or removed) workout changes home. */
export function clearHomeStartupCaches(): void {
  homeCarouselCache.clear();
}
