import { describe, it, expect } from 'vitest';
import { CART_TINT_OPACITY, cartDoneCount, cartRingSegments } from '../cart-ring';

const items = (n: number, done: number) =>
  Array.from({ length: n }, (_, i) => ({ color: i % 2 ? '#e5484d' : '#a9b7c2', done: i < done }));

const start = (d: string) => d.match(/^M([\d.]+) ([\d.]+)/)!.slice(1).map(Number);

describe('cartRingSegments — shopping-cart ring', () => {
  it('one segment per item, colour kept, done solid / rest tinted', () => {
    const segs = cartRingSegments(items(13, 5));
    expect(segs).toHaveLength(13);
    expect(segs[1].color).toBe('#e5484d');
    expect(segs.slice(0, 5).every((s) => s.opacity === 1)).toBe(true);
    expect(segs.slice(5).every((s) => s.opacity === CART_TINT_OPACITY)).toBe(true);
  });

  it('starts just left of 12 o\'clock and runs counter-clockwise (RTL)', () => {
    const segs = cartRingSegments(items(13, 0), { size: 54 });
    const [x0, y0] = start(segs[0].d);
    expect(x0).toBeLessThan(27); // left of centre
    expect(y0).toBeLessThan(10); // near the top
    const [x3] = start(segs[3].d);
    expect(x3).toBeLessThan(10); // a quarter in ≈ 9 o'clock (left side)
    expect(segs[0].d).toMatch(/ 0 0 0 /); // sweep-flag 0 = CCW
  });

  it('matches the approved board F-1c first segment', () => {
    // F-1c: "M25.30 3.56 A23.5 23.5 …" for 13 items in a 54 px box.
    const [x0, y0] = start(cartRingSegments(items(13, 5), { size: 54, stroke: 4.5, gapDeg: 7 })[0].d);
    expect(x0).toBeCloseTo(25.6, 0);
    expect(y0).toBeCloseTo(3.6, 0);
  });

  it('edge cases: none, one item, many items', () => {
    expect(cartRingSegments([])).toEqual([]);
    expect(cartRingSegments(items(1, 1))).toHaveLength(1);
    expect(cartRingSegments(items(40, 3))).toHaveLength(40);
  });

  it('badge count', () => {
    expect(cartDoneCount(items(13, 5))).toBe(5);
    expect(cartDoneCount([])).toBe(0);
  });
});
