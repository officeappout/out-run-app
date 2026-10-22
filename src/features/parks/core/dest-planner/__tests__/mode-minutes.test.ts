import { describe, it, expect } from 'vitest';
import { defaultPlannerMode, minutesForKm, modeMinutes } from '../mode-minutes';
import { distanceAlongToNearest, isFitnessPark, pickViaParks } from '../via-park';
import { FLAG_DEFS, FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';

describe('mode minutes', () => {
  it('uses the app pace table (walk 5, run 10, bike 20 km/h)', () => {
    expect(modeMinutes(1.8)).toEqual({ walking: 22, running: 11, cycling: 5 });
  });
  it('the active mode shows the generator minutes for its shortest option', () => {
    expect(modeMinutes(1.8, { mode: 'walking', minutes: 24 })).toEqual({ walking: 24, running: 11, cycling: 5 });
    expect(modeMinutes(1.8, { mode: 'walking', minutes: null }).walking).toBe(22);
  });
  it('at least 1 minute; no distance → null', () => {
    expect(minutesForKm(0.05, 'cycling')).toBe(1);
    expect(modeMinutes(null)).toEqual({ walking: null, running: null, cycling: null });
    expect(minutesForKm(Number.NaN, 'walking')).toBeNull();
  });
  it('default tab = the last activity, else walking', () => {
    expect(defaultPlannerMode('running')).toBe('running');
    expect(defaultPlannerMode('cycling')).toBe('cycling');
    expect(defaultPlannerMode('workout')).toBe('walking');
    expect(defaultPlannerMode(undefined)).toBe('walking');
  });
});

describe('via park picking', () => {
  const from = { lat: 32.08, lng: 34.78 };
  const to = { lat: 32.096, lng: 34.78 }; // ~1.78 km north
  const park = (id: string, lat: number, lng: number, extra = {}) => ({ id, name: `park ${id}`, location: { lat, lng }, isPrimaryFitness: true, ...extra });

  it('fitness parks only (catalog flags)', () => {
    expect(isFitnessPark({ id: 'a', facilityType: 'gym_park' })).toBe(true);
    expect(isFitnessPark({ id: 'b', hasUsableEquipment: true })).toBe(true);
    expect(isFitnessPark({ id: 'c', facilityType: 'court' })).toBe(false);
  });

  it('smallest detour first; far, end-adjacent, nameless and non-fitness parks are skipped', () => {
    const picks = pickViaParks(from, to, [
      park('far', 32.088, 34.80),             // ~1.9 km sideways
      park('near', 32.088, 34.7815),          // on the way
      park('side', 32.088, 34.785),           // small detour
      park('atStart', 32.0805, 34.7801),      // at the start
      park('noName', 32.087, 34.7805, { name: ' ' }),
      park('court', 32.087, 34.7802, { isPrimaryFitness: false, facilityType: 'court' }),
    ]);
    expect(picks.map((p) => p.park.id)).toEqual(['near', 'side']);
    expect(picks[0].detourKm).toBeLessThan(picks[1].detourKm);
  });

  it('two parks within 150 m of each other count once', () => {
    const picks = pickViaParks(from, to, [park('a', 32.088, 34.7815), park('b', 32.0885, 34.7816)]);
    expect(picks).toHaveLength(1);
  });

  it('too short a trip → no stop', () => {
    expect(pickViaParks(from, { lat: 32.082, lng: 34.78 }, [park('x', 32.081, 34.7801)])).toEqual([]);
  });

  it('stop distance along the path', () => {
    const path: [number, number][] = [[34.78, 32.08], [34.78, 32.089], [34.78, 32.096]];
    expect(distanceAlongToNearest(path, { lat: 32.089, lng: 34.7801 })).toBe(1);
    expect(distanceAlongToNearest([], { lat: 0, lng: 0 })).toBeNull();
  });
});

describe('enable_destination_planner_v1 flag', () => {
  it('default off, super admins preview', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_destination_planner_v1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
    expect(FIRESTORE_FLAG_DEFAULTS.enable_destination_planner_v1).toBe(false);
  });
});
