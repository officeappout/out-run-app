'use client';

/**
 * useHomeToday: the home "היום שלך" cards and the home tour from them (enable_schedule_tutorial_v1,
 * Part B). Null while the flag is off (or loading), without a strength program, or before a week is
 * saved, so home stays exactly as today.
 *
 * armed: the tutorial's flames screen (ל5) left the arm signal (tutorial-v1 tutorialPrefs); home
 * treats it like "סתם להסתכל" and starts the tour. consumeArm clears it once the tour closed.
 */
import { useCallback, useMemo, useState } from 'react';
import type { HomeTourToday } from '@/features/user/onboarding/services/first-run-tour';
import { consumeHomeTourArm, isHomeTourArmedAfterScheduleTutorial, useScheduleTutorialV1 } from '@/features/schedule/tutorial-v1';
import { resolveHomeToday, type HomeTodayModel } from './model/homeToday';
import { homeTourToday, optionalDoneOf, strengthMinutesOf } from './model/homeTodayInputs';
import { plannedSessionMinutes, type PlannedMinutesProfile } from '@/features/schedule/goals/plannedSessionMinutes';

interface ProfileSlice {
  id?: string;
  lifestyle?: {
    scheduleDays?: string[] | null;
    trainingTime?: string | null;
    recurringTemplate?: unknown;
    sessionMinutes?: unknown;
    reminders?: { strengthTimesByDay?: Partial<Record<string, string>> | null } | null;
  } | null;
  progression?: unknown;
}

export interface UseHomeTodayInput {
  profile: ProfileSlice | null | undefined;
  hasStrengthProgram: boolean;
  strengthDone: boolean;
  todaysWorkouts: ReadonlyArray<{ duration?: number | null; workoutType?: string | null; activityType?: string | null; category?: string | null }> | null;
  steps: number;
  stepsGoal: number;
}

export interface HomeToday {
  model: HomeTodayModel | null;
  tour: HomeTourToday | null;
  armed: boolean;
  consumeArm: () => void;
}

export function useHomeToday(input: UseHomeTodayInput): HomeToday {
  const on = useScheduleTutorialV1();
  const uid = input.profile?.id;
  const days = input.profile?.lifestyle?.scheduleDays;
  const show = on && input.hasStrengthProgram && Array.isArray(days) && days.length > 0;
  const minutes = strengthMinutesOf(input.todaysWorkouts);
  const template = input.profile?.lifestyle?.recurringTemplate as Partial<Record<string, readonly string[]>> | undefined;
  const trainingTime = input.profile?.lifestyle?.trainingTime;
  const timesByDay = input.profile?.lifestyle?.reminders?.strengthTimesByDay;
  const optionalDone = optionalDoneOf(input.todaysWorkouts);
  const now = new Date();
  const plannedMinutes = plannedSessionMinutes(input.profile as PlannedMinutesProfile | null | undefined, now);
  const dow = now.getDay();
  const dom = now.getDate();
  const model = useMemo(
    () => (show
      ? resolveHomeToday({
          todayDow: dow,
          dayOfMonth: dom,
          scheduleDays: days ?? [],
          recurringTemplate: template,
          trainingTime,
          timesByDay,
          plannedMinutes,
          optionalDone,
          strengthDone: input.strengthDone,
          strengthMinutes: minutes,
          steps: input.steps,
          stepsGoal: input.stepsGoal,
        })
      : null),
    [show, dow, dom, days, template, trainingTime, timesByDay, plannedMinutes, optionalDone, input.strengthDone, minutes, input.steps, input.stepsGoal],
  );
  const tour = useMemo(() => homeTourToday(model), [model]);
  // Read once per uid; cleared when the tour closes.
  const [consumed, setConsumed] = useState(false);
  const armed = !!model && !consumed && isHomeTourArmedAfterScheduleTutorial(uid);
  const consumeArm = useCallback(() => {
    if (!on) return;
    consumeHomeTourArm(uid);
    setConsumed(true);
  }, [on, uid]);
  return { model, tour, armed, consumeArm };
}
