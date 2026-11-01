/**
 * Workout palette — one colour per segment kind, for every surface (pure, no React).
 *
 * The story bars, cart ring and list rails read it through `v2BlockColor`
 * (planned-rep-results.ts); the live map trail reads `WORKOUT_ZONE_TRAIL_COLORS`
 * under enable_unified_player_v1, so tempo, fartlek and intervals look the
 * same on the bars and on the map (UNIFIED-PLAYER-PLAN stage 2, "one palette").
 */

import { ALL_RUN_ZONES, type RunZoneType } from '../../../core/types/running.types';

export const V2_BLOCK_COLORS = {
  wrapper: '#bfe48a',
  easy: '#84cc16',
  fast: '#e5484d',
  tempo: '#f97316',
  rest: '#a9b7c2',
  walk: '#f59e0b',
} as const;

/** zoneType → bar colour; null for no / unknown zone (the caller picks by block type). */
export function zoneBlockColor(z: RunZoneType | null | undefined): string | null {
  switch (z) {
    case 'tempo':
    case 'fartlek_medium':
      return V2_BLOCK_COLORS.tempo;
    case 'interval_long':
    case 'interval_short':
    case 'sprint':
    case 'fartlek_fast':
      return V2_BLOCK_COLORS.fast;
    case 'easy':
    case 'long_run':
    case 'jogging':
      return V2_BLOCK_COLORS.easy;
    case 'recovery':
      return V2_BLOCK_COLORS.rest;
    case 'walk':
      return V2_BLOCK_COLORS.walk;
    default:
      return null;
  }
}

/**
 * The trail's `[zoneType, colour]` pairs in the bars' palette (same shape as
 * ZONE_TRAIL_COLORS). The trail only knows each point's zoneType, not its
 * block type, so a warm-up tagged 'easy' paints easy green, not the wrapper.
 */
export const WORKOUT_ZONE_TRAIL_COLORS: ReadonlyArray<readonly [string, string]> = ALL_RUN_ZONES.map(
  (z) => [z, zoneBlockColor(z) as string] as const,
);
