import { describe, it, expect, vi } from 'vitest';

vi.mock('mapbox-gl', () => ({ default: {} }));

import { earlyHiddenLayerIds, hidePoiLayersEarly } from '../mapStyleConfig';

const STREETS_V12_SAMPLE = [
  'land', 'water', 'road-primary', 'building',
  'poi-label', 'transit-label', 'airport-label', 'road-label-small', 'road-label',
  'place-label', 'natural-line-label', 'waterway-label', 'park-pins', 'routes-active',
];

describe('AD5: shops / restaurants are hidden before the first paint', () => {
  // Mirrors the full declutter's label sweep (keep tokens: park / natural / water / place / road).
  it('hides the POI / transit / small-road labels, keeps places, roads, nature and our layers', () => {
    const hidden = earlyHiddenLayerIds(STREETS_V12_SAMPLE);
    expect(hidden).toEqual(expect.arrayContaining(['poi-label', 'transit-label', 'airport-label', 'road-label-small']));
    for (const keep of ['road-label', 'place-label', 'natural-line-label', 'waterway-label', 'park-pins', 'routes-active', 'land', 'building']) {
      expect(hidden).not.toContain(keep);
    }
  });

  it('runs once the style JSON is parsed, sets visibility none on each hidden layer', () => {
    const setLayoutProperty = vi.fn();
    const map = {
      getStyle: () => ({ layers: STREETS_V12_SAMPLE.map((id) => ({ id })) }),
      setLayoutProperty,
    } as unknown as Parameters<typeof hidePoiLayersEarly>[0];
    expect(hidePoiLayersEarly(map)).toBe(true);
    expect(setLayoutProperty).toHaveBeenCalledWith('poi-label', 'visibility', 'none');
    expect(setLayoutProperty).not.toHaveBeenCalledWith('place-label', 'visibility', 'none');
  });

  it('style not parsed yet: reports false so the caller tries again on the next styledata', () => {
    const notYet = { getStyle: () => { throw new Error('Style is not done loading'); } } as unknown as Parameters<typeof hidePoiLayersEarly>[0];
    const empty = { getStyle: () => ({ layers: [] }) } as unknown as Parameters<typeof hidePoiLayersEarly>[0];
    expect(hidePoiLayersEarly(notYet)).toBe(false);
    expect(hidePoiLayersEarly(empty)).toBe(false);
  });
});
