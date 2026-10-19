import { describe, it, expect } from 'vitest';
import type { Park } from '@/features/parks/core/types/park.types';
import { findRoutesWithStops, countRouteStops } from '../routes-with-stops';
import { sessionTypesForRoute, ROUTE_SESSION_TYPES } from '../route-session-types';
import { todayScheduledKind } from '../today-schedule-kind';
import { focusFromMap } from '../map-focus';
import { buildLollipopPath, rotateLoopToNearest, pickClosestKm } from '../smart-walk-backbone';

// ~0.001° lat ≈ 111 m.
const USER = { lat: 32.0, lng: 34.8 };
const line = (lat: number, lng0: number, n = 10): [number, number][] =>
  Array.from({ length: n }, (_, i) => [lng0 + i * 0.001, lat]);
const park = (id: string, lat: number, lng: number, over: Partial<Park> = {}): Park =>
  ({ id, name: id, location: { lat, lng }, hasUsableEquipment: false, facilityType: 'urban_spot', urbanType: 'bench', ...over } as unknown as Park);
const gym = (id: string, lat: number, lng: number) => park(id, lat, lng, { hasUsableEquipment: true, facilityType: 'gym_park' } as unknown as Partial<Park>);

describe('countRouteStops', () => {
  it('counts parks within the snap radius, strength separately', () => {
    const path = line(32.0, 34.8);
    const parks = [gym('g1', 32.0005, 34.802), park('b1', 32.0, 34.806), gym('far', 32.01, 34.802)];
    expect(countRouteStops(path, parks)).toEqual({ stopCount: 2, strengthStopCount: 1 });
  });
});

describe('findRoutesWithStops', () => {
  const parks = [gym('g1', 32.0, 34.803)];
  it('keeps a route near the user with stops, drops one without stops', () => {
    const r = findRoutesWithStops({
      routes: [{ id: 'near', name: 'קרוב', path: line(32.0, 34.8) }, { id: 'empty', path: line(32.003, 34.8) }],
      parks, user: USER,
    });
    expect(r.map((x) => x.routeId)).toEqual(['near']);
    expect(r[0].sessionTypes.map((t) => t.id)).toEqual(['walk_with_stops']);
  });

  it('a far route counts only when the user is looking at it (and it is within reach)', () => {
    const farPath = line(32.015, 34.8); // ~1.7 km north
    const farParks = [gym('g2', 32.015, 34.803)];
    const routes = [{ id: 'far', path: farPath }];
    expect(findRoutesWithStops({ routes, parks: farParks, user: USER })).toEqual([]);
    const r = findRoutesWithStops({ routes, parks: farParks, user: USER, focus: { lat: 32.015, lng: 34.803 } });
    expect(r).toHaveLength(1);
    expect(r[0].focused).toBe(true);
    // Too far from the user (> 3 km) even when browsed.
    expect(findRoutesWithStops({
      routes: [{ id: 'xfar', path: line(32.05, 34.8) }], parks: [gym('g3', 32.05, 34.803)], user: USER, focus: { lat: 32.05, lng: 34.803 },
    })).toEqual([]);
  });
});

describe('route session types (extensible)', () => {
  it('only implemented types are offered; today = walk with stops', () => {
    expect(sessionTypesForRoute({ stopCount: 3, strengthStopCount: 2 }).map((t) => t.id)).toEqual(['walk_with_stops']);
    expect(sessionTypesForRoute({ stopCount: 0, strengthStopCount: 0 })).toEqual([]);
  });
  it('a future type plugs in by flipping implemented', () => {
    const reg = ROUTE_SESSION_TYPES.map((t) => (t.id === 'amrap_combo' ? { ...t, implemented: true } : t));
    expect(sessionTypesForRoute({ stopCount: 3, strengthStopCount: 1 }, reg).map((t) => t.id)).toEqual(['walk_with_stops', 'amrap_combo']);
    expect(sessionTypesForRoute({ stopCount: 3, strengthStopCount: 0 }, reg).map((t) => t.id)).toEqual(['walk_with_stops']);
  });
});

describe('todayScheduledKind', () => {
  it('maps today\'s schedule entries', () => {
    expect(todayScheduledKind(null)).toBe('unknown');
    expect(todayScheduledKind([])).toBe('none');
    expect(todayScheduledKind([{ type: 'rest' }])).toBe('rest');
    expect(todayScheduledKind([{ type: 'training', scheduledCategories: ['strength'] }])).toBe('strength');
    expect(todayScheduledKind([{ type: 'training', scheduledCategories: ['cardio'] }])).toBe('run');
    expect(todayScheduledKind([{ type: 'training', scheduledCategories: ['walking'] }])).toBe('walk');
    expect(todayScheduledKind([{ type: 'training' }])).toBe('strength');
  });
  it('a completed workout is no longer "scheduled"', () => {
    expect(todayScheduledKind([{ type: 'training', scheduledCategories: ['strength'], completed: true }])).toBe('none');
  });
});

describe('focusFromMap', () => {
  const bounds = (lat: number, lng: number, d: number) => ({ swLat: lat - d, swLng: lng - d, neLat: lat + d, neLng: lng + d });
  it('selected park wins', () => {
    expect(focusFromMap({ location: { lat: 32.02, lng: 34.8 } }, bounds(31, 34, 0.001), USER)).toEqual({ lat: 32.02, lng: 34.8 });
  });
  it('zoomed-in viewport centre; zoomed-out → null', () => {
    expect(focusFromMap(null, bounds(32.02, 34.8, 0.005), USER)).toEqual({ lat: 32.02, lng: 34.8 });
    expect(focusFromMap(null, bounds(32.02, 34.8, 0.2), USER)).toBeNull();
  });
  it('a focus on the user\'s own spot is not "browsing"', () => {
    expect(focusFromMap(null, bounds(32.0, 34.8, 0.005), USER)).toBeNull();
  });
});

describe('smart walk backbone (pure parts)', () => {
  it('out-and-back when there is no loop; lollipop with a loop; starts and ends at the user', () => {
    const out: [number, number][] = [[34.8, 32.0], [34.801, 32.0], [34.802, 32.0]];
    const ob = buildLollipopPath(out, null);
    expect(ob[0]).toEqual(out[0]);
    expect(ob[ob.length - 1]).toEqual(out[0]);
    expect(ob).toHaveLength(5);
    const loop: [number, number][] = [[34.802, 32.0], [34.803, 32.001], [34.804, 32.0], [34.802, 32.0]];
    const lp = buildLollipopPath(out, loop);
    expect(lp).toHaveLength(3 + 3 + 2);
    expect(lp[lp.length - 1]).toEqual(out[0]);
    expect(lp).toContainEqual([34.803, 32.001]);
  });
  it('rotates a loop to start (and close) at the park', () => {
    const loop: [number, number][] = [[34.81, 32.0], [34.82, 32.0], [34.82, 32.01], [34.81, 32.0]];
    const r = rotateLoopToNearest(loop, { lat: 32.0, lng: 34.82 });
    expect(r[0]).toEqual([34.82, 32.0]);
    expect(r[r.length - 1]).toEqual([34.82, 32.0]);
    expect(r).toHaveLength(4);
  });
  it('picks the candidate closest to the target km', () => {
    expect(pickClosestKm([{ distance: 1 }, { distance: 2.4 }, { distance: 4 }], 2.5)?.distance).toBe(2.4);
    expect(pickClosestKm([], 2)).toBeNull();
  });
});
