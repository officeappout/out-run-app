import type { SessionGoalSpec } from '@/types/community.types';
import type { SessionGoal } from '@/features/workout-engine/players/running/store/useRunningPlayer';

/**
 * Resolves the effective goal for a participant from their personal override
 * and the session-level default set by the creator.
 *
 * Three cases:
 *   A — personalGoal === null  → solo / no goal → null
 *   B — personalGoal is set    → participant override → use it
 *   C — personalGoal undefined → inherit sessionGoal (or null if absent)
 *
 * Returns a SessionGoal compatible with useRunningPlayer.setSessionGoal(),
 * or null when there is no goal.
 *
 * Value units (same as useRunningPlayer.SessionGoal):
 *   type 'distance' → km
 *   type 'time'     → seconds
 */
export function resolveSessionGoal(
  personalGoal: SessionGoalSpec | null | undefined,
  sessionGoal: SessionGoalSpec | undefined,
): SessionGoal | null {
  // Explicit null = case A: solo / no goal
  if (personalGoal === null) return null;

  // undefined = case C (inherit); object = case B (override)
  const spec = personalGoal ?? sessionGoal ?? null;
  if (!spec || spec.kind !== 'goal') return null;

  return { type: spec.type, value: spec.value };
}
