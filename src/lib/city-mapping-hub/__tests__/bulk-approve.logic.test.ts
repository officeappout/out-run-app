import { describe, expect, it } from 'vitest';
import {
  applyBulkFilters, authorityOptions, buildBulkPreview, chunk, confirmPhrase, isConfirmValid, runBulkApprove, summarizeRun,
  type PendingRouteCandidate,
} from '../bulk-approve.logic';

const c = (id: string, authorityId: string, o: Partial<PendingRouteCandidate> = {}): PendingRouteCandidate =>
  ({ id, authorityId, name: id, distanceKm: 5, score: 82, origin: 'osm_import', ...o });
const names = new Map([['a', 'אילת'], ['b', 'באר שבע']]);
const base = { minScore: 0, minKm: 0, origin: 'all' as const, authorityIds: new Set(['a', 'b']) };

describe('applyBulkFilters', () => {
  const all = [c('1', 'a'), c('2', 'a', { score: 70, distanceKm: 1, origin: 'web_research' }), c('3', 'b', { score: null, distanceKm: null })];
  it('defaults pass everything selected, including null score / length', () => {
    expect(applyBulkFilters(all, base).map((x) => x.id)).toEqual(['1', '2', '3']);
  });
  it('positive minimums exclude missing values', () => {
    expect(applyBulkFilters(all, { ...base, minScore: 80 }).map((x) => x.id)).toEqual(['1']);
    expect(applyBulkFilters(all, { ...base, minKm: 2 }).map((x) => x.id)).toEqual(['1']);
  });
  it('origin and authority selection', () => {
    expect(applyBulkFilters(all, { ...base, origin: 'known' }).map((x) => x.id)).toEqual(['2']);
    expect(applyBulkFilters(all, { ...base, origin: 'other' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(applyBulkFilters(all, { ...base, authorityIds: new Set(['b']) }).map((x) => x.id)).toEqual(['3']);
  });
});

describe('preview', () => {
  it('groups per authority, biggest first, exact total', () => {
    const p = buildBulkPreview([c('1', 'a'), c('2', 'b'), c('3', 'b')], names);
    expect(p.perAuthority.map((a) => [a.name, a.count])).toEqual([['באר שבע', 2], ['אילת', 1]]);
    expect(p.total).toBe(3);
  });
  it('options list authorities with unfiltered pending counts', () => {
    expect(authorityOptions([c('1', 'a'), c('2', 'a'), c('3', 'b')], names).map((o) => o.pending)).toEqual([2, 1]);
  });
});

describe('confirm text', () => {
  it('accepts exactly "אשר N" or N', () => {
    expect(confirmPhrase(12)).toBe('אשר 12');
    expect(isConfirmValid('אשר 12', 12)).toBe(true);
    expect(isConfirmValid(' 12 ', 12)).toBe(true);
    expect(isConfirmValid('אשר  12', 12)).toBe(true);
    expect(isConfirmValid('13', 12)).toBe(false);
    expect(isConfirmValid('', 12)).toBe(false);
    expect(isConfirmValid('0', 0)).toBe(false);
  });
});

describe('chunk', () => {
  it('splits at 500', () => {
    const ids = Array.from({ length: 1201 }, (_, i) => String(i));
    expect(chunk(ids).map((x) => x.length)).toEqual([500, 500, 201]);
    expect(chunk([])).toEqual([]);
  });
});

describe('runBulkApprove', () => {
  const preview = buildBulkPreview([...Array.from({ length: 501 }, (_, i) => c(`a${i}`, 'a')), c('b1', 'b'), c('b2', 'b')], names);
  it('batches ≤500 sequentially, continues past a failing authority, aggregates', async () => {
    const calls: Array<[string, number]> = [];
    const progress: number[] = [];
    const s = await runBulkApprove(preview, async (id, ids) => {
      calls.push([id, ids.length]);
      if (id === 'a' && ids.length === 1) throw new Error('boom');
      return { updated: ids.slice(1), skipped: ids.slice(0, 1).map((x) => ({ id: x, reason: 'not_pending' as const })) };
    }, (d) => progress.push(d));
    expect(calls).toEqual([['a', 500], ['a', 1], ['b', 2]]);
    expect(progress).toEqual([1, 2]);
    expect(s.failedAuthorities.map((r) => r.authorityId)).toEqual(['a']);
    const a = s.authorities.find((r) => r.authorityId === 'a')!;
    expect(a.approved).toBe(499);
    expect(a.error).toBe('boom');
    expect(s.approved).toBe(499 + 1);
    expect(s.requested).toBe(503);
  });
  it('summarize of nothing is zero', () => {
    expect(summarizeRun([])).toMatchObject({ requested: 0, approved: 0, skipped: 0 });
  });
});
