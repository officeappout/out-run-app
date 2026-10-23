import { describe, expect, it } from 'vitest';
import { GEOMETRY_GAP_SUSPICIOUS_M, haversineLngLatM, isSuspiciousGap, maxVertexGapM, measureGaps, polylineLengthM, splitPathAtGaps } from '../gaps';

const line = (n: number, stepDeg: number): [number, number][] => Array.from({ length: n }, (_, i) => [35 + i * stepDeg, 31.5]);

describe('route-geometry/gaps', () => {
  it('measures the longest step, the steps over the threshold and the bridge length', () => {
    const p: [number, number][] = [...line(5, 0.001), [35.2, 31.5], ...line(4, 0.001).map(([x, y]): [number, number] => [x + 0.2, y])];
    const r = measureGaps(p);
    expect(r.gapCount).toBe(1);
    expect(r.maxGapM).toBeGreaterThan(15_000);
    expect(r.bridgeM).toBeCloseTo(r.maxGapM, 3);
    expect(r.lengthM).toBeCloseTo(polylineLengthM(p), 3);
    expect(maxVertexGapM(p)).toBe(Math.round(r.maxGapM));
  });

  it('a dense line has no gaps; fewer than 2 points is 0', () => {
    expect(measureGaps(line(50, 0.0005)).gapCount).toBe(0);
    expect(maxVertexGapM([])).toBe(0);
    expect(maxVertexGapM([[35, 31]])).toBe(0);
  });

  it('flags at the suspicious threshold', () => {
    expect(isSuspiciousGap(GEOMETRY_GAP_SUSPICIOUS_M)).toBe(true);
    expect(isSuspiciousGap(GEOMETRY_GAP_SUSPICIOUS_M - 1)).toBe(false);
    expect(isSuspiciousGap(null)).toBe(false);
    expect(isSuspiciousGap(undefined)).toBe(false);
    expect(isSuspiciousGap(NaN)).toBe(false);
  });

  it('splits at every long step, drops the bridge and singletons', () => {
    const a = line(4, 0.001), b = line(3, 0.001).map(([x, y]): [number, number] => [x + 0.1, y]);
    const lone: [number, number] = [35.5, 31.5];
    const parts = splitPathAtGaps([...a, ...b, lone]);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual(a);
    expect(parts[1]).toEqual(b);
    expect(splitPathAtGaps(a)).toEqual([a]);
    expect(haversineLngLatM([35, 31.5], [35.001, 31.5])).toBeGreaterThan(90);
  });
});
