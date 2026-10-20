'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import PlanLengthStep from '@/features/user/onboarding/components/steps/PlanLengthStep';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';
import { useOnboardingV2 } from '@/features/user/onboarding/hooks/useOnboardingV2';
import { runSignupNextRoute } from '@/features/user/onboarding/utils/run-signup-routing';

export default function RunningPlanLengthPage() {
  const router = useRouter();
  // enable_home_v2: plan length comes before the days step (run-signup-routing.ts).
  const v2 = useOnboardingV2();

  const handleNext = () => {
    firePhaseConfetti();
    router.push(runSignupNextRoute('running-plan-length', v2));
  };

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={RUNNING_PHASES.TOTAL}
      currentSegment={v2 ? RUNNING_PHASES.SCHEDULE : RUNNING_PHASES.PLAN_LENGTH}
      segmentFillPercent={v2 ? 20 : 50}
      phaseLabel={RUNNING_PHASES.labels[v2 ? RUNNING_PHASES.SCHEDULE : RUNNING_PHASES.PLAN_LENGTH]}
      hideContinueButton
    >
      <PlanLengthStep onNext={handleNext} />
    </OnboardingLayout>
  );
}
