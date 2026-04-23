'use client';

export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RunningScheduleStep from '@/features/user/onboarding/components/steps/RunningScheduleStep';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

/**
 * /onboarding-new/running-schedule
 *
 * Reached after the dynamic running tree terminates (at q_run_beginner_ability,
 * q_run_pace_input, or q_run_maintain_distance depending on path).
 * Collects frequency (1-4), specific days, and preferred time, then
 * routes to the Plan Length selection page.
 *
 * Route guard: when enable_running_programs is false, immediately redirects to /home.
 */
export default function RunningSchedulePage() {
  const router = useRouter();
  const { flags, loading } = useFeatureFlags();

  useEffect(() => {
    if (!loading && !flags.enableRunningPrograms) {
      router.replace('/home');
    }
  }, [loading, flags.enableRunningPrograms, router]);

  if (loading || !flags.enableRunningPrograms) return null;

  const handleNext = () => {
    firePhaseConfetti();
    router.push('/onboarding-new/running-plan-length');
  };

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={RUNNING_PHASES.TOTAL}
      currentSegment={RUNNING_PHASES.SCHEDULE}
      phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.SCHEDULE]}
      hideContinueButton
    >
      <RunningScheduleStep onNext={handleNext} />
    </OnboardingLayout>
  );
}
