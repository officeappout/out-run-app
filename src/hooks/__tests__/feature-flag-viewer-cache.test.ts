import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_DEFS } from '../feature-flag-defs';
import {
  readViewerFlags,
  writeViewerFlags,
  viewerFlagsCacheKey,
  readLastViewerUid,
  writeLastViewerUid,
  resolveDisplayFlags,
  shouldWriteViewerCache,
  sameFlags,
  loadingLook,
  __resetViewerFlagsMemo,
  type FlagMap,
} from '../feature-flag-viewer-cache';

const DEFAULTS = Object.fromEntries(FLAG_DEFS.map((d) => [d.key, d.defaultValue])) as FlagMap;
const V2: FlagMap = { ...DEFAULTS, enableHomeV2: true };
const V1: FlagMap = { ...DEFAULTS, enableHomeV2: false };

function stubStorage(initial: Record<string, string> = {}, throws = false) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => {
        if (throws) throw new Error('blocked');
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (throws) throw new Error('blocked');
        store.set(k, v);
      },
    },
  });
  return store;
}

beforeEach(() => __resetViewerFlagsMemo());
afterEach(() => vi.unstubAllGlobals());

const base = { live: null, viewerKnown: false, viewerCache: null, docCache: null, gaveUp: false, fallback: DEFAULTS };

describe('resolveDisplayFlags', () => {
  it('nothing known → unknown (the screen shows the skeleton, not v1)', () => {
    expect(resolveDisplayFlags(base)).toEqual({ flags: DEFAULTS, source: 'unknown' });
  });

  it('initial value from the viewer cache while the document is pending', () => {
    const r = resolveDisplayFlags({ ...base, viewerKnown: true, viewerCache: V2 });
    expect(r.source).toBe('cached');
    expect(r.flags.enableHomeV2).toBe(true);
  });

  it('the viewer cache beats the raw-document cache (it includes the super-admin resolution)', () => {
    const r = resolveDisplayFlags({ ...base, viewerKnown: true, viewerCache: V2, docCache: V1 });
    expect(r.flags.enableHomeV2).toBe(true);
  });

  it('while the profile is still loading, the last viewer cache beats a live answer computed without the viewer', () => {
    const r = resolveDisplayFlags({ ...base, live: V1, viewerKnown: false, viewerCache: V2 });
    expect(r).toEqual({ flags: V2, source: 'cached' });
  });

  it('a profile that never shows up stops holding the last viewer cache after the cap', () => {
    const r = resolveDisplayFlags({ ...base, live: V1, viewerKnown: false, viewerCache: V2, gaveUp: true });
    expect(r).toEqual({ flags: V1, source: 'live' });
  });

  it('mismatch: the live truth for a known viewer wins over a stale v2 cache → v1', () => {
    const r = resolveDisplayFlags({ ...base, live: V1, viewerKnown: true, viewerCache: V2 });
    expect(r).toEqual({ flags: V1, source: 'live' });
    expect(shouldWriteViewerCache('u1', true, r, V2)).toBe(true);
  });

  it('falls back to the raw-document cache, then (after the cap) the defaults', () => {
    expect(resolveDisplayFlags({ ...base, docCache: V2 }).source).toBe('cached');
    expect(resolveDisplayFlags({ ...base, gaveUp: true })).toEqual({ flags: DEFAULTS, source: 'fallback' });
  });

  it('offline with a known viewer keeps the viewer cache after the cap', () => {
    const r = resolveDisplayFlags({ ...base, viewerKnown: true, viewerCache: V2, gaveUp: true });
    expect(r).toEqual({ flags: V2, source: 'cached' });
  });
});

describe('shouldWriteViewerCache', () => {
  it('writes only a live result for a known uid that differs from the cache', () => {
    const live = { flags: V2, source: 'live' as const };
    expect(shouldWriteViewerCache('u1', true, live, null)).toBe(true);
    expect(shouldWriteViewerCache('u1', true, live, V2)).toBe(false);
    expect(shouldWriteViewerCache(null, true, live, null)).toBe(false);
    expect(shouldWriteViewerCache('u1', false, live, null)).toBe(false);
    expect(shouldWriteViewerCache('u1', true, { flags: V2, source: 'cached' }, null)).toBe(false);
    expect(shouldWriteViewerCache('u1', true, { flags: DEFAULTS, source: 'fallback' }, null)).toBe(false);
  });
});

describe('viewer cache storage', () => {
  it('round-trips per uid, keyed by uid', () => {
    const store = stubStorage();
    writeViewerFlags('u1', V2);
    expect(store.has(viewerFlagsCacheKey('u1'))).toBe(true);
    __resetViewerFlagsMemo();
    expect(readViewerFlags('u1')?.enableHomeV2).toBe(true);
    expect(readViewerFlags('u2')).toBeNull();
  });

  it('missing / non-boolean keys fall back to defaults; corrupt → null', () => {
    stubStorage({ [viewerFlagsCacheKey('a')]: JSON.stringify({ enableHomeV2: true, enableLeagues: 'x' }), [viewerFlagsCacheKey('b')]: '{bad' });
    const a = readViewerFlags('a')!;
    expect(a.enableHomeV2).toBe(true);
    expect(a.enableLeagues).toBe(DEFAULTS.enableLeagues);
    expect(readViewerFlags('b')).toBeNull();
  });

  it('blocked storage never throws', () => {
    stubStorage({}, true);
    expect(readViewerFlags('u1')).toBeNull();
    expect(() => writeViewerFlags('u1', V2)).not.toThrow();
    expect(readLastViewerUid()).toBeNull();
    expect(() => writeLastViewerUid('u1')).not.toThrow();
  });

  it('no uid / no window → null', () => {
    expect(readViewerFlags(null)).toBeNull();
    expect(readViewerFlags('u1')).toBeNull();
  });

  it('remembers the last viewer uid', () => {
    stubStorage();
    writeLastViewerUid('u9');
    __resetViewerFlagsMemo();
    expect(readLastViewerUid()).toBe('u9');
  });
});

describe('sameFlags / loadingLook', () => {
  it('compares every flag', () => {
    expect(sameFlags(V2, { ...V2 })).toBe(true);
    expect(sameFlags(V2, V1)).toBe(false);
    expect(sameFlags(null, V1)).toBe(false);
  });

  it('skeleton while unknown or v2; the old loader only for known-off', () => {
    expect(loadingLook(false, false)).toBe('skeleton');
    expect(loadingLook(true, true)).toBe('skeleton');
    expect(loadingLook(true, false)).toBe('legacy');
  });
});
