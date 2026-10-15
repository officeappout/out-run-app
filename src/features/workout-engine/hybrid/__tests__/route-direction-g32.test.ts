import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { computeStartArrow, detectWalkDirection, isFlippableLoop, pointAlong, type LngLat } from '../route-direction';
import { reverseHybridSegments } from '../reverse-plan';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** G3.2 (Sderot pilot) — adapt a LOOP route to the direction actually walked. */

const LNG = 34.6, LAT = 31.5;
const at = (dLatM: number, dLngM = 0) => ({ lat: LAT + dLatM / 111_195, lng: LNG + dLngM / (111_195 * Math.cos((LAT * Math.PI) / 180)) });
const pt = (dLatM: number, dLngM = 0): LngLat => { const p = at(dLatM, dLngM); return [p.lng, p.lat]; };

// Square loop starting/ending at the entry: north 200 → east 200 → south 200 → west 200.
const loop: LngLat[] = [pt(0, 0), pt(200, 0), pt(200, 200), pt(0, 200), pt(0, 0)];

describe('which way is the user walking', () => {
  it('too close to the start → undecided', () => {
    expect(detectWalkDirection(loop, at(30))).toBe('undecided');
  });
  it('walking the planned way (north first) → forward', () => {
    expect(detectWalkDirection(loop, at(80))).toBe('forward');
  });
  it('walking the other way (east along the closing leg) → reverse', () => {
    expect(detectWalkDirection(loop, at(0, 80))).toBe('reverse');
  });
  it('off the route (cutting across the park) → still undecided', () => {
    expect(detectWalkDirection(loop, at(80, 80))).toBe('undecided');
  });
  it('pointAlong walks the path in metres', () => {
    const p = pointAlong(loop, 300); // 200 north + 100 east
    expect(p.lat).toBeCloseTo(at(200, 100).lat, 5);
    expect(p.lng).toBeCloseTo(at(200, 100).lng, 5);
  });
});

describe('only a real loop is flipped', () => {
  it('closed loop → flippable', () => {
    expect(isFlippableLoop(loop)).toBe(true);
  });
  it('one_way (open) → never flipped (would need the composer — out of scope)', () => {
    expect(isFlippableLoop([pt(0), pt(200), pt(400), pt(600)])).toBe(false);
  });
  it('out-and-back palindrome → never flipped (reads the same both ways)', () => {
    const out = [pt(0), pt(100), pt(200)];
    expect(isFlippableLoop([...out, ...out.slice(0, -1).reverse()])).toBe(false);
  });
});

describe('start arrow → toward the first stop (every route shape)', () => {
  // one_way, straight north 0 → 600 m. North = bearing 0, south = 180.
  const oneWay: LngLat[] = [pt(0), pt(200), pt(400), pt(600)];
  const near = (b: number, want: number) => Math.min(Math.abs(b - want), 360 - Math.abs(b - want)) < 5;

  it('joined mid-line, first stop ahead → anchored at the user, pointing along the line to it', () => {
    const a = computeStartArrow(oneWay, at(300, 15), at(500))!;
    expect(a.lat).toBeCloseTo(at(300).lat, 4);
    expect(a.lng).toBeCloseTo(at(300).lng, 4);
    expect(near(a.bearing, 0)).toBe(true);
  });
  it('joined past the first stop (one_way, never flipped) → arrow points back along the line', () => {
    const a = computeStartArrow(oneWay, at(300), at(100))!;
    expect(near(a.bearing, 180)).toBe(true);
  });
  it('no start fix yet → anchored at the route start', () => {
    const a = computeStartArrow(oneWay, null, at(500))!;
    expect(a.lat).toBeCloseTo(at(0).lat, 5);
    expect(near(a.bearing, 0)).toBe(true);
  });
  it('first stop without coordinates (full-park) → forward along the route', () => {
    expect(near(computeStartArrow(oneWay, at(300), null)!.bearing, 0)).toBe(true);
  });
  it('loop: start at the closing point → the START is kept, pointing to the first stop', () => {
    const a = computeStartArrow(loop, at(0), at(200, 100))!; // first stop on the 2nd side
    expect(a.lat).toBeCloseTo(at(0).lat, 4);
    expect(near(a.bearing, 0)).toBe(true);
  });
  it('degenerate path → no arrow', () => {
    expect(computeStartArrow([pt(0)], null, null)).toBeNull();
  });
});

