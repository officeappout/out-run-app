import { describe, expect, it } from 'vitest';
import { selectTopN, type ScoredRoute } from '../select';
import { quotaForAuthority } from '../quota';
import { buildRouteScoreDoc } from '../route-scores-doc';
import type { RouteScoreInput } from '../types';
import { CITY_LOW_FLOOR, LOW_SCORE_FILL_REASON } from '../weights';
import { rectLoop } from './fixtures';
import { GEOMETRY_GAP_REVIEW_M } from '../../route-geometry/gaps';
import { quotaMet, runAuthorityStages, type CandidateRoute, type StageProvider } from '../../routes-nationwide/stages';
import { summarizeAuthority, summarizeNation } from '../../routes-nationwide/summary';

let seq = 0;
const GOOD_GEOM = { retracedPct: 0, uTurnCount: 0, spurCount: 0, compactness: 0.7 };
function route(o: { score: number; km?: number; geom?: RouteScoreInput['geometry']; band?: 'green' | 'yellow' | 'red'; tier?: RouteScoreInput['sourceTier']; gap?: number; settlement?: boolean; low?: string }): ScoredRoute {
  const id = `l${String(++seq).padStart(3, '0')}`;
  const input: RouteScoreInput = {
    id, name: `route ${id}`, authorityId: 'a', city: 'c', activityType: 'walking',
    distanceKm: o.km ?? 1.2, path: rectLoop(34.8 + seq * 0.02, 32.1, 300, 300), shape: 'loop',
    composition: null, compositionIsProxy: false, litCoveragePct: null, amenitiesHas: null, osmSafety: null,
    geometry: o.geom === undefined ? GOOD_GEOM : o.geom,
    sourceTier: o.tier ?? 'generated', urbanKind: null, greenShare: null, parkRef: null,
    hasFitnessStop: false, certificate: null,
    surface: { pavedShare: 1, unpavedShare: 0, knownShare: 1, source: 'route_surface_type' }, surfaceClass: 'walk_run_paved', shadeShare: null, shade: null,
    ...(o.gap != null ? { geometryGapM: o.gap } : {}),
    ...(o.settlement ? { settlementLoop: true } : {}),
    ...(o.low ? { lowConfidenceReason: o.low } : {}),
  };
  return { input, score: { score: o.score, confidence: 0.8, band: o.band ?? 'yellow', components: {} as any, version: 'v1.4' } };
}
const small = quotaForAuthority({ type: 'local_council', population: 20_000 }); // total 8-15
const FILL = { lowScoreFill: CITY_LOW_FLOOR };

describe('city low floor (low_score_fill)', () => {
  it('is 55 and named low_score_fill', () => {
    expect(CITY_LOW_FLOOR).toBe(55);
    expect(LOW_SCORE_FILL_REASON).toBe('low_score_fill');
  });

  it('off by default: same result as before, no lowScoreFill count key', () => {
    const rs = [route({ score: 60 }), route({ score: 58 })];
    const res = selectTopN(rs, small);
    expect(res.counts.selected).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(res.counts, 'lowScoreFill')).toBe(false);
    expect(res.rows.every((r) => !Object.prototype.hasOwnProperty.call(r, 'lowConfidence'))).toBe(true);
  });

  it('fills a city below its quota MINIMUM with ≥55 candidates, best first, only up to the minimum, marked low confidence', () => {
    const rs = [route({ score: 80 }), ...Array.from({ length: 12 }, (_, k) => route({ score: 55 + (k % 10) })), route({ score: 54 }), route({ score: 46 })];
    const res = selectTopN(rs, small, FILL);
    expect(res.counts.selected).toBe(small.total.min);
    expect(res.counts.lowScoreFill).toBe(small.total.min - 1);
    const filled = res.rows.filter((r) => r.lowConfidence);
    expect(filled).toHaveLength(small.total.min - 1);
    expect(filled.every((r) => r.decision === 'selected' && r.reason.startsWith('low_score_fill') && r.lowConfidence?.reason === 'low_score_fill')).toBe(true);
    // best first: everything left out scores no higher than the lowest admitted one
    const minIn = Math.min(...filled.map((r) => r.score));
    const maxOut = Math.max(...res.rows.filter((r) => r.decision !== 'selected').map((r) => r.score));
    expect(maxOut).toBeLessThanOrEqual(minIn);
    expect(res.rows.find((r) => r.score === 54)?.decision).toBe('candidate');
    // the ≥70 route is not marked
    expect(res.rows.find((r) => r.score === 80)?.lowConfidence).toBeUndefined();
  });

  it('never when the ≥70 set already meets the minimum', () => {
    const rs = [...Array.from({ length: small.total.min }, () => route({ score: 75 })), route({ score: 65 })];
    const res = selectTopN(rs, small, FILL);
    expect(res.counts.lowScoreFill).toBe(0);
    expect(res.counts.selected).toBe(small.total.min);
  });

  it('never a manual-review route (official 55-70 / geometry gap), a red route, or a settlement loop', () => {
    const res = selectTopN([
      route({ score: 66, tier: 'official' }),
      route({ score: 66, gap: GEOMETRY_GAP_REVIEW_M + 1 }),
      route({ score: 66, band: 'red' }),
      route({ score: 66, settlement: true }),
    ], small, FILL);
    expect(res.counts.lowScoreFill).toBe(0);
    expect(res.rows.filter((r) => r.decision === 'manual_review')).toHaveLength(2);
    expect(res.rows.some((r) => r.lowConfidence)).toBe(false);
  });

  it('same hard bars as the urban floor (distance accuracy, U-turn)', () => {
    const res = selectTopN([route({ score: 60, km: 3 }), route({ score: 60, geom: { ...GOOD_GEOM, spurCount: 1 } })], small, FILL);
    expect(res.counts.lowScoreFill).toBe(0);
    expect(res.rows[0].reason).toMatch(/low_score_fill: distance/);
    expect(res.rows[1].reason).toMatch(/low_score_fill: 1 U-turn/);
  });

  it('a floor at 70 or above is a no-op', () => {
    const res = selectTopN([route({ score: 66 })], small, { lowScoreFill: 70 });
    expect(res.counts.selected).toBe(0);
  });

  it('route_scores: lowConfidenceReason from the selection, key absent when unset (axiom §24)', () => {
    const r = route({ score: 60 });
    const marked = buildRouteScoreDoc(r.input, r.score, { decision: 'selected', reason: 'low_score_fill: score 60', lowConfidence: { reason: 'low_score_fill' } });
    expect(marked.lowConfidenceReason).toBe('low_score_fill');
    const plain = buildRouteScoreDoc(r.input, r.score, { decision: 'candidate', reason: 'score 60 < 70' });
    expect(Object.prototype.hasOwnProperty.call(plain, 'lowConfidenceReason')).toBe(false);
    // the selection's marker wins over a candidate's informational hint
    const hinted = route({ score: 60, low: 'promenade_hint' });
    expect(buildRouteScoreDoc(hinted.input, hinted.score, { decision: 'selected', reason: 'x', lowConfidence: { reason: 'low_score_fill' } }).lowConfidenceReason).toBe('low_score_fill');
    expect(buildRouteScoreDoc(hinted.input, hinted.score, { decision: 'candidate', reason: 'x' }).lowConfidenceReason).toBe('promenade_hint');
  });
});

