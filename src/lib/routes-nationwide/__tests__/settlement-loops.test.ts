import { describe, expect, it } from 'vitest';
import { buildValidatedDoc } from '../../route-collections/validate';
import type { GhRouteRequest, GraphHopperClient, RoutedPath } from '../../routing/graphhopper';
import { routeScoreInputFromDoc } from '../../route-score/from-route-doc';
import { quotaForAuthority } from '../../route-score/quota';
import { selectTopN, type ScoredRoute } from '../../route-score/select';
import type { RouteScoreInput } from '../../route-score/types';
import { SETTLEMENT_LOOP_PIPELINE, SETTLEMENT_LOOPS_SELECT_MAX } from '../../route-score/weights';
import {
  generateSettlementLoops, isSettlementLoopDoc, parsePopulation, rankSettlements, settlementLoopDoc, settlementLoopId, settlementLoopName,
  SETTLEMENT_LOOP_KM, SETTLEMENT_LOOPS_MAX, SETTLEMENT_PIPELINE, type Settlement,
} from '../settlement-loops';
import { quotaMet, runAuthorityStages, QUOTA_GATED_STAGES, type CandidateRoute, type StageProvider } from '../stages';

type LngLat = [number, number];

function rect(start: LngLat, sideM: number): LngLat[] {
  const dLng = sideM / 94_500, dLat = sideM / 110_900;
  const corners: LngLat[] = [start, [start[0] + dLng, start[1]], [start[0] + dLng, start[1] + dLat], [start[0], start[1] + dLat], start];
  const pts: LngLat[] = [];
  for (let c = 0; c < 4; c++) for (let k = 0; k < 10; k++) {
    const a = corners[c], b = corners[c + 1];
    pts.push([a[0] + ((b[0] - a[0]) * k) / 10, a[1] + ((b[1] - a[1]) * k) / 10]);
  }
  pts.push(start);
  return pts;
}
const routed = (path: LngLat[], distanceM: number): RoutedPath => ({ path, elevations: path.map(() => 10), distanceM, timeMs: distanceM * 600, ascendM: 12, descendM: 12, maxGradePct: 2, roadClassShare: { residential: 1 }, majorRoadShare: 0, crossings: { signalled: 0, marked: 0, unmarked: 0 } });
/** Fake GH: a square loop of the requested round-trip size. */
function fakeGh(calls: GhRouteRequest[]): GraphHopperClient {
  return {
    async route(body) {
      calls.push(body);
      const d = body['round_trip.distance'] ?? 4000;
      return routed(rect(body.points[0] as LngLat, d / 4), d);
    },
  };
}

const S = (name: string, lng: number, lat: number, population: number | null = null): Settlement => ({ name, coord: [lng, lat], place: 'village', population, osmNodeId: 1 });
/** Street vertices: a small grid around each given point. */
function streetsAround(points: LngLat[], n = 3): LngLat[] {
  const out: LngLat[] = [];
  for (const [x, y] of points) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([x + i * 0.001, y + j * 0.001]);
  return out;
}

describe('settlement loops — settlement choice', () => {
  it('parsePopulation', () => {
    expect(parsePopulation('1,200')).toBe(1200);
    expect(parsePopulation(800)).toBe(800);
    expect(parsePopulation('')).toBeNull();
    expect(parsePopulation(undefined)).toBeNull();
  });
  it('most populous first, then most streets; drops settlements with no streets; keeps them ≥2 km apart', () => {
    const big = S('כפר עזה', 34.5, 31.48, 900);
    const near = S('צמוד', 34.502, 31.481, 2000); // 200 m from big — but bigger, so it wins and big is skipped
    const busy = S('ניר עם', 34.6, 31.5); // unknown population, many streets
    const quiet = S('שקט', 34.7, 31.5); // unknown population, few streets
    const empty = S('ריק', 34.8, 31.5, 5000); // no streets nearby
    const streets = [...streetsAround([big.coord, near.coord, busy.coord], 4), ...streetsAround([quiet.coord], 1)];
    const r = rankSettlements([big, near, busy, quiet, empty], streets);
    expect(r.map((s) => s.name)).toEqual(['צמוד', 'ניר עם', 'שקט']);
    expect(r[0].start).not.toBeNull();
  });
});

