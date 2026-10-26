import { describe, expect, it } from 'vitest';
import { haversineKm } from '@/features/parks/core/services/geoUtils';
import {
  climbSegmentCandidate, findHillsNear, pointAlongPath, routeProfileCandidate, type HillClimbSegmentInput,
} from '../hill-finder';
import { at, lineNorth, ORIGIN, profileWithClimb } from './fixtures';

const spec = { repLengthM: 300, minGradePct: 5, reps: 6 };
const ll = ([lng, lat]: [number, number]) => ({ lat, lng });

function climb(over: Partial<HillClimbSegmentInput> & { id: string }): HillClimbSegmentInput {
  return {
    type: 'terrain',
    status: 'published',
    geometry: [ll(at(0, 1000)), ll(at(0, 1300))],
    lengthM: 320,
    avgGrade: 6,
    dir: 'up',
    wayName: 'רחוב הגבעה',
    ...over,
  };
}

describe('pointAlongPath', () => {
  it('interpolates by metres along the path and clamps at both ends', () => {
    const path = lineNorth(1000);
    const p = pointAlongPath(path, 450)!;
    expect(haversineKm(ORIGIN.lat, ORIGIN.lng, p.lat, p.lng) * 1000).toBeCloseTo(450, -1);
    expect(pointAlongPath(path, -5)).toEqual({ lng: path[0][0], lat: path[0][1] });
    const end = pointAlongPath(path, 99_999)!;
    expect(end.lat).toBeCloseTo(path[path.length - 1][1], 9);
    expect(pointAlongPath([], 10)).toBeNull();
  });
});

describe('climbSegmentCandidate', () => {
  it('a published terrain climb that meets the spec, foot = first point for dir up', () => {
    const h = climbSegmentCandidate(climb({ id: 'c1' }), ORIGIN, spec)!;
    expect(h.source).toBe('climb_segment');
    expect(h.meetsSpec).toBe(true);
    expect(h.distanceKm).toBeCloseTo(1, 1);
    expect(h.name).toBe('רחוב הגבעה');
  });

  it('dir down → the foot is the LAST geometry point', () => {
    const h = climbSegmentCandidate(climb({ id: 'c1', dir: 'down' }), ORIGIN, spec)!;
    expect(h.distanceKm).toBeCloseTo(1.3, 1);
  });

  it('skips pending, stairs, no-grade, too-shallow and out-of-range climbs', () => {
    expect(climbSegmentCandidate(climb({ id: 'p', status: 'pending' }), ORIGIN, spec)).toBeNull();
    expect(climbSegmentCandidate(climb({ id: 's', type: 'stairs', avgGrade: null }), ORIGIN, spec)).toBeNull();
    expect(climbSegmentCandidate(climb({ id: 'n', avgGrade: null }), ORIGIN, spec)).toBeNull();
    expect(climbSegmentCandidate(climb({ id: 'f', avgGrade: 1.5 }), ORIGIN, spec)).toBeNull();
    expect(climbSegmentCandidate(climb({ id: 'far', geometry: [ll(at(0, 9000)), ll(at(0, 9300))] }), ORIGIN, spec)).toBeNull();
  });

  it('a short climb is a near-miss, not a match', () => {
    const h = climbSegmentCandidate(climb({ id: 'short', lengthM: 120 }), ORIGIN, spec)!;
    expect(h.meetsSpec).toBe(false);
  });
});

