import { describe, expect, it } from 'vitest';
import {
  availableLayers, betterSide, clockText, gaugeLayout, indexFromScroll, layerAfterSelection, vsGap, type VsSide,
} from '../run-chrome/run-chrome-logic';

const S = (o: Partial<VsSide>): VsSide => ({ distanceKm: 0, paceSecPerKm: 0, avgPaceSecPerKm: 0, elapsedSec: 0, elevGainM: 0, ...o });

describe('gauge layout', () => {
  it('puts a 10 s band in the middle ~24 % and the pointer inside it when on target', () => {
    const g = gaugeLayout({ nowSec: 291, loSec: 285, hiSec: 295 });
    expect(g.band!.widthPct).toBeGreaterThan(22);
    expect(g.band!.widthPct).toBeLessThan(26);
    expect(g.band!.leftPct + g.band!.widthPct / 2).toBeCloseTo(50, 0);
    expect(g.inBand).toBe(true);
    expect(g.pointerPct).toBeGreaterThan(g.band!.leftPct);
  });
  it('faster than target moves the pointer to the fast (left) side, slower to the right, clamped', () => {
    const fast = gaugeLayout({ nowSec: 200, loSec: 285, hiSec: 295 });
    const slow = gaugeLayout({ nowSec: 500, loSec: 285, hiSec: 295 });
    expect(fast.pointerPct).toBe(0);
    expect(slow.pointerPct).toBe(100);
    expect(fast.inBand).toBe(false);
  });
  it('free run: no band, window around the average, unknown pace centres', () => {
    const g = gaugeLayout({ nowSec: 391, avgSec: 372 });
    expect(g.band).toBeNull();
    expect(g.avgPct).toBeCloseTo(50, 5);
    expect(g.pointerPct).toBeGreaterThan(50);
    expect(gaugeLayout({ nowSec: 0 }).pointerPct).toBe(50);
  });
});

describe('top layers', () => {
  it('layers depend on the flag and on a picked rival', () => {
    expect(availableLayers(false, true)).toEqual(['blocks']);
    expect(availableLayers(true, false)).toEqual(['blocks', 'together']);
    expect(availableLayers(true, true)).toEqual(['blocks', 'together', 'race']);
  });
  it('picking a face jumps to the race layer; clearing leaves it', () => {
    const L = availableLayers(true, true);
    expect(layerAfterSelection(L, 'together', 'u1', null)).toBe('race');
    expect(layerAfterSelection(L, 'race', null, 'u1')).toBe('together');
    expect(layerAfterSelection(L, 'blocks', null, null)).toBe('blocks');
    expect(layerAfterSelection(['blocks', 'together'], 'race', null, null)).toBe('blocks');
  });
  it('scroll position maps to the nearest layer', () => {
    expect(indexFromScroll(0, 390, 3)).toBe(0);
    expect(indexFromScroll(-400, 390, 3)).toBe(1);
    expect(indexFromScroll(800, 390, 3)).toBe(2);
    expect(indexFromScroll(5000, 390, 3)).toBe(2);
    expect(indexFromScroll(10, 0, 3)).toBe(0);
  });
});

describe('me vs them', () => {
  it('gap, leader and trend', () => {
    expect(vsGap(S({ distanceKm: 12.4 }), S({ distanceKm: 12.44 }), null)).toEqual({ meters: -40, leader: 'them', trend: 'steady' });
    expect(vsGap(S({ distanceKm: 12.4 }), S({ distanceKm: 12.44 }), -60).trend).toBe('closing');
    expect(vsGap(S({ distanceKm: 12.4 }), S({ distanceKm: 12.44 }), -20).trend).toBe('growing');
    expect(vsGap(S({ distanceKm: 5 }), S({ distanceKm: 5.004 }), null).leader).toBe('even');
    expect(vsGap(S({ distanceKm: 5.1 }), S({ distanceKm: 5 }), null).leader).toBe('me');
  });
  it('better side per row', () => {
    expect(betterSide('pace', S({ paceSecPerKm: 291 }), S({ paceSecPerKm: 284 }))).toBe('them');
    expect(betterSide('distance', S({ distanceKm: 3 }), S({ distanceKm: 2 }))).toBe('me');
    expect(betterSide('elev', S({ elevGainM: 38 }), S({ elevGainM: 52 }))).toBe('them');
    expect(betterSide('time', S({}), S({}))).toBeNull();
    expect(betterSide('pace', S({}), S({ paceSecPerKm: 300 }))).toBeNull();
  });
  it('clock text', () => {
    expect(clockText(1450)).toBe('24:10');
    expect(clockText(3723)).toBe('1:02:03');
    expect(clockText(NaN)).toBe('0:00');
  });
});
