'use client';
/**
 * First-input tour (enable_workout_tutorial_v1, pilot S2): one bubble on the reps / time picker
 * the first time a user ever fills one in. Once per user.
 */
import React from 'react';
import CoachMarks from '@/components/ui/CoachMarks';
import { useCoachTargetPresent } from '@/features/user/onboarding/hooks/useCoachTargetPresent';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { COACH_INPUT, inputTourSeenKey } from './workout-tutorial';
import { useSeenOnce } from './useSeenOnce';
import TutorialPortal from './TutorialPortal';

export default function WorkoutInputTour({ enabled, uid, isTime }: { enabled: boolean; uid: string | null | undefined; isTime: boolean }) {
  const t = useT(player);
  const present = useCoachTargetPresent(COACH_INPUT, enabled);
  const { show, finish } = useSeenOnce(inputTourSeenKey(uid), enabled && present);
  if (!show) return null;
  return (
    <TutorialPortal>
      <CoachMarks
        steps={[{
          target: COACH_INPUT,
          title: t(isTime ? 'workoutTutorial.input.timeTitle' : 'workoutTutorial.input.repsTitle'),
          text: t(isTime ? 'workoutTutorial.input.timeText' : 'workoutTutorial.input.repsText'),
          finger: 'swipe',
        }]}
        onFinish={finish}
        variant="entry"
      />
    </TutorialPortal>
  );
}
