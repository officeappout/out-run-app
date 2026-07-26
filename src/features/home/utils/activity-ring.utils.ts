/**
 * activity-ring.utils — shared builder for the ACTIVITY schedule ring (S10).
 *
 * The activity schedule (Stage 2 of the "two displays" split) shows, per day, a
 * SINGLE summary ring: total activity minutes vs the daily goal, coloured by the
 * day's dominant category. This is the RING axis (S10 activity minutes), kept
 * cleanly separate from the FLAME axis (S8 workout completion) that the icon
 * view owns.
 *
 * Shared so the week strip (SmartWeeklySchedule) and the month grid
 * (MonthlyCalendarGrid) build the ring the SAME way — no per-surface copy
 * (mirrors usePastWorkoutCompleted's single-source rationale). NOTE: this is a
 * single aggregate ring — NOT the multi-ring ConcentricRingsProgress.
 */
import {
  ACTIVITY_COLORS,
  type ActivityCategory,
} from '@/features/activity/types/activity.types';

/** Aggregate daily activity goal (minutes). ~30 min/day of any movement. */
export const ACTIVITY_RING_DAILY_GOAL = 30;

/** Neutral track colour for a day with no logged activity (empty/faded ring). */
export const ACTIVITY_RING_EMPTY_COLOR = '#E5E7EB'; // gray-200

export interface ActivityRingData {
  /** Fill percentage 0–100 (totalMinutes / goal, clamped). */
  percentage: number;
  /** Ring colour — the dominant category's hex (or the empty colour when idle). */
  color: string;
  /** True when any activity was logged (drives the partial arc vs the faded track). */
  active: boolean;
  /** Raw total minutes (kept for a future centre label / detail view). */
  totalMinutes: number;
  /** Dominant category (null when no activity). Preserved for a future detail view. */
  dominantCategory: ActivityCategory | null;
}

interface BuildActivityRingInput {
  totalMinutes: number;
  categories: { strength: number; cardio: number; maintenance: number };
  dominantCategory: ActivityCategory | null;
}

/**
 * Build the single summary ring for one day.
 *
 * States (per product spec):
 *  • activity logged          → partial arc by %, in the dominant-category colour
 *  • missed workout but steps  → still partial (steps ⇒ activity minutes ⇒ not zero)
 *  • no activity               → active:false → faded/empty track only
 */
export function buildActivityRingData(input: BuildActivityRingInput): ActivityRingData {
  const totalMinutes = Math.max(0, Math.round(input.totalMinutes || 0));
  const active = totalMinutes > 0;

  // Dominant category: prefer the store's value; fall back to the max category
  // when the store didn't set one but minutes exist.
  let dominant = input.dominantCategory;
  if (!dominant && active) {
    const cats = input.categories;
    dominant = (['strength', 'cardio', 'maintenance'] as ActivityCategory[]).reduce(
      (best, cat) => (cats[cat] > cats[best] ? cat : best),
      'strength' as ActivityCategory,
    );
  }

  const color =
    active && dominant
      ? ACTIVITY_COLORS[dominant]?.hex ?? ACTIVITY_COLORS.strength.hex
      : ACTIVITY_RING_EMPTY_COLOR;

  const percentage = Math.min(
    100,
    Math.round((totalMinutes / ACTIVITY_RING_DAILY_GOAL) * 100),
  );

  return {
    percentage,
    color,
    active,
    totalMinutes,
    dominantCategory: active ? dominant : null,
  };
}
