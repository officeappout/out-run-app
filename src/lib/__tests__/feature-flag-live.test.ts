import { describe, it, expect, afterEach, vi } from 'vitest';
import { readLiveFlag, LIVE_FLAGS_CACHE_KEY } from '../feature-flag-live';
import { FLAGS_CACHE_KEY } from '@/hooks/useFeatureFlags';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

vi.mock('@/lib/firebase', () => ({ db: {} }));

describe('calm return flag — CALM_RETURN_V1', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a panel flag, default OFF, one switch for admins too', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableCalmReturnV1');
    expect(def).toEqual({ key: 'enableCalmReturnV1', firestoreKey: 'enable_calm_return_v1', defaultValue: false, superAdminValue: false });
  });

  it('readLiveFlag reads the same cache key useFeatureFlags writes', () => {
    expect(LIVE_FLAGS_CACHE_KEY).toBe(FLAGS_CACHE_KEY);
  });

  it('no window (server / hermetic runs) → the default: OFF', () => {
    expect(readLiveFlag('enableCalmReturnV1')).toBe(false);
  });

  it('reads the cached live value; garbage or missing → OFF', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
    expect(readLiveFlag('enableCalmReturnV1')).toBe(false);
    store[LIVE_FLAGS_CACHE_KEY] = JSON.stringify({ enableCalmReturnV1: true });
    expect(readLiveFlag('enableCalmReturnV1')).toBe(true);
    store[LIVE_FLAGS_CACHE_KEY] = '{not json';
    expect(readLiveFlag('enableCalmReturnV1')).toBe(false);
  });
});
