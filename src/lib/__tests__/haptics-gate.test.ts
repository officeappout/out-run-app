/**
 * enable_haptics_v1 — the gate (pure policy + the device reads) and the
 * helpers: hapticTap fires only with the flag on + the "רטט" setting on +
 * native + no reduced motion; the existing helpers are untouched with the
 * flag off and obey the same policy with it on.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const impact = vi.fn(async () => {});
const selectionChanged = vi.fn(async () => {});
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, selectionChanged, notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

import { hapticGate, hapticAllowed, readHapticsPref, writeHapticsPref, HAPTICS_PREF_KEY } from '../haptics-gate';
import { hapticTap, hapticSelection, hapticLight } from '../haptics';
import { LIVE_FLAGS_CACHE_KEY } from '../feature-flag-live';
import { FLAG_DEFS, FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';

function fakeWindow(opts: { flag: boolean; native: boolean; reduced?: boolean; pref?: '0' | '1' | null }) {
  const store: Record<string, string> = { [LIVE_FLAGS_CACHE_KEY]: JSON.stringify({ enableHapticsV1: opts.flag }) };
  if (opts.pref) store[HAPTICS_PREF_KEY] = opts.pref;
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    },
    matchMedia: () => ({ matches: !!opts.reduced }),
    Capacitor: { isNativePlatform: () => opts.native },
  });
  return store;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// Warm the mocked module once: two concurrent first-time dynamic imports of a
// mocked module can resolve to different instances under vitest.
beforeAll(async () => { await import('@capacitor/haptics'); });
beforeEach(() => { impact.mockClear(); selectionChanged.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('hapticGate (pure)', () => {
  const on = { flagOn: true, prefOn: true, reducedMotion: false, native: true };
  it('flag off: existing calls as today, new calls never', () => {
    const off = { ...on, flagOn: false, native: false, prefOn: false };
    expect(hapticGate('existing', off)).toBe(true);
    expect(hapticGate('new', off)).toBe(false);
  });
  it('flag on: both kinds need setting on + native + no reduced motion', () => {
    for (const kind of ['existing', 'new'] as const) {
      expect(hapticGate(kind, on)).toBe(true);
      expect(hapticGate(kind, { ...on, prefOn: false })).toBe(false);
      expect(hapticGate(kind, { ...on, native: false })).toBe(false);
      expect(hapticGate(kind, { ...on, reducedMotion: true })).toBe(false);
    }
  });
});

describe('device reads', () => {
  it('the "רטט" setting defaults on and persists', () => {
    fakeWindow({ flag: true, native: true });
    expect(readHapticsPref()).toBe(true);
    writeHapticsPref(false);
    expect(readHapticsPref()).toBe(false);
  });
  it('no window (SSR / node) → existing allowed, new not', () => {
    expect(hapticAllowed('existing')).toBe(true);
    expect(hapticAllowed('new')).toBe(false);
  });
});

describe('hapticTap / existing helpers', () => {
  it('flag off: hapticTap is silent, hapticSelection fires as today (even on web)', async () => {
    fakeWindow({ flag: false, native: false });
    hapticTap('impact');
    hapticTap('selection');
    hapticSelection();
    await flush();
    expect(impact).not.toHaveBeenCalled();
    expect(selectionChanged).toHaveBeenCalledTimes(1);
  });
  it('flag on, native, setting on: hapticTap fires a light impact / selection tick', async () => {
    fakeWindow({ flag: true, native: true });
    hapticTap('impact');
    await vi.waitFor(() => expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' }));
    hapticTap('selection');
    await vi.waitFor(() => expect(selectionChanged).toHaveBeenCalledTimes(1));
  });
  it('flag on, setting off: nothing buzzes — old or new', async () => {
    fakeWindow({ flag: true, native: true, pref: '0' });
    hapticTap('impact');
    hapticLight();
    hapticSelection();
    await flush();
    expect(impact).not.toHaveBeenCalled();
    expect(selectionChanged).not.toHaveBeenCalled();
  });
  it('flag on, web: no-op', async () => {
    fakeWindow({ flag: true, native: false });
    hapticTap('impact');
    hapticSelection();
    await flush();
    expect(impact).not.toHaveBeenCalled();
    expect(selectionChanged).not.toHaveBeenCalled();
  });
  it('flag on, reduced motion: no-op', async () => {
    fakeWindow({ flag: true, native: true, reduced: true });
    hapticTap('selection');
    await flush();
    expect(selectionChanged).not.toHaveBeenCalled();
  });
});

describe('enable_haptics_v1 flag', () => {
  it('is fail-closed, previewed by super admins', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_haptics_v1');
    expect(def?.key).toBe('enableHapticsV1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
    expect(FIRESTORE_FLAG_DEFAULTS.enable_haptics_v1).toBe(false);
  });
});
