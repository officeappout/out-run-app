import { describe, it, expect, vi } from 'vitest';
import { createTtlAsyncCache } from '../ttlAsyncCache';

describe('createTtlAsyncCache', () => {
  it('serves a fresh entry without calling the fetcher again', async () => {
    let t = 0;
    const fetcher = vi.fn(async () => ['a']);
    const c = createTtlAsyncCache(fetcher, 1000, () => t);
    expect(await c.get()).toEqual(['a']);
    t = 999;
    expect(await c.get()).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has elapsed', async () => {
    let t = 0;
    const fetcher = vi.fn(async () => [t]);
    const c = createTtlAsyncCache(fetcher, 1000, () => t);
    expect(await c.get()).toEqual([0]);
    t = 1000;
    expect(await c.get()).toEqual([1000]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent callers onto one in-flight fetch', async () => {
    let resolve!: (v: string[]) => void;
    const fetcher = vi.fn(() => new Promise<string[]>((r) => { resolve = r; }));
    const c = createTtlAsyncCache(fetcher, 1000);
    const p1 = c.get();
    const p2 = c.get();
    resolve(['x']);
    expect(await p1).toEqual(['x']);
    expect(await p2).toEqual(['x']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure: the error propagates and the next call retries', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(['ok']);
    const c = createTtlAsyncCache(fetcher, 1000);
    await expect(c.get()).rejects.toThrow('boom');
    expect(await c.get()).toEqual(['ok']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces the next call to re-fetch', async () => {
    const fetcher = vi.fn(async () => ['v']);
    const c = createTtlAsyncCache(fetcher, 1000);
    await c.get();
    c.invalidate();
    await c.get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
