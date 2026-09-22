/**
 * RouteEditor freehand drawing (kein Directions API) — 22.09.2026, field-test
 * doc 24. RouteEditor.tsx itself can't be pure-function-imported under this
 * repo's vitest config (verified — a .tsx transform fails at the oxc/
 * vite:define step regardless of jsdom), so the pure geometry it calls lives
 * in route-editor-geometry.ts and is tested directly here.
 *
 * David's 3 required proofs (all covered below):
 *   1. A freehand-mode route saves in the same [lng,lat] format.
 *   2. It passes through the REAL resolveRouteStops without crashing.
 *   3. A normal (snapped) route is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { densifyPath, FREEHAND_DENSIFY_METERS } from '../route-editor-geometry';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { resolveRouteStops } from '@/features/workout-engine/hybrid/route-stops.service';

// ── Fixture helper: a point exactly `meters` due east of (lng, lat). ──────
const METERS_PER_DEG_LAT = 111_320;
function metersEast(base: [number, number], meters: number): [number, number] {
  const [lng, lat] = base;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return [lng + meters / metersPerDegLng, lat];
}

/** True lat/lng distance between two [lng,lat] points, via the same
 *  haversine the rest of the app uses — never a hand-computed expectation. */
function distM(a: [number, number], b: [number, number]): number {
  return haversineMeters(a[1], a[0], b[1], b[0]);
}

const P0: [number, number] = [34.6000, 31.5300];

// ── 1. densifyPath — pure geometry ─────────────────────────────────────────

