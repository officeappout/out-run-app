import { describe, expect, it } from 'vitest';
import { anchorKey, lengthBucket, selectTopN, type ScoredRoute } from '../select';
import { quotaForAuthority } from '../quota';
import type { RouteScoreInput, ScoreBand, SourceTier } from '../types';
import type { SurfaceClass } from '../surface-class';
import { rectLoop } from './fixtures';

let seq = 0;
function route(o: { score: number; band?: ScoreBand; name?: string; km?: number; lng?: number; lat?: number;
  activity?: string; tier?: SourceTier; park?: string; cls?: SurfaceClass }): ScoredRoute {
  const id = `r${++seq}`;
  const input: RouteScoreInput = {
    id, name: o.name ?? `route ${id}`, authorityId: 'a', city: 'c', activityType: o.activity ?? 'running',
    distanceKm: o.km ?? 5, path: rectLoop(o.lng ?? 34.8 + seq * 0.02, o.lat ?? 32.1, 300, 300), shape: 'loop',
    composition: null, compositionIsProxy: false, litCoveragePct: null, amenitiesHas: null, osmSafety: null, geometry: null,
    sourceTier: o.tier ?? 'osm_named', greenShare: null, parkRef: o.park ? { source: 'osm', id: o.park, name: o.park } : null,
    hasFitnessStop: false, certificate: 'approve',
    surface: { pavedShare: 1, unpavedShare: 0, knownShare: 1, source: 'route_surface_type' },
    surfaceClass: o.cls ?? (o.activity === 'cycling' ? 'bike_road' : 'walk_run_paved'), shadeShare: null,
  };
  return { input, score: { score: o.score, confidence: 0.9, band: o.band ?? (o.score >= 75 ? 'green' : 'yellow'), components: {} as any, version: 'v1' } };
}

const small = quotaForAuthority({ type: 'local_council', population: 20_000 }); // total 8-15, parks 2-4, cycling 0-2

describe('selectTopN', () => {
  it('never selects below 70 and never a red route', () => {
    const rs = [route({ score: 69 }), route({ score: 95, band: 'red' }), route({ score: 80 })];
    const res = selectTopN(rs, small);
    expect(res.rows.map((r) => r.decision)).toEqual(['candidate', 'rejected', 'selected']);
  });
  it('official 55-70 goes to manual review, not selected', () => {
    const res = selectTopN([route({ score: 60, tier: 'official' }), route({ score: 50, tier: 'official' })], small);
    expect(res.rows.map((r) => r.decision)).toEqual(['manual_review', 'candidate']);
  });
  it('quota is a ceiling — the rest become hidden candidates', () => {
    const rs = Array.from({ length: 30 }, (_, k) => route({ score: 71 + (k % 20), km: [2, 5, 10][k % 3] }));
    const res = selectTopN(rs, small);
    expect(res.counts.selected).toBe(15);
    expect(res.counts.candidate).toBe(15);
  });
  it('a small pool gives a small set — no padding', () => {
    const res = selectTopN([route({ score: 90 }), route({ score: 40 })], small);
    expect(res.counts.selected).toBe(1);
  });
  it('at most 2 routes per park', () => {
    const rs = [1, 2, 3].map(() => route({ score: 90, park: 'yarkon' }));
    const res = selectTopN(rs, small);
    expect(res.counts.selected).toBe(2);
    expect(res.rows[2].reason).toMatch(/park:yarkon/);
  });
  it('at most 2 routes per 1 km cell', () => {
    const rs = [1, 2, 3].map(() => route({ score: 90, lng: 34.8, lat: 32.1 }));
    expect(selectTopN(rs, small).counts.selected).toBe(2);
  });
  it('reserves the best cycling route even when it scores lower', () => {
    const rs = [...Array.from({ length: 20 }, (_, k) => route({ score: 95, km: [2, 5, 10][k % 3] })), route({ score: 72, activity: 'cycling' })];
    const res = selectTopN(rs, small);
    expect(res.counts.cycling).toBe(1);
    expect(res.rows[20]).toMatchObject({ decision: 'selected', reason: 'reserved: cycling' });
  });
  it('length mix: no bucket above half the quota', () => {
    const rs = Array.from({ length: 20 }, () => route({ score: 90, km: 5 }));
    expect(selectTopN(rs, small).counts.selected).toBe(Math.ceil(15 / 2));
  });
  it('park loops capped by the quota', () => {
    const rs = Array.from({ length: 10 }, (_, k) => route({ score: 90, park: `p${k}`, km: [2, 5, 10][k % 3] }));
    expect(selectTopN(rs, small).counts.parkLoops).toBe(4);
  });
});

describe('selectTopN — surface mix (owner 21.10)', () => {
  it('reserves an offroad option when the city has one, even below the paved routes', () => {
    const rs = [...Array.from({ length: 20 }, (_, k) => route({ score: 95, km: [2, 5, 10][k % 3] })), route({ score: 71, cls: 'hike_offroad' })];
    const res = selectTopN(rs, small);
    expect(res.rows[20]).toMatchObject({ decision: 'selected', reason: 'reserved: surface hike_offroad' });
    expect(res.selectedBySurface.hike_offroad).toBe(1);
    expect(res.selectedBySurface.walk_run_paved).toBe(14);
  });
});

describe('helpers', () => {
  it('lengthBucket', () => {
    expect([null, 1, 3, 8, 9].map(lengthBucket)).toEqual(['unknown', 'short', 'medium', 'medium', 'long']);
  });
  it('anchorKey strips "הקפת" so a perimeter and an inner loop share one park', () => {
    const a = route({ score: 1, name: 'הקפת פארק הירקון' }).input;
    const b = route({ score: 1, name: 'פארק הירקון' }).input;
    expect(anchorKey(a)).toBe(anchorKey(b));
    expect(anchorKey(route({ score: 1, name: 'רחוב הרצל' }).input)).toBeNull();
  });
});
