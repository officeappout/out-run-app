'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import AddTrackFlow, { ADD_TRACK_SUBSTEPS } from '@/features/user/onboarding/components/add-track/AddTrackFlow';
import { RUNNING_PHASES, STRENGTH_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { useOnboardingV2State } from '@/features/user/onboarding/hooks/useOnboardingV2';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { addTrackDoneRoute, HOME_ROUTE, parseAddedTrack } from '@/features/user/onboarding/utils/add-track-routing';
import { removeOnboardingPref } from '@/lib/onboardingPrefs';

/**
 * /onboarding-new/add-track-week?added=running|strength — enable_home_v2 only
 * (journeys J3 / J4, boards jr/J3-05..06, J4-05..06, sch/S-6b, S-6c).
 *
 * The end of the SECOND track's signup: the combined week, then the shared reminders
 * step. Reached from the running-schedule hand-off (J3) and the strength result (J4) —
 * both only under the flag; a flag-off user (or a bad link) is sent home.
 */
function AddTrackWeekPage() {
  const router = useRouter();
  const params = useSearchParams();
  const added = parseAddedTrack(params?.get('added'));
  const { v2, ready } = useOnboardingV2State();
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const [sub, setSub] = useState(0);

  const blocked = ready && (!v2 || !added);
  useEffect(() => {
    if (blocked) router.replace(HOME_ROUTE);
  }, [blocked, router]);

  if (!ready || blocked || !added || !hasHydrated) return null;

  const phases = added === 'running' ? RUNNING_PHASES : STRENGTH_PHASES;
  const segment = added === 'running' ? RUNNING_PHASES.SCHEDULE : STRENGTH_PHASES.RESULT;

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={phases.TOTAL}
      currentSegment={segment}
      segmentFillPercent={Math.round(((sub + 1) / ADD_TRACK_SUBSTEPS) * 100)}
      phaseLabel={phases.labels[segment]}
      onBack={sub > 0 ? () => setSub(sub - 1) : undefined}
      hideContinueButton
    >
      <AddTrackFlow
        added={added}
        sub={sub}
        setSub={setSub}
        onDone={() => {
          firePhaseConfetti();
          // health-connect clears this at the end of a signup; the strength route skips it.
          if (added === 'strength') removeOnboardingPref('gateway_track');
          router.replace(addTrackDoneRoute(added));
        }}
      />
    </OnboardingLayout>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AddTrackWeekPage />
    </Suspense>
  );
}
