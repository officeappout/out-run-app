'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import IdentityProfileScreen from '../components/IdentityProfileScreen';
import { useUserStore } from '../../identity/store/useUserStore';
import { backfillOnboardingIdentitySession } from '../utils/onboarding-entry';
import { needsIdentityBeforeSave } from '../utils/deferred-identity';

function readSession(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return sessionStorage.getItem(key); } catch { return null; }
}

/**
 * enable_home_v2 — "identity right before the first save" (needsIdentityBeforeSave).
 * `runAfterIdentity(save)` runs `save` at once when the identity is known; otherwise it
 * shows the existing identity screen inline (same contract as the JIT gate: no
 * navigation, onboarding state kept) and runs `save` after it was saved — with the
 * onboarding_personal_* keys backfilled, so the flow's own reads (name check, sync,
 * health declaration) see them. Back closes the screen and leaves the user on the step,
 * or runs `onBack` when the step has nothing left to show (the run questionnaire's end).
 */
export function useDeferredIdentity(v2: boolean, onBack?: () => void): {
  runAfterIdentity: (save: () => void) => void;
  identityOverlay: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const runAfterIdentity = useCallback((save: () => void) => {
    const needs = needsIdentityBeforeSave({
      v2,
      profileCore: useUserStore.getState().profile?.core,
      session: {
        name: readSession('onboarding_personal_name'),
        gender: readSession('onboarding_personal_gender'),
        dob: readSession('onboarding_personal_dob'),
      },
    });
    if (!needs) { save(); return; }
    pending.current = save;
    setOpen(true);
  }, [v2]);

  const identityOverlay = open ? (
    <div
      className="fixed inset-0 z-[140] flex flex-col bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <IdentityProfileScreen
        context="program"
        onWorkoutBack={() => { pending.current = null; setOpen(false); onBack?.(); }}
        onWorkoutIdentitySaved={() => {
          backfillOnboardingIdentitySession(useUserStore.getState().profile);
          const save = pending.current;
          pending.current = null;
          setOpen(false);
          save?.();
        }}
      />
    </div>
  ) : null;

  return { runAfterIdentity, identityOverlay };
}
