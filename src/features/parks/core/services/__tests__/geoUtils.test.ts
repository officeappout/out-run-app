import { describe, it, expect } from 'vitest';
import {
  bearingBetween,
  destinationPoint,
  isOutAndBackPath,
  buildLaneOffsetPath,
  buildOutAndBackPath,
  computeRouteTurns,
} from '../geoUtils';

describe('destinationPoint — inverse of bearingBetween (15.08.2026, route-styling batch)', () => {
  it('moving north (bearing 0) increases latitude, leaves longitude ~unchanged', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 100, 0);
    expect(lat).toBeGreaterThan(32.05);
    expect(lng).toBeCloseTo(34.77, 3);
  });

  it('moving east (bearing 90) increases longitude, leaves latitude ~unchanged', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 100, 90);
    expect(lng).toBeGreaterThan(34.77);
    expect(lat).toBeCloseTo(32.05, 3);
  });

  it('zero distance returns the same point', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 0, 123);
    expect(lat).toBeCloseTo(32.05, 9);
    expect(lng).toBeCloseTo(34.77, 9);
  });

  it('round-trips with bearingBetween: the bearing FROM the origin TO the destination matches the input bearing', () => {
    const [lng, lat] = destinationPoint(32.05, 34.77, 50, 45);
    const backBearing = bearingBetween(32.05, 34.77, lat, lng);
    expect(backBearing).toBeCloseTo(45, 1);
  });
});

describe('isOutAndBackPath — structural palindrome detection (15.08.2026)', () => {
  it('detects a real buildOutAndBackPath output', () => {
    const outbound: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    const path = buildOutAndBackPath(outbound);
    expect(isOutAndBackPath(path)).toBe(true);
  });

  it('rejects a plain one-way path (not mirrored)', () => {
    const path: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    expect(isOutAndBackPath(path)).toBe(false);
  });

  it('rejects a loop (returns near the start but via different geometry, not a literal mirror)', () => {
    const path: [number, number][] = [
      [34.77, 32.05], [34.78, 32.06], [34.79, 32.06], [34.78, 32.05], [34.77, 32.05],
    ];
    expect(isOutAndBackPath(path)).toBe(false);
  });

  it('rejects paths shorter than 3 points', () => {
    expect(isOutAndBackPath([[34.77, 32.05], [34.78, 32.06]])).toBe(false);
    expect(isOutAndBackPath([[34.77, 32.05]])).toBe(false);
    expect(isOutAndBackPath([])).toBe(false);
  });

  it('rejects even-length paths (an out-and-back mirror is always odd-length, 2n-1)', () => {
    const path: [number, number][] = [[0, 0], [1, 1], [2, 2], [1, 1]];
    expect(isOutAndBackPath(path)).toBe(false);
  });

  it('a single-point outbound ([A] → [A]) is too short to be a real out-and-back (needs length >= 3)', () => {
    expect(isOutAndBackPath(buildOutAndBackPath([[34.77, 32.05]]))).toBe(false);
  });
});

describe('buildLaneOffsetPath — display-only out-and-back lane separation (15.08.2026)', () => {
  const outbound: [number, number][] = [
    [34.77, 32.05], [34.78, 32.06], [34.79, 32.07], [34.80, 32.08],
  ];
  const oabPath = buildOutAndBackPath(outbound);

  it('is a no-op for a non-out-and-back path', () => {
    const oneWay: [number, number][] = [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]];
    expect(buildLaneOffsetPath(oneWay)).toEqual(oneWay);
  });

  it('preserves path length', () => {
    expect(buildLaneOffsetPath(oabPath).length).toBe(oabPath.length);
  });

  it('leaves the true start point unchanged (ramp = 0 there)', () => {
    const offset = buildLaneOffsetPath(oabPath);
    expect(offset[0][0]).toBeCloseTo(oabPath[0][0], 9);
    expect(offset[0][1]).toBeCloseTo(oabPath[0][1], 9);
  });

  it('leaves the true end point unchanged (same physical point as start, ramp = 0 there too)', () => {
    const offset = buildLaneOffsetPath(oabPath);
    const last = offset.length - 1;
    expect(offset[last][0]).toBeCloseTo(oabPath[last][0], 9);
    expect(offset[last][1]).toBeCloseTo(oabPath[last][1], 9);
  });

  it('leaves the true turnaround vertex unchanged (ramp = 0 there — no seam/jump between the two lanes)', () => {
    const offset = buildLaneOffsetPath(oabPath);
    const turnaroundIdx = (oabPath.length - 1) / 2;
    expect(offset[turnaroundIdx][0]).toBeCloseTo(oabPath[turnaroundIdx][0], 9);
    expect(offset[turnaroundIdx][1]).toBeCloseTo(oabPath[turnaroundIdx][1], 9);
  });

  it('actually separates the outbound and return legs in the middle of each leg', () => {
    const offset = buildLaneOffsetPath(oabPath, 5);
    // Middle of the outbound leg (index 1, between start=0 and turnaround=3)
    // vs. the corresponding point on the return leg — same original
    // coordinate (oabPath is symmetric), should now differ after offsetting.
    const turnaroundIdx = (oabPath.length - 1) / 2; // 3
    const outboundMidIdx = 1;
    const returnMidIdx = oabPath.length - 1 - outboundMidIdx; // mirror index
    expect(oabPath[outboundMidIdx]).toEqual(oabPath[returnMidIdx]); // same original point
    const distApart = Math.hypot(
      offset[outboundMidIdx][0] - offset[returnMidIdx][0],
      offset[outboundMidIdx][1] - offset[returnMidIdx][1],
    );
    expect(distApart).toBeGreaterThan(0);
    void turnaroundIdx;
  });
});

describe('computeRouteTurns — turnaround detection (15.08.2026, fixes U-turn mislabeled as "turn left")', () => {
  it('flags a genuine ~180° reversal as isTurnaround with the turnaround label, not an ordinary sharp turn', () => {
    const outbound: [number, number][] = [[34.77, 32.05], [34.78, 32.05], [34.79, 32.05]];
    const path = buildOutAndBackPath(outbound); // straight out, straight back — 180° at the turnaround
    const turns = computeRouteTurns(path);
    const turnaround = turns.find(t => t.isTurnaround);
    expect(turnaround).toBeDefined();
    expect(turnaround?.instruction).toBe('פנה לאחור');
  });

  it('an ordinary ~90° turn is NOT flagged as a turnaround and keeps its normal label', () => {
    // North then east — a clean 90° right turn, nowhere near a reversal.
    const path: [number, number][] = [[34.77, 32.05], [34.77, 32.06], [34.78, 32.06]];
    const turns = computeRouteTurns(path);
    expect(turns.length).toBeGreaterThan(0);
    for (const t of turns) {
      expect(t.isTurnaround).toBeFalsy();
      expect(t.instruction).not.toBe('פנה לאחור');
    }
  });
});
