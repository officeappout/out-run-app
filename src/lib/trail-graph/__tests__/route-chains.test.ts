import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NAMED_MAIN_MIN_M, NAMED_PART_MIN_M, orderSegmentChains, orderSegments, planChainParts, relationRouteId } from '../route-assembly';
import { distM } from '../geo';
import { measureGaps } from '../../route-geometry/gaps';
import type { LngLat, TrailSegment } from '../types';

type Seg = Pick<TrailSegment, 'id' | 'startNode' | 'endNode' | 'lengthM' | 'geometry'>;

/** A straight east-west segment at latitude y, from x0 to x1 (degrees), joined by node ids. */
function seg(id: string, a: number, b: number, x0: number, x1: number, y = 31.9): Seg {
  const n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 0.001)); // a vertex about every 95 m, like a real mapped way
  const g: LngLat[] = Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y] as LngLat);
  return { id, startNode: a, endNode: b, lengthM: distM(g[0], g[g.length - 1]), geometry: g };
}

/** Every step inside every chain is shorter than `maxStepM` — i.e. no straight bridge was drawn. */
const maxStep = (g: LngLat[]) => measureGaps(g).maxGapM;

describe('orderSegmentChains — never bridges', () => {
  // Three trail pieces of one relation: [1-2-3] ... 20 km of missing trail ... [10-11] ... [20-21-22]
  const piece1 = [seg('a', 1, 2, 35.0, 35.01), seg('b', 2, 3, 35.01, 35.02)]; // ~2 km
  const piece2 = [seg('c', 10, 11, 35.30, 35.33)]; // ~2.8 km, 28 km east of piece 1's end
  const piece3 = [seg('d', 20, 21, 35.6, 35.62), seg('e', 21, 22, 35.62, 35.63), seg('f', 22, 23, 35.63, 35.64)]; // ~3.1 km

  it('a relation with missing trail becomes separate continuous chains, longest first', () => {
    const chains = orderSegmentChains([...piece3, ...piece1, ...piece2]);
    expect(chains.map((c) => c.segmentIds.length)).toEqual([3, 1, 2]);
    expect(chains).toHaveLength(3);
    expect(chains[0].segmentIds.sort()).toEqual(['d', 'e', 'f']);
    for (const c of chains) {
      expect(c.gaps).toBe(0);
      expect(maxStep(c.geometry)).toBeLessThan(200); // vertex spacing only, never the ~20 km hop
    }
    // every input segment lands in exactly one chain
    expect(chains.flatMap((c) => c.segmentIds).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // lengths add up to the input, nothing invented for the gaps
    const sum = chains.reduce((a, c) => a + c.lengthM, 0);
    expect(sum).toBeCloseTo([...piece1, ...piece2, ...piece3].reduce((a, s) => a + s.lengthM, 0), 0);
  });

  it('the legacy single-walk wrapper returns the longest chain and counts what it left out', () => {
    const o = orderSegments([...piece1, ...piece2, ...piece3]);
    expect(o.segmentIds.sort()).toEqual(['d', 'e', 'f']);
    expect(o.gaps).toBe(2);
    expect(measureGaps(o.geometry).gapCount).toBe(0);
  });

  it('a boundary-clipped relation that leaves and RE-ENTERS the area is two chains, not one with a chord', () => {
    // inside: 1-2-3 ; outside (clipped away) ; inside again: 7-8-9. The hop between node 3 and 7 is ~15 km.
    const inA = [seg('in1', 1, 2, 35.1, 35.12), seg('in2', 2, 3, 35.12, 35.14)];
    const inB = [seg('re1', 7, 8, 35.28, 35.3), seg('re2', 8, 9, 35.3, 35.32), seg('re3', 9, 10, 35.32, 35.33)];
    const chains = orderSegmentChains([...inB, ...inA]);
    expect(chains).toHaveLength(2);
    for (const c of chains) expect(maxStep(c.geometry)).toBeLessThan(200);
    const all = chains.flatMap((c) => c.geometry);
    expect(measureGaps(all).gapCount).toBeGreaterThan(0); // (the concatenation WOULD be bridged — the chains are not)
  });

  it('a continuous relation stays one chain and reverses flipped segments', () => {
    const chains = orderSegmentChains([seg('c', 3, 4, 35.02, 35.03), seg('a', 1, 2, 35.0, 35.01), seg('b', 3, 2, 35.02, 35.01)]);
    expect(chains).toHaveLength(1);
    expect(chains[0].segmentIds).toEqual(['a', 'b', 'c']);
    expect(chains[0].forward).toEqual([true, false, true]);
    expect(chains[0].continuity).toBe(1);
    expect(maxStep(chains[0].geometry)).toBeLessThan(200);
  });

  it('a spur the walk passes becomes its own chain instead of being jumped to', () => {
    // main line 1-2-3-4, spur 2-9 hanging off node 2
    const main = [seg('m1', 1, 2, 35.0, 35.01), seg('m2', 2, 3, 35.01, 35.03), seg('m3', 3, 4, 35.03, 35.05)];
    const spur = seg('s', 2, 9, 35.01, 35.01, 31.92);
    const chains = orderSegmentChains([...main, spur]);
    const walked = chains.flatMap((c) => c.segmentIds).sort();
    expect(walked).toEqual(['m1', 'm2', 'm3', 's']);
    for (const c of chains) expect(maxStep(c.geometry)).toBeLessThan(200);
  });

  it('is deterministic regardless of input order and handles empty input', () => {
    const segs = [...piece1, ...piece2, ...piece3];
    const a = orderSegmentChains(segs).map((c) => c.segmentIds.join(','));
    const b = orderSegmentChains([...segs].reverse()).map((c) => c.segmentIds.join(','));
    expect(b).toEqual(a);
    expect(orderSegmentChains([])).toEqual([]);
    expect(orderSegments([])).toMatchObject({ segmentIds: [], gaps: 0 });
  });
});

describe('planChainParts / relationRouteId', () => {
  const chain = (id: string, lengthM: number) => ({ segmentIds: [id], forward: [true], geometry: [], lengthM, continuity: 0, gaps: 0 });

  it('the longest chain needs the usual 300 m, every further part 800 m', () => {
    const plan = planChainParts([chain('a', 6840), chain('b', 2378), chain('c', 843), chain('d', 804), chain('e', 497), chain('f', 15)]);
    expect(plan.partCount).toBe(6);
    expect(plan.parts.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    expect(plan.droppedShort).toEqual([{ rank: 5, lengthM: 497 }, { rank: 6, lengthM: 15 }]);
    expect(NAMED_MAIN_MIN_M).toBeLessThan(NAMED_PART_MIN_M);
    expect(planChainParts([chain('x', 350)]).parts).toHaveLength(1);
    expect(planChainParts([chain('x', 250)]).parts).toHaveLength(0);
  });

  it('single-chain relations keep osm_rel_<id>; multi-chain ones get _pN for every chain (never colliding with an old bridged doc)', () => {
    expect(relationRouteId(11123868, 1, 1)).toBe('osm_rel_11123868');
    expect(relationRouteId(11123868, 1, 6)).toBe('osm_rel_11123868_p1');
    expect(relationRouteId(11123868, 2, 6)).toBe('osm_rel_11123868_p2');
  });
});

describe('real fixture — שביל גולני inside מועצה אזורית מטה בנימין (relation 11123868, 76 segments)', () => {
  const segs = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golani-mateh-binyamin.segments.json'), 'utf8')) as Seg[];

  it('used to be ONE route with a 13.8 km chord; now continuous chains with no bridge', () => {
    const chains = orderSegmentChains(segs);
    expect(chains.length).toBeGreaterThan(1);
    // the pre-fix single walk bridged 3 gaps of 500 m+ (max 13,759 m); the concatenated chains do too — the chains themselves do not
    expect(measureGaps(chains.flatMap((c) => c.geometry)).maxGapM).toBeGreaterThan(10_000);
    for (const c of chains) {
      expect(measureGaps(c.geometry).gapCount).toBe(0);
      expect(maxStep(c.geometry)).toBeLessThan(500);
    }
    const total = segs.reduce((a, s) => a + s.lengthM, 0);
    expect(chains.reduce((a, c) => a + c.lengthM, 0)).toBeCloseTo(total, 0);
    expect(chains[0].lengthM).toBeGreaterThan(6000);
    const plan = planChainParts(chains);
    expect(plan.parts.length).toBeGreaterThanOrEqual(2);
    expect(plan.droppedShort.length).toBeGreaterThanOrEqual(1);
  });
});
