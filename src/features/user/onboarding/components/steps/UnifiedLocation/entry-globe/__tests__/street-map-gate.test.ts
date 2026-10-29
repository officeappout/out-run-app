import { describe, it, expect } from 'vitest';
import { STREET_MAP_IDLE_DELAY_MS, STREET_MAP_MAX_DEFER_MS, shouldMountStreetMap } from '../street-map-gate';

describe('AC2: the street map is built after the Earth, not in the same frames', () => {
  it('globe off: mounts right away (today\'s behaviour)', () => {
    expect(shouldMountStreetMap({ entryGlobe: false, globeSettled: false, leftRest: false })).toBe(true);
  });

  it('globe on, Earth still loading, user at rest: waits', () => {
    expect(shouldMountStreetMap({ entryGlobe: true, globeSettled: false, leftRest: false })).toBe(false);
  });

  it('globe on: mounts once the Earth settled, or as soon as the user acts', () => {
    expect(shouldMountStreetMap({ entryGlobe: true, globeSettled: true, leftRest: false })).toBe(true);
    expect(shouldMountStreetMap({ entryGlobe: true, globeSettled: false, leftRest: true })).toBe(true);
  });

  it('sticky: a mounted street map is never torn down when the flag turns on late', () => {
    expect(shouldMountStreetMap({ entryGlobe: true, globeSettled: false, leftRest: false, alreadyMounted: true })).toBe(true);
  });

  it('the cap leaves room for the idle beat and is short enough for a landing', () => {
    expect(STREET_MAP_IDLE_DELAY_MS).toBeLessThan(STREET_MAP_MAX_DEFER_MS);
    // Lift (1100) + region (1700): the street map is up before the earliest landing.
    expect(STREET_MAP_MAX_DEFER_MS).toBeLessThanOrEqual(1100 + 1700 + 500);
  });
});
