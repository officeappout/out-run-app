import { describe, expect, it } from 'vitest';
import { bboxOfBoundary, cityMatchesAuthority, planAuthorityBackfill, resolveSkippedByDocCity, summarizeBackfill } from '../authority-backfill';
import type { AuthorityBoundary } from '../../dataset-import/authority-assign';
import { authorityPayload } from '../../../../scripts/routes-nationwide/lib/authority-apply.node';

// Two adjacent ~1.1 km squares: A = lng 34.00–34.01, B = lng 34.01–34.02 (lat 32.00–32.01).
const sq = (x0: number, x1: number) => ({ type: 'Polygon' as const, coordinates: [[[x0, 32], [x1, 32], [x1, 32.01], [x0, 32.01], [x0, 32]]] });
const A: AuthorityBoundary = { id: 'tlv', name: 'תל אביב-יפו', geometry: sq(34.0, 34.01) };
const B: AuthorityBoundary = { id: 'rg', name: 'רמת גן', geometry: sq(34.01, 34.02) };
const line = (x0: number, x1: number, n = 20): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, 32.005]);

describe('planAuthorityBackfill', () => {
  it('assigns by majority of length and sets city only when missing', () => {
    const plan = planAuthorityBackfill([
      { id: 'r1', coords: line(34.001, 34.009) },                        // fully in A, no city
      { id: 'r2', city: 'תל אביב יפו', coords: line(34.001, 34.012) },    // ~80% A, city names A (spacing differs)
    ], [A, B]);
    expect(plan.updates).toEqual([
      expect.objectContaining({ id: 'r1', authorityId: 'tlv', city: 'תל אביב-יפו' }),
      expect.objectContaining({ id: 'r2', authorityId: 'tlv', reportCity: 'תל אביב יפו' }),
    ]);
    expect(plan.updates[1]).not.toHaveProperty('city');
  });

  it('never touches a doc that already has an authorityId', () => {
    const plan = planAuthorityBackfill([{ id: 'r', authorityId: 'rg', coords: line(34.001, 34.009) }], [A, B]);
    expect(plan.updates).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe('has_authority');
  });

  it('does not guess below 50% and skips paths outside every boundary', () => {
    const plan = planAuthorityBackfill([
      { id: 'out', coords: line(34.05, 34.06) },
      { id: 'short', coords: [[34.005, 32.005]] },
    ], [A, B]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['below_majority', 'no_path']);
  });

  it('reports a city that names a different authority instead of writing', () => {
    const plan = planAuthorityBackfill([{ id: 'r', city: 'תל אביב-יפו', coords: line(34.011, 34.019) }], [A, B]);
    expect(plan.updates).toHaveLength(0);
    expect(plan.skipped[0]).toMatchObject({ reason: 'city_conflict' });
    expect(summarizeBackfill(plan).skippedByReason).toEqual({ city_conflict: 1 });
  });
});

describe('cityMatchesAuthority / bboxOfBoundary', () => {
  it('ignores council prefixes and maqaf/spacing', () => {
    expect(cityMatchesAuthority('מועצה אזורית חוף הכרמל', 'חוף הכרמל')).toBe(true);
    expect(cityMatchesAuthority('זכרון יעקב', 'חוף הכרמל')).toBe(false);
  });
  it('bbox of a polygon', () => {
    expect(bboxOfBoundary(A.geometry)).toEqual({ latMin: 32, lonMin: 34, latMax: 32.01, lonMax: 34.01 });
  });
});

describe('authorityPayload (write-site chokepoint)', () => {
  const known = new Set(['tlv', 'rg']);
  const base = { collection: 'official_routes' as const, id: 'x', existingCity: null };
  it('is exactly {authorityId, city} for a doc with no city', () => {
    expect(authorityPayload({ ...base, authorityId: 'tlv', city: 'תל אביב-יפו' }, known)).toEqual({ authorityId: 'tlv', city: 'תל אביב-יפו' });
  });
  it('is exactly {authorityId} when the doc keeps its city', () => {
    expect(authorityPayload({ ...base, authorityId: 'tlv', existingCity: 'תל אביב-יפו' }, known)).toEqual({ authorityId: 'tlv' });
  });
  it('rejects an unknown authority and a city change (§23 lock)', () => {
    expect(() => authorityPayload({ ...base, authorityId: 'nope', city: 'x' }, known)).toThrow(/not a known authority/);
    expect(() => authorityPayload({ ...base, authorityId: 'tlv', city: 'רמת גן', existingCity: 'תל אביב-יפו' }, known)).toThrow(/locked once set/);
  });
});

