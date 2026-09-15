'use client';

/**
 * useKellyWelcomeBotCatchup
 *
 * Runs once per login session (keyed on uid) after the user store hydrates.
 * Same "once per session" shape as useGroupMembershipReconciliation.ts, for
 * the same reason: the primary trigger (onboarding-sync.service.ts, the
 * moment onboardingStatus first reaches COMPLETED) is a client-initiated
 * fire-and-forget call that can simply be missed — app closed mid-request,
 * network drop right after onboarding finishes — with no way for that call
 * site to know it failed and no later moment where it fires again on its
 * own.
 *
 * This closes that gap from the other direction: anyone whose onboarding IS
 * complete but who still has hasWelcomeBotTriggered !== true gets the same
 * /api/social/kelly-welcome-bot call retried here. The endpoint's own
 * transaction (read the flag, check, write everything together) is what
 * makes calling it from two places safe — this hook adds a second caller,
 * not a second implementation.
 *
 * Mounted on the home screen (src/app/home/page.tsx), not the map — unlike
 * useGroupMembershipReconciliation, which only runs for users who happen to
 * open the map, home is the near-universal post-onboarding landing screen,
 * so this catches the large majority of sessions rather than a subset.
 */

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { triggerKellyWelcomeBot } from '@/features/social/services/kelly-welcome-bot.service';

export function useKellyWelcomeBotCatchup(): void {
  const uid = useUserStore((s) => s.profile?.id);
  const hasHydrated = useUserStore((s) => s._hasHydrated);

  // Prevent double-run under React StrictMode double-invoke and across re-renders.
  const hasRanFor = useRef<string | null>(null);

  useEffect(() => {
    if (!hasHydrated || !uid) return;
    if (hasRanFor.current === uid) return;

    const profile = useUserStore.getState().profile;
    const onboardingStatus = (profile as { onboardingStatus?: string } | undefined)?.onboardingStatus;
    const hasWelcomeBotTriggered = (profile as { hasWelcomeBotTriggered?: boolean } | undefined)
      ?.hasWelcomeBotTriggered;

    if (onboardingStatus !== 'COMPLETED' || hasWelcomeBotTriggered === true) {
      // Not eligible yet, or already sent — mark as handled for this uid
      // either way so we don't re-check on every re-render this session.
      hasRanFor.current = uid;
      return;
    }

    hasRanFor.current = uid;
    void triggerKellyWelcomeBot(uid, 'catchup');
  }, [uid, hasHydrated]);
}
