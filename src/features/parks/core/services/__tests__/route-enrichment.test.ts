import { describe, it, expect } from 'vitest';
import {
  findNearestAssociations,
  computeClimbRouteAssociations,
  buildEnrichmentWritesFromAssociations,
  CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS,
  type ClimbJoinInput,
} from '../route-enrichment.service';

const KM_PER_DEGREE = 111;

const climbNearRoute: ClimbJoinInput = {
  id: 'climb-1',
  path: [[34.77 + 0.0001, 32.05]], // ~10m east of routeA's only point
  type: 'terrain',
  climbType: 'short-sharp',
};

const climbFarFromRoute: ClimbJoinInput = {
  id: 'climb-2',
  path: [[34.77, 32.05 + 2 / KM_PER_DEGREE]], // ~2km north
  type: 'stairs',
  climbType: 'stairs',
};

const routeA = { id: 'route-a', path: [[34.77, 32.05]] as [number, number][] };
const routeB = { id: 'route-b', path: [[34.78, 32.06]] as [number, number][] }; // far from both climbs

describe('findNearestAssociations', () => {
  it('associates a climb with a candidate within the threshold', () => {
    const results = findNearestAssociations(climbNearRoute, [routeA], 'route', CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS);
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ climbId: 'climb-1', targetId: 'route-a', targetType: 'route' });
    expect(results[0].distanceMeters).toBeLessThan(CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS);
  });

  it('excludes a candidate beyond the threshold', () => {
    const results = findNearestAssociations(climbFarFromRoute, [routeA], 'route', CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS);
    expect(results.length).toBe(0);
  });

  it('tags targetType correctly for segments', () => {
    const results = findNearestAssociations(climbNearRoute, [routeA], 'segment', CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS);
    expect(results[0].targetType).toBe('segment');
  });

  it('skips empty-path candidates without throwing', () => {
    const empty = { id: 'empty', path: [] as [number, number][] };
    expect(() => findNearestAssociations(climbNearRoute, [empty], 'route')).not.toThrow();
    expect(findNearestAssociations(climbNearRoute, [empty], 'route')).toEqual([]);
  });

  it('uses the default threshold constant when none is passed', () => {
    const results = findNearestAssociations(climbNearRoute, [routeA], 'route');
    expect(results.length).toBe(1);
  });
});

describe('computeClimbRouteAssociations', () => {
  it('checks every climb against every route (full cross-product)', () => {
    const results = computeClimbRouteAssociations([climbNearRoute, climbFarFromRoute], [routeA, routeB]);
    // Only climbNearRoute × routeA is within 40m; everything else exceeds it.
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({ climbId: 'climb-1', targetId: 'route-a', targetType: 'route' });
  });

  it('returns empty when no climb is near any route', () => {
    const results = computeClimbRouteAssociations([climbFarFromRoute], [routeA, routeB]);
    expect(results).toEqual([]);
  });
});

describe('buildEnrichmentWritesFromAssociations', () => {
  const climbsById = new Map<string, ClimbJoinInput>([
    ['climb-1', climbNearRoute],
    ['climb-2', climbFarFromRoute],
  ]);

  it('groups a route association into climbUpdates.routeIds and routeUpdates', () => {
    const associations = [{ climbId: 'climb-1', targetId: 'route-a', targetType: 'route' as const, distanceMeters: 12.3 }];
    const { climbUpdates, routeUpdates, segmentUpdates } = buildEnrichmentWritesFromAssociations(associations, climbsById);

    expect(climbUpdates.get('climb-1')).toEqual({ routeIds: ['route-a'], streetSegmentIds: [] });
    expect(routeUpdates.get('route-a')).toEqual([
      { climbSegmentId: 'climb-1', type: 'terrain', climbType: 'short-sharp', distanceFromPathMeters: 12.3 },
    ]);
    expect(segmentUpdates.size).toBe(0);
  });

  it('groups a segment association into climbUpdates.streetSegmentIds and segmentUpdates', () => {
    const associations = [{ climbId: 'climb-2', targetId: 'seg-1', targetType: 'segment' as const, distanceMeters: 5 }];
    const { climbUpdates, routeUpdates, segmentUpdates } = buildEnrichmentWritesFromAssociations(associations, climbsById);

    expect(climbUpdates.get('climb-2')).toEqual({ routeIds: [], streetSegmentIds: ['seg-1'] });
    expect(segmentUpdates.get('seg-1')).toEqual(['climb-2']);
    expect(routeUpdates.size).toBe(0);
  });

  it('accumulates multiple targets for the same climb without overwriting', () => {
    const associations = [
      { climbId: 'climb-1', targetId: 'route-a', targetType: 'route' as const, distanceMeters: 10 },
      { climbId: 'climb-1', targetId: 'route-b', targetType: 'route' as const, distanceMeters: 20 },
      { climbId: 'climb-1', targetId: 'seg-1', targetType: 'segment' as const, distanceMeters: 15 },
    ];
    const { climbUpdates } = buildEnrichmentWritesFromAssociations(associations, climbsById);
    expect(climbUpdates.get('climb-1')).toEqual({ routeIds: ['route-a', 'route-b'], streetSegmentIds: ['seg-1'] });
  });

  it('silently skips an association whose climbId is missing from climbsById (defensive, should not happen)', () => {
    const associations = [{ climbId: 'unknown-climb', targetId: 'route-a', targetType: 'route' as const, distanceMeters: 1 }];
    const { climbUpdates, routeUpdates } = buildEnrichmentWritesFromAssociations(associations, climbsById);
    expect(climbUpdates.size).toBe(0);
    expect(routeUpdates.size).toBe(0);
  });
});
