import { describe, it, expect } from 'vitest';
import { computeSmoothedProfile, hysteresisGainLoss, maxWindowGrade, medianFilter, resamplePolyline, polylineLengthM } from '../elevation-profile';
import type { ElevationProvider } from '../elevation-provider';

// 0.001° of longitude at lat 31.5 ≈ 94.9 m
const line = (lenDeg: number): Array<[number, number]> => [[34.5, 31.5], [34.5 + lenDeg, 31.5]];
const provider = (f: (lng: number) => number | null): ElevationProvider => ({ id: 'copernicus-glo30', attribution: 'test', storable: true, sample: (_lat, lng) => f(lng) });

describe('resamplePolyline', () => {
  it('keeps both endpoints and steps evenly', () => {
    const { points, dist } = resamplePolyline(line(0.01), 15);
    expect(points[0]).toEqual([34.5, 31.5]);
    expect(points[points.length - 1]).toEqual([34.51, 31.5]);
    expect(dist[1]).toBeCloseTo(15, 6);
    expect(dist[dist.length - 1]).toBeCloseTo(polylineLengthM(line(0.01)), 6);
  });
});

describe('medianFilter', () => {
  it('removes a single-sample spike that a moving average would smear', () => {
    expect(medianFilter([10, 10, 30, 10, 10], 3)).toEqual([10, 10, 10, 10, 10]);
  });
});

describe('hysteresisGainLoss', () => {
  it('ignores sub-threshold noise on flat ground', () => {
    const noisy = Array.from({ length: 200 }, (_, i) => 100 + (i % 2 ? 1.2 : -1.2));
    expect(hysteresisGainLoss(noisy, 3)).toEqual({ gain: 0, loss: 0 });
  });
  it('counts a real climb and descent', () => {
    const hill = [0, 2, 4, 6, 8, 10, 8, 6, 4, 2, 0];
    expect(hysteresisGainLoss(hill, 3)).toEqual({ gain: 8, loss: 8 }); // 0→4→8 (residual 2 m is noise), 8→… down
  });
});

describe('maxWindowGrade', () => {
  it('measures sustained grade over ≥ 50 m in both directions', () => {
    const dist = Array.from({ length: 21 }, (_, i) => i * 10); // 0..200 m
    const ele = dist.map((d) => (d <= 100 ? d * 0.1 : 10)); // 10 % for 100 m then flat
    const g = maxWindowGrade(ele, dist, 50);
    expect(g.fwd).toBeCloseTo(10, 6);
    expect(g.rev).toBe(0);
  });
  it('a 1-step spike does not register as a steep grade', () => {
    const dist = Array.from({ length: 21 }, (_, i) => i * 10);
    const ele = dist.map((_, i) => (i === 10 ? 3 : 0));
    expect(maxWindowGrade(ele, dist, 50).fwd).toBeLessThanOrEqual(6);
  });
  it('uses the whole length when the path is shorter than the window', () => {
    const g = maxWindowGrade([0, 2], [0, 20], 50);
    expect(g.windowUsed).toBe(20);
    expect(g.fwd).toBeCloseTo(10, 6);
  });
});

describe('computeSmoothedProfile', () => {
  it('flat noisy DEM → ~0 gain; gain fwd equals loss when reversed', () => {
    let i = 0;
    const flat = computeSmoothedProfile(line(0.02), provider(() => 50 + ((i++ % 3) - 1)))!;
    expect(flat.gainM).toBe(0);
    const ramp = provider((lng) => (lng - 34.5) * 10000); // ≈10.5 % grade
    const fwd = computeSmoothedProfile(line(0.01), ramp)!;
    const rev = computeSmoothedProfile([...line(0.01)].reverse() as Array<[number, number]>, ramp)!;
    expect(fwd.gainM).toBeGreaterThan(90);
    expect(fwd.lossM).toBe(0);
    expect(rev.lossM).toBeCloseTo(fwd.gainM, 0);
    expect(fwd.maxGradeFwdPct).toBeGreaterThan(10);
    expect(fwd.maxGradeFwdPct).toBeLessThan(11);
    expect(fwd.maxGradeRevPct).toBe(0);
  });
  it('returns null on any coverage gap (never a partial profile)', () => {
    expect(computeSmoothedProfile(line(0.01), provider((lng) => (lng > 34.505 ? null : 1)))).toBeNull();
  });
  it('clamps step to 10–20 m and hysteresis to ≥ 3 m', () => {
    const p = computeSmoothedProfile(line(0.01), provider(() => 1), { stepM: 1, hysteresisM: 0 })!;
    expect(p.samples).toBeLessThanOrEqual(Math.ceil(polylineLengthM(line(0.01)) / 10) + 2);
  });
});
