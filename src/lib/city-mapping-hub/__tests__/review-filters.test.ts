import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_FILTER, NATIONWIDE_APPROVE_DEFAULT_FILTER, SCORE_PRESETS, authorityKindOf, describeReviewFilter, filterReviewRows,
  matchesReviewFilter, parseReviewFilter, parseScoreBound, planFilteredAction, presetIdOf, type ReviewMeta, type RouteReviewFacts,
} from '../review-filters';
import { applyBulkFilters, type PendingRouteCandidate } from '../bulk-approve.logic';

const facts = (o: Partial<RouteReviewFacts> = {}): RouteReviewFacts => ({ score: 72, lowConfidenceReason: null, authorityKind: 'municipal', city: 'גבעתיים', activityType: 'running', name: 'טיילת', ...o });

describe('matchesReviewFilter', () => {
  it('default passes everything, including a route with no score', () => {
    expect(matchesReviewFilter(facts({ score: null, authorityKind: null }), DEFAULT_REVIEW_FILTER)).toBe(true);
  });
  it('score range is inclusive; any bound excludes a missing score', () => {
    const f = { ...DEFAULT_REVIEW_FILTER, scoreMin: 62, scoreMax: 69 };
    expect(matchesReviewFilter(facts({ score: 62 }), f)).toBe(true);
    expect(matchesReviewFilter(facts({ score: 69 }), f)).toBe(true);
    expect(matchesReviewFilter(facts({ score: 70 }), f)).toBe(false);
    expect(matchesReviewFilter(facts({ score: 61 }), f)).toBe(false);
    expect(matchesReviewFilter(facts({ score: null }), { ...DEFAULT_REVIEW_FILTER, scoreMax: 54 })).toBe(false);
  });
  it('low confidence: only / exclude / any', () => {
    const low = facts({ lowConfidenceReason: 'low_score_fill' });
    expect(matchesReviewFilter(low, { ...DEFAULT_REVIEW_FILTER, lowConfidence: 'only' })).toBe(true);
    expect(matchesReviewFilter(facts(), { ...DEFAULT_REVIEW_FILTER, lowConfidence: 'only' })).toBe(false);
    expect(matchesReviewFilter(low, { ...DEFAULT_REVIEW_FILTER, lowConfidence: 'exclude' })).toBe(false);
  });
  it('authority kind, city, activity, name', () => {
    expect(matchesReviewFilter(facts(), { ...DEFAULT_REVIEW_FILTER, authorityKind: 'regional' })).toBe(false);
    expect(matchesReviewFilter(facts({ authorityKind: null }), { ...DEFAULT_REVIEW_FILTER, authorityKind: 'municipal' })).toBe(false);
    expect(matchesReviewFilter(facts(), { ...DEFAULT_REVIEW_FILTER, city: 'חיפה' })).toBe(false);
    expect(matchesReviewFilter(facts(), { ...DEFAULT_REVIEW_FILTER, activity: 'cycling' })).toBe(false);
    expect(matchesReviewFilter(facts({ activityType: 'walking' }), { ...DEFAULT_REVIEW_FILTER, activity: 'pedestrian' })).toBe(true);
    expect(matchesReviewFilter(facts(), { ...DEFAULT_REVIEW_FILTER, nameQuery: 'טייל' })).toBe(true);
    expect(matchesReviewFilter(facts(), { ...DEFAULT_REVIEW_FILTER, nameQuery: 'פארק' })).toBe(false);
  });
  it('the nationwide approve default is 70+ without low confidence', () => {
    expect(NATIONWIDE_APPROVE_DEFAULT_FILTER).toMatchObject({ scoreMin: 70, scoreMax: null, lowConfidence: 'exclude' });
    expect(matchesReviewFilter(facts({ score: 69 }), NATIONWIDE_APPROVE_DEFAULT_FILTER)).toBe(false);
    expect(matchesReviewFilter(facts({ score: 80, lowConfidenceReason: 'low_score_fill' }), NATIONWIDE_APPROVE_DEFAULT_FILTER)).toBe(false);
    expect(matchesReviewFilter(facts({ score: 80 }), NATIONWIDE_APPROVE_DEFAULT_FILTER)).toBe(true);
  });
});

describe('helpers', () => {
  it('authority kind follows the runner --kind split', () => {
    expect(authorityKindOf('regional_council')).toBe('regional');
    expect(authorityKindOf('city')).toBe('municipal');
    expect(authorityKindOf('local_council')).toBe('municipal');
    expect(authorityKindOf(undefined)).toBe('municipal');
  });
  it('presets round-trip, anything else is custom', () => {
    for (const p of SCORE_PRESETS) expect(presetIdOf(p.min, p.max)).toBe(p.id);
    expect(presetIdOf(60, 65)).toBe('custom');
    expect(SCORE_PRESETS.map((p) => p.label)).toEqual(['כל הציונים', '70+', '62–69', '55–61', '<55']);
  });
  it('parseScoreBound', () => {
    expect(parseScoreBound('')).toBeNull();
    expect(parseScoreBound(' 62 ')).toBe(62);
    expect(parseScoreBound('abc')).toBeNull();
    expect(parseScoreBound('140')).toBe(100);
  });
  it('describes the filter in Hebrew', () => {
    expect(describeReviewFilter({ ...DEFAULT_REVIEW_FILTER, city: 'חיפה', scoreMin: 55, scoreMax: 61, lowConfidence: 'only', authorityKind: 'municipal' }))
      .toBe('עיר: חיפה · סוג רשות: עירייה · ציון 55–61 · ביטחון נמוך בלבד');
    expect(describeReviewFilter(NATIONWIDE_APPROVE_DEFAULT_FILTER)).toBe('סוג רשות: הכל · ציון 70+ · ללא ביטחון נמוך');
  });
});

