'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import HealthConnectOptInStep from '@/features/user/onboarding/components/HealthConnectOptInStep';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { STRENGTH_PHASES, RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { getOnboardingPref, removeOnboardingPref } from '@/lib/onboardingPrefs';

export default function HealthConnectOptInPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const isRunningTrack = getOnboardingPref('gateway_track') === 'RUNNING';

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleContinue = () => {
    // Last reader of gateway_track in the flow (program-path → dynamic →
    // health → here — the real COMPLETED sync already fired in health/page.tsx
    // before this screen reads it for the header label). Clear it now so a
    // stale 'RUNNING' value can't silently bypass dynamic/page.tsx's re-entry
    // guard on a later, unrelated visit (e.g. browser "back").
    removeOnboardingPref('gateway_track');
    router.replace('/home');
  };

  if (!mounted) return null;

  const content = (
    <Suspense fallback={null}>
      <HealthConnectOptInStep onContinue={handleContinue} />
    </Suspense>
  );

  // Same phase segment as /onboarding-new/health — this step is a
  // continuation of the health phase, not a new distinct phase.
  if (isRunningTrack) {
    return (
      <OnboardingLayout
        headerType="progress"
        totalSegments={RUNNING_PHASES.TOTAL}
        currentSegment={RUNNING_PHASES.HEALTH}
        phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.HEALTH]}
        hideContinueButton
      >
        {content}
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      totalSegments={STRENGTH_PHASES.TOTAL}
      currentSegment={STRENGTH_PHASES.HEALTH}
      phaseLabel={STRENGTH_PHASES.labels[STRENGTH_PHASES.HEALTH]}
      hideContinueButton
    >
      {content}
    </OnboardingLayout>
  );
}
