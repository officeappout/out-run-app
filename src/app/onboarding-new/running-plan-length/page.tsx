'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import PlanLengthStep from '@/features/user/onboarding/components/steps/PlanLengthStep';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';

export default function RunningPlanLengthPage() {
  const router = useRouter();

  const handleNext = () => {
    firePhaseConfetti();
    router.push('/onboarding-new/running-summary');
  };

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={RUNNING_PHASES.TOTAL}
      currentSegment={RUNNING_PHASES.PLAN_LENGTH}
      segmentFillPercent={50}
      phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.PLAN_LENGTH]}
      hideContinueButton
    >
      <PlanLengthStep onNext={handleNext} />
    </OnboardingLayout>
  );
}
