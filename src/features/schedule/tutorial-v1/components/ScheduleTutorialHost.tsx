'use client';

/**
 * Home mount of the schedule tutorial (enable_schedule_tutorial_v1). Launch point: a new user (the
 * first-run tours' 14-day rule) who finished the strength questionnaire (has a strength program) and
 * landed home without a schedule yet, once per uid. ל1 points at the weekly strip; its CTA opens the
 * flow (ל2 to ל5). After ל5: seen is recorded, the home tour is armed (Part B), `onFinished` runs.
 *
 * `onBusyChange(true)` while the tutorial may still show, so the host can hold the home tour back.
 * Flag off: renders nothing and never reports busy.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { useIsNewUserForTours } from '@/features/user/onboarding/hooks/useIsNewUserForTours';
import { useCoachTargetPresent } from '@/features/user/onboarding/hooks/useCoachTargetPresent';
import { FIRST_RUN_COACH } from '@/features/user/onboarding/services/first-run-tour';
import { useScheduleTutorialV1 } from '../useScheduleTutorialV1';
import { armHomeTourAfterScheduleTutorial, markScheduleTutorialSeen, scheduleTutorialSeenKey } from '../model/tutorialPrefs';
import { tutorialPhase } from '../model/launch';

const SchedHomeCoach = dynamic(() => import('./SchedHomeCoach'), { ssr: false });
const ScheduleTutorialFlow = dynamic(() => import('./ScheduleTutorialFlow'), { ssr: false });

export interface ScheduleTutorialHostProps {
  uid: string | null | undefined;
  hasStrengthProgram: boolean;
  hasSchedule: boolean;
  /** Nothing else is open on home (the home's own guard list). */
  calm: boolean;
  onBusyChange?: (busy: boolean) => void;
  onFinished?: (r: { startWorkout: boolean }) => void;
}

export default function ScheduleTutorialHost({ uid, hasStrengthProgram, hasSchedule, calm, onBusyChange, onFinished }: ScheduleTutorialHostProps) {
  const on = useScheduleTutorialV1();
  const candidate = on && hasStrengthProgram && !hasSchedule && !!uid;
  const isNew = useIsNewUserForTours(candidate);
  const [seen, setSeen] = useState<boolean | null>(null);
  const [stage, setStage] = useState<'idle' | 'flow' | 'done'>('idle');
  const targetPresent = useCoachTargetPresent(FIRST_RUN_COACH.homeWeek, candidate && stage === 'idle');

  useEffect(() => {
    if (!candidate || seen !== null) return;
    let alive = true;
    void getOnboardingPrefAsync(scheduleTutorialSeenKey(uid)).then((v) => { if (alive) setSeen(!!v); });
    return () => { alive = false; };
  }, [candidate, seen, uid]);

  const phase = tutorialPhase({ candidate, isNew, seen, stage, calm, targetPresent });

  useEffect(() => { onBusyChange?.(phase.busy); }, [phase.busy, onBusyChange]);

  if (phase.show === 'coach') {
    return (
      <SchedHomeCoach
        target={FIRST_RUN_COACH.homeWeek}
        onStart={() => setStage('flow')}
        onSkip={() => { markScheduleTutorialSeen(uid); setStage('done'); }}
      />
    );
  }
  if (phase.show === 'flow') {
    return (
      <ScheduleTutorialFlow
        onDone={(r) => {
          markScheduleTutorialSeen(uid);
          armHomeTourAfterScheduleTutorial(uid);
          setStage('done');
          onFinished?.(r);
        }}
      />
    );
  }
  return null;
}
