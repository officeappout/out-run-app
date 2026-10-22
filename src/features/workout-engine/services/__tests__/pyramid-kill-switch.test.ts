/**
 * pyramid_injection_off — the panel's "פירמידות כבויות" switch drops ONLY the pyramid;
 * supersets / EMOM / tabata stay as configured.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { applyPyramidKillSwitch, readPyramidInjectionOff, withoutPyramid } from '../pyramid-kill-switch';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';

describe('pyramid kill switch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('flag def: fail-closed, no super-admin override', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'pyramid_injection_off');
    expect(def).toMatchObject({ key: 'pyramidInjectionOff', defaultValue: false, superAdminValue: false });
  });

  it('switch OFF → the context is untouched (today)', () => {
    const ctx = { preferredProtocols: ['pyramid', 'superset'], protocolProbability: 0.4 };
    applyPyramidKillSwitch(ctx, false);
    expect(ctx).toEqual({ preferredProtocols: ['pyramid', 'superset'], protocolProbability: 0.4 });
  });

  it('switch ON → pyramid dropped, the other protocols and the probability kept', () => {
    const ctx = { preferredProtocols: ['pyramid', 'superset', 'emom', 'tabata'], protocolProbability: 0.4 };
    applyPyramidKillSwitch(ctx, true);
    expect(ctx).toEqual({ preferredProtocols: ['superset', 'emom', 'tabata'], protocolProbability: 0.4 });
  });

  it('switch ON on a pyramid-only list (incl. the forced intense option) → straight sets', () => {
    const ctx = { preferredProtocols: ['pyramid'], protocolProbability: 1.0 };
    applyPyramidKillSwitch(ctx, true);
    expect(ctx).toEqual({ preferredProtocols: [], protocolProbability: 0 });
  });

  it('switch ON without a pyramid → untouched (EMOM / superset stay)', () => {
    const ctx = { preferredProtocols: ['emom', 'antagonist_pair'], protocolProbability: 1 };
    applyPyramidKillSwitch(ctx, true);
    expect(ctx).toEqual({ preferredProtocols: ['emom', 'antagonist_pair'], protocolProbability: 1 });
    expect(withoutPyramid(undefined)).toBeUndefined();
  });

  it('reads the device flag cache once; missing/invalid → false', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
    expect(readPyramidInjectionOff()).toBe(false);
    store[LIVE_FLAGS_CACHE_KEY] = JSON.stringify({ pyramidInjectionOff: true });
    expect(readPyramidInjectionOff()).toBe(true);
    store[LIVE_FLAGS_CACHE_KEY] = 'not json';
    expect(readPyramidInjectionOff()).toBe(false);
  });
});
