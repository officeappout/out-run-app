import { describe, it, expect } from 'vitest';
import {
  planFromPoint, buildPrefixKm, snapToVertex, detectTopology,
  LOOP_ENDPOINT_THRESHOLD_M, type RoutePath,
} from '../plan-from-point';
import type { ResolvedRouteStop } from '../route-stops.service';

// A straight east–west line: 7 vertices, equal lng spacing → monotonically increasing km.
const PATH: RoutePath = [
  [0.00, 0], [0.01, 0], [0.02, 0], [0.03, 0], [0.04, 0], [0.05, 0], [0.06, 0],
];

/** Minimal ResolvedRouteStop at a given canonical waypoint index. */
function stopAt(waypointIndex: number, id: string): ResolvedRouteStop {
  return {
    stopId: id,
    locationKind: 'gym',
    lat: 0,
    lng: waypointIndex * 0.01,
    waypointIndex,
    availableEquipment: [],
    activityType: 'strength',
    cooldownEligible: false,
    distToPathM: 0,
  };
}

describe('planFromPoint — Axis ① (entry-relative ordering)', () => {
  it('one_way from the start: keeps all stops, orders them by distance-from-entry', () => {
    const plan = planFromPoint({
      canonical: { path: PATH },
      entry: { position: { lat: 0, lng: 0 } }, // snaps to vertex 0
      direction: 'forward',
      topology: 'one_way',
      stops: [stopAt(5, 'far'), stopAt(2, 'near')], // deliberately out of order
    });
    expect(plan.entryIndex).toBe(0);
    expect(plan.meta.clippedStops).toBe(0);
    expect(plan.stops.map((s) => s.stop.stopId)).toEqual(['near', 'far']);
    expect(plan.stops[0].traversalKm).toBeLessThan(plan.stops[1].traversalKm);
  });

  it('one_way mid-entry: CLIPS stops behind the entry (decision ①a), re-bases traversalKm to 0', () => {
    const plan = planFromPoint({
      canonical: { path: PATH },
      entry: { position: { lat: 0, lng: 0.03 } }, // snaps to vertex 3
      direction: 'forward',
      topology: 'one_way',
      stops: [stopAt(2, 'behind'), stopAt(5, 'ahead')],
    });
    expect(plan.entryIndex).toBe(3);
    expect(plan.meta.clippedStops).toBe(1);
    expect(plan.stops.map((s) => s.stop.stopId)).toEqual(['ahead']);
    // traversal is measured from the entry, not from path[0]
    expect(plan.stops[0].traversalKm).toBeGreaterThan(0);
    expect(plan.stops[0].traversalKm).toBeCloseTo(plan.meta.totalKm - plan.entryKm - (plan.meta.totalKm - buildPrefixKm(PATH)[5]), 6);
    // traversal geometry starts at the entry vertex
    expect(plan.traversal[0]).toEqual(PATH[3]);
    expect(plan.traversal.length).toBe(4); // vertices 3..6
  });

  it('loop mid-entry: keeps every stop, a stop just behind the entry wraps to LAST', () => {
    const plan = planFromPoint({
      canonical: { path: PATH },
      entry: { position: { lat: 0, lng: 0.03 } }, // vertex 3
      direction: 'forward',
      topology: 'loop',
      stops: [stopAt(2, 'just_behind'), stopAt(5, 'just_ahead')],
    });
    expect(plan.meta.clippedStops).toBe(0);
    // ahead is reached first; the one behind the entry comes around last
    expect(plan.stops.map((s) => s.stop.stopId)).toEqual(['just_ahead', 'just_behind']);
    expect(plan.stops[1].traversalKm).toBeGreaterThan(plan.stops[0].traversalKm);
    // cyclic traversal is rotated to the entry and closes back to it
    expect(plan.traversal[0]).toEqual(PATH[3]);
    expect(plan.traversal[plan.traversal.length - 1]).toEqual(PATH[3]);
  });

  it('deferred axes (backward / out_and_back) resolve to the supported behavior + are reported', () => {
    const plan = planFromPoint({
      canonical: { path: PATH },
      entry: { position: { lat: 0, lng: 0 } },
      direction: 'backward',
      topology: 'out_and_back',
      stops: [stopAt(4, 'x')],
    });
    expect(plan.direction).toBe('forward'); // Axis ② not built yet
    expect(plan.meta.deferredAxes.length).toBe(2);
    expect(plan.meta.deferredAxes.some((d) => d.startsWith('direction:'))).toBe(true);
    expect(plan.meta.deferredAxes.some((d) => d.startsWith('topology:'))).toBe(true);
  });

  it('degenerate route (< 2 vertices) → empty, well-formed plan', () => {
    const plan = planFromPoint({
      canonical: { path: [[0, 0]] },
      entry: { position: { lat: 0, lng: 0 } },
      direction: 'forward',
      topology: 'one_way',
      stops: [stopAt(0, 'x')],
    });
    expect(plan.stops).toEqual([]);
    expect(plan.meta.totalKm).toBe(0);
  });

  it('pure helpers: buildPrefixKm is monotonic, snapToVertex finds the nearest vertex', () => {
    const km = buildPrefixKm(PATH);
    expect(km[0]).toBe(0);
    for (let i = 1; i < km.length; i++) expect(km[i]).toBeGreaterThan(km[i - 1]);
    expect(snapToVertex(PATH, { lat: 0, lng: 0.0405 })).toBe(4);
  });
});

