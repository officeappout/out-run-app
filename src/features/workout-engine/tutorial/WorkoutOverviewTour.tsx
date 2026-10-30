'use client';
/**
 * Overview tour (enable_workout_tutorial_v1, pilot S2): the first time a user opens a workout
 * overview, two "entry" bubbles: "now the warm-up" on the warm-up header, "now the main part" on
 * the main section header. Once per user; "skip" counts as seen.
 */
import React from 'react';
import CoachMarks, { type CoachMarkStep } from '@/components/ui/CoachMarks';
import { useCoachTargetPresent, coachTargetVisible } from '@/features/user/onboarding/hooks/useCoachTargetPresent';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { COACH_MAIN, COACH_WARMUP, overviewTourSeenKey } from './workout-tutorial';
import { useSeenOnce } from './useSeenOnce';
import TutorialPortal from './TutorialPortal';

export default function WorkoutOverviewTour({ enabled, uid }: { enabled: boolean; uid: string | null | undefined }) {
  const t = useT(player);
  const present = useCoachTargetPresent(COACH_MAIN, enabled);
  const { show, finish } = useSeenOnce(overviewTourSeenKey(uid), enabled && present);
  if (!show) return null;
  const steps: CoachMarkStep[] = [
    ...(coachTargetVisible(COACH_WARMUP)
      ? [{ target: COACH_WARMUP, title: t('workoutTutorial.overview.warmupTitle'), text: t('workoutTutorial.overview.warmupText') }]
      : []),
    { target: COACH_MAIN, title: t('workoutTutorial.overview.mainTitle'), text: t('workoutTutorial.overview.mainText') },
  ];
  return (
    <TutorialPortal>
      <CoachMarks steps={steps} onFinish={finish} variant="entry" />
    </TutorialPortal>
  );
}
