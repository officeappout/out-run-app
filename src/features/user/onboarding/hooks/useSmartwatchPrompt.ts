'use client';

/**
 * useSmartwatchPrompt
 * -------------------
 * One-time-per-activity gate for the smartwatch connection prompt.
 * Replaces the equipment JIT prompt for runners — instead of asking
 * "what gear do you own?" (irrelevant for a 5 km run), we ask "want
 * to connect your smartwatch?" (a high-value teaser for an upcoming
 * feature).
 *
 * Flow:
 *   1. Caller (useWorkoutSession) invokes
 *      `openIfFirstRunner('running', onContinue)`.
 *   2. If activity ≠ 'running' OR the user has already been asked
 *      for this activity (persisted check), `onContinue` fires
 *      immediately — no modal.
 *   3. Otherwise the modal opens; user picks Connect (toast) or Skip.
 *      Either choice resolves to `onContinue` AND marks the activity
 *      as "decided" in `useSmartwatchPreferenceStore`, so the prompt
 *      never re-fires for that activity again.
 *
 * Why persistent (not session-scoped): field-test feedback was that
 * the prompt appeared on EVERY workout because state reset on tab
 * reload. The spec is now "ask once per activity, then stay quiet" —
 * tracked via a persisted `decided[activity]` flag. When Bluetooth
 * pairing ships, this hook can layer a `paired[activity]` slot on
 * top of the same store without UI surgery.
 *
 * Wiring:
 *   • The hook is consumed by `useWorkoutSession` (running + guided).
 *   • The modal `<SmartwatchPromptModal />` is mounted globally by
 *     MapShell in parallel with `<JITSetupModal />`.
 */

import { useCallback, useRef, useState } from 'react';
import { useSmartwatchPreferenceStore } from '../store/useSmartwatchPreferenceStore';
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

  /**
   * Schedule the smartwatch prompt for runners. For all other activity
   * types (or for activities the user has already answered for in a
   * past session — persisted in `useSmartwatchPreferenceStore`), this
   * is a no-op pass-through that calls `onContinue` synchronously.
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
      // Persisted check — replaces the previous session-scoped ref so
      // the prompt never fires twice for the same activity, even
      // across app reloads. Reads `getState()` to avoid making this
      // hook reactive to the store; we only need a one-shot lookup
      // here.
      const prefStore = useSmartwatchPreferenceStore.getState();
      if (prefStore.hasDecided(activityType)) {
        onContinue();
        return false;
      }
      continueRef.current = onContinue;
      setState({
        isOpen: true,
        onClose: () => {
          // Re-read the latest continueRef (defensive — callers may swap
          // it via a re-mount) and clear before invoking so a synchronous
          // re-trigger from the callee can't double-fire. Persist the
          // "asked" flag in the SAME tick as the resolve, so even an
          // interrupted close path (e.g. unmount mid-toast) leaves the
          // user in a "won't be re-asked" state — fail-quiet by design.
          useSmartwatchPreferenceStore.getState().markDecided(activityType);
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
