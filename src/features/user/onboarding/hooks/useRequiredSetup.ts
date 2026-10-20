'use client';

/**
 * useRequiredSetup — Just-In-Time (JIT) Trigger Hook
 *
 * Checks whether critical setup steps are completed before allowing
 * a user to start a workout.
 *
 * Trigger rules:
 *   1. Health Declaration → HARD BLOCK (cannot skip, Lemur-branded modal)
 *   2. Account Security   → Soft prompt (can skip)
 *   3. Equipment Config   → Soft prompt (can skip)
 *      └─ SKIPPED for running activities (free run + guided routes).
 *         Runners don't need pull-up bars or benches.
 *
 * Activity-aware behaviour:
 *   `interceptWorkoutStart` accepts an optional `activityType`. Pass
 *   `'running'` for free runs and guided routes; equipment will be
 *   filtered out of the requirements list. Strength / planned workouts
 *   leave it as 'unknown' (default) and equipment stays in the list.
 *
 * The health/terms check fires only on the FIRST "Start Workout"
 * attempt. After the user completes or dismisses it, subsequent starts
 * proceed directly.
 */

import { useCallback, useRef, useState } from 'react';
import { useUserStore } from '../../identity/store/useUserStore';
import {
  closeJitWithoutProceeding,
  getMissingRequirements,
  type MissingRequirement,
  type WorkoutActivityType,
} from '../utils/required-setup';

export type { MissingRequirement, WorkoutActivityType };

// ============================================================================
// TYPES
// ============================================================================

export interface JITState {
  /** Whether the JIT modal is currently open */
  isModalOpen: boolean;
  /** The missing requirements to show in the modal */
  requirements: MissingRequirement[];
  /** Callback to invoke after the user completes/dismisses */
  onComplete: (() => void) | null;
  /** Callback to invoke when the modal is closed without proceeding */
  onCancel?: (() => void) | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useRequiredSetup() {
  const profile = useUserStore((s) => s.profile);
  const [jitState, setJitState] = useState<JITState>({
    isModalOpen: false,
    requirements: [],
    onComplete: null,
  });

  // Track whether the first-time JIT has already fired in this session
  const hasShownJIT = useRef(false);

  /**
   * Evaluate which critical setup steps are still missing.
   *
   * Only the Health Declaration is checked here as a hard block.
   * Equipment and Account prompts are deferred to the Profile Progress Bar
   * so they don't interrupt the workout-start flow with a blocking modal.
   *
   * @param activityType — When `'running'`, the equipment requirement is
   *   filtered out (runners don't need pull-up bars or benches).
   */
  // Reads the LIVE store profile (not only this render's closure) — a caller
  // holding a memoized interceptWorkoutStart from before the user signed
  // must still see the acceptance. HealthDeclarationStep marks the profile
  // accepted in memory the moment the user signs, so a later start (this
  // instance or another, e.g. MapShell's) passes silently.
  const checkRequirements = useCallback(
    (activityType: WorkoutActivityType = 'unknown'): MissingRequirement[] =>
      getMissingRequirements(useUserStore.getState().profile ?? profile, activityType),
    [profile],
  );

  /**
   * Intercept a workout start attempt.
   *
   * @param onProceed - callback to invoke if the user is cleared to start
   * @param activityType - drives requirement filtering (see
   *   `checkRequirements`). Pass `'running'` for free runs and guided
   *   routes so the equipment prompt is bypassed.
   * @param onCancel - invoked if the modal is closed without proceeding
   *   (cancelJIT), so a caller holding a loading state can release it.
   * @returns `true` if the user can proceed immediately, `false` if a
   *   modal was shown
   */
  const interceptWorkoutStart = useCallback(
    (
      onProceed: () => void,
      activityType: WorkoutActivityType = 'unknown',
      onCancel?: () => void,
    ): boolean => {
      // After first-time check, let subsequent starts pass through
      if (hasShownJIT.current) {
        onProceed();
        return true;
      }

      const missing = checkRequirements(activityType);

      // Nothing missing — proceed immediately
      if (missing.length === 0) {
        hasShownJIT.current = true;
        onProceed();
        return true;
      }

      // Health Declaration is missing — show hard-block modal
      setJitState({
        isModalOpen: true,
        requirements: missing,
        onComplete: () => {
          hasShownJIT.current = true;
          setJitState((s) => ({ ...s, isModalOpen: false, onComplete: null, onCancel: null }));
          onProceed();
        },
        onCancel: onCancel ?? null,
      });
      return false;
    },
    [checkRequirements],
  );

  /**
   * Dismiss the JIT modal (for soft requirements only).
   * Hard-block requirements cannot be dismissed.
   */
  const dismissJIT = useCallback(() => {
    const hasHardBlock = jitState.requirements.some((r) => r.isHardBlock);
    if (hasHardBlock) return; // Cannot dismiss hard blocks

    hasShownJIT.current = true;
    jitState.onComplete?.();
  }, [jitState]);

  /**
   * Close modal without proceeding (cancel).
   */
  const cancelJIT = useCallback(() => {
    const { next, notify } = closeJitWithoutProceeding(jitState);
    setJitState(next);
    notify?.();
  }, [jitState]);

  return {
    checkRequirements,
    interceptWorkoutStart,
    dismissJIT,
    cancelJIT,
    jitState,
  };
}