describe('parseReviewFilter (server)', () => {
  it('accepts a full filter and fills defaults', () => {
    expect(parseReviewFilter({ scoreMin: 70 })).toEqual({ ok: true, value: { authorityKind: 'all', scoreMin: 70, scoreMax: null, lowConfidence: 'any', city: null, activity: 'all', nameQuery: null } });
  });
  it('rejects malformed input instead of treating it as "no filter"', () => {
    expect(parseReviewFilter(null).ok).toBe(false);
    expect(parseReviewFilter({ scoreMin: 70.5 }).ok).toBe(false);
    expect(parseReviewFilter({ scoreMin: '70' }).ok).toBe(false);
    expect(parseReviewFilter({ scoreMin: 70, scoreMax: 60 }).ok).toBe(false);
    expect(parseReviewFilter({ lowConfidence: 'maybe' }).ok).toBe(false);
    expect(parseReviewFilter({ authorityKind: 'city' }).ok).toBe(false);
    expect(parseReviewFilter({ city: 'x'.repeat(201) }).ok).toBe(false);
  });
});

describe('approval center plan', () => {
  const meta = new Map<string, ReviewMeta>([
    ['a1', { authorityId: 'A', score: 72, lowConfidenceReason: null, authorityKind: 'municipal', geometry: 'ok' }],
    ['a2', { authorityId: 'A', score: 58, lowConfidenceReason: 'low_score_fill', authorityKind: 'municipal', geometry: 'ok' }],
    ['a3', { authorityId: 'A', score: 59, lowConfidenceReason: 'low_score_fill', authorityKind: 'municipal', geometry: 'gap' }],
    ['b1', { authorityId: 'B', score: 75, lowConfidenceReason: null, authorityKind: 'regional', geometry: 'ok' }],
  ]);
  const rows = [
    { id: 'a1', title: 'a1', city: 'x' }, { id: 'a2', title: 'a2', city: 'x' }, { id: 'a3', title: 'a3', city: 'x' }, { id: 'b1', title: 'b1' },
    { id: 'n1', title: 'no meta', authorityId: 'A' }, { id: 'n2', title: 'no meta, no authority' },
  ];
  it('filters rows by the server meta', () => {
    expect(filterReviewRows(rows, meta, { ...DEFAULT_REVIEW_FILTER, lowConfidence: 'only' }).map((r) => r.id)).toEqual(['a2', 'a3']);
    expect(filterReviewRows(rows, meta, { ...DEFAULT_REVIEW_FILTER, authorityKind: 'regional' }).map((r) => r.id)).toEqual(['b1']);
    expect(filterReviewRows(rows, meta, { ...DEFAULT_REVIEW_FILTER, scoreMin: 70 }).map((r) => r.id)).toEqual(['a1', 'b1']);
  });
  it('groups by authority; approve drops known geometry gaps; unattributed never sent', () => {
    const p = planFilteredAction(rows, meta, 'approve', new Map([['A', 'גבעתיים']]));
    expect(p.perAuthority.map((a) => [a.name, a.ids])).toEqual([['גבעתיים', ['a1', 'a2', 'n1']], ['B', ['b1']]]);
    expect(p).toMatchObject({ total: 4, unattributed: 1, geometryExcluded: 1 });
    const r = planFilteredAction(rows, meta, 'reject');
    expect(r).toMatchObject({ total: 5, unattributed: 1, geometryExcluded: 0 });
  });
});

describe('hub nationwide approve uses the review filter', () => {
  const c = (id: string, o: Partial<PendingRouteCandidate>): PendingRouteCandidate =>
    ({ id, authorityId: 'a', name: id, distanceKm: 5, score: 82, origin: null, geometry: 'ok', gapM: 0, lowConfidenceReason: null, authorityKind: 'municipal', city: null, activityType: null, ...o });
  it('default excludes <70 and low confidence', () => {
    const cands = [c('ok', {}), c('low', { score: 80, lowConfidenceReason: 'low_score_fill' }), c('mid', { score: 65 }), c('none', { score: null })];
    const out = applyBulkFilters(cands, { minScore: 0, minKm: 0, origin: 'all', authorityIds: new Set(['a']), review: NATIONWIDE_APPROVE_DEFAULT_FILTER });
    expect(out.map((x) => x.id)).toEqual(['ok']);
  });
});
