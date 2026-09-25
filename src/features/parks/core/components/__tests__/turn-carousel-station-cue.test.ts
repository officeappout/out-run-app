/**
 * TurnCarousel station-cue (kind='station') — 22.09.2026, field-test doc 21.
 *
 * TurnCarousel.tsx itself can't be rendered or even pure-function-imported
 * under this repo's vitest config (node-env, no jsdom; a direct .tsx import
 * was verified to fail at transform time regardless). The logic under test
 * was extracted into `turn-carousel-logic.ts` (plain .ts) specifically so
 * it's testable — TurnCarousel.tsx now just calls these same functions.
 *
 * Two suites:
 *   1. REGRESSION — proves ordinary turn-by-turn navigation (no stations)
 *      is byte-identical to the pre-22.09.2026 behavior. TurnCarousel is
 *      live on 5 screens; this is the "did I break navigation" proof.
 *   2. STATION CUE — proves the new merge/order/icon/label behavior.
 */
import { describe, it, expect } from 'vitest';
import { ArrowUp, ArrowUpRight, ArrowUpLeft, CornerUpRight, CornerUpLeft, Flag, Dumbbell } from 'lucide-react';
import type { RouteTurn } from '../../services/geoUtils';
import {
  DEST_INSTRUCTION,
  getIconForInstruction,
  findNearestPathIdx,
  buildAllTurns,
  computeCurrentGpsIdx,
} from '../turn-carousel-logic';

// ── Fixtures ─────────────────────────────────────────────────────────────

/** A straight-ish 5-vertex path with two real turns, [lng, lat] per geoUtils convention. */
const ROUTE_PATH: [number, number][] = [
  [34.6000, 31.5300], // 0 — start
  [34.6010, 31.5300], // 1
  [34.6020, 31.5300], // 2 — turn 1 here
  [34.6020, 31.5310], // 3
  [34.6020, 31.5320], // 4 — turn 2 here / end
];

const TURN_1: RouteTurn = {
  instruction: 'פנה ימינה',
  distanceMeters: 220,
  lat: 31.5300,
  lng: 34.6020,
  bearingAfter: 90,
  pathIndex: 2,
};
const TURN_2: RouteTurn = {
  instruction: 'ישר',
  distanceMeters: 220,
  lat: 31.5320,
  lng: 34.6020,
  bearingAfter: 0,
  pathIndex: 4,
};
const TURNS: RouteTurn[] = [TURN_1, TURN_2];

