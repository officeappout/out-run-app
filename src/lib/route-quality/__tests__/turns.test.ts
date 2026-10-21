import { describe, expect, it } from 'vitest';
import { computeRouteQualityMetrics, countTurns, simplifyIndices, turnMetrics, zigzagIndex } from '..';
import { SQUARE, dense, m } from './fixtures';

/** 1 km diagonal crossed as a staircase of `step`-metre blocks (east, north, east, north…). */
function staircase(step: number, total = 1000): Array<[number, number]> {
  const pts: Array<[number, number]> = [[0, 0]];
  let x = 0, y = 0;
  while (x < total) { x += step; pts.push([x, y]); y += step; pts.push([x, y]); }
  return pts;
}

/** Closed staircase loop: staircase up to (s,s) then back along a straight L (east side + north side reversed). */
function staircaseLoop(step: number, side: number): Array<[number, number]> {
  const up = staircase(step, side);
  const [ex, ey] = up[up.length - 1];
  return [...up, [0, ey], [0, 0]].map(([x, y]) => [Math.min(x, ex), y] as [number, number]);
}

describe('turns per km', () => {
  it('a straight street has no turns', () => {
    const line = m(dense([[0, 0], [1000, 0]]));
    expect(countTurns(line)).toBe(0);
    expect(turnMetrics(line).turnsPerKm).toBe(0);
  });

  it('a 500 m square loop has its 3 inner corners (the start corner is the loop closure)', () => {
    expect(countTurns(SQUARE)).toBe(3);
    expect(turnMetrics(SQUARE).turnsPerKm).toBeCloseTo(1.5, 3);
  });

  it('gentle curves (< 45° per vertex after simplification) are not turns', () => {
    // A 90° arc of radius 300 m drawn with 10 m vertices.
    const arc: Array<[number, number]> = [];
    for (let k = 0; k <= 47; k++) { const t = (k / 47) * (Math.PI / 2); arc.push([300 * Math.sin(t), 300 - 300 * Math.cos(t)]); }
    expect(countTurns(m(arc))).toBe(0);
  });

  it('a 100 m-block staircase turns at every block corner', () => {
    const s = m(dense(staircase(100)));
    // 10 steps east + 10 north = 20 legs → 19 inner corners over 2 km.
    expect(countTurns(s)).toBe(19);
    expect(turnMetrics(s).turnsPerKm).toBeCloseTo(9.5, 1);
  });

  it('a sidewalk hop (two 90° jogs 15 m apart) counts as two turns', () => {
    const hop = m(dense([[0, 0], [300, 0], [300, 15], [600, 15]], 5));
    expect(countTurns(hop)).toBe(2);
  });

  it('a kink of < 5 m off the line (vertex noise) is ignored', () => {
    const noisy = m([[0, 0], [200, 0], [205, 3], [210, 0], [400, 0]]);
    expect(countTurns(noisy)).toBe(0);
  });
});

describe('zigzag index', () => {
  it('≈ 1 for a straight line and for a block-sized square loop', () => {
    expect(zigzagIndex(m(dense([[0, 0], [1000, 0]])))).toBeCloseTo(1, 5);
    expect(zigzagIndex(SQUARE)).toBeCloseTo(1, 2);
  });

  it('≈ √2 for an 80 m-block staircase', () => {
    expect(zigzagIndex(m(dense(staircase(80, 960))))).toBeCloseTo(Math.SQRT2, 1);
  });

  it('a 100 m-block staircase still reads clearly zigzag', () => {
    expect(zigzagIndex(m(dense(staircase(100))))).toBeGreaterThan(1.15);
  });

  it('a coarse 400 m-step staircase is real geometry, not zigzag', () => {
    expect(zigzagIndex(m(dense(staircase(400, 800))))).toBeLessThan(1.05);
  });

  it('a loop with a staircase side reads more zigzag than the plain loop', () => {
    const loop = m(dense(staircaseLoop(80, 800)));
    const z = zigzagIndex(loop);
    expect(z).toBeGreaterThan(1.1);
    expect(z).toBeLessThan(Math.SQRT2);
  });

  it('degenerate paths → 1', () => {
    expect(zigzagIndex([])).toBe(1);
    expect(zigzagIndex(m([[0, 0], [10, 0]]))).toBe(1);
  });
});

describe('simplifyIndices', () => {
  it('keeps the ends and the real corner', () => {
    expect(simplifyIndices([[0, 0], [50, 1], [100, 0], [100, 100]], 5)).toEqual([0, 2, 3]);
  });
});

describe('computeRouteQualityMetrics carries the turn metrics', () => {
  it('square loop', () => {
    const q = computeRouteQualityMetrics(SQUARE);
    expect(q.turns).toBe(3);
    expect(q.turnsPerKm).toBeCloseTo(1.5, 3);
    expect(q.zigzagIndex).toBeCloseTo(1, 2);
  });
});