describe('resolveSkippedByDocCity (--skipped-by-doc-city)', () => {
  const auths = [
    { id: 'zy', name: 'זכרון יעקב' },
    { id: 'tlv', name: 'תל אביב-יפו' },
    { id: 'hk', name: 'חוף הכרמל' },
    { id: 'dupA', name: 'כפר כלשהו' },
    { id: 'dupB', name: 'מועצה מקומית כפר כלשהו' },
  ];
  const skip = (id: string, reason: 'below_majority' | 'city_conflict' | 'no_path' | 'has_authority' = 'city_conflict') =>
    ({ id, reason, city: null, detail: `detail-${id}` });

  it('resolves an exact (normalised) doc.city match for below_majority and city_conflict, payload city untouched', () => {
    const r = resolveSkippedByDocCity(
      [{ id: 'a', city: 'זכרון יעקב' }, { id: 'b', city: 'תל אביב יפו' }],
      [skip('a', 'city_conflict'), skip('b', 'below_majority')],
      auths,
    );
    expect(r.unresolved).toEqual([]);
    expect(r.resolved).toEqual([
      { id: 'a', authorityId: 'zy', authorityName: 'זכרון יעקב', city: 'זכרון יעקב', boundaryReason: 'city_conflict', boundaryDetail: 'detail-a' },
      { id: 'b', authorityId: 'tlv', authorityName: 'תל אביב-יפו', city: 'תל אביב יפו', boundaryReason: 'below_majority', boundaryDetail: 'detail-b' },
    ]);
    expect(authorityPayload({ collection: 'official_routes', id: 'a', authorityId: 'zy', existingCity: 'זכרון יעקב' }, new Set(['zy']))).toEqual({ authorityId: 'zy' });
  });

  it('zero matches → still skipped (no_match); no city → no_city; a substring is not a match', () => {
    const r = resolveSkippedByDocCity(
      [{ id: 'a', city: 'עיר שאינה קיימת' }, { id: 'b' }, { id: 'c', city: 'זכרון' }],
      [skip('a'), skip('b', 'below_majority'), skip('c')],
      auths,
    );
    expect(r.resolved).toEqual([]);
    expect(r.unresolved.map((u) => [u.id, u.reason])).toEqual([['a', 'no_match'], ['b', 'no_city'], ['c', 'no_match']]);
  });

  it('ambiguous (>1 authority with the same normalised name) → still skipped, candidates reported', () => {
    const r = resolveSkippedByDocCity([{ id: 'a', city: 'כפר כלשהו' }], [skip('a')], auths);
    expect(r.resolved).toEqual([]);
    expect(r.unresolved[0]).toMatchObject({ id: 'a', reason: 'ambiguous' });
    expect(r.unresolved[0].candidates.map((c) => c.id).sort()).toEqual(['dupA', 'dupB']);
  });

  it('never overrides an existing authorityId and ignores other skip reasons', () => {
    const r = resolveSkippedByDocCity(
      [{ id: 'a', authorityId: 'hk', city: 'זכרון יעקב' }, { id: 'b', city: 'זכרון יעקב' }, { id: 'c', authorityId: 'hk', city: 'זכרון יעקב' }],
      [skip('a', 'city_conflict'), skip('b', 'no_path'), skip('c', 'has_authority')],
      auths,
    );
    expect(r.resolved).toEqual([]);
    expect(r.unresolved.map((u) => [u.id, u.reason])).toEqual([['a', 'has_authority']]);
  });

  it('end-to-end with the planner: a boundary city_conflict gets the doc.city authority', () => {
    const plan = planAuthorityBackfill([{ id: 'r', city: 'תל אביב-יפו', coords: line(34.011, 34.019) }], [A, B]);
    const r = resolveSkippedByDocCity([{ id: 'r', city: 'תל אביב-יפו' }], plan.skipped, [{ id: 'tlv', name: 'תל אביב-יפו' }, { id: 'rg', name: 'רמת גן' }]);
    expect(r.resolved).toEqual([expect.objectContaining({ id: 'r', authorityId: 'tlv', boundaryReason: 'city_conflict' })]);
  });
});