describe('settlement loops — generation', () => {
  const settlements = rankSettlements([S('א', 34.5, 31.4, 3), S('ב', 34.6, 31.4, 2), S('ג', 34.7, 31.4, 1), S('ד', 34.8, 31.4, 0)], streetsAround([[34.5, 31.4], [34.6, 31.4], [34.7, 31.4], [34.8, 31.4]]));
  it('at most 3 loops, 4–6 km targets, foot_turns, 3–8 km kept', async () => {
    const calls: GhRouteRequest[] = [];
    const res = await generateSettlementLoops(fakeGh(calls), settlements);
    expect(res.loops).toHaveLength(SETTLEMENT_LOOPS_MAX);
    expect(res.loops.map((l) => l.settlement.name)).toEqual(['א', 'ב', 'ג']);
    expect(res.loops.map((l) => l.targetKm)).toEqual([5, 4, 6]);
    for (const l of res.loops) expect(l.loop.distanceKm).toBeGreaterThanOrEqual(SETTLEMENT_LOOP_KM.min);
    for (const l of res.loops) expect(l.loop.distanceKm).toBeLessThanOrEqual(SETTLEMENT_LOOP_KM.max);
    expect(calls.every((c) => c.profile === 'foot_turns')).toBe(true);
    expect(calls.length).toBeLessThanOrEqual(3 * 9);
  });
  it('drops a loop outside 3–8 km and moves on to the next settlement', async () => {
    // GH always answers with an 8.8 km loop; with an 8.5 km target it passes route-quality but is too long.
    const fixed: GraphHopperClient = { async route(body) { return routed(rect(body.points[0] as LngLat, 2200), 8800); } };
    const res = await generateSettlementLoops(fixed, settlements, { targetsKm: [8.5] });
    expect(res.loops).toHaveLength(0);
    expect(res.notes).toHaveLength(4);
    expect(res.notes[0]).toMatch(/^א: 8\.\d km outside 3-8 km/);
  });
  it('stops at a spent budget', async () => {
    const res = await generateSettlementLoops(fakeGh([]), settlements, { isBudgetSpent: () => true });
    expect(res.loops).toEqual([]);
    expect(res.notes[0]).toMatch(/budget spent/);
  });
  it('doc: owner name, generated tier, settlement pipeline, passes buildValidatedDoc', async () => {
    const res = await generateSettlementLoops(fakeGh([]), settlements);
    const l = res.loops[0];
    const doc = settlementLoopDoc(l, { authorityId: 'rc1', city: 'מועצה', importBatchId: 'b' });
    expect(doc.id).toBe(settlementLoopId('rc1', l));
    expect(doc.id).toMatch(/^ghsettle_/);
    expect(doc.id).not.toMatch(/[./]/);
    expect(doc.data.name).toBe(settlementLoopName('א', l.loop.distanceKm));
    expect(String(doc.data.name)).toMatch(/^לולאת א · \d+\.\d ק״מ$/);
    const data = buildValidatedDoc('official_routes', doc.data, { mode: 'create', knownAuthorityIds: new Set(['rc1']) });
    expect(data).toMatchObject({ origin: 'generated', status: 'pending', published: false, authorityId: 'rc1', routeShape: 'loop' });
    expect(SETTLEMENT_PIPELINE).toBe(SETTLEMENT_LOOP_PIPELINE);
    expect(isSettlementLoopDoc(doc.data)).toBe(true);
    const input = routeScoreInputFromDoc(doc.id, doc.data);
    expect(input.sourceTier).toBe('generated');
    expect(input.settlementLoop).toBe(true);
  });
});

