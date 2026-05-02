'use client';

/**
 * useSmartwatchPreferenceStore — persisted "have I been asked already?"
 * tracker for the pre-run smartwatch-connect prompt, scoped per
 * activity type.
 *
 * Why per-activity (not a single global flag): the prompt is currently
 * gated on `running` only, but the field-test feedback is that the
 * SAME nag would appear every workout for that activity until the
 * tab was reloaded — which is hostile UX. The right contract is "ask
 * once per activity, then stay quiet forever (until they explicitly
 * pair, which today is a coming-soon path)".
 *
 * Storage contract:
 *   • `out-smartwatch-pref` localStorage key.
 *   • `decided[activity]` flips `true` once the user has either tapped
 *     "חיבור שעון" OR "דילוג" — both decisions count as "they've been
 *     asked", because the goal is to avoid re-asking, not to record
 *     consent. If we ever ship pairing, a separate `paired[activity]`
 *     slot can be added without breaking this contract.
 *   • SSR-safe via `skipHydration`.
 *
 * Non-running activities still pass through `useSmartwatchPrompt` as a
 * no-op (the hook short-circuits on `activityType !== 'running'`),
 * so this store only ever receives keys for activities the prompt
 * actually fires on. The shape is generic to leave room for a future
 * cycling/walking variant without a migration.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { WorkoutActivityType } from '../hooks/useRequiredSetup';

interface SmartwatchPreferenceState {
  decided: Partial<Record<WorkoutActivityType, true>>;
  /**
   * Returns true if the user has ALREADY been shown the prompt for this
   * activity at any point in the past (across reloads). The prompt
   * gate uses this to short-circuit before opening the modal a second
   * time.
   */
  hasDecided: (activity: WorkoutActivityType) => boolean;
  /** Mark the activity as "asked". Idempotent — safe to call every show. */
  markDecided: (activity: WorkoutActivityType) => void;
  /**
   * Reset the persisted preference. Mainly for QA / dev-tools — there's
   * no user-facing UI for this today.
   */
  reset: () => void;
}

export const useSmartwatchPreferenceStore = create<SmartwatchPreferenceState>()(
  persist(
    (set, get) => ({
      decided: {},
      hasDecided: (activity) => Boolean(get().decided[activity]),
      markDecided: (activity) =>
        set((state) =>
          state.decided[activity]
            ? state
            : { decided: { ...state.decided, [activity]: true } },
        ),
      reset: () => set({ decided: {} }),
    }),
    {
      name: 'out-smartwatch-pref',
      storage: createJSONStorage(() => localStorage),
      skipHydration: typeof window === 'undefined',
    },
  ),
);
