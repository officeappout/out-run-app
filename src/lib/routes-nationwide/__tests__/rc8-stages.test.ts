import { describe, expect, it } from 'vitest';
import { buildValidatedDoc } from '../../route-collections/validate';
import type { GhRouteRequest, GraphHopperClient, RoutedPath } from '../../routing/graphhopper';
import { budgetedClient, ghCacheKey, GhBudgetExhausted, mapCacheStore } from '../gh-budget';
import { generateNeighbourhoodLoops, neighbourhoodLoopDoc, neighbourhoodLoopId, spreadSeeds } from '../neighbourhood-loops';
import { runAuthorityStages, STAGE_ORDER, type CandidateRoute, type StageProvider } from '../stages';
import { routeScoreInputFromDoc } from '../../route-score/from-route-doc';

type LngLat = [number, number];

/** A clean ~rectangular loop of `sideM` sides starting at the request's first point (≈ m per degree at 32°N). */
function rect(start: LngLat, sideM: number): LngLat[] {
  const dLng = sideM / 94_500, dLat = sideM / 110_900;
  const pts: LngLat[] = [];
  const corners: LngLat[] = [start, [start[0] + dLng, start[1]], [start[0] + dLng, start[1] + dLat], [start[0], start[1] + dLat], start];
  for (let c = 0; c < 4; c++) for (let k = 0; k < 10; k++) {
    const a = corners[c], b = corners[c + 1];
    pts.push([a[0] + ((b[0] - a[0]) * k) / 10, a[1] + ((b[1] - a[1]) * k) / 10]);
  }
  pts.push(start);
  return pts;
}

function routed(path: LngLat[], distanceM: number): RoutedPath {
  return { path, elevations: path.map(() => 10), distanceM, timeMs: distanceM * 600, ascendM: 12, descendM: 12, maxGradePct: 2, roadClassShare: { residential: 1 }, majorRoadShare: 0, crossings: { signalled: 0, marked: 0, unmarked: 0 } };
}

/** Fake GH: every request answers with a square loop of the requested round-trip size. */
function fakeGh(calls: GhRouteRequest[]): GraphHopperClient {
  return {
    async route(body) {
      calls.push(body);
      const d = body['round_trip.distance'] ?? 4000;
      return routed(rect(body.points[0] as LngLat, d / 4), d);
    },
  };
}

describe('gh-budget', () => {
  it('caps live calls per authority, serves repeats from the cache', async () => {
    const calls: GhRouteRequest[] = [];
    const cache = mapCacheStore();
    const b = budgetedClient(fakeGh(calls), { maxCalls: 2, cache });
    const body = (seed: number) => ({ profile: 'foot_turns', points: [[34.8, 32.1]], 'round_trip.seed': seed }) as unknown as GhRouteRequest;
    await b.client.route(body(1));
    await b.client.route(body(1)); // cached
    await b.client.route(body(2));
    await expect(b.client.route(body(3))).rejects.toBeInstanceOf(GhBudgetExhausted);
    expect(calls).toHaveLength(2);
    expect(b.stats()).toMatchObject({ calls: 2, cacheHits: 1, refused: 1 });
    // a resumed run with a fresh budget re-uses every cached answer at no cost
    const again = budgetedClient(fakeGh(calls), { maxCalls: 0, cache });
    await again.client.route(body(2));
    expect(again.stats()).toMatchObject({ calls: 0, cacheHits: 1 });
  });
  it('cache key ignores key order', () => {
    expect(ghCacheKey({ a: 1, b: { y: 2, x: 1 } } as never)).toBe(ghCacheKey({ b: { x: 1, y: 2 }, a: 1 } as never));
  });
});

describe('neighbourhood loops', () => {
  it('spreadSeeds: centre first, then far apart; a small town gets fewer seeds', () => {
    const grid: LngLat[] = [];
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) grid.push([34.8 + i * 0.001, 32.1 + j * 0.001]); // ≈ 3.8 × 4.4 km
    const s = spreadSeeds(grid, 4);
    expect(s).toHaveLength(4);
    expect(s[0][0]).toBeCloseTo(34.82, 3);
    expect(s[0][1]).toBeCloseTo(32.12, 3);
    const tiny = grid.filter(([x, y]) => x < 34.805 && y < 32.105); // ≈ 500 m across
    expect(spreadSeeds(tiny, 4)).toHaveLength(1);
    expect(spreadSeeds([], 4)).toEqual([]);
  });
  it('generates one passing loop per seed with foot_turns, and the doc passes buildValidatedDoc', async () => {
    const calls: GhRouteRequest[] = [];
    const seeds: LngLat[] = [[34.8, 32.1], [34.85, 32.15]];
    const res = await generateNeighbourhoodLoops(fakeGh(calls), seeds, { targetsKm: [4] });
    expect(res.loops).toHaveLength(2);
    expect(calls.every((c) => c.profile === 'foot_turns')).toBe(true);
    expect(calls.length).toBeLessThanOrEqual(2 * 9);
    const doc = neighbourhoodLoopDoc(res.loops[0], { authorityId: 'auth1', city: 'עיר', importBatchId: 'b' });
    expect(doc.id).toBe(neighbourhoodLoopId('auth1', res.loops[0]));
    expect(doc.id).not.toMatch(/[./]/);
    const data = buildValidatedDoc('official_routes', doc.data, { mode: 'create', knownAuthorityIds: new Set(['auth1']) });
    expect(data).toMatchObject({ origin: 'generated', status: 'pending', published: false, authorityId: 'auth1', routeShape: 'loop' });
    expect(routeScoreInputFromDoc(doc.id, doc.data).sourceTier).toBe('generated');
  });
  it('stops at a spent budget and says so', async () => {
    const res = await generateNeighbourhoodLoops(fakeGh([]), [[34.8, 32.1], [34.9, 32.2]], { isBudgetSpent: () => true });
    expect(res.loops).toEqual([]);
    expect(res.notes[0]).toMatch(/budget spent/);
  });
});

describe('runAuthorityStages (RC8)', () => {
  const route = (id: string, x: number): CandidateRoute => ({
    id, stage: 'existing', isNew: false,
    data: { name: id, distance: 3, routeShape: 'loop', activityType: 'running', path: rect([34.7 + x, 32.1], 700).map(([lng, lat]) => ({ lng, lat })) },
  });
  it('neighbourhood runs last; providers see the pool so far; enrich feeds every route', async () => {
    expect(STAGE_ORDER.slice(-4)).toEqual(['park_loops', 'generated', 'neighbourhood', 'settlement_loops']);
    const seen: Record<string, string[]> = {};
    const p = (key: StageProvider['key'], routes: CandidateRoute[]): StageProvider => ({
      key, run: async (prior) => { seen[key] = prior.map((r) => r.id); return { routes: routes.map((r) => ({ ...r, isNew: key !== 'existing' })) }; },
    });
    const enriched: string[] = [];
    const r = await runAuthorityStages({ id: 'x', type: 'local_council', population: 20_000 }, [
      p('neighbourhood', [route('n1', 0.3)]), p('existing', [route('e1', 0)]), p('park_loops', [route('p1', 0.1)]),
    ], new Date(), { enrich: (c) => { enriched.push(c.id); return { shadeShare: 0.3 }; } });
    expect(Object.keys(seen)).toEqual(['existing', 'park_loops', 'neighbourhood']);
    expect(seen.neighbourhood).toEqual(['e1', 'p1']);
    expect(enriched).toEqual(['e1', 'p1', 'n1']);
    expect(r.score.scored.every((s) => s.input.shadeShare === 0.3)).toBe(true);
  });
});