// The OLD (pre-22.09.2026) algorithms, reconstructed verbatim from git history,
// kept ONLY as the regression oracle — never imported, so a future edit to the
// real logic can't accidentally "fix" this file into passing trivially.
function oldBuildAllTurns(turns: RouteTurn[], routePath: [number, number][] | null | undefined): RouteTurn[] {
  if (!routePath || routePath.length === 0) return turns;
  const last = routePath[routePath.length - 1];
  return [
    ...turns,
    { instruction: DEST_INSTRUCTION, distanceMeters: 0, lat: last[1], lng: last[0], bearingAfter: 0, pathIndex: routePath.length - 1 },
  ];
}
function oldCurrentGpsTurnIdx(
  turns: RouteTurn[],
  allTurnsLength: number,
  routePath: [number, number][] | null | undefined,
  currentLocation: { lat: number; lng: number },
): number {
  if (!routePath || routePath.length === 0) return 0;
  const nearestPathIdx = findNearestPathIdx(routePath, currentLocation);
  const idx = turns.findIndex((t) => t.pathIndex >= nearestPathIdx);
  return idx === -1 ? Math.max(0, allTurnsLength - 1) : idx;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. REGRESSION — no stations, must match the old (pre-station) behavior
// ─────────────────────────────────────────────────────────────────────────

describe('REGRESSION — ordinary turn navigation is unchanged (no stations)', () => {
  it('buildAllTurns(turns, path, undefined) === old turns+destination behavior', () => {
    const result = buildAllTurns(TURNS, ROUTE_PATH, undefined);
    const expected = oldBuildAllTurns(TURNS, ROUTE_PATH);
    expect(result).toEqual(expected);
    expect(result).toHaveLength(3); // 2 turns + destination, nothing extra
    expect(result.filter((t) => t.kind === 'station')).toHaveLength(0);
  });

  it('null and [] stations produce the identical result to undefined', () => {
    const withUndefined = buildAllTurns(TURNS, ROUTE_PATH, undefined);
    const withNull = buildAllTurns(TURNS, ROUTE_PATH, null);
    const withEmpty = buildAllTurns(TURNS, ROUTE_PATH, []);
    expect(withNull).toEqual(withUndefined);
    expect(withEmpty).toEqual(withUndefined);
  });

  it('the destination card is unchanged: same instruction/coords/pathIndex as before', () => {
    const result = buildAllTurns(TURNS, ROUTE_PATH, null);
    const dest = result[result.length - 1];
    expect(dest.instruction).toBe(DEST_INSTRUCTION);
    expect(dest.lat).toBe(ROUTE_PATH[4][1]);
    expect(dest.lng).toBe(ROUTE_PATH[4][0]);
    expect(dest.pathIndex).toBe(4);
    expect(dest.kind).toBeUndefined();
  });

  it('turn order and identity are preserved — same array elements, same order', () => {
    const result = buildAllTurns(TURNS, ROUTE_PATH, null);
    expect(result[0]).toBe(TURN_1); // same object reference — not cloned/mutated
    expect(result[1]).toBe(TURN_2);
  });

  it('computeCurrentGpsIdx matches the old turns-only scan across a sweep of GPS positions', () => {
    // Sweep GPS along the whole route (and slightly past both ends) — every
    // point must resolve to the same index the OLD algorithm would give.
    const allTurns = buildAllTurns(TURNS, ROUTE_PATH, null);
    const sweepPositions = ROUTE_PATH.map((p) => ({ lng: p[0], lat: p[1] }))
      .concat([{ lng: 34.5990, lat: 31.5299 }, { lng: 34.6021, lat: 31.5325 }]);

    for (const pos of sweepPositions) {
      const oldIdx = oldCurrentGpsTurnIdx(TURNS, allTurns.length, ROUTE_PATH, pos);
      const newIdx = computeCurrentGpsIdx(allTurns, ROUTE_PATH, pos);
      expect(newIdx).toBe(oldIdx);
    }
  });

  it('getIconForInstruction returns the exact same icon for every real maneuver label as before', () => {
    expect(getIconForInstruction({ instruction: 'ימינה קל' })).toBe(ArrowUpRight);
    expect(getIconForInstruction({ instruction: 'שמאלה קל' })).toBe(ArrowUpLeft);
    expect(getIconForInstruction({ instruction: 'פנה ימינה' })).toBe(CornerUpRight);
    expect(getIconForInstruction({ instruction: 'פנה שמאלה' })).toBe(CornerUpLeft);
    expect(getIconForInstruction({ instruction: DEST_INSTRUCTION })).toBe(Flag);
    expect(getIconForInstruction({ instruction: 'ישר' })).toBe(ArrowUp); // default fallback
    expect(getIconForInstruction({ instruction: 'anything unrecognized' })).toBe(ArrowUp);
  });

  it('findNearestPathIdx behavior is unchanged (moved, not rewritten)', () => {
    expect(findNearestPathIdx(ROUTE_PATH, { lat: 31.5300, lng: 34.6000 })).toBe(0);
    expect(findNearestPathIdx(ROUTE_PATH, { lat: 31.5300, lng: 34.6021 })).toBe(2);
    expect(findNearestPathIdx(ROUTE_PATH, { lat: 31.5320, lng: 34.6020 })).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. STATION CUE — new behavior
// ─────────────────────────────────────────────────────────────────────────

describe('STATION CUE — stations merge into the carousel in real route order', () => {
  it('a station between turn 1 and turn 2 is inserted between them, not appended at the end', () => {
    const station = { lat: 31.5305, lng: 34.6020, name: 'תחנת כוח — נאות השבטים', parkId: 'park-abc' };
    const result = buildAllTurns(TURNS, ROUTE_PATH, [station]);

    expect(result).toHaveLength(4); // turn1, station, turn2, destination
    expect(result[0]).toBe(TURN_1);
    expect(result[1].kind).toBe('station');
    expect(result[1].instruction).toBe('תחנת כוח — נאות השבטים');
    expect(result[1].parkId).toBe('park-abc');
    expect(result[2]).toBe(TURN_2);
    expect(result[3].instruction).toBe(DEST_INSTRUCTION);
  });

  it('a station before the first turn lands first', () => {
    const station = { lat: 31.5300, lng: 34.6005, name: 'תחנה מוקדמת' };
    const result = buildAllTurns(TURNS, ROUTE_PATH, [station]);
    expect(result[0].kind).toBe('station');
    expect(result[1]).toBe(TURN_1);
    expect(result[2]).toBe(TURN_2);
  });

  it('a station that snaps to the route\'s last vertex still lands BEFORE the destination card, never after/tied', () => {
    const station = { lat: 31.5320, lng: 34.6020, name: 'תחנה סופית' }; // == routePath[4]
    const result = buildAllTurns(TURNS, ROUTE_PATH, [station]);
    const dest = result[result.length - 1];
    expect(dest.instruction).toBe(DEST_INSTRUCTION); // destination is unconditionally last
    expect(result[result.length - 2].kind).toBe('station');
  });

  it('multiple stations all sort correctly among turns by route position', () => {
    // Snapped unambiguously to path[0] and path[3] respectively (no tie
    // with a neighboring vertex) — see findNearestPathIdx's Manhattan search.
    const stationEarly = { lat: 31.5300, lng: 34.6003, name: 'A' }; // nearest: path[0] (idx 0)
    const stationMid = { lat: 31.5310, lng: 34.6020, name: 'B' };   // == path[3] (idx 3)
    const result = buildAllTurns(TURNS, ROUTE_PATH, [stationMid, stationEarly]); // passed out of order
    const order = result.map((t) => t.instruction);
    expect(order).toEqual(['A', 'פנה ימינה', 'B', 'ישר', DEST_INSTRUCTION]);
  });

  it('a station with no name falls back to a generic label, never crashes', () => {
    const result = buildAllTurns(TURNS, ROUTE_PATH, [{ lat: 31.5305, lng: 34.6020 }]);
    const station = result.find((t) => t.kind === 'station')!;
    expect(station.instruction).toBe('תחנה');
  });

  it('a station with a blank/whitespace-only name also falls back to the generic label', () => {
    const result = buildAllTurns(TURNS, ROUTE_PATH, [{ lat: 31.5305, lng: 34.6020, name: '   ' }]);
    const station = result.find((t) => t.kind === 'station')!;
    expect(station.instruction).toBe('תחנה');
  });

  it('a station with invalid coordinates is silently dropped, not crashed on', () => {
    const badStations = [
      { lat: NaN, lng: 34.6020, name: 'bad-lat' },
      { lat: 31.5305, lng: NaN, name: 'bad-lng' },
      { lat: undefined as any, lng: 34.6020, name: 'missing-lat' },
    ];
    const result = buildAllTurns(TURNS, ROUTE_PATH, badStations);
    expect(result.filter((t) => t.kind === 'station')).toHaveLength(0);
    expect(result).toHaveLength(3); // 2 turns + destination only
  });

  it('computeCurrentGpsIdx correctly highlights the station when GPS is approaching it (not the turn past it)', () => {
    const station = { lat: 31.5310, lng: 34.6020, name: 'S' }; // == path[3] (idx 3), between turn1 (idx2) and turn2 (idx4)
    const allTurns = buildAllTurns(TURNS, ROUTE_PATH, [station]);
    const stationIdx = allTurns.findIndex((t) => t.kind === 'station');
    expect(stationIdx).toBe(1); // [turn1, station, turn2, destination]

    // GPS just past turn 1, closest to the station's own vertex (path[3]) —
    // should highlight the station's card, not stay on turn 1 or skip to turn 2.
    const gpsNearStation = { lat: 31.5309, lng: 34.6020 };
    expect(computeCurrentGpsIdx(allTurns, ROUTE_PATH, gpsNearStation)).toBe(stationIdx);
  });

  it('getIconForInstruction returns Dumbbell for kind="station" regardless of instruction text', () => {
    expect(getIconForInstruction({ instruction: 'תחנת כוח — נאות השבטים', kind: 'station' })).toBe(Dumbbell);
    // Even if a station's name coincidentally matches a real maneuver string,
    // kind still wins — proves the discriminator, not string content, decides the icon.
    expect(getIconForInstruction({ instruction: 'ישר', kind: 'station' })).toBe(Dumbbell);
  });

  it('empty stations array is equivalent to no stations at all (no accidental extra cards)', () => {
    const result = buildAllTurns(TURNS, ROUTE_PATH, []);
    expect(result.filter((t) => t.kind === 'station')).toHaveLength(0);
    expect(result).toHaveLength(3);
  });
});
