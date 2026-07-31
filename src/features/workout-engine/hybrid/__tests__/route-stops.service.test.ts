import { describe, it, expect } from 'vitest';
import { resolveRouteStops } from '../route-stops.service';

// A short east–west route: vertex 0 at (lat0,lng0), vertex 1 ~1.1km east, vertex 2 ~2.2km east.
const ROUTE: [number, number][] = [[0, 0], [0.01, 0], [0.02, 0]];

const gym = (id: string, lng: number, lat = 0): any => ({
  id, location: { lat, lng }, category: 'gym_park', gymEquipment: [],
});
const stretch = (id: string, lng: number, lat = 0): any => ({
  id, location: { lat, lng }, natureType: 'observation_point',
});

describe('resolveRouteStops — P4 proximity-dedupe', () => {
  it('drops a second stop within MIN_STOP_GAP_M of a kept one (no two-at-same-vertex)', () => {
    // A ~1m from vertex0, B ~55m from vertex0 → ~54m apart (< 150) → B dropped.
    // C ~111m from vertex1 → kept (far from A).
    const stops = resolveRouteStops(ROUTE, [
      gym('A', 0.00001), gym('B', 0.0005), gym('C', 0.01, 0.001),
    ]);
    expect(stops.map((s) => s.parkId).sort()).toEqual(['poi:A', 'poi:C'].map((s) => s.replace('poi:', '')));
    // exactly one stop at wp0 (the overlap is gone)
    expect(stops.filter((s) => s.waypointIndex === 0).length).toBe(1);
    expect(stops.length).toBe(2);
  });

  it('on a same-spot cluster, the equipped/strength stop wins over the closer-to-path stretch', () => {
    // Stretch S is CLOSER to the vertex (~1m) but strength G (~33m) must win the cluster.
    const stops = resolveRouteStops(ROUTE, [
      stretch('S', 0.00001), gym('G', 0.0003),
    ]);
    expect(stops.length).toBe(1);
    expect(stops[0].activityType).toBe('strength');
    expect(stops[0].parkId).toBe('G');
  });

  it('keeps stops that are farther apart than the gap (spread along the route)', () => {
    const stops = resolveRouteStops(ROUTE, [
      gym('A', 0), gym('C', 0.01, 0.001), gym('D', 0.02, 0.001),
    ]);
    expect(stops.length).toBe(3);
    expect(stops.map((s) => s.waypointIndex)).toEqual([0, 1, 2]); // path order preserved
  });

  it('respects an explicit minStopGapMeters override', () => {
    // With a tiny gap, both near-vertex-0 stops survive; with the default 150m, one drops.
    const wide = resolveRouteStops(ROUTE, [gym('A', 0.00001), gym('B', 0.0005)], { minStopGapMeters: 5 });
    expect(wide.length).toBe(2);
    const tight = resolveRouteStops(ROUTE, [gym('A', 0.00001), gym('B', 0.0005)]);
    expect(tight.length).toBe(1);
  });
});
