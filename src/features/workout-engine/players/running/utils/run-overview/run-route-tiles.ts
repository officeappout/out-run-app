/**
 * The route tiles of the run overview's "from me" drawer (board RP-14,
 * enable_run_drawer_from_me_v1) — pure. Everything starts from the runner's
 * location: the loops the existing generator made from here for this workout,
 * plus ONE official route only when it is near and the workout fits it.
 *
 *   order    generated loops (best score first), then the official route
 *   cap      MAX_TILES in all; the official route keeps its slot
 *   default  the first tile (the best loop; the official route when no loop)
 *
 * The green "why it fits" line reuses route-fit's own reasons (minus the
 * "how far" one — the tile shows that itself for an official route).
 */

import { accessKm } from '../../lib/route-fit/route-traits';
import { routeKm, routeRunShape } from '../../lib/route-fit/distance-fit';
import { accessReason } from '../../lib/route-fit/score-route-for-workout';
import type { RouteSuggestion } from '../../lib/route-fit/suggest-routes-for-workout';

export const MAX_TILES = 3;
/** An official route shows only within this walk of the runner (km). */
export const OFFICIAL_NEAR_KM = 1;
/** How many results to ask route-fit for, so loops and an official route can both make it. */
export const FROM_ME_SEARCH_LIMIT = 6;

export interface RouteTile {
  id: string;
  suggestion: RouteSuggestion;
  kind: 'loop' | 'official';
  /** Route length (km). */
  km: number;
  /** Walk to the route (km) — official only; null for loops (they start here). */
  accessKm: number | null;
  /** route-fit reasons for the green line, most important first (at most 2). */
  reasons: string[];
  /** The run ends where it started (a loop from here). */
  returnsHere: boolean;
  laps: number | null;
}

type LatLng = { lat: number; lng: number };

function fitsTheWorkout(s: RouteSuggestion): boolean {
  return s.score.fit.verdict === 'fits' || s.score.fit.verdict === 'laps';
}

function tileReasons(s: RouteSuggestion, access: number | null): string[] {
  const skip = access == null ? null : accessReason(access);
  return s.score.reasons.filter((r) => r !== skip).slice(0, 2);
}

function toTile(s: RouteSuggestion, origin: LatLng | null): RouteTile {
  const official = !s.isGenerated;
  const access = official && origin ? accessKm(s.route, origin) : null;
  const finite = access != null && Number.isFinite(access) ? access : null;
  return {
    id: s.route.id,
    suggestion: s,
    kind: official ? 'official' : 'loop',
    km: routeKm(s.route),
    accessKm: finite,
    reasons: tileReasons(s, finite),
    returnsHere: !official && s.score.fit.endsAtStart && routeRunShape(s.route) === 'loop',
    laps: s.score.fit.laps,
  };
}

/** The official route worth a tile: near, fits, best score. */
export function qualifyingOfficial(suggestions: readonly RouteSuggestion[], origin: LatLng | null): RouteSuggestion | null {
  if (!origin) return null;
  let best: RouteSuggestion | null = null;
  for (const s of suggestions) {
    if (s.isGenerated || !fitsTheWorkout(s)) continue;
    const d = accessKm(s.route, origin);
    if (!Number.isFinite(d) || d > OFFICIAL_NEAR_KM) continue;
    if (!best || s.score.score > best.score.score) best = s;
  }
  return best;
}

/** Loops from here + at most one near, fitting official route. */
export function buildRouteTiles(
  suggestions: readonly RouteSuggestion[],
  origin: LatLng | null,
  max = MAX_TILES,
): RouteTile[] {
  const official = qualifyingOfficial(suggestions, origin);
  const loops = suggestions
    .filter((s) => s.isGenerated && s.score.fit.verdict !== 'no')
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, Math.max(0, official ? max - 1 : max));
  const picked = official ? [...loops, official] : loops;
  return picked.map((s) => toTile(s, origin));
}

/** The tile to preselect: keep the current one if it's still there, else the first. */
export function defaultTileId(tiles: readonly RouteTile[], currentId: string | null): string | null {
  if (currentId && tiles.some((t) => t.id === currentId)) return currentId;
  return tiles[0]?.id ?? null;
}
