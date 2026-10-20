'use client';

/**
 * Home's "what next?" after a workout (enable_home_v2) — the week's goals from the
 * activity store (no reads) + today's plan + today's workouts → resolveNextRecommendation.
 * The weekly targets are the ConsistencyWidget's own (strength: getStrengthAdherence;
 * runs: running.weeklyFrequency ?? scheduleDays ?? 3), so the cards and the bars agree.
 * Runs done = runs only (useWeeklyRunCount, owner 20.10.2026), the summary's cardio count
 * only until that read lands. Disabled → null.
 */
import { useMemo } from 'react';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { getStrengthAdherence } from '@/features/activity';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { PlanKind } from '../utils/day-plan';
import { doneKindsOf, resolveNextRecommendation, type NextRecommendation, type WeekGoals } from '../utils/next-recommendation';

export interface UseNextRecommendationArgs {
  enabled: boolean;
  profile: UserFullProfile | null | undefined;
  hasStrengthProgram: boolean;
  hasRunningPlan: boolean;
  todaysWorkouts: ReadonlyArray<{ workoutType?: string | null; activityType?: string | null }> | null | undefined;
  /** Today's plan in day-plan order (walk / run / strength). */
  plannedToday: readonly PlanKind[];
  /** null = no step data. */
  stepsRemaining: number | null;
  /** This week's runs (not walks); null = not read yet. */
  weekRuns: number | null;
  /** Sets still missing from today's strength goal (strength-top-up.ts). */
  strengthTopUpSets: number;
}

export interface NextUp {
  next: NextRecommendation;
  week: WeekGoals;
  doneToday: PlanKind[];
}

export function useNextRecommendation(a: UseNextRecommendationArgs): NextUp | null {
  const summary = useActivityStore((s) => s.weeklySummary);
  const { enabled, profile, hasStrengthProgram, hasRunningPlan, todaysWorkouts, plannedToday, stepsRemaining, weekRuns, strengthTopUpSets } = a;
  const runTarget = profile?.running?.weeklyFrequency ?? profile?.running?.scheduleDays?.length ?? 3;
  const plannedKey = plannedToday.join(',');
  return useMemo(() => {
    if (!enabled) return null;
    const strength = getStrengthAdherence(profile, summary);
    const doneToday = doneKindsOf(todaysWorkouts);
    const week: WeekGoals = {
      strengthDone: strength.done,
      strengthTarget: strength.target,
      runDone: weekRuns ?? summary?.categorySessions?.cardio ?? 0,
      runTarget,
    };
    const next = resolveNextRecommendation({
      doneToday,
      plannedToday,
      stepsRemaining,
      hasStrengthProgram,
      hasRunningPlan,
      week,
      strengthTopUpSets,
    });
    return { next, week, doneToday };
    // plannedKey stands in for plannedToday (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, profile, summary, todaysWorkouts, plannedKey, stepsRemaining, hasStrengthProgram, hasRunningPlan, runTarget, weekRuns, strengthTopUpSets]);
}
