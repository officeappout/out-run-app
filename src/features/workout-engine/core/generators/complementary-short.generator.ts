/**
 * complementary-short.generator — post_workout Generator (home-generator-v2 plan, step 6).
 *
 * Ships the strength/core version only (per plan): eligible on `stepsRemaining > 0` (a real,
 * live field) rather than a domain-gap signal — `weeklyPerformance.neglectedDomains` is a
 * Gate-B placeholder today (rank-suggestions.ts's own header), not a real source yet.
 * Deliberately NOT building a second aerobic/steps-flavored complementary generator up
 * front — revisit once real post_workout usage shows which gap (steps vs. domain) fires
 * more often, per the plan's explicit call to avoid speculative build-out.
 *
 * `requiredDomains`+`strictDomains`+`generateSingleOption` are the same load-bearing,
 * already-real HomeWorkoutOptions full-strength.generator.ts already demonstrates the
 * pattern for (home-workout.types.ts:119-133) — this is a new, automated caller of an
 * existing capability, not new pipeline work.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { generateHomeWorkoutTrio } from '../../services/home-workout.service';

const SHORT_DURATION_MIN = 12;

export async function buildComplementaryShortWorkout(
  profile: UserFullProfile,
): Promise<GeneratedWorkout | null> {
  const trio = await generateHomeWorkoutTrio({
    userProfile: profile,
    availableTime: SHORT_DURATION_MIN,
    requiredDomains: ['core'],
    strictDomains: true,
    generateSingleOption: true,
    targetOptionIndex: 1,
    skipCycleRestart: true,
  });
  const { workout } = trio.options[1].result;
  if (workout.needsAssessment) return null;
  return workout;
}

export const complementaryShortGenerator: Generator = {
  id: 'complementary-short',
  name: 'השלמה קצרה',
  surfaces: ['post_workout'],

  eligible: (context) => context.stepsRemaining > 0 && useUserStore.getState().profile !== null,

  generate: async (): Promise<Suggestion | null> => {
    const profile = useUserStore.getState().profile;
    if (!profile) return null;

    const workout = await buildComplementaryShortWorkout(profile);
    if (!workout) return null;

    return {
      id: `complementary-short-${Date.now()}`,
      type: 'post_workout',
      generatorId: 'complementary-short',
      title: workout.title,
      subtitle: 'עוד קצת ליבה?',
      structure: {
        segments: workout.exercises.length,
        durationMin: workout.estimatedDuration,
      },
      methodsUsed: [],
      difficulty: workout.difficulty,
      goalTags: ['strength', 'core'],
      surfaceEligibility: ['post_workout'],
      requiresLocation: false,
      score: 0,
      scoreBreakdown: {
        goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
        recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0,
      },
    };
  },
};
