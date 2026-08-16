/**
 * recovery-follow-up.generator — post_workout Generator (home-generator-v2 plan, step 6).
 *
 * Read-only preview (skipCycleRestart) — same reasoning as the hybrid "full workout in the
 * park" card (home-workout.types.ts:197-208): this recommends, it never commits the user's
 * program cycle. `isRecoveryDay` routes generateHomeWorkoutTrio into the recovery-video-trio
 * content pool already live in production (the same one the home dashboard's own rest-day
 * card uses) — no new content pool built here.
 *
 * eligible() is deliberately permissive (no context.surface self-check — centrally enforced
 * by suggestion-engine.ts; no recoveryState/questionnaire gate) — the ranker's existing
 * recoveryMatch/stepDeficit factors differentiate this from complementary-short naturally,
 * per the home-generator-v2 plan's explicit call to prefer that over a hand-rolled
 * precedence chain per generator.
 *
 * `buildRecoveryFollowUpWorkout` is exported separately from the Generator itself so a
 * "start" tap (which needs the real GeneratedWorkout, not just the Suggestion summary
 * generate() returns) can re-derive it via the SAME single source of truth instead of a
 * second, hand-copied options object elsewhere — see pick-post-workout-suggestion.ts.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { generateHomeWorkoutTrio } from '../../services/home-workout.service';

export async function buildRecoveryFollowUpWorkout(
  profile: UserFullProfile,
): Promise<GeneratedWorkout | null> {
  const trio = await generateHomeWorkoutTrio({
    userProfile: profile,
    isRecoveryDay: true,
    generateSingleOption: true,
    targetOptionIndex: 1,
    skipCycleRestart: true,
  });
  const { workout } = trio.options[1].result;
  if (workout.needsAssessment) return null;
  return workout;
}

export const recoveryFollowUpGenerator: Generator = {
  id: 'recovery-follow-up',
  name: 'התאוששות',
  surfaces: ['post_workout'],

  eligible: () => useUserStore.getState().profile !== null,

  generate: async (): Promise<Suggestion | null> => {
    const profile = useUserStore.getState().profile;
    if (!profile) return null;

    const workout = await buildRecoveryFollowUpWorkout(profile);
    if (!workout) return null;

    return {
      id: `recovery-follow-up-${Date.now()}`,
      type: 'post_workout',
      generatorId: 'recovery-follow-up',
      title: workout.title,
      subtitle: 'התאוששות קלה אחרי האימון',
      structure: {
        segments: workout.exercises.length,
        durationMin: workout.estimatedDuration,
      },
      methodsUsed: [],
      difficulty: workout.difficulty,
      goalTags: ['recovery'],
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
