import { describe, it, expect } from 'vitest';
import {
  buildElevationStrip, climbLabel, elevationAt, kmTicks, nextClimbAhead, profileLengthM,
  readElevationSamples, rotateElevationSamples, sessionStartOffsetM,
} from '../route-elevation-ahead';

const flat = (n: number, e = 10) => ({ stepM: 15, elevationsM: Array.from({ length: n }, () => e) });

describe('readElevationSamples — no runtime DEM, only stored samples', () => {
  it('null for every route shape that exists today (gain/maxGrade only)', () => {
    expect(readElevationSamples({ elevationGain: 42, maxGrade: 6 })).toBeNull();
    expect(readElevationSamples(null)).toBeNull();
    expect(readElevationSamples({ elevationProfile: { stepM: 0, elevationsM: [1, 2] } })).toBeNull();
    expect(readElevationSamples({ elevationProfile: { stepM: 15, elevationsM: [1] } })).toBeNull();
    expect(readElevationSamples({ elevationProfile: { stepM: 15, elevationsM: [1, NaN] } })).toBeNull();
    expect(readElevationSamples({ elevationProfile: { stepM: 15, elevationsM: [1, '2'] } })).toBeNull();
  });
  it('accepts an equally spaced profile', () => {
    expect(readElevationSamples({ elevationProfile: { stepM: 15, elevationsM: [1, 2, 3] } }))
      .toEqual({ stepM: 15, elevationsM: [1, 2, 3] });
  });
});

describe('elevationAt / rotate', () => {
  const s = { stepM: 10, elevationsM: [0, 10, 20, 10, 0] }; // 40 m loop
  it('interpolates and clamps', () => {
    expect(profileLengthM(s)).toBe(40);
    expect(elevationAt(s, 5)).toBe(5);
    expect(elevationAt(s, -5)).toBe(0);
    expect(elevationAt(s, 99)).toBe(0);
  });
  it('rotates a loop to start at the offset and closes back on itself', () => {
    const r = rotateElevationSamples(s, 20);
    expect(r.elevationsM).toEqual([20, 10, 0, 10, 20]);
    expect(rotateElevationSamples(s, 0)).toBe(s);
  });
  it('sessionStartOffsetM finds the rotated start vertex', () => {
    const canonical = [[34.8, 32], [34.8, 32.001], [34.8, 32.002]];
    expect(sessionStartOffsetM(canonical, canonical)).toBe(0);
    const off = sessionStartOffsetM(canonical, [[34.8, 32.001], [34.8, 32.002]])!;
    expect(off).toBeGreaterThan(110);
    expect(off).toBeLessThan(112);
    expect(sessionStartOffsetM(canonical, [[35, 33], [35, 33.1]])).toBeNull();
  });
});

describe('nextClimbAhead', () => {
  // 0–300 m flat, then 120 m at +5 %, then flat.
  const els: number[] = [];
  for (let m = 0; m <= 600; m += 15) els.push(m <= 300 ? 10 : m <= 420 ? 10 + (m - 300) * 0.05 : 16);
  const s = { stepM: 15, elevationsM: els };

  it('finds the climb ahead with its distance and grade', () => {
    const c = nextClimbAhead(s, 0)!;
    expect(c.inM).toBe(300);
    expect(c.gradePct).toBeCloseTo(5, 1);
    expect(c.lengthM).toBe(120);
    expect(climbLabel(c)).toBe('עלייה קלה בעוד 300 מ׳');
  });
  it('none when already past it / flat / beyond look-ahead', () => {
    expect(nextClimbAhead(s, 450)).toBeNull();
    expect(nextClimbAhead(flat(50), 0)).toBeNull();
    expect(nextClimbAhead(s, 0, { lookAheadM: 200 })).toBeNull();
  });
  it('ignores a climb shorter than minLengthM', () => {
    const short = { stepM: 15, elevationsM: [0, 0, 2, 4, 4, 4] }; // 30 m up
    expect(nextClimbAhead(short, 0)).toBeNull();
  });
  it('labels', () => {
    expect(climbLabel(null)).toBeNull();
    expect(climbLabel({ inM: 10, gradePct: 8, lengthM: 100 })).toBe('עלייה עכשיו');
    expect(climbLabel({ inM: 1200, gradePct: 8, lengthM: 100 })).toBe('עלייה בעוד 1.2 ק״מ');
  });
});

describe('kmTicks (RTL — start on the right)', () => {
  it('0..whole km plus the finish', () => {
    const t = kmTicks(5200, 350);
    // '5' is 200 m from the finish — dropped so the labels don't collide.
    expect(t.map((x) => x.label)).toEqual(['0', '1', '2', '3', '4', '5.2']);
    expect(t[0].x).toBe(350);
    expect(t[t.length - 1].x).toBe(0);
  });
  it('keeps a whole km that is not crowding the finish', () => {
    expect(kmTicks(5600, 350).map((x) => x.label)).toEqual(['0', '1', '2', '3', '4', '5', '5.6']);
  });
  it('thins long routes', () => {
    expect(kmTicks(21_100, 350).length).toBeLessThanOrEqual(8);
  });
  it('empty for nothing', () => {
    expect(kmTicks(0, 350)).toEqual([]);
  });
});

describe('buildElevationStrip', () => {
  const s = { stepM: 10, elevationsM: [0, 10, 20, 10, 0] };
  it('places "you are here" by along-route metres (RTL)', () => {
    const g = buildElevationStrip(s, 20, 40, { width: 100, height: 40 })!;
    expect(g.you.x).toBe(50);
    expect(g.lineD.startsWith('M100 ')).toBe(true);
    expect(g.areaD.endsWith('Z')).toBe(true);
    // The top of the hill is the smallest y.
    expect(g.you.y).toBeLessThan(10);
  });
  it('null before join is fine — marker at the start', () => {
    expect(buildElevationStrip(s, null, 40, { width: 100, height: 40 })!.you.x).toBe(100);
  });
  it('null for an unusable length', () => {
    expect(buildElevationStrip(s, 0, 0, { width: 100, height: 40 })).toBeNull();
  });
});
