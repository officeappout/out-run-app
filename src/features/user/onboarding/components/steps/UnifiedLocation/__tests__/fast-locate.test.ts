import { describe, it, expect, vi } from 'vitest';

// location-utils (for calculateDistance) pulls in Firestore-backed services.
vi.mock('@/features/admin/services/authority.service', () => ({
  getAllAuthorities: vi.fn(),
  getChildrenByParent: vi.fn(),
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: vi.fn() }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ InventoryService: {} }));

import {
  getFirstFix,
  needsRefinement,
  shouldApplyRefinedFix,
  COARSE_FIX_OPTIONS,
  PRECISE_FALLBACK_OPTIONS,
  GOOD_ENOUGH_ACCURACY_METERS,
  type FixRequester,
} from '../fast-locate';
import type { GPSFixResult } from '@/features/parks/core/store/useGPSStore';

const TLV = { lat: 32.0853, lng: 34.7818 };

function requester(...results: GPSFixResult[]) {
  const calls: unknown[] = [];
  const fn: FixRequester = async (opts) => {
    calls.push(opts);
    const r = results.shift();
    if (!r) throw new Error('unexpected extra request');
    return r;
  };
  return { fn, calls };
}

describe('getFirstFix — coarse first, precise fallback', () => {
  it('returns the coarse fix without a second request', async () => {
    const { fn, calls } = requester({ coords: { ...TLV, accuracy: 30 }, reason: 'ok' });
    const res = await getFirstFix(fn);
    expect(res).toEqual({ status: 'ok', fix: { coords: { ...TLV, accuracy: 30 }, needsRefine: false } });
    expect(calls).toEqual([COARSE_FIX_OPTIONS]);
  });

  it('flags a coarse fix of poor accuracy for refinement', async () => {
    const { fn } = requester({ coords: { ...TLV, accuracy: 1500 }, reason: 'ok' });
    const res = await getFirstFix(fn);
    expect(res.status === 'ok' && res.fix.needsRefine).toBe(true);
  });

  it('falls back to one precise request when the coarse one times out', async () => {
    const { fn, calls } = requester(
      { coords: null, reason: 'unavailable' },
      { coords: { ...TLV, accuracy: 2000 }, reason: 'ok' },
    );
    const res = await getFirstFix(fn);
    expect(calls).toEqual([COARSE_FIX_OPTIONS, PRECISE_FALLBACK_OPTIONS]);
    // A precise answer is never refined again, whatever its accuracy.
    expect(res).toEqual({ status: 'ok', fix: { coords: { ...TLV, accuracy: 2000 }, needsRefine: false } });
  });

  it('never re-prompts after a denial', async () => {
    const { fn, calls } = requester({ coords: null, reason: 'denied' });
    expect(await getFirstFix(fn)).toEqual({ status: 'denied' });
    expect(calls).toHaveLength(1);
  });

  it('reports unavailable when both requests produce nothing', async () => {
    const { fn } = requester({ coords: null, reason: 'unavailable' }, { coords: null, reason: 'unavailable' });
    expect(await getFirstFix(fn)).toEqual({ status: 'unavailable' });
  });

  it('reports denied when the fallback request is denied', async () => {
    const { fn } = requester({ coords: null, reason: 'unavailable' }, { coords: null, reason: 'denied' });
    expect(await getFirstFix(fn)).toEqual({ status: 'denied' });
  });

  it('keeps worst-case GPS wait at or below 12s (coarse + fallback timeouts)', () => {
    expect(COARSE_FIX_OPTIONS.timeout + PRECISE_FALLBACK_OPTIONS.timeout).toBeLessThanOrEqual(12000);
    expect(COARSE_FIX_OPTIONS.enableHighAccuracy).toBe(false);
    expect(COARSE_FIX_OPTIONS.maximumAge).toBeGreaterThan(0);
  });
});

describe('needsRefinement', () => {
  it('never refines a precise request', () => {
    expect(needsRefinement({ ...TLV, accuracy: 5000 }, false)).toBe(false);
  });
  it('refines a coarse fix with unknown accuracy', () => {
    expect(needsRefinement({ ...TLV }, true)).toBe(true);
    expect(needsRefinement({ ...TLV, accuracy: NaN }, true)).toBe(true);
  });
  it('uses the good-enough threshold', () => {
    expect(needsRefinement({ ...TLV, accuracy: GOOD_ENOUGH_ACCURACY_METERS }, true)).toBe(false);
    expect(needsRefinement({ ...TLV, accuracy: GOOD_ENOUGH_ACCURACY_METERS + 1 }, true)).toBe(true);
  });
});

describe('shouldApplyRefinedFix', () => {
  it('ignores a missing refined fix', () => {
    expect(shouldApplyRefinedFix(TLV, null)).toBe(false);
  });
  it('ignores jitter under the shift threshold (~11m)', () => {
    expect(shouldApplyRefinedFix(TLV, { lat: TLV.lat + 0.0001, lng: TLV.lng })).toBe(false);
  });
  it('applies a real move (~1.1km)', () => {
    expect(shouldApplyRefinedFix(TLV, { lat: TLV.lat + 0.01, lng: TLV.lng })).toBe(true);
  });
  it('ignores non-finite coordinates', () => {
    expect(shouldApplyRefinedFix(TLV, { lat: NaN, lng: TLV.lng })).toBe(false);
  });
});
