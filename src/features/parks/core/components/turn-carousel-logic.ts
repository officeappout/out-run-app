/**
 * turn-carousel-logic — pure helpers backing TurnCarousel.tsx.
 *
 * Lives in a plain `.ts` file (not `.tsx`) specifically so it can be unit
 * tested: this repo's vitest config is node-env with no jsdom, and — as
 * verified directly (22.09.2026) — even a pure-function import from a
 * `.tsx` file fails at transform time (`vite:define` plugin error on JSX
 * syntax), independent of whether jsdom would be needed at runtime. See
 * `__tests__/turn-carousel-station-cue.test.ts` for the test suite this
 * file exists to make possible.
 */
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  CornerUpRight,
  CornerUpLeft,
  Flag,
  Dumbbell,
  type LucideIcon,
} from 'lucide-react';
import type { RouteTurn } from '../services/geoUtils';
import { isFiniteLatLng } from '@/utils/geoValidation';

export const DEST_INSTRUCTION = 'הגעת ליעד';

/**
 * Pick a lucide icon for a card. Station cards (kind === 'station') get the
 * same Dumbbell glyph as AppMap's hybrid stop marker (22.09.2026) — checked
 * BEFORE the instruction switch, since a station's `instruction` field holds
 * its own name (arbitrary Hebrew text), not a maneuver label.
 *
 * IMPORTANT: for real turns, this returns the GEOMETRICALLY CORRECT icon for
 * each direction (ימינה → right-pointing, שמאלה → left-pointing). The
 * previous mapping had every left/right pair SWAPPED — apparently an
 * attempt to compensate for an RTL flip that never actually happens
 * (lucide-react SVGs ignore CSS `direction`, they only mirror if you
 * deliberately apply a `transform: scaleX(-1)`). The defence in
 * TurnCarousel.tsx (`dir="ltr"` on the icon wrapper) makes sure no future
 * RTL ancestor ever introduces such a flip, so this mapping can stay literal.
 */
export function getIconForInstruction(turn: Pick<RouteTurn, 'instruction' | 'kind'>): LucideIcon {
  if (turn.kind === 'station') return Dumbbell;
  switch (turn.instruction) {
    case 'ימינה קל':   return ArrowUpRight;   // slight right
    case 'שמאלה קל':  return ArrowUpLeft;    // slight left
    case 'פנה ימינה': return CornerUpRight;  // sharp right
    case 'פנה שמאלה': return CornerUpLeft;   // sharp left
    case DEST_INSTRUCTION: return Flag;
    default:          return ArrowUp;
  }
}

/** Manhattan-distance nearest-vertex search — fast enough for 10k-point paths. */
export function findNearestPathIdx(
  path: [number, number][],
  pos: { lat: number; lng: number },
): number {
  let minD = Infinity;
  let idx = 0;
  for (let i = 0; i < path.length; i++) {
    const d = Math.abs(path[i][1] - pos.lat) + Math.abs(path[i][0] - pos.lng);
    if (d < minD) { minD = d; idx = i; }
  }
  return idx;
}

/**
 * Merges hybrid station stops into the turn list (in true route order, via
 * a nearest-vertex pathIndex snap) and appends the synthetic destination
 * card. With `stations` empty/absent this returns byte-identical output to
 * the pre-22.09.2026 behavior (turns + destination card only) — see the
 * regression suite in the test file.
 */
export function buildAllTurns(
  turns: RouteTurn[],
  routePath: [number, number][] | null | undefined,
  stations: { lat: number; lng: number; name?: string; parkId?: string }[] | null | undefined,
): RouteTurn[] {
  if (!routePath || routePath.length === 0) return turns;

  const stationTurns: RouteTurn[] = (stations ?? [])
    .filter((s) => isFiniteLatLng(s))
    .map((s) => ({
      kind: 'station' as const,
      instruction: s.name?.trim() || 'תחנה',
      distanceMeters: 0,
      lat: s.lat,
      lng: s.lng,
      bearingAfter: 0,
      pathIndex: findNearestPathIdx(routePath, s),
      parkId: s.parkId,
    }));

  const merged = stationTurns.length > 0
    ? [...turns, ...stationTurns].sort((a, b) => a.pathIndex - b.pathIndex)
    : turns;

  const last = routePath[routePath.length - 1];
  return [
    ...merged,
    {
      instruction: DEST_INSTRUCTION,
      distanceMeters: 0,
      lat: last[1],
      lng: last[0],
      bearingAfter: 0,
      pathIndex: routePath.length - 1,
    },
  ];
}

/**
 * Index of the first card (turn OR station) not yet passed, by GPS
 * position. Scans the MERGED `allTurns` (not the raw turns list) so a
 * station is found in its real position rather than skipped over; with no
 * stations this is behavior-identical to scanning turns alone, since the
 * destination card's pathIndex is always the path's last index (>= any
 * nearestPathIdx), supplying the same "-1 → last card" fallback as before.
 */
export function computeCurrentGpsIdx(
  allTurns: RouteTurn[],
  routePath: [number, number][] | null | undefined,
  currentLocation: { lat: number; lng: number },
): number {
  if (!routePath || routePath.length === 0) return 0;
  const nearestPathIdx = findNearestPathIdx(routePath, currentLocation);
  const idx = allTurns.findIndex((t) => t.pathIndex >= nearestPathIdx);
  return idx === -1 ? Math.max(0, allTurns.length - 1) : idx;
}
