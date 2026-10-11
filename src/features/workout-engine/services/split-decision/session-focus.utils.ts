/**
 * Session Focus Classification — 48h Muscle Shield input
 *
 * Pure (no Firebase, no React) so it's unit-testable without mocking the
 * writer. Extracted from useActivitySync.ts's trackMusclesForShield
 * (11.10.2026, domain-balance audit) — see that call site's own comment for
 * why the programId-substring check alone misses every calisthenics_upper
 * session (programId is always the generic master id, never the day's
 * dominant skill).
 *
 * @see SplitDecisionService's Pendulum split — the one real consumer of the
 *      `lastSessionFocus` value this classification ultimately produces.
 */
import type { Exercise, MuscleGroup } from '@/features/content/exercises/core/exercise.types';

const LEG_MUSCLES: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'hip_flexors',
]);

const PUSH_MOVEMENT_GROUPS = new Set(['horizontal_push', 'vertical_push']);
const PULL_MOVEMENT_GROUPS = new Set(['horizontal_pull', 'vertical_pull']);

/**
 * Classify a completed session's focus for the 48h muscle-shield / Pendulum
 * split. Priority order: explicit programId substring match (plain push/pull/
 * legs programs) → leg-muscle majority → push/pull movement-group majority
 * (the skill-track fallback — classifies by what was actually trained,
 * independent of the program's own id/name).
 */
export function deriveSessionFocus(
  programId: string | undefined,
  exercises: Pick<Exercise, 'movementGroup'>[],
  trainedMuscleGroups: MuscleGroup[],
): string | undefined {
  const pid = programId?.toLowerCase() ?? '';

  const legMuscleCount = trainedMuscleGroups.filter((m) => LEG_MUSCLES.has(m)).length;
  const isLegsDominant = trainedMuscleGroups.length > 0 && legMuscleCount >= trainedMuscleGroups.length / 2;

  if (pid.includes('legs') || pid.includes('lower_body') || isLegsDominant) return 'legs';
  if (pid.includes('push')) return 'push';
  if (pid.includes('pull')) return 'pull';

  const pushCount = exercises.filter((ex) => ex?.movementGroup && PUSH_MOVEMENT_GROUPS.has(ex.movementGroup)).length;
  const pullCount = exercises.filter((ex) => ex?.movementGroup && PULL_MOVEMENT_GROUPS.has(ex.movementGroup)).length;
  if (pushCount > 0 && pushCount >= pullCount) return 'push';
  if (pullCount > 0 && pullCount > pushCount) return 'pull';

  return undefined;
}
