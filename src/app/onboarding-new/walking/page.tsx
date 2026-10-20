'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import WalkSignupFlow, { WALK_SIGNUP_SUBSTEPS } from '@/features/user/onboarding/components/walking-v2/WalkSignupFlow';
import { RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { useOnboardingV2State } from '@/features/user/onboarding/hooks/useOnboardingV2';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { WALK_SIGNUP_DONE_ROUTE } from '@/features/user/onboarding/utils/walk-signup-routing';
import { removeOnboardingPref } from '@/lib/onboardingPrefs';

/**
 * /onboarding-new/walking — enable_home_v2 only (owner 20.10.2026; boards wr/WR-3a..3d).
 *
 * Reached from q_run_goal's 4th choice "הליכה" (the home run start card's signup).
 * goal → days → the week → reminders → home. Not a program: the walks are written to
 * the schedule (features/schedule/walking). A flag-off user, or no signed-in user,
 * is sent home.
 */
export default function WalkingSignupPage() {
  const router = useRouter();
  const { v2, ready } = useOnboardingV2State();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const signedIn = useUserStore((s) => !!s.profile?.id);
  const [sub, setSub] = useState(0);

  const blocked = ready && hasHydrated && (!v2 || !signedIn);
  useEffect(() => {
    if (blocked) router.replace(WALK_SIGNUP_DONE_ROUTE);
  }, [blocked, router]);

  if (!ready || !hasHydrated || blocked) return null;

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={RUNNING_PHASES.TOTAL}
      currentSegment={RUNNING_PHASES.SCHEDULE}
      segmentFillPercent={Math.round(((sub + 1) / WALK_SIGNUP_SUBSTEPS) * 100)}
      phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.SCHEDULE]}
      onBack={sub > 0 && sub < 3 ? () => setSub(sub - 1) : sub === 0 ? () => router.back() : undefined}
      hideContinueButton
    >
      <WalkSignupFlow
        sub={sub}
        setSub={setSub}
        onDone={() => {
          firePhaseConfetti();
          // The run start card seeded the running track; walking is not one.
          removeOnboardingPref('gateway_track');
          router.replace(WALK_SIGNUP_DONE_ROUTE);
        }}
      />
    </OnboardingLayout>
  );
}
