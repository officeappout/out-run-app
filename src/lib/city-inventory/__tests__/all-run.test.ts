import { describe, expect, it } from 'vitest';
import { blockerKey, formatRollupMarkdown, inventoryTodo, newInventoryCheckpoint, orderInventoryAuthorities, parseInventoryCheckpoint, rollupReadiness, type InventoryAuthorityRow } from '../all-run';

const A = (o: Partial<InventoryAuthorityRow> & { id: string }): InventoryAuthorityRow => ({ name: o.id, type: 'city', population: null, isActiveClient: false, hasBoundary: true, ...o });

describe('city-inventory --all', () => {
  it('orders clients → big cities → regional councils → the rest; skips no-boundary and non-city types', () => {
    const { ordered, skippedNoBoundary } = orderInventoryAuthorities([
      A({ id: 'small', population: 10_000 }),
      A({ id: 'rc', type: 'regional_council' }),
      A({ id: 'big', population: 900_000 }),
      A({ id: 'client', population: 30_000, isActiveClient: true }),
      A({ id: 'mid', type: 'local_council', population: 50_000 }),
      A({ id: 'nob', hasBoundary: false }),
      A({ id: 'settlement', type: 'settlement' }),
    ]);
    expect(ordered.map((a) => `${a.id}:${a.tier}`)).toEqual(['client:client', 'big:large_city', 'rc:regional_council', 'mid:other', 'small:other']);
    expect(skippedNoBoundary.map((a) => a.id)).toEqual(['nob']);
  });
  it('checkpoint resumes, retries errors on demand, survives JSON', () => {
    const cp = newInventoryCheckpoint(false, new Date(0));
    cp.done.a = { name: 'a', tier: 'other', status: 'done', finishedAt: 'x', level: 'red', score: 20 };
    cp.done.b = { name: 'b', tier: 'other', status: 'error', finishedAt: 'x', note: 'boom' };
    const back = parseInventoryCheckpoint(JSON.stringify(cp))!;
    expect(inventoryTodo(back, ['a', 'b', 'c'])).toEqual(['c']);
    expect(inventoryTodo(back, ['a', 'b', 'c'], true)).toEqual(['b', 'c']);
    expect(parseInventoryCheckpoint('{"kind":"x"}')).toBeNull();
  });
  it('rolls readiness up by level and tier, with the most common gaps', () => {
    const done = {
      a: { name: 'א', tier: 'client' as const, status: 'done' as const, finishedAt: 'x', level: 'green' as const, score: 80, missing: [], blockers: [] },
      b: { name: 'ב', tier: 'other' as const, status: 'done' as const, finishedAt: 'x', level: 'red' as const, score: 20, missing: ['shade' as const, 'lighting' as const], blockers: ['only 2 approved routes (need 8)'] },
      c: { name: 'ג', tier: 'other' as const, status: 'done' as const, finishedAt: 'x', level: 'yellow' as const, score: 50, missing: ['shade' as const], blockers: ['only 5 approved routes (need 8)'] },
      d: { name: 'ד', tier: 'other' as const, status: 'error' as const, finishedAt: 'x', note: 'no boundary' },
    };
    const r = rollupReadiness(done as never);
    expect(r).toMatchObject({ authorities: 3, errors: 1, levels: { red: 1, yellow: 1, green: 1 }, meanScore: 50 });
    expect(r.byTier.other).toEqual({ red: 1, yellow: 1, green: 0 });
    expect(r.topMissing[0]).toEqual({ layer: 'shade', count: 2 });
    expect(r.topBlockers[0]).toEqual({ blocker: 'only # approved routes (need #)', count: 2 });
    const md = formatRollupMarkdown(r, done as never);
    expect(md).toContain('| **all (3)** | 1 | 1 | 1 |');
    expect(md).toContain('✖ error');
    expect(blockerKey('3.5 km² of 12 ')).toBe('# km² of #');
  });
});
