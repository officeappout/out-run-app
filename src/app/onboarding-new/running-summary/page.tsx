'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import RunningPlanSummary from '@/features/user/onboarding/components/steps/RunningPlanSummary';
import OnboardingLayout from '@/features/user/onboarding/components/OnboardingLayout';
import { RUNNING_PHASES } from '@/features/user/onboarding/constants/onboarding-phases';
import { firePhaseConfetti } from '@/features/user/onboarding/utils/onboarding-confetti';

export default function RunningSummaryPage() {
  const router = useRouter();

  const handleGenerate = () => {
    firePhaseConfetti();
    router.push('/onboarding-new/health');
  };

  return (
    <OnboardingLayout
      headerType="progress"
      totalSegments={RUNNING_PHASES.TOTAL}
      currentSegment={RUNNING_PHASES.SUMMARY}
      phaseLabel={RUNNING_PHASES.labels[RUNNING_PHASES.SUMMARY]}
      hideContinueButton
    >
      <RunningPlanSummary onGenerate={handleGenerate} />
    </OnboardingLayout>
  );
}
