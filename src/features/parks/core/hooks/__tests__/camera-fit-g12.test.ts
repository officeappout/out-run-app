import { describe, it, expect } from 'vitest';
import {
  previewFitDelayMs,
  PREVIEW_FIT_DEBOUNCE_MS,
  overviewFitBounds,
  overviewFitPadding,
  OVERVIEW_DRAWER_MARGIN_PX,
} from '../camera-fit';

describe('G1.2 previewFitDelayMs — leading-edge debounce', () => {
  it('fits at once when at rest (nothing pending, last schedule long ago)', () => {
    expect(previewFitDelayMs(false, 10_000)).toBe(0);
    expect(previewFitDelayMs(false, Date.now())).toBe(0); // first fit ever (ref starts at 0)
  });
  it('keeps the trailing debounce while a fit is pending (fast swipes collapse)', () => {
    expect(previewFitDelayMs(true, 10_000)).toBe(PREVIEW_FIT_DEBOUNCE_MS);
    expect(previewFitDelayMs(true, 50)).toBe(PREVIEW_FIT_DEBOUNCE_MS);
  });
  it('debounces a focus change right after a previous one even if that fit already ran', () => {
    expect(previewFitDelayMs(false, 200)).toBe(PREVIEW_FIT_DEBOUNCE_MS);
  });
});

describe('G1.2 overviewFitBounds — route + round-trip walk legs', () => {
  const route: [number, number][] = [[34.60, 31.52], [34.61, 31.53]];
  it('route only when there are no walk legs (same bounds as before)', () => {
    expect(overviewFitBounds(route, null)).toEqual([34.60, 31.52, 34.61, 31.53]);
  });
  it('extends the bounds to include the walk legs (user position off the route)', () => {
    const legs: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { leg: 'there' }, geometry: { type: 'LineString', coordinates: [[34.58, 31.50], [34.60, 31.52]] } },
        { type: 'Feature', properties: { leg: 'back' }, geometry: { type: 'LineString', coordinates: [[34.61, 31.53], [34.58, 31.50]] } },
      ],
    };
    expect(overviewFitBounds(route, legs)).toEqual([34.58, 31.50, 34.61, 31.53]);
  });
  it('ignores non-finite coords and non-line features', () => {
    const legs = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[Infinity, 1], [NaN, 2]] } },
      ],
    } as GeoJSON.FeatureCollection;
    expect(overviewFitBounds([...route, [NaN, 3] as [number, number]], legs)).toEqual([34.60, 31.52, 34.61, 31.53]);
  });
  it('null when the route has fewer than 2 valid points (fit skipped, as before)', () => {
    expect(overviewFitBounds([[34.6, 31.5]], null)).toBeNull();
    expect(overviewFitBounds(null, null)).toBeNull();
  });
});

describe('G1.2 overviewFitPadding — margin above the drawer', () => {
  it('bottom = drawer height + margin; top/sides unchanged', () => {
    expect(overviewFitPadding(464, 140, 70)).toEqual({ top: 140, bottom: 464 + OVERVIEW_DRAWER_MARGIN_PX, left: 70, right: 70 });
    expect(OVERVIEW_DRAWER_MARGIN_PX).toBeGreaterThan(0);
  });
});
