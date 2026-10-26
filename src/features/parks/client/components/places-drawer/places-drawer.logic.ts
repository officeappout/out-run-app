/**
 * places-drawer.logic — PURE rules behind the map places drawer (enable_map_places_drawer_v1,
 * canvas page 11, board RP-4): which places are "near me", which chip shows which place, the
 * short workout tags on a row, and when the drawer shows the "create a route here" empty state.
 *
 * Always from the user's location (owner 26.10 — no "start from a route" option). No reads, no
 * React, no text: the UI turns ids into catalog strings.
 */

import type { PlaceWorkoutStyle, PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';

/** Walking range (board RP-4: "רדיוס 1.5 ק״מ"). */
export const WALK_RANGE_M = 1500;
/** Rows in the list (nearest first). */
export const MAX_PLACES = 8;
/** Workout tags under a row. */
export const MAX_TAGS = 2;

export type PlacesChip = 'all' | 'strength' | 'run' | 'walk' | 'hybrid';
export const PLACES_CHIPS: readonly PlacesChip[] = ['all', 'strength', 'run', 'walk', 'hybrid'];

const CHIP_STYLES: Record<Exclude<PlacesChip, 'all'>, readonly PlaceWorkoutStyle[]> = {
  strength: ['strength'],
  run: ['run_easy', 'run_hills', 'run_quality'],
  walk: ['walk'],
  hybrid: ['hybrid'],
};

export interface RankablePlace {
  key: string;
  distanceM: number;
}

/** Places inside the walking range, nearest first (ties: key), at most `max`. */
export function nearbyPlaces<T extends RankablePlace>(items: readonly T[], radiusM = WALK_RANGE_M, max = MAX_PLACES): T[] {
  return items
    .filter((p) => Number.isFinite(p.distanceM) && p.distanceM >= 0 && p.distanceM <= radiusM)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM || a.key.localeCompare(b.key))
    .slice(0, max);
}

export function styleMatchesChip(style: PlaceWorkoutStyle, chip: PlacesChip): boolean {
  return chip === 'all' || CHIP_STYLES[chip].includes(style);
}

/** 'all' keeps every place; any other chip keeps the places with at least one workout of that kind. */
export function filterPlacesByChip<T extends { styles: readonly PlaceWorkoutStyle[] }>(places: readonly T[], chip: PlacesChip): T[] {
  if (chip === 'all') return [...places];
  return places.filter((p) => p.styles.some((s) => styleMatchesChip(s, chip)));
}

export interface PlaceTag {
  style: PlaceWorkoutStyle;
  minutes: number | null;
  fromPlan: boolean;
}

/** The row's tags: the place's top workouts (plan first, as ranked), the chip's kind first when filtered. */
export function placeTags(suggestions: readonly PlaceWorkoutSuggestion[], chip: PlacesChip = 'all', max = MAX_TAGS): PlaceTag[] {
  const ordered = chip === 'all'
    ? [...suggestions]
    : [...suggestions].sort((a, b) => Number(styleMatchesChip(b.style, chip)) - Number(styleMatchesChip(a.style, chip)));
  return ordered.slice(0, max).map((s) => ({ style: s.style, minutes: s.durationMin, fromPlan: s.isFromPlan }));
}

export type DrawerBody =
  | { kind: 'loading' }
  | { kind: 'list' }
  /** none_near: nothing within walking range; none_for_chip: places exist, none fits the chip. */
  | { kind: 'generate'; reason: 'none_near' | 'none_for_chip' };

export function drawerBody(input: { loading: boolean; hasLocation: boolean; nearbyCount: number; shownCount: number }): DrawerBody {
  if (input.loading || !input.hasLocation) return { kind: 'loading' };
  if (input.nearbyCount === 0) return { kind: 'generate', reason: 'none_near' };
  if (input.shownCount === 0) return { kind: 'generate', reason: 'none_for_chip' };
  return { kind: 'list' };
}

export type GeneratorActivity = 'running' | 'walking';

/** The generator's starting activity: the chip's when it names one, else the persona's (walkers walk). */
export function generatorActivityFor(chip: PlacesChip, persona: 'strength' | 'run' | 'walk' | 'hybrid' | null): GeneratorActivity {
  if (chip === 'walk') return 'walking';
  if (chip === 'run') return 'running';
  return persona === 'walk' ? 'walking' : 'running';
}
