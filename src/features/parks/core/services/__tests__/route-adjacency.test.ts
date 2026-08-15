import { describe, it, expect } from 'vitest';
import {
  capPathForComparison,
  findNearestContactPoint,
  corridorCentroid,
  findCandidatePairsByGeohash,
  computeCorridorAdjacency,
  orientCorridorForSplice,
  spliceCorridorChain,
} from '../route-adjacency.service';

const KM_PER_DEGREE = 111;
// A tiny square loop near Tel Aviv, ~4 points, closed (start===end).
const SQUARE_LOOP: [number, number][] = [
  [34.77, 32.05],
  [34.77 + 0.001, 32.05],
  [34.77 + 0.001, 32.05 + 0.001],
  [34.77, 32.05 + 0.001],
  [34.77, 32.05], // closes the loop
];

describe('capPathForComparison', () => {
  it('returns the path unchanged when under the point cap', () => {
    expect(capPathForComparison(SQUARE_LOOP, 60)).toEqual(SQUARE_LOOP);
  });

  it('resamples down to exactly maxPoints for an oversized path', () => {
    const dense: [number, number][] = Array.from({ length: 500 }, (_, i) => [34.77 + i * 0.0001, 32.05]);
    const capped = capPathForComparison(dense, 60);
    expect(capped.length).toBe(60);
  });
});

describe('findNearestContactPoint', () => {
  it('finds the true minimum gap between two paths, not just endpoint combinations', () => {
    // pathB is a single point positioned near the MIDDLE of pathA's second edge —
    // an endpoint-only check would report a much larger gap.
    const pathA: [number, number][] = [
      [34.77, 32.05],
      [34.77, 32.05 + 1 / KM_PER_DEGREE], // ~1km north
      [34.77, 32.05 + 2 / KM_PER_DEGREE], // ~2km north
    ];
    const pathB: [number, number][] = [[34.77 + 0.0001, 32.05 + 1 / KM_PER_DEGREE]]; // right next to pathA's MIDDLE point
    const contact = findNearestContactPoint(pathA, pathB);
    expect(contact.indexA).toBe(1); // the interior point, not an endpoint
    expect(contact.gapMeters).toBeLessThan(50);
  });

  it('returns 0 gap for two paths that share a point', () => {
    const shared: [number, number] = [34.77, 32.05];
    const contact = findNearestContactPoint([shared, [34.78, 32.06]], [[34.76, 32.04], shared]);
    expect(contact.gapMeters).toBeCloseTo(0, 3);
  });
});

describe('corridorCentroid', () => {
  it('returns the mean of all path points', () => {
    const [lng, lat] = corridorCentroid([[0, 0], [2, 2]]);
    expect(lng).toBeCloseTo(1, 5);
    expect(lat).toBeCloseTo(1, 5);
  });
});

describe('findCandidatePairsByGeohash', () => {
  it('includes a pair whose centroids are genuinely close', () => {
    const a = { id: 'a', path: [[34.77, 32.05], [34.7701, 32.0501]] as [number, number][] };
    const b = { id: 'b', path: [[34.7702, 32.0502], [34.7703, 32.0503]] as [number, number][] };
    const pairs = findCandidatePairsByGeohash([a, b], 5000);
    expect(pairs.length).toBe(1);
  });

  it('excludes a pair whose centroids are far apart (different city)', () => {
    const a = { id: 'a', path: [[34.77, 32.05]] as [number, number][] }; // Tel Aviv
    const b = { id: 'b', path: [[34.65, 31.05]] as [number, number][] }; // ~110km south (Eilat-ish)
    const pairs = findCandidatePairsByGeohash([a, b], 5000);
    expect(pairs.length).toBe(0);
  });

  it('never returns a self-pair or a duplicate reversed pair', () => {
    const a = { id: 'a', path: [[34.77, 32.05]] as [number, number][] };
    const b = { id: 'b', path: [[34.7701, 32.0501]] as [number, number][] };
    const c = { id: 'c', path: [[34.7702, 32.0502]] as [number, number][] };
    const pairs = findCandidatePairsByGeohash([a, b, c], 5000);
    const keys = pairs.map(([x, y]) => [x.id, y.id].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
    expect(keys.every((k) => k.split('|')[0] !== k.split('|')[1])).toBe(true); // no self-pairs
  });
});

describe('computeCorridorAdjacency', () => {
  it('returns an edge for two corridors within threshold, with correct contact coords', () => {
    const a = { id: 'a', path: [[34.77, 32.05], [34.7701, 32.0501]] as [number, number][] };
    const b = { id: 'b', path: [[34.77011, 32.05011], [34.772, 32.052]] as [number, number][] }; // starts ~1-2m from a's end
    const edges = computeCorridorAdjacency([a, b], 150);
    expect(edges.length).toBe(1);
    expect(edges[0].gapMeters).toBeLessThan(10);
    expect([edges[0].routeIdA, edges[0].routeIdB].sort()).toEqual(['a', 'b']);
  });

  it('returns no edges when every pair exceeds the threshold', () => {
    const a = { id: 'a', path: [[34.77, 32.05]] as [number, number][] };
    const b = { id: 'b', path: [[34.80, 32.08]] as [number, number][] }; // several km away
    const edges = computeCorridorAdjacency([a, b], 150);
    expect(edges.length).toBe(0);
  });
});

describe('orientCorridorForSplice', () => {
  it('rotates a closed loop so it starts and ends at the contact index', () => {
    const rotated = orientCorridorForSplice(SQUARE_LOOP, 2);
    expect(rotated[0]).toEqual(SQUARE_LOOP[2]);
    expect(rotated[rotated.length - 1]).toEqual(SQUARE_LOOP[2]);
    expect(rotated.length).toBe(SQUARE_LOOP.length); // same point count, still closed
  });

  it('leaves a non-loop (point-to-point) path unchanged', () => {
    const openPath: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    expect(orientCorridorForSplice(openPath, 1)).toEqual(openPath);
  });
});

describe('spliceCorridorChain', () => {
  it('concatenates corridors and connectors, dropping only the connector\'s duplicate FIRST point', () => {
    // Connector's own last point (1.9, 1.9) is intentionally NOT bit-identical
    // to corridorB's first point (2, 2) — realistic: a Mapbox-snapped
    // connector's endpoint rarely exactly matches a stored corridor vertex
    // even at the "same" real-world location, so that seam is never deduped.
    const corridorA: [number, number][] = [[0, 0], [1, 1]];
    const connector: [number, number][] = [[1, 1], [1.5, 1.5], [1.9, 1.9]]; // starts where A ends
    const corridorB: [number, number][] = [[2, 2], [3, 3]];
    const spliced = spliceCorridorChain([corridorA, corridorB], [connector]);
    expect(spliced).toEqual([[0, 0], [1, 1], [1.5, 1.5], [1.9, 1.9], [2, 2], [3, 3]]);
  });

  it('throws when connector count does not match corridors.length - 1', () => {
    expect(() => spliceCorridorChain([[[0, 0]], [[1, 1]], [[2, 2]]], [[[0, 0], [1, 1]]])).toThrow();
  });

  it('returns empty for zero corridors', () => {
    expect(spliceCorridorChain([], [])).toEqual([]);
  });
});