describe('densifyPath', () => {
  it('a segment already under the max gap is left completely untouched', () => {
    const p1 = metersEast(P0, 8); // under the 10m default
    const result = densifyPath([P0, p1], FREEHAND_DENSIFY_METERS);
    expect(result).toEqual([P0, p1]);
  });

  it('a long segment is subdivided so every consecutive gap stays ≤ maxGapMeters', () => {
    for (const lengthM of [35, 100, 247]) {
      const p1 = metersEast(P0, lengthM);
      const result = densifyPath([P0, p1], FREEHAND_DENSIFY_METERS);

      expect(result.length).toBeGreaterThan(2); // something was actually inserted
      for (let i = 1; i < result.length; i++) {
        const gap = distM(result[i - 1], result[i]);
        expect(gap).toBeLessThanOrEqual(FREEHAND_DENSIFY_METERS + 0.01); // tiny float slack
      }
    }
  });

  it('the first and last point of each input segment are preserved exactly (not just approximately)', () => {
    const p1 = metersEast(P0, 87);
    const result = densifyPath([P0, p1], FREEHAND_DENSIFY_METERS);
    expect(result[0]).toEqual(P0);
    expect(result[result.length - 1][0]).toBeCloseTo(p1[0], 9);
    expect(result[result.length - 1][1]).toBeCloseTo(p1[1], 9);
  });

  it('every ORIGINAL vertex in a multi-segment path survives, in order, as a subsequence', () => {
    const p1 = metersEast(P0, 8);        // short segment, unchanged
    const p2 = metersEast(p1, 62);       // long segment, gets subdivided
    const p3 = metersEast(p2, 5);        // short segment, unchanged
    const result = densifyPath([P0, p1, p2, p3], FREEHAND_DENSIFY_METERS);

    // Original vertices must appear in the same relative order.
    const idx0 = result.findIndex((p) => p[0] === P0[0] && p[1] === P0[1]);
    const idx1 = result.findIndex((p) => p[0] === p1[0] && p[1] === p1[1]);
    const idx2 = result.findIndex((p) => Math.abs(p[0] - p2[0]) < 1e-9 && Math.abs(p[1] - p2[1]) < 1e-9);
    const idx3 = result.findIndex((p) => Math.abs(p[0] - p3[0]) < 1e-9 && Math.abs(p[1] - p3[1]) < 1e-9);
    expect(idx0).toBe(0);
    expect(idx1).toBeGreaterThan(idx0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(idx3).toBeGreaterThan(idx2);
  });

  it('a closed loop (last point === first point) densifies the closing segment too, without losing the closure', () => {
    const p1 = metersEast(P0, 40);
    const loop: [number, number][] = [P0, p1, P0]; // closeLoop's shape: … , last, first
    const result = densifyPath(loop, FREEHAND_DENSIFY_METERS);
    expect(result[0]).toEqual(P0);
    expect(result[result.length - 1]).toEqual(P0); // still closed after densifying
    for (let i = 1; i < result.length; i++) {
      expect(distM(result[i - 1], result[i])).toBeLessThanOrEqual(FREEHAND_DENSIFY_METERS + 0.01);
    }
  });

  it('edge cases: empty array, single point, and zero-distance duplicate points never throw', () => {
    expect(densifyPath([], FREEHAND_DENSIFY_METERS)).toEqual([]);
    expect(densifyPath([P0], FREEHAND_DENSIFY_METERS)).toEqual([P0]);
    expect(() => densifyPath([P0, P0], FREEHAND_DENSIFY_METERS)).not.toThrow();
    expect(densifyPath([P0, P0], FREEHAND_DENSIFY_METERS)).toEqual([P0, P0]);
  });

  it('output points are always 2-element [lng,lat] tuples — same shape as the input', () => {
    const p1 = metersEast(P0, 53);
    const result = densifyPath([P0, p1], FREEHAND_DENSIFY_METERS);
    for (const p of result) {
      expect(Array.isArray(p)).toBe(true);
      expect(p).toHaveLength(2);
      expect(typeof p[0]).toBe('number');
      expect(typeof p[1]).toBe('number');
    }
  });
});

// ── 2. Format + resolveRouteStops acceptance (David's proofs 1 + 2) ───────

describe('a freehand-drawn route is compatible with the real route_stops engine', () => {
  it('a densified freehand loop saves in the same [lng,lat] format resolveRouteStops expects', () => {
    // Simulate a small hand-drawn square loop (4 corners + closure), the
    // shape RouteEditor's freehand mode + "סגור מעגל" would actually produce.
    const corners: [number, number][] = [
      P0,
      metersEast(P0, 80),
      [metersEast(P0, 80)[0], P0[1] + 60 / METERS_PER_DEG_LAT],
      [P0[0], P0[1] + 60 / METERS_PER_DEG_LAT],
      P0, // closed
    ];
    const densified = densifyPath(corners, FREEHAND_DENSIFY_METERS);
    expect(densified.length).toBeGreaterThan(corners.length); // real densification happened
    expect(densified.every((p) => Array.isArray(p) && p.length === 2)).toBe(true);

    // resolveRouteStops must not throw on this shape, with a park placed
    // right on the loop and one far away (control).
    const parks = [
      {
        id: 'park-on-loop',
        name: 'Test Park',
        facilityType: 'gym_park',
        location: { lat: densified[Math.floor(densified.length / 2)][1], lng: densified[Math.floor(densified.length / 2)][0] },
        gymEquipment: [{ equipmentId: 'e1' }],
      },
      {
        id: 'park-far-away',
        name: 'Far Park',
        facilityType: 'gym_park',
        location: { lat: P0[1] + 1, lng: P0[0] + 1 }, // ~100km+ away
        gymEquipment: [{ equipmentId: 'e1' }],
      },
    ];
    expect(() => resolveRouteStops(densified, parks as any)).not.toThrow();
    const stops = resolveRouteStops(densified, parks as any);
    expect(Array.isArray(stops)).toBe(true);
    // The near park should be picked up (within default 180m radius), the far one never.
    expect(stops.some((s) => s.parkId === 'park-on-loop')).toBe(true);
    expect(stops.some((s) => s.parkId === 'park-far-away')).toBe(false);
  });
});

// ── 3. Regression — snapped mode is unchanged (David's proof 3) ───────────

// Mirrors RouteEditor.tsx's `pathToSave` useMemo verbatim — a 3-line direct
// ternary, so there's no meaningful separate logic to extract/test beyond
// what densifyPath already covers above. Kept here (not imported — can't
// be, see file header) so the specific claim "snapped mode never densifies"
// has its own named, explicit assertion instead of being merely implied.
function pathToSave(raw: [number, number][], snapToRoads: boolean): [number, number][] {
  if (raw.length < 2) return raw;
  return snapToRoads ? raw : densifyPath(raw, FREEHAND_DENSIFY_METERS);
}

describe('REGRESSION — a normal (road-snapped) route is byte-identical to before', () => {
  it('snapToRoads=true returns the exact same points, untouched, regardless of segment length', () => {
    const snapped: [number, number][] = [P0, metersEast(P0, 8), metersEast(P0, 200), metersEast(P0, 500)];
    expect(pathToSave(snapped, true)).toBe(snapped); // same reference — proves no copy/densify ran
  });

  it('snapToRoads=false on the same long path DOES densify (proves the branch is real, not a no-op)', () => {
    const raw: [number, number][] = [P0, metersEast(P0, 200)];
    const result = pathToSave(raw, false);
    expect(result.length).toBeGreaterThan(raw.length);
  });

  it('a path shorter than 2 points is returned as-is regardless of mode (no crash on an empty/1-point draft)', () => {
    expect(pathToSave([], true)).toEqual([]);
    expect(pathToSave([P0], false)).toEqual([P0]);
  });
});
