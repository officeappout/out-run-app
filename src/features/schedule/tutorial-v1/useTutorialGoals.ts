'use client';

/**
 * The tutorial's goals (Part C), read once when it opens:
 * - steps: the gradual goal's first value (baseline + 500..1,000, else 4,000; capped by age) for a
 *   user on the automatic goal. A user who chose their own goal keeps it (steps = null).
 * - ramp: the first-weeks active-minutes ramp input (level + week since the program start).
 * The health read is best effort: offline / failed = no data = 4,000.
 */
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { fetchRecentDays } from '@/features/activity/services/step-goal.service';
import { getTodayString } from '@/features/activity/store/useActivityStore';
import { rampStartStepGoal, stepRampCapForAge } from '@/features/activity/lib/step-goal';
import { ageFromBirthDate } from '@/features/user/onboarding/utils/goal-note';
import type { RampInput } from '@/features/schedule/goals/activeMinutesRamp';
import { rampInputOf, type PlannedMinutesProfile } from '@/features/schedule/goals/plannedSessionMinutes';

export interface TutorialGoals {
  /** Null while loading, or when the user keeps their own goal. */
  steps: { goal: number; cap: number } | null;
  ramp: RampInput;
}

function ageOf(birthDate: unknown): number | null {
  const d = birthDate instanceof Date ? birthDate
    : typeof birthDate === 'string' ? new Date(birthDate)
      : birthDate && typeof (birthDate as { toDate?: unknown }).toDate === 'function' ? (birthDate as { toDate: () => Date }).toDate()
        : null;
  return ageFromBirthDate(d);
}

export function useTutorialGoals(): TutorialGoals {
  const profile = useUserStore((s) => s.profile);
  const uid = profile?.id;
  const manual = (profile?.progression as { stepGoalMode?: unknown } | undefined)?.stepGoalMode === 'manual';
  const cap = stepRampCapForAge(ageOf((profile?.core as { birthDate?: unknown } | undefined)?.birthDate));
  const [steps, setSteps] = useState<TutorialGoals['steps']>(null);

  useEffect(() => {
    if (!uid || manual) return;
    let alive = true;
    fetchRecentDays(uid)
      .catch(() => [])
      .then((days) => { if (alive) setSteps({ goal: rampStartStepGoal(days, getTodayString(), cap), cap }); });
    return () => { alive = false; };
    // Once per open (the tutorial reads its inputs once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ramp = useMemo(() => rampInputOf(profile as PlannedMinutesProfile | null, new Date()), [uid]);
  return { steps, ramp };
}
