import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  buildCumulativeMeters, advanceRouteProgress, splitPathAtMeters, easeAlong, type LngLat,
} from '../route-progress';

/** G3.4 (Sderot pilot) — the walked part of the route line: smooth + monotonic. */

// ~111 m per 0.001° lat. A straight 200 m north segment (one RDP-thinned street).
const LNG = 34.6, LAT = 31.5;
const at = (dLatM: number, dLngM = 0) => ({ lat: LAT + dLatM / 111_195, lng: LNG + dLngM / (111_195 * Math.cos((LAT * Math.PI) / 180)) });
const pt = (dLatM: number, dLngM = 0): LngLat => { const p = at(dLatM, dLngM); return [p.lng, p.lat]; };

describe('long segment — continuous, no vertex snap', () => {
  const path = [pt(0), pt(200)];
  const cum = buildCumulativeMeters(path);
  it('progress follows the position along the segment', () => {
    let p: number | null = null;
    for (const m of [10, 50, 90, 130, 170]) {
      p = advanceRouteProgress(p, at(m, 5), path, cum);
      expect(p!).toBeCloseTo(m, 0);
    }
  });
});

describe('monotonic + noise', () => {
  const path = [pt(0), pt(300)];
  const cum = buildCumulativeMeters(path);
  it('a noisy fix slightly behind never lowers progress', () => {
    const p1 = advanceRouteProgress(null, at(100), path, cum)!;
    expect(advanceRouteProgress(p1, at(92), path, cum)).toBe(p1);
  });
  it('a fix far off the line (> 40 m) leaves progress unchanged', () => {
    const p1 = advanceRouteProgress(null, at(100), path, cum)!;
    expect(advanceRouteProgress(p1, at(160, 80), path, cum)).toBe(p1);
  });
});

describe('out-and-back (palindrome path)', () => {
  const out = [pt(0), pt(100), pt(200)];
  const path = [...out, ...out.slice(0, -1).reverse()]; // 0 → 200 → 0
  const cum = buildCumulativeMeters(path);
  it('walking OUT never jumps to the return leg', () => {
    let p: number | null = null;
    for (const m of [20, 60, 120]) p = advanceRouteProgress(p, at(m), path, cum);
    expect(p!).toBeCloseTo(120, 0);
  });
  it('walking BACK keeps advancing — never drops to the outbound mirror', () => {
    let p: number | null = null;
    for (const m of [20, 60, 100, 140, 180, 200]) p = advanceRouteProgress(p, at(m), path, cum);
    for (const m of [170, 120, 80]) {
      const prev = p!;
      p = advanceRouteProgress(p, at(m), path, cum);
      expect(p!).toBeGreaterThanOrEqual(prev);
    }
    expect(p!).toBeCloseTo(200 + 120, 0); // 200 out + 120 back
  });
});

describe('loop where start = end', () => {
  // square loop: 0,0 → 0,150 → 150,150 → 150,0 → 0,0
  const path = [pt(0, 0), pt(150, 0), pt(150, 150), pt(0, 150), pt(0, 0)];
  const cum = buildCumulativeMeters(path);
  it('first fix at the start/end corner resolves to the START, not the end', () => {
    expect(advanceRouteProgress(null, at(2, 2), path, cum)!).toBeLessThan(20);
  });
  it('a nearby LATER pass (beyond the windows, not unmistakably on it) is never chosen', () => {
    const p1 = advanceRouteProgress(null, at(20), path, cum)!;          // ~20 m in
    const p2 = advanceRouteProgress(p1, at(25, 125), path, cum);         // 25 m off the 3rd leg (~425 m)
    expect(p2).toBe(p1);
  });
  it('standing ON a later stretch (shortcut) jumps FORWARD to it — never backward', () => {
    const p1 = advanceRouteProgress(null, at(20), path, cum)!;
    const p2 = advanceRouteProgress(p1, at(25, 148), path, cum)!;        // 2 m off the 3rd leg
    expect(p2).toBeGreaterThan(400);
    expect(advanceRouteProgress(p2, at(75), path, cum)).toBe(p2);        // back on the 1st leg → unchanged
  });
  it('walking up to the loop from the side where it CLOSES does not grey the whole route', () => {
    // 25 m beside the closing leg (~520 m along), ~84 m from the start: no confident match → no progress.
    expect(advanceRouteProgress(null, at(-25, 80), path, cum)).toBeNull();
  });
  it('after a GPS gap the extended forward window catches up (forward only)', () => {
    const p1 = advanceRouteProgress(null, at(20), path, cum)!;
    const p2 = advanceRouteProgress(p1, at(150, 60), path, cum)!;        // ~210 m along, 190 m ahead
    expect(p2).toBeGreaterThan(200);
  });
});

describe('split + easing', () => {
  const path = [pt(0), pt(100), pt(200)];
  const cum = buildCumulativeMeters(path);
  it('passed + ahead share the interpolated split point and add up to the route', () => {
    const { passed, ahead } = splitPathAtMeters(path, cum, 150);
    expect(passed.at(-1)).toEqual(ahead[0]);
    const len = (c: LngLat[]) => buildCumulativeMeters(c).at(-1)!;
    expect(len(passed)).toBeCloseTo(150, 0);
    expect(len(passed) + len(ahead)).toBeCloseTo(cum.at(-1)!, 0);
  });
  it('clamps outside the route', () => {
    expect(splitPathAtMeters(path, cum, -5).passed).toHaveLength(2);
    expect(splitPathAtMeters(path, cum, 999).ahead).toHaveLength(2);
  });
  it('easeAlong never decreases, never overshoots, and settles', () => {
    let v = 0;
    for (let i = 0; i < 400; i++) {
      const n = easeAlong(v, 50, 16);
      expect(n).toBeGreaterThanOrEqual(v);
      expect(n).toBeLessThanOrEqual(50);
      v = n;
    }
    expect(v).toBe(50);
    expect(easeAlong(60, 50, 16)).toBe(60);
  });
});

describe('AppMap wiring', () => {
  const map = readFileSync(fileURLToPath(new URL('../../components/AppMap.tsx', import.meta.url)), 'utf8');
  it('no vertex snapping left; progress advances on every position fix, imperatively', () => {
    expect(map).not.toContain('ghostStartIdxRef');
    expect(map).toContain('advanceRouteProgress(targetAlongRef.current, currentLocation!, progressPath, progressCum)');
    expect(map).toContain('}, [currentLocation?.lat, currentLocation?.lng, progressCum]);');
    expect(map).toContain("ghostSrc.setData(lineFC(ahead));");
  });
  it('source data is keyed on route content, not the array reference (no overwrite on re-render)', () => {
    expect(map).toContain('[progressRouteKey],');
    expect(map).not.toMatch(/\[progressRouteKey, focusedRoute\?\.path\]/);
  });
});
