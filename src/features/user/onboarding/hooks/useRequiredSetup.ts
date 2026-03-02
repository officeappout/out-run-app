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
 * 
 * The health/terms check fires only on the FIRST "Start Workout" attempt.
 * After the user completes or dismisses it, subsequent starts proceed directly.
 */

import { useCallback, useRef, useState } from 'react';
import { useUserStore } from '../../identity/store/useUserStore';
import type { OnboardingStepId } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface MissingRequirement {
  id: string;
  label: string;
  step: OnboardingStepId;
  /** Hard block = user MUST complete before proceeding */
  isHardBlock: boolean;
}

export interface JITState {
  /** Whether the JIT modal is currently open */
  isModalOpen: boolean;
  /** The missing requirements to show in the modal */
  requirements: MissingRequirement[];
  /** Callback to invoke after the user completes/dismisses */
  onComplete: (() => void) | null;
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
   */
  const checkRequirements = useCallback((): MissingRequirement[] => {
    if (!profile) return [];

    const missing: MissingRequirement[] = [];

    // Health Declaration — HARD BLOCK (the only requirement that gates workout start)
    const healthAccepted =
      (profile as any)?.healthDeclarationAccepted ||
      (profile.health as any)?.healthDeclarationAccepted;

    if (!healthAccepted) {
      missing.push({
        id: 'health',
        label: 'הצהרת בריאות',
        step: 'HEALTH_DECLARATION',
        isHardBlock: true,
      });
    }

    // Equipment — SOFT BLOCK (user can skip; workout falls back to bodyweight)
    const hasEquipment =
      (profile.equipment?.home?.length ?? 0) > 0 ||
      (profile.equipment?.outdoor?.length ?? 0) > 0 ||
      (profile.equipment?.office?.length ?? 0) > 0;

    if (!hasEquipment) {
      missing.push({
        id: 'equipment',
        label: 'ציוד אימון',
        step: 'EQUIPMENT',
        isHardBlock: false,
      });
    }

    return missing;
  }, [profile]);

  /**
   * Intercept a workout start attempt.
   * 
   * @param onProceed - callback to invoke if the user is cleared to start
   * @returns `true` if the user can proceed immediately, `false` if a modal was shown
   */
  const interceptWorkoutStart = useCallback(
    (onProceed: () => void): boolean => {
      // After first-time check, let subsequent starts pass through
      if (hasShownJIT.current) {
        onProceed();
        return true;
      }

      const missing = checkRequirements();

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
          setJitState((s) => ({ ...s, isModalOpen: false, onComplete: null }));
          onProceed();
        },
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
    setJitState({ isModalOpen: false, requirements: [], onComplete: null });
  }, []);

  return {
    checkRequirements,
    interceptWorkoutStart,
    dismissJIT,
    cancelJIT,
    jitState,
  };
}