describe('planFromPoint — traversalIndex reindex (the composeHybridSession waypoint frame)', () => {
  it('one_way mid-entry: kept stop reindexes to (wp − entryIndex); behind-entry stop is clipped', () => {
    const plan = planFromPoint({
      canonical: { path: PATH },
      entry: { position: { lat: 0, lng: 0.03 } }, // entryIndex = 3
      direction: 'forward',
      topology: 'one_way',
      stops: [stopAt(2, 'behind'), stopAt(5, 'ahead')],
    });
    expect(plan.entryIndex).toBe(3);
    expect(plan.stops.map((s) => s.stop.stopId)).toEqual(['ahead']); // behind clipped
    expect(plan.stops[0].traversalIndex).toBe(2);                    // 5 − 3
    // the reindexed waypointIndex is a valid index into the traversal geometry
    expect(plan.traversal[plan.stops[0].traversalIndex]).toEqual(PATH[5]);
  });

  it('loop mid-entry: every stop kept; the one just behind the entry wraps to LAST via modulo', () => {
    const plan = planFromPoint({
      canonical: { path: PATH },
      entry: { position: { lat: 0, lng: 0.03 } }, // entryIndex = 3, N = 7
      direction: 'forward',
      topology: 'loop',
      stops: [stopAt(2, 'just_behind'), stopAt(5, 'just_ahead')],
    });
    // traversal order: ahead first (idx 2), the behind-stop wraps to the end
    expect(plan.stops.map((s) => s.stop.stopId)).toEqual(['just_ahead', 'just_behind']);
    expect(plan.stops[0].traversalIndex).toBe(2);           // (5 − 3 + 7) % 7
    expect(plan.stops[1].traversalIndex).toBe(6);           // (2 − 3 + 7) % 7 → wraps last
    expect(plan.stops[1].traversalIndex).toBeGreaterThan(plan.stops[0].traversalIndex);
    // wrapped index still indexes the real canonical vertex inside the cyclic traversal
    expect(plan.traversal[plan.stops[1].traversalIndex]).toEqual(PATH[2]);
  });
});

describe('detectTopology — closed loop vs linear one-way', () => {
  it("open route (ends far apart) → 'one_way'", () => {
    expect(detectTopology(PATH)).toBe('one_way'); // ends ~6.6km apart
  });

  it("closed route (ends within the threshold) → 'loop'", () => {
    // a small square-ish loop whose last vertex returns ~5m from the first
    const loop: RoutePath = [
      [0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0.00005, 0],
    ];
    const [aLng, aLat] = loop[0];
    const [bLng, bLat] = loop[loop.length - 1];
    // guard the fixture: endpoints genuinely within the documented threshold
    expect(Math.abs(bLng - aLng)).toBeLessThan(0.001);
    expect(detectTopology(loop)).toBe('loop');
    expect(LOOP_ENDPOINT_THRESHOLD_M).toBeGreaterThan(0);
  });

  it('degenerate (< 3 vertices) → one_way', () => {
    expect(detectTopology([[0, 0], [0.01, 0]])).toBe('one_way');
  });
});