let seq = 0;
function scored(o: { score: number; settlement?: boolean; band?: 'green' | 'yellow' | 'red'; km?: number }): ScoredRoute {
  const id = `r${++seq}`;
  const input: RouteScoreInput = {
    id, name: `route ${id}`, authorityId: 'a', city: 'c', activityType: 'running',
    distanceKm: o.km ?? 12, path: rect([34.5 + seq * 0.03, 31.4], 600), shape: 'loop',
    composition: null, compositionIsProxy: false, litCoveragePct: null, amenitiesHas: null, osmSafety: null,
    geometry: { retracedPct: 0, uTurnCount: 0, spurCount: 0, compactness: 0.7 },
    sourceTier: o.settlement ? 'generated' : 'osm_named', urbanKind: null, greenShare: null, parkRef: null,
    hasFitnessStop: false, certificate: null,
    surface: { pavedShare: 0, unpavedShare: 1, knownShare: 1, source: 'route_surface_type' }, surfaceClass: 'hike_offroad', shadeShare: null, shade: null,
    ...(o.settlement ? { settlementLoop: true } : {}),
  };
  return { input, score: { score: o.score, confidence: 0.8, band: o.band ?? 'yellow', components: {} as any, version: 'v1.4' } };
}

describe('settlement loops — selection', () => {
  const regional = quotaForAuthority({ type: 'regional_council' });
  it('added on top of a full quota, never displacing a ranked route, at most 3, red dropped', () => {
    const ranked = Array.from({ length: 60 }, (_, k) => scored({ score: 75 + (k % 10), km: k % 2 ? 12 : 5 }));
    const loops = [scored({ score: 50, settlement: true }), scored({ score: 40, settlement: true }), scored({ score: 60, settlement: true }), scored({ score: 55, settlement: true }), scored({ score: 65, settlement: true, band: 'red' })];
    const withLoops = selectTopN([...ranked, ...loops], regional);
    const without = selectTopN(ranked, regional);
    const rankedSel = withLoops.selectedIds.filter((id) => !loops.some((l) => l.input.id === id));
    expect(rankedSel.sort()).toEqual([...without.selectedIds].sort());
    expect(rankedSel.length).toBeLessThanOrEqual(regional.total.max);
    expect(withLoops.counts.settlementLoops).toBe(SETTLEMENT_LOOPS_SELECT_MAX);
    expect(withLoops.counts.selected).toBe(without.counts.selected + 3);
    const row = (r: ScoredRoute) => withLoops.rows.find((x) => x.id === r.input.id)!;
    expect(row(loops[2]).decision).toBe('selected'); // 60, best first
    expect(row(loops[1]).decision).toBe('candidate'); // 4th: full
    expect(row(loops[4]).decision).toBe('rejected'); // red
  });
  it('never counts toward "quota met" — the generating stages still run', () => {
    const run = { selection: { counts: { selected: 23, urbanFloor: 0, settlementLoops: 3 } }, quota: regional } as any;
    expect(quotaMet(run)).toBe(true);
    expect(quotaMet({ ...run, selection: { counts: { selected: 22, urbanFloor: 0, settlementLoops: 3 } } })).toBe(false);
  });
});

describe('settlement_loops stage', () => {
  it('is not quota-gated: runs even after the quota minimum was met', async () => {
    expect(QUOTA_GATED_STAGES.has('settlement_loops')).toBe(false);
    const pathOf = (x: number, side = 600) => rect([34.5 + x, 31.4], side).map(([lng, lat]) => ({ lng, lat }));
    const trail = (k: number): CandidateRoute => ({ id: `t${k}`, stage: 'osm', isNew: true, data: { name: `שביל ${k}`, distance: 12, routeShape: 'loop', activityType: 'running', path: pathOf(k * 0.05) } });
    const ran: string[] = [];
    const p = (key: StageProvider['key'], routes: CandidateRoute[]): StageProvider => ({ key, run: async () => { ran.push(key); return { routes }; } });
    const loop: CandidateRoute = { id: 'ghsettle_x', stage: 'settlement_loops', isNew: true, data: { name: 'לולאת א · 5.0 ק״מ', distance: 5, routeShape: 'loop', activityType: 'running', origin: 'generated', generator: { pipeline: SETTLEMENT_LOOP_PIPELINE }, path: pathOf(3, 1250) } };
    const r = await runAuthorityStages({ id: 'rc', type: 'regional_council' }, [
      p('osm', Array.from({ length: 30 }, (_, k) => trail(k))), p('neighbourhood', []), p('settlement_loops', [loop]),
    ]);
    expect(ran).toContain('settlement_loops');
    expect(r.stages.find((s) => s.key === 'settlement_loops')).toMatchObject({ ran: true, added: 1 });
  });
});
