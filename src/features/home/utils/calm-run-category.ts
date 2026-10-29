import { CATEGORY_TO_KIND } from '@/features/workout-engine/players/running/utils/run-preview/run-kind';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

/**
 * Calm return runs a quality run as an easy one (calmRunWorkout). The home "next run" card has
 * no loaded workout yet, so it maps the planned category the same way up front; otherwise the
 * card says "intervals" and the drawer opens an easy run (pilot O13 follow-up, 29.10.2026).
 */
export function calmRunCategory(
  category: WorkoutCategory | null,
  calmLoad: { runEasyOnly?: boolean } | null | undefined,
): WorkoutCategory | null {
  if (!calmLoad?.runEasyOnly || !category) return category;
  const kind = CATEGORY_TO_KIND[category];
  return kind === 'easy' || kind === 'long' ? category : 'easy_run';
}
