'use client';

/**
 * The ring days' category hexes: the shared v2 track map (CATEGORY_TRACK_COLORS) while the v2
 * planner is on (enable_week_builder_v1 + enable_home_v2), so the home strip, the month grid
 * and the big planner draw one palette. Off → undefined, and buildActivityRingData keeps its
 * classic ACTIVITY_COLORS — identical to today.
 */
import { CATEGORY_TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { useWeekBuilderV1 } from '@/features/schedule/week-builder/useWeekBuilderV1';

export function useTrackRingColors(): typeof CATEGORY_TRACK_COLORS | undefined {
  return useWeekBuilderV1() ? CATEGORY_TRACK_COLORS : undefined;
}
