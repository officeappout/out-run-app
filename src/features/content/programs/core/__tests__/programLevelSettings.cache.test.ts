import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Firestore mocks ──────────────────────────────────────────────────────────
// getDocMock is the observable: cache correctness == how many times it is called.
const getDocMock = vi.fn();
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ __id: id }),
  getDoc: (ref: unknown) => getDocMock(ref),
  getDocs: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  updateDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class {},
}));

import {
  getProgramLevelSetting,
  invalidateProgramLevelSetting,
  saveProgramLevelSettings,
  __clearPlsCacheForTests,
} from '../programLevelSettings.service';

function snap(exists: boolean, id = 'x_level_1', data: Record<string, unknown> = {}) {
  return { id, exists: () => exists, data: () => data };
}

// Drive the runtime A/B override (env 'node' → no window; we provide a stub).
function setCacheToggle(on: boolean) {
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (k === 'OUT_PLS_CACHE' ? (on ? '1' : '0') : null),
      setItem: () => {},
    },
  };
}
function clearWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

beforeEach(() => {
  getDocMock.mockReset();
  __clearPlsCacheForTests();
  vi.useRealTimers();
});
afterEach(() => {
  clearWindow();
  vi.useRealTimers();
});

describe('getProgramLevelSetting — PLS cache (#1)', () => {
  it('dedups repeated reads of the same doc to a single Firestore fetch', async () => {
    setCacheToggle(true);
    getDocMock.mockResolvedValue(
      snap(true, 'push_level_18', { weeklyVolumeTarget: 20, preferredProtocols: ['pyramid'] }),
    );

    const a = await getProgramLevelSetting('push', 18);
    const b = await getProgramLevelSetting('push', 18);
    const c = await getProgramLevelSetting('push', 18);

    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a?.weeklyVolumeTarget).toBe(20);
    expect(a?.preferredProtocols).toEqual(['pyramid']);
  });

  it('value parity: cached return deep-equals a fresh (uncached) fetch', async () => {
    const data = { weeklyVolumeTarget: 24, protocolProbability: 0.5, maxSets: 28 };

    // Fresh path (cache OFF) — the ground truth.
    setCacheToggle(false);
    getDocMock.mockResolvedValue(snap(true, 'pull_level_10', data));
    const fresh = await getProgramLevelSetting('pull', 10);

    // Cached path (cache ON) — must be identical.
    __clearPlsCacheForTests();
    getDocMock.mockClear();
    getDocMock.mockResolvedValue(snap(true, 'pull_level_10', data));
    setCacheToggle(true);
    const first = await getProgramLevelSetting('pull', 10);
    const second = await getProgramLevelSetting('pull', 10);

    expect(first).toEqual(fresh);
    expect(second).toEqual(fresh);
    expect(getDocMock).toHaveBeenCalledTimes(1); // 2nd came from cache
  });

  it('negative-caches misses (no document) — no repeat round-trip', async () => {
    setCacheToggle(true);
    getDocMock.mockResolvedValue(snap(false));

    const a = await getProgramLevelSetting('ghost', 1);
    const b = await getProgramLevelSetting('ghost', 1);

    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('flag OFF: every call fetches (byte-identical to today, no dedup)', async () => {
    setCacheToggle(false);
    getDocMock.mockResolvedValue(snap(true, 'legs_level_5', { weeklyVolumeTarget: 12 }));

    await getProgramLevelSetting('legs', 5);
    await getProgramLevelSetting('legs', 5);
    await getProgramLevelSetting('legs', 5);

    expect(getDocMock).toHaveBeenCalledTimes(3);
  });

  it('invalidate-on-write: eviction forces a refetch', async () => {
    setCacheToggle(true);
    getDocMock.mockResolvedValue(snap(true, 'core_level_7', { weeklyVolumeTarget: 8 }));

    await getProgramLevelSetting('core', 7);
    await getProgramLevelSetting('core', 7);
    expect(getDocMock).toHaveBeenCalledTimes(1);

    invalidateProgramLevelSetting('core', 7);
    await getProgramLevelSetting('core', 7);
    expect(getDocMock).toHaveBeenCalledTimes(2); // refetched after eviction
  });

  it('saveProgramLevelSettings evicts the cached entry (admin edit reflects next read)', async () => {
    setCacheToggle(true);
    getDocMock.mockResolvedValue(snap(true, 'push_level_3', { weeklyVolumeTarget: 6 }));
    await getProgramLevelSetting('push', 3);

    // Admin edit: save updates the doc and must evict the stale cache entry.
    await saveProgramLevelSettings({ programId: 'push', levelNumber: 3, weeklyVolumeTarget: 9 } as never);

    getDocMock.mockClear();
    getDocMock.mockResolvedValue(snap(true, 'push_level_3', { weeklyVolumeTarget: 9 }));
    const after = await getProgramLevelSetting('push', 3);

    expect(getDocMock).toHaveBeenCalledTimes(1); // refetched post-save (not stale)
    expect(after?.weeklyVolumeTarget).toBe(9);
  });

  it('TTL expiry forces a refetch', async () => {
    setCacheToggle(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    getDocMock.mockResolvedValue(snap(true, 'push_level_1', { weeklyVolumeTarget: 4 }));

    await getProgramLevelSetting('push', 1);
    await getProgramLevelSetting('push', 1);
    expect(getDocMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-01-01T00:00:31Z')); // +31s > 30s TTL
    await getProgramLevelSetting('push', 1);
    expect(getDocMock).toHaveBeenCalledTimes(2);
  });
});
