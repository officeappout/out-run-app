import { describe, it, expect, vi } from 'vitest';
import type { AsyncRecordStore, CacheRecord } from '@/lib/persistentTtlCache';
import {
  createDailyRecordCache,
  isDailyRecordUsable,
  localDateKey,
  clearHomeStartupCaches,
  type DailyRecord,
} from '../daily-record-cache';

function memoryStore<T>(initial: CacheRecord<T> | null = null) {
  let rec = initial;
  const store: AsyncRecordStore<T> & { peekRec(): CacheRecord<T> | null } = {
    read: vi.fn(async () => rec),
    write: vi.fn(async (r: CacheRecord<T>) => { rec = r; }),
    clear: vi.fn(async () => { rec = null; }),
    peekRec: () => rec,
  };
  return store;
}

const want = { uid: 'u1', date: '2026-10-19', ctxKey: 'home:v1' };
const rec = (over: Partial<DailyRecord<string>> = {}): DailyRecord<string> => ({ ...want, value: 'trio', ...over });

describe('localDateKey', () => {
  it('is the LOCAL calendar date', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 9, 19, 0, 1))).toBe('2026-10-19');
  });
});

describe('isDailyRecordUsable', () => {
  it('same uid + date + ctx → usable', () => {
    expect(isDailyRecordUsable(rec(), want)).toBe(true);
  });
  it('never a previous day', () => {
    expect(isDailyRecordUsable(rec({ date: '2026-10-18' }), want)).toBe(false);
  });
  it('never another user', () => {
    expect(isDailyRecordUsable(rec({ uid: 'u2' }), want)).toBe(false);
    expect(isDailyRecordUsable(rec(), { ...want, uid: '' })).toBe(false);
  });
  it('never another context', () => {
    expect(isDailyRecordUsable(rec({ ctxKey: 'home:v0' }), want)).toBe(false);
  });
  it('empty → not usable', () => {
    expect(isDailyRecordUsable(null, want)).toBe(false);
    expect(isDailyRecordUsable(rec({ value: undefined as unknown as string }), want)).toBe(false);
  });
});

describe('createDailyRecordCache', () => {
  it('reads a stored record for today, and peek works once loaded', async () => {
    const store = memoryStore<DailyRecord<string>>({ at: 1, value: rec() });
    const c = createDailyRecordCache<string>({ storeKey: 'k', markerKey: 'm', store });
    expect(c.peek(want)).toBeNull(); // not loaded yet
    expect(await c.read(want)).toBe('trio');
    expect(c.peek(want)).toBe('trio');
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it("a stored record from yesterday is never served", async () => {
    const store = memoryStore<DailyRecord<string>>({ at: 1, value: rec({ date: '2026-10-18' }) });
    const c = createDailyRecordCache<string>({ storeKey: 'k', markerKey: 'm', store });
    expect(await c.read(want)).toBeNull();
  });

  it('write replaces memory + store; clear drops both (workout saved)', async () => {
    const store = memoryStore<DailyRecord<string>>();
    const c = createDailyRecordCache<string>({ storeKey: 'k', markerKey: 'm', store });
    c.write(rec({ value: 'fresh' }));
    expect(c.peek(want)).toBe('fresh');
    await Promise.resolve();
    expect(store.peekRec()?.value.value).toBe('fresh');
    c.clear();
    expect(c.peek(want)).toBeNull();
    expect(await c.read(want)).toBeNull();
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('a read in flight before clear() cannot resurrect the cleared record', async () => {
    let release!: (v: CacheRecord<DailyRecord<string>> | null) => void;
    const store = memoryStore<DailyRecord<string>>();
    store.read = vi.fn(() => new Promise<CacheRecord<DailyRecord<string>> | null>((r) => { release = r; }));
    const c = createDailyRecordCache<string>({ storeKey: 'k', markerKey: 'm', store });
    const p = c.read(want);
    c.clear();
    release({ at: 1, value: rec() });
    expect(await p).toBeNull();
    expect(c.peek(want)).toBeNull();
  });

  it('a non-cloneable value is not cached', () => {
    const store = memoryStore<DailyRecord<unknown>>();
    const c = createDailyRecordCache<unknown>({ storeKey: 'k', markerKey: 'm', store });
    c.write({ ...want, value: { fn: () => 1 } });
    expect(c.peek(want)).toBeNull();
    expect(store.write).not.toHaveBeenCalled();
  });

  it('store failures degrade to "no cache"', async () => {
    const store = memoryStore<DailyRecord<string>>();
    store.read = vi.fn(async () => { throw new Error('idb blocked'); });
    const c = createDailyRecordCache<string>({ storeKey: 'k', markerKey: 'm', store });
    expect(await c.read(want)).toBeNull();
  });
});

describe('clearHomeStartupCaches (saveWorkout / deleteWorkout)', () => {
  it('is a safe no-op when nothing was ever cached (flag off, SSR/tests)', () => {
    expect(() => clearHomeStartupCaches()).not.toThrow();
  });
});
