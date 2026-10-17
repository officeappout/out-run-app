import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));

import { FLAGS_CACHE_KEY, readCachedFlags, initialFlags, __setFlagsMemoryForTests } from '../useFeatureFlags';

function stubStorage(value: string | null) {
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => (k === FLAGS_CACHE_KEY ? value : null) } });
}

afterEach(() => vi.unstubAllGlobals());

describe('readCachedFlags', () => {
  it('no cache → null (screen waits for Firestore)', () => {
    stubStorage(null);
    expect(readCachedFlags()).toBeNull();
  });

  it('returns the cached values, defaults for missing or non-boolean keys', () => {
    stubStorage(JSON.stringify({ enableHomeV2: true, enableLeagues: 'yes' }));
    const f = readCachedFlags()!;
    expect(f.enableHomeV2).toBe(true);
    expect(f.enableLeagues).toBe(false);
    expect(f.enableHybridSlots).toBe(true);
  });

  it('corrupt cache → null', () => {
    stubStorage('{not json');
    expect(readCachedFlags()).toBeNull();
  });

  it('no window (server) → null', () => {
    expect(readCachedFlags()).toBeNull();
  });
});

describe('initialFlags (a hook mounting after hydration)', () => {
  afterEach(() => __setFlagsMemoryForTests(null, false));

  it('before hydration → null even with a cache (the first render must match the server)', () => {
    stubStorage(JSON.stringify({ enableHomeV2: true }));
    __setFlagsMemoryForTests(null, false);
    expect(initialFlags()).toBeNull();
  });

  it('after hydration → the cached flags, synchronously', () => {
    stubStorage(JSON.stringify({ enableHomeV2: true }));
    __setFlagsMemoryForTests(null, true);
    expect(initialFlags()?.enableHomeV2).toBe(true);
  });

  it('the in-memory snapshot wins over the cache', () => {
    stubStorage(JSON.stringify({ enableHomeV2: false }));
    const live = { ...readCachedFlags()!, enableHomeV2: true };
    __setFlagsMemoryForTests(live, true);
    expect(initialFlags()?.enableHomeV2).toBe(true);
  });

  it('after hydration with nothing known → null (screen waits for Firestore)', () => {
    stubStorage(null);
    __setFlagsMemoryForTests(null, true);
    expect(initialFlags()).toBeNull();
  });
});