describe('plan reversal = pure list reversal', () => {
  const seg = (o: Partial<HybridPlannedSegment>) => ({ estCalories: 10, ...o } as HybridPlannedSegment);
  const plan = [
    seg({ index: 0, kind: 'aerobic', distanceKm: 0.3, fromKm: 0, toKm: 0.3 }),
    seg({ index: 1, kind: 'strength', parkId: 'A', lat: 1, lng: 1 }),
    seg({ index: 2, kind: 'aerobic', distanceKm: 0.5, fromKm: 0.3, toKm: 0.8 }),
    seg({ index: 3, kind: 'strength', parkId: 'B', lat: 2, lng: 2 }),
    seg({ index: 4, kind: 'aerobic', distanceKm: 0.2, fromKm: 0.8, toKm: 1.0 }),
  ];
  const rev = reverseHybridSegments(plan);
  it('stations swap order; content/coords unchanged; still starts and ends with a walk leg', () => {
    expect(rev.map((s) => s.parkId ?? s.kind)).toEqual(['aerobic', 'B', 'aerobic', 'A', 'aerobic']);
    expect(rev[1]).toMatchObject({ parkId: 'B', lat: 2, lng: 2 });
  });
  it('index + cumulative km recomputed; totals unchanged', () => {
    expect(rev.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(rev[0]).toMatchObject({ distanceKm: 0.2, fromKm: 0, toKm: 0.2 });
    expect(rev[4]).toMatchObject({ distanceKm: 0.3, fromKm: 0.7, toKm: 1 });
    const sum = (a: HybridPlannedSegment[]) => a.reduce((t, s) => t + (s.estCalories ?? 0), 0);
    expect(sum(rev)).toBe(sum(plan));
  });
  it('the input plan is not mutated', () => {
    expect(plan[0]).toMatchObject({ index: 0, fromKm: 0, toKm: 0.3 });
  });
});

describe('wiring', () => {
  const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  it('the store reverses only on the first leg, from the composed segments — never re-composes', () => {
    const store = src('../useHybridRun.ts');
    const body = store.slice(store.indexOf('reverseRoute: () => {'), store.indexOf('reset: () => {'));
    expect(body).toContain("if (st.phase !== 'aerobic' || st.cursor !== 0) return false;");
    expect(body).toContain('createHybridSessionController(reverseHybridSegments(st.plan))');
    expect(body).not.toMatch(/composeHybrid|composeRoute/);
  });
  it('the hook flips only a flippable loop, updates map + deviation path + turns, and toasts', () => {
    const hook = src('../../../../app/map/layers/useRouteDirectionAdapt.ts');
    expect(hook).toContain("if (verdict !== 'reverse' || !isFlippableLoop(path)) return;");
    expect(hook).toContain('rp.setActiveRoutePath(reversed);');
    expect(hook).toContain('rp.setGuidedRouteTurns(');
    expect(hook).toContain("showToast('success', routeFlippedToast(gender));");
  });
  it('start arrow during the live walk + TurnCarousel remounts on a flip', () => {
    expect(src('../../../parks/core/components/AppMap.tsx')).toContain('{isActiveWorkout && startArrowGeoJSON && (');
    expect(src('../../../../app/map/layers/FreeRunLayer.tsx')).toContain('startDirectionArrow={startArrow}');
    expect(src('../../../../app/map/MapShell.tsx')).toContain('key={`${logic.focusedRoute.path.length}:${String(logic.focusedRoute.path[1])}`}');
  });
  it('fail-closed flag', () => {
    expect(FLAG_DEFS.find((d) => d.firestoreKey === 'enable_route_direction_adapt')).toMatchObject({ defaultValue: false, superAdminValue: false });
  });
});
