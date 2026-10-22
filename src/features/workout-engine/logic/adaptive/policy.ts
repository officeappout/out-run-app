/**
 * Adaptive progression switches, resolved ONCE per generation and carried on the generator
 * context (`WorkoutGenerationContext.progressionPolicy`). Absent / all-false = today's engine.
 *
 * Each switch is its own panel flag (default OFF). Super admins preview them: the device's
 * live flag cache has no super-admin override, so the caller passes `isSuperAdmin`.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export interface ProgressionPolicy {
  /** 3d enable_skill_cap_true_skills — the ≤5 reps / ≤12 s ceiling only for true skills. */
  trueSkillCap: boolean;
  /** 3a enable_adaptive_reps_v1 — per-exercise double progression. */
  adaptiveReps: boolean;
  /** 3e enable_goal_presence_v1 — goal presence boost + performance ramp + celebration. */
  goalPresence: boolean;
}

export const POLICY_OFF: ProgressionPolicy = Object.freeze({
  trueSkillCap: false,
  adaptiveReps: false,
  goalPresence: false,
});

export function resolveProgressionPolicy(isSuperAdmin: boolean): ProgressionPolicy {
  return {
    trueSkillCap: isSuperAdmin || readLiveFlag('enableSkillCapTrueSkills'),
    adaptiveReps: isSuperAdmin || readLiveFlag('enableAdaptiveRepsV1'),
    goalPresence: false,
  };
}