describe('city low floor in the nationwide stages', () => {
  const rect = (lng: number) => rectLoop(lng, 32.1, 700, 700).map(([a, b]) => ({ lng: a, lat: b }));
  const cand = (id: string, x: number): CandidateRoute => ({ id, stage: 'generated', isNew: true, data: { name: id, distance: 2.8, routeShape: 'loop', activityType: 'running', path: rect(34.7 + x) } });
  const prov = (routes: CandidateRoute[]): StageProvider => ({ key: 'generated', run: async () => ({ routes }) });
  const now = new Date('2026-10-24T00:00:00Z');

  it('quotaMet ignores low-score-fill selections (the generating stages keep running)', () => {
    const run = { quota: small, selection: { counts: { selected: small.total.min, urbanFloor: 0, lowScoreFill: 3 } } } as any;
    expect(quotaMet(run)).toBe(false);
    expect(quotaMet({ ...run, selection: { counts: { selected: small.total.min, urbanFloor: 0 } } })).toBe(true);
  });

  it('a regional council is byte-identical with or without the city low floor', async () => {
    const pool = [cand('g1', 0), cand('g2', 0.05)];
    const a = { id: 'r', type: 'regional_council', population: null };
    const on = await runAuthorityStages(a, [{ key: 'existing', run: async () => ({ routes: pool.map((p) => ({ ...p, isNew: false, stage: 'existing' as const })) }) }], now);
    const off = await runAuthorityStages(a, [{ key: 'existing', run: async () => ({ routes: pool.map((p) => ({ ...p, isNew: false, stage: 'existing' as const })) }) }], now, { cityLowFloor: null });
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    expect(Object.prototype.hasOwnProperty.call(on.score.selection.counts, 'lowScoreFill')).toBe(false);
    const s = summarizeAuthority(on, { name: 'r', tier: 'regional_council' });
    expect(Object.prototype.hasOwnProperty.call(s.selection, 'lowScoreFill')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(summarizeNation([s]), 'lowScoreFill')).toBe(false);
  });

  it('a city runs with it (count key present) and the summary carries the per-route marker', async () => {
    const a = { id: 'm', type: 'local_council', population: 20_000 };
    const r = await runAuthorityStages(a, [prov([cand('g1', 0), cand('g2', 0.05)])], now);
    expect(typeof r.score.selection.counts.lowScoreFill).toBe('number');
    const s = summarizeAuthority(r, { name: 'm', tier: 'other' });
    const lowRows = r.score.selection.rows.filter((x) => x.lowConfidence).map((x) => x.id);
    for (const row of s.routes) {
      if (lowRows.includes(row.id)) expect(row.lowConfidence).toEqual({ reason: 'low_score_fill' });
      else expect(Object.prototype.hasOwnProperty.call(row, 'lowConfidence')).toBe(false);
    }
    expect(summarizeNation([s]).lowScoreFill).toBe(r.score.selection.counts.lowScoreFill);
    const docs = r.score.docs.filter((d) => d.lowConfidenceReason === 'low_score_fill').map((d) => d.routeId).sort();
    expect(docs).toEqual([...lowRows].sort());
  });
});
