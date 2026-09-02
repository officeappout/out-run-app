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
 *
 * 2a (idempotent-booping-sunrise.md, 02.09.2026): RunningScheduleStep no
 * longer collects anything here in signup mode — it silently writes a
 * system default and advances (real day-picking now happens later, in
 * LifestyleWizard). handleNext below uses router.replace, not .push
 * (changed as part of this same commit, not incidental): a pass-through
 * screen that writes-and-advances on mount would otherwise still leave
 * itself as a distinct back-history entry, so pressing "back" from
 * running-plan-length would land here, immediately re-fire the same
 * write-and-advance, and bounce right back to running-plan-length --
 * a back button that visibly does nothing. .replace() removes this route
 * from the back-stack instead, matching health/page.tsx's own
 * already-accepted auto-skip precedent (:129), so "back" from
 * running-plan-length correctly lands on dynamic's own last real question.
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
    router.replace('/onboarding-new/running-plan-length');
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
