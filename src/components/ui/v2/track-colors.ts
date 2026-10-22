/**
 * Track colours (v2) — the ONE map of the three training tracks' hexes. The home strip's
 * flames (FLAME_TONES), the Progress tab (PROGRESS_COLORS), the ring days of the month grid
 * and the big planner all read these, so a strength day is the same blue everywhere.
 *
 * Plain .ts, zero React — safe for pure helpers and tests.
 */

export type TrackKey = 'strength' | 'run' | 'walk';

/** Display order when a day mixes tracks (ring segments, dots). */
export const TRACK_ORDER: readonly TrackKey[] = ['strength', 'run', 'walk'];

export const TRACK_COLORS: Record<TrackKey, string> = {
  strength: '#00baf7',
  run: '#84cc16',
  walk: '#f59e0b',
};

/** "r,g,b" of each track, for soft washes (rgba). */
export const TRACK_RGB: Record<TrackKey, string> = {
  strength: '0,186,247',
  run: '132,204,22',
  walk: '249,140,22',
};

/** Recovery / mobility — not a track, but it shares the flame palette. */
export const MAINTENANCE_COLOR = '#a855f7';

/**
 * Activity category ('strength' | 'cardio' | 'maintenance') → ring hex, aligned with the
 * tracks. Passed to buildActivityRingData where the v2 planner is on (enable_week_builder_v1);
 * without it the ring keeps its classic ACTIVITY_COLORS hexes.
 */
export const CATEGORY_TRACK_COLORS: Record<'strength' | 'cardio' | 'maintenance', string> = {
  strength: TRACK_COLORS.strength,
  cardio: TRACK_COLORS.run,
  maintenance: MAINTENANCE_COLOR,
};
