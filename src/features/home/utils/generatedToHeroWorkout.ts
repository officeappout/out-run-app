import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { MockWorkout } from '../data/mock-schedule-data';

/**
 * Adapter (R Track 1) — maps an engine `GeneratedWorkout` to the `MockWorkout`
 * shape that `HeroWorkoutCard` consumes for its `workout` prop.
 *
 * The anchor redesign renders the recommended trio option as a single hero via
 * the existing `HeroWorkoutCard` (which is typed against `MockWorkout`), so this
 * is the one seam between the engine output and that card. Exercises/media are
 * passed to the card separately (via its `exercises` prop) — this only shapes the
 * scalar metadata the card reads (`title`, `duration`, `difficulty`, `isRecovery`).
 */
export function generatedToHeroWorkout(gw: GeneratedWorkout): MockWorkout {
  return {
    id: 'anchor-hero',
    title: gw.title,
    type: gw.isRecovery ? 'recovery' : 'strength',
    difficulty: gw.difficulty,
    duration: gw.estimatedDuration,
    calories: gw.stats?.calories ?? 0,
    coins: gw.stats?.coins ?? 0,
    imageUrl: '',
    description: gw.description,
    isRecovery: gw.isRecovery,
    isGenerated: true,
  };
}
