import { describe, it, expect, vi } from 'vitest';
import { createPersistentTtlCache, type AsyncRecordStore, type CacheRecord } from '../persistentTtlCache';

function memoryStore<T>(initial: CacheRecord<T> | null = null) {
  let rec = initial;
  const store: AsyncRecordStore<T> & { peek(): CacheRecord<T> | null } = {
    read: vi.fn(async () => rec),
    write: vi.fn(async (r: CacheRecord<T>) => { rec = r; }),
    clear: vi.fn(async () => { rec = null; }),
    peek: () => rec,
  };
  return store;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createPersistentTtlCache — TTL', () => {
  it('serves memory without re-fetching inside the TTL, re-fetches at the TTL', async () => {
    let t = 0;
    const fetcher = vi.fn(async () => [t]);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 1000, now: () => t });
    expect(await c.get()).toEqual([0]);
    t = 999;
    expect(await c.get()).toEqual([0]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 1000;
    expect(await c.get()).toEqual([1000]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serves a fresh persisted record without fetching (cold memory, e.g. after reload)', async () => {
    const store = memoryStore<string[]>({ at: 500, value: ['persisted'] });
    const fetcher = vi.fn(async () => ['network']);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 1000, store, now: () => 1200 });
    expect(await c.get()).toEqual(['persisted']);
    expect(await c.get()).toEqual(['persisted']);
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.read).toHaveBeenCalledTimes(1); // second call hit memory
  });

  it('ignores an expired (or future-dated) persisted record and writes the fresh one back', async () => {
    const store = memoryStore<string[]>({ at: 0, value: ['old'] });
    const fetcher = vi.fn(async () => ['new']);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 1000, store, now: () => 5000 });
    expect(await c.get()).toEqual(['new']);
    await flush();
    expect(store.peek()).toEqual({ at: 5000, value: ['new'] });

    const future = memoryStore<string[]>({ at: 9999, value: ['skewed'] });
    const c2 = createPersistentTtlCache({ fetcher, ttlMs: 1000, store: future, now: () => 5000 });
    expect(await c2.get()).toEqual(['new']);
  });

  it('degrades to memory-only when the store throws', async () => {
    const store: AsyncRecordStore<string[]> = {
      read: async () => { throw new Error('idb blocked'); },
      write: async () => { throw new Error('quota'); },
      clear: async () => { throw new Error('nope'); },
    };
    const fetcher = vi.fn(async () => ['v']);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 1000, store, now: () => 0 });
    expect(await c.get()).toEqual(['v']);
    expect(await c.get()).toEqual(['v']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(() => c.invalidate()).not.toThrow();
  });
});

describe('createPersistentTtlCache — in-flight dedupe', () => {
  it('concurrent callers share ONE fetch', async () => {
    const d = deferred<string[]>();
    const fetcher = vi.fn(() => d.promise);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 1000, store: memoryStore<string[]>() });
    const all = Promise.all([c.get(), c.get(), c.get()]);
    await flush();
    d.resolve(['x']);
    expect(await all).toEqual([['x'], ['x'], ['x']]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a failure is not cached: it propagates to every waiter and the next call retries', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(['ok']);
    const c = createPersistentTtlCache<string[]>({ fetcher, ttlMs: 1000 });
    const [a, b] = await Promise.allSettled([c.get(), c.get()]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    expect(await c.get()).toEqual(['ok']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('every caller gets its own copy — mutating one result cannot corrupt the cache', async () => {
    const fetcher = vi.fn(async () => [{ id: 'a', reps: 5 }]);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 1000 });
    const [r1, r2] = await Promise.all([c.get(), c.get()]);
    r1[0].reps = 99;
    r1.push({ id: 'b', reps: 1 });
    expect(r2).toEqual([{ id: 'a', reps: 5 }]);
    expect(await c.get()).toEqual([{ id: 'a', reps: 5 }]);
  });
});

describe('createPersistentTtlCache — invalidation', () => {
  it('invalidate() clears memory and the persisted record, so the next call re-fetches', async () => {
    const store = memoryStore<string[]>();
    let n = 0;
    const fetcher = vi.fn(async () => [`v${++n}`]);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 60_000, store });
    expect(await c.get()).toEqual(['v1']);
    await flush();
    expect(store.peek()?.value).toEqual(['v1']);
    c.invalidate();
    expect(await c.get()).toEqual(['v2']);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a fetch already in flight when invalidate() runs can NOT repopulate the cache with pre-edit data', async () => {
    const before = deferred<string[]>();
    const fetcher = vi.fn()
      .mockImplementationOnce(() => before.promise)
      .mockImplementationOnce(async () => ['after-edit']);
    const store = memoryStore<string[]>();
    const c = createPersistentTtlCache<string[]>({ fetcher, ttlMs: 60_000, store });
    const stale = c.get();
    await flush();
    c.invalidate(); // admin saved while the read was on the wire
    before.resolve(['before-edit']);
    expect(await stale).toEqual(['before-edit']); // the original caller still gets its answer
    await flush();
    expect(store.peek()).toBeNull(); // …but it was not persisted
    expect(await c.get()).toEqual(['after-edit']); // …nor kept in memory
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('a load right after invalidate() waits for the store clear (never reads the deleted record)', async () => {
    const clearGate = deferred<void>();
    let rec: CacheRecord<string[]> | null = { at: 0, value: ['stale-persisted'] };
    const store: AsyncRecordStore<string[]> = {
      read: async () => rec,
      write: async (r) => { rec = r; },
      clear: async () => { await clearGate.promise; rec = null; },
    };
    const fetcher = vi.fn(async () => ['fresh']);
    const c = createPersistentTtlCache({ fetcher, ttlMs: 60_000, store, now: () => 10 });
    c.invalidate();
    const p = c.get();
    await flush();
    clearGate.resolve();
    expect(await p).toEqual(['fresh']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
