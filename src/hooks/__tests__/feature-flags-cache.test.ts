import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));

import { FLAGS_CACHE_KEY, readCachedFlags } from '../useFeatureFlags';

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
