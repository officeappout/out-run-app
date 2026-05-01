'use client';

/**
 * useSmartwatchPrompt
 * -------------------
 * Single-shot promotional gate for smartwatch connection. Replaces the
 * equipment JIT prompt for runners — instead of asking "what gear do
 * you own?" (irrelevant for a 5 km run), we ask "want to connect your
 * smartwatch?" (a high-value teaser for an upcoming feature).
 *
 * Flow:
 *   1. Caller (useWorkoutSession) invokes `openIfFirstRunner('running', onContinue)`.
 *   2. If activity ≠ 'running', or this user has already seen the prompt
 *      this session, `onContinue` fires immediately — no modal.
 *   3. Otherwise the modal opens; user picks Connect (toast) or Skip.
 *      Either choice resolves to `onContinue` so the workout proceeds.
 *
 * Why session-scoped (not user-profile-persisted): the spec calls this a
 * "feature teaser", not a true setting. Re-prompting on the next app
 * launch is fine — once Bluetooth pairing ships, the same hook can flip
 * to a "you have a watch connected — use it?" Y/N pattern without UI
 * surgery.
 *
 * Wiring:
 *   • The hook is consumed by `useWorkoutSession` (running + guided).
 *   • The modal `<SmartwatchPromptModal />` is mounted globally by
 *     MapShell in parallel with `<JITSetupModal />`.
 */

import { useCallback, useRef, useState } from 'react';
import type { WorkoutActivityType } from './useRequiredSetup';

export interface SmartwatchPromptState {
  isOpen: boolean;
  /** Resolves the deferred workout-start callback. Set internally. */
  onClose: (() => void) | null;
}

export function useSmartwatchPrompt() {
  const [state, setState] = useState<SmartwatchPromptState>({
    isOpen: false,
    onClose: null,
  });

  // Refs ensure the open-deferred-onContinue callback identity stays
  // stable across renders. We can't store the callback in state because
  // changing state would trigger a re-render which would re-invoke the
  // caller's effect — that's the same race that broke RadarAnimation
  // before the useUserCityName memoisation fix.
  const continueRef = useRef<(() => void) | null>(null);
  const hasShown = useRef(false);

  /**
   * Schedule the smartwatch prompt for runners. For all other activity
   * types (or for runners who've already seen the prompt this session),
   * this is a no-op pass-through that calls `onContinue` synchronously.
   *
   * @returns `true` if the modal opened, `false` if pass-through fired.
   */
  const openIfFirstRunner = useCallback(
    (
      activityType: WorkoutActivityType,
      onContinue: () => void,
    ): boolean => {
      if (activityType !== 'running') {
        onContinue();
        return false;
      }
      if (hasShown.current) {
        onContinue();
        return false;
      }
      hasShown.current = true;
      continueRef.current = onContinue;
      setState({
        isOpen: true,
        onClose: () => {
          // Re-read the latest continueRef (defensive — callers may swap
          // it via a re-mount) and clear before invoking so a synchronous
          // re-trigger from the callee can't double-fire.
          const cb = continueRef.current;
          continueRef.current = null;
          setState({ isOpen: false, onClose: null });
          cb?.();
        },
      });
      return true;
    },
    [],
  );

  return {
    smartwatchPrompt: state,
    openIfFirstRunner,
  } as const;
}
