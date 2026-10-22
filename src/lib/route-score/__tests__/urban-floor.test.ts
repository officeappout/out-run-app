import { describe, expect, it } from 'vitest';
import { selectTopN, urbanFloorBlocker, type ScoredRoute } from '../select';
import { quotaForAuthority } from '../quota';
import { deriveUrbanKind, routeScoreInputFromDoc } from '../from-route-doc';
import { scoreAuthorityRoutes } from '../score-authority';
import type { RouteScoreInput, UrbanRouteKind } from '../types';
import { URBAN_SELECTION_MIN_SCORE } from '../weights';
import { rectLoop } from './fixtures';

let seq = 0;
const GOOD_GEOM = { retracedPct: 0, uTurnCount: 0, spurCount: 0, compactness: 0.7 };
function route(o: { score: number; kind?: UrbanRouteKind | null; km?: number; geom?: RouteScoreInput['geometry']; band?: 'green' | 'yellow' | 'red' }): ScoredRoute {
  const id = `u${++seq}`;
  const input: RouteScoreInput = {
    id, name: `route ${id}`, authorityId: 'a', city: 'c', activityType: 'walking',
    distanceKm: o.km ?? 1.2, path: rectLoop(34.8 + seq * 0.02, 32.1, 300, 300), shape: 'loop',
    composition: null, compositionIsProxy: false, litCoveragePct: null, amenitiesHas: null, osmSafety: null,
    geometry: o.geom === undefined ? GOOD_GEOM : o.geom,
    sourceTier: 'stitched', urbanKind: o.kind === undefined ? 'named_corridor' : o.kind, greenShare: null, parkRef: null,
    hasFitnessStop: false, certificate: null,
    surface: { pavedShare: 1, unpavedShare: 0, knownShare: 1, source: 'route_surface_type' }, surfaceClass: 'walk_run_paved', shadeShare: null, shade: null,
  };
  return { input, score: { score: o.score, confidence: 0.8, band: o.band ?? 'yellow', components: {} as any, version: 'v1.3' } };
}
const small = quotaForAuthority({ type: 'local_council', population: 20_000 }); // total 8-15

describe('urban floor (RC9)', () => {
  it('starts at 62', () => expect(URBAN_SELECTION_MIN_SCORE).toBe(62));

  it('named urban routes ≥62 fill up to the quota MINIMUM only, best first', () => {
    const rs = [route({ score: 80, kind: null }), ...Array.from({ length: 12 }, (_, k) => route({ score: 62 + (k % 8) }))];
    const res = selectTopN(rs, small);
    expect(res.counts.selected).toBe(small.total.min);
    expect(res.counts.urbanFloor).toBe(small.total.min - 1);
    const picked = res.rows.filter((r) => r.decision === 'selected' && r.reason.startsWith('urban floor'));
    expect(Math.min(...picked.map((r) => r.score))).toBeGreaterThanOrEqual(64);
  });

  it('never for generated / unnamed routes, red routes, or under the floor', () => {
    const res = selectTopN([route({ score: 68, kind: null }), route({ score: 68, band: 'red' }), route({ score: 61 })], small);
    expect(res.counts.selected).toBe(0);
  });

  it('never in an authority whose ≥70 set already meets the minimum', () => {
    const rs = [...Array.from({ length: small.total.min }, () => route({ score: 75, kind: null })), route({ score: 68 })];
    const res = selectTopN(rs, small);
    expect(res.counts.urbanFloor).toBe(0);
    expect(res.counts.selected).toBe(small.total.min);
  });

  it('hard bars: U-turn/spur, retrace, distance accuracy', () => {
    expect(urbanFloorBlocker(route({ score: 65 }).input)).toBeNull();
    expect(urbanFloorBlocker(route({ score: 65, geom: { ...GOOD_GEOM, spurCount: 1 } }).input)).toMatch(/U-turn/);
    expect(urbanFloorBlocker(route({ score: 65, geom: { ...GOOD_GEOM, retracedPct: 0.3 } }).input)).toMatch(/retrace/);
    expect(urbanFloorBlocker(route({ score: 65, km: 2 }).input)).toMatch(/distance/);
    const oab = route({ score: 65, geom: { ...GOOD_GEOM, uTurnCount: 1, retracedPct: 0.5 } });
    oab.input.shape = 'out_and_back';
    expect(urbanFloorBlocker(oab.input)).toBeNull();
    const res = selectTopN([route({ score: 66, km: 3 })], small);
    expect(res.rows[0].decision).toBe('candidate');
    expect(res.rows[0].reason).toMatch(/urban floor: distance/);
  });

  it('an official-source named urban route in manual review (e.g. a MoT-based bike-adjacent walk) can still use the urban floor', () => {
    const r = route({ score: 64, kind: 'bike_adjacent' });
    r.input.sourceTier = 'official';
    const res = selectTopN([r], small);
    expect(res.rows[0].decision).toBe('selected');
  });

  it('a floor at 70 switches it off', () => {
    expect(selectTopN([route({ score: 66 })], small, { urbanFloor: 70 }).counts.selected).toBe(0);
  });

  it('scoreAuthorityRoutes reports the calibration at 62 / 65 / 70', () => {
    const doc = (name: string, lng: number, origin: string) => ({ name, origin, distance: 1.2, activityType: 'walking', path: rectLoop(lng, 32.1, 300, 300).map(([a, b]) => ({ lng: a, lat: b })) });
    const run = scoreAuthorityRoutes({ id: 'a', type: 'local_council', population: 20_000 }, [
      { id: 'p1', data: doc('טיילת א', 34.8, 'osm_named_way') }, { id: 'p2', data: doc('טיילת ב', 34.9, 'osm_named_way') },
    ]);
    expect(Object.keys(run.floorCalibration)).toEqual(['62', '65', '70']);
    expect(run.floorCalibration['62']).toBeGreaterThanOrEqual(run.floorCalibration['65']);
    expect(run.floorCalibration['65']).toBeGreaterThanOrEqual(run.floorCalibration['70']);
  });
});

describe('deriveUrbanKind', () => {
  it('by origin first, then named park loops / corridors; never generated', () => {
    expect(deriveUrbanKind({ origin: 'bike_adjacent_walk' }, 'stitched', 'loop', false)).toBe('bike_adjacent');
    expect(deriveUrbanKind({ origin: 'web_research' }, 'named_place', 'loop', false)).toBe('known_route');
    expect(deriveUrbanKind({ origin: 'osm_named_way' }, 'stitched', 'point_to_point', false)).toBe('named_corridor');
    expect(deriveUrbanKind({ origin: 'park_loop', parkLoopKind: 'inner' }, 'generated', 'loop', true)).toBeNull();
    expect(deriveUrbanKind({ origin: 'park_loop', parkLoopKind: 'perimeter' }, 'named_place', 'loop', true)).toBe('park_loop');
    expect(deriveUrbanKind({}, 'named_place', 'loop', false)).toBe('park_loop');
    expect(deriveUrbanKind({}, 'generated', 'loop', true)).toBeNull();
    expect(deriveUrbanKind({}, 'osm_named', 'loop', false)).toBeNull();
    expect(routeScoreInputFromDoc('x', { name: 'הקפת פארק X', path: rectLoop(34.8, 32.1, 300, 300) }).urbanKind).toBe('park_loop');
  });
});
