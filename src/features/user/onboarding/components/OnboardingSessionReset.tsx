'use client';

/**
 * OnboardingSessionReset — mounted once in ClientLayout, renders nothing.
 * Watches the auth uid and wipes the previous account's onboarding state on
 * sign-out or an in-session account switch, whichever code path signed out
 * (settings, account deletion, challenge join, existing-account sign-in).
 */
import { useEffect } from 'react';
import {
  resetOnboardingSession,
  shouldResetOnboardingSession,
} from '../services/onboarding-session-reset';

export default function OnboardingSessionReset() {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let prevUid: string | null | undefined;
    void import('@/lib/firebase')
      .then(({ auth }) => {
        if (cancelled) return;
        unsub = auth.onAuthStateChanged((user) => {
          const nextUid = user?.uid ?? null;
          if (shouldResetOnboardingSession(prevUid, nextUid)) resetOnboardingSession();
          prevUid = nextUid;
        });
      })
      .catch(() => { /* non-fatal */ });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return null;
}