describe('routeProfileCandidate', () => {
  it('locates the climb foot on the route path (km 1.2 of a 4 km line north)', () => {
    const h = routeProfileCandidate(
      { id: 'r1', name: 'טיילת', path: lineNorth(4000), elevationProfile: profileWithClimb(4000, 20, 1200, 300, 6) },
      ORIGIN, spec,
    )!;
    expect(h.source).toBe('route_profile');
    expect(h.meetsSpec).toBe(true);
    expect(h.startAlongRouteM).toBe(1200);
    expect(h.distanceKm).toBeCloseTo(1.2, 1);
    expect(h.lengthM).toBe(300);
  });

  it('point-to-point descent → climbs on the way back; the foot is at the low end', () => {
    // Profile drops over 2000..2300 m going out: running back, the climb's foot is at 2300 m.
    const out = profileWithClimb(4000, 20, 2000, 300, 6);
    const desc = { stepM: out.stepM, elevationsM: out.elevationsM.map((e) => 100 - e) };
    const h = routeProfileCandidate({ id: 'p2p', path: lineNorth(4000), routeShape: 'point_to_point', elevationProfile: desc }, ORIGIN, spec)!;
    expect(h.meetsSpec).toBe(true);
    expect(h.distanceKm).toBeCloseTo(2.3, 1);
  });

  it('no profile / flat profile → null', () => {
    expect(routeProfileCandidate({ id: 'x', path: lineNorth(2000) }, ORIGIN, spec)).toBeNull();
    expect(routeProfileCandidate({ id: 'y', path: lineNorth(2000), elevationProfile: { stepM: 50, elevationsM: Array(41).fill(5) } }, ORIGIN, spec)).toBeNull();
  });
});

describe('findHillsNear', () => {
  it('ranks spec-meeting hills first, then by fit × proximity, and caps at the limit', () => {
    const out = findHillsNear(ORIGIN, spec, {
      climbs: [
        climb({ id: 'near-short', lengthM: 100, geometry: [ll(at(200, 0)), ll(at(300, 0))] }),
        climb({ id: 'far-good', geometry: [ll(at(0, 3000)), ll(at(0, 3300))] }),
        climb({ id: 'mid-good', geometry: [ll(at(0, -1000)), ll(at(0, -1300))] }),
      ],
      routes: [{ id: 'r1', path: lineNorth(4000, 500), elevationProfile: profileWithClimb(4000, 20, 2000, 400, 7) }],
    }, { limit: 3 });
    expect(out.map((h) => h.id)).toEqual(['mid-good', 'r1', 'far-good']);
    expect(out.every((h) => h.meetsSpec)).toBe(true);
  });

  it('the same hill from a climb segment and a route profile is returned once', () => {
    const out = findHillsNear(ORIGIN, spec, {
      climbs: [climb({ id: 'c', geometry: [ll(at(0, 1200)), ll(at(0, 1500))] })],
      routes: [{ id: 'r', path: lineNorth(4000), elevationProfile: profileWithClimb(4000, 20, 1200, 300, 6) }],
    });
    expect(out).toHaveLength(1);
  });

  it('nothing usable → empty; a bad origin → empty', () => {
    expect(findHillsNear(ORIGIN, spec, {})).toEqual([]);
    expect(findHillsNear({ lat: NaN, lng: 0 }, spec, { climbs: [climb({ id: 'c' })] })).toEqual([]);
  });
});

describe('findHillsForRun (deps injected)', () => {
  it('combines climbs + cached routes; a failing source is dropped, not thrown', async () => {
    const { findHillsForRun } = await import('../find-hills-for-run');
    const out = await findHillsForRun(ORIGIN, spec, {
      deps: {
        getClimbsNear: async () => { throw new Error('offline'); },
        getOfficialRoutes: async () => [{ id: 'r', path: lineNorth(4000), elevationProfile: profileWithClimb(4000, 20, 1200, 300, 6) }] as never,
      },
    });
    expect(out.map((h) => h.id)).toEqual(['r']);
  });

  it('passes the radius in metres to the climb reader', async () => {
    const { findHillsForRun } = await import('../find-hills-for-run');
    let gotRadius = 0;
    await findHillsForRun(ORIGIN, spec, {
      radiusKm: 2,
      deps: { getClimbsNear: async (_o, r) => { gotRadius = r; return [climb({ id: 'c' })]; }, getOfficialRoutes: async () => [] },
    });
    expect(gotRadius).toBe(2000);
  });
});
