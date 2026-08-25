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
 *
 * Home-generator-v2 follow-ups, Task 1 (16.08.2026): the card renderer needs the REAL
 * GeneratedWorkout too, not just the Suggestion summary — rendering recovery-follow-up
 * suggestions through HeroWorkoutCard (matching the existing rest-day hero card exactly)
 * requires the real workout object, not a lightweight card. Rather than a third
 * independent generateHomeWorkoutTrio call (generate() already makes one for ranking;
 * pick-post-workout-suggestion.ts made a second one for "start"), the result is cached
 * here, keyed by the Suggestion.id generate() itself mints — one real call feeds ranking,
 * rendering, and starting. Mirrors the same "cache the real result keyed by id" pattern
 * already proven at start-hybrid-session.ts's hybridPlanCache (map surface).
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { generateHomeWorkoutTrio } from '../../services/home-workout.service';

const RECOVERY_WORKOUT_CACHE_CAP = 10;
const recoveryWorkoutCache = new Map<string, GeneratedWorkout>();

function cacheRecoveryWorkout(suggestionId: string, workout: GeneratedWorkout): void {
  if (recoveryWorkoutCache.size >= RECOVERY_WORKOUT_CACHE_CAP) {
    const oldestKey = recoveryWorkoutCache.keys().next().value;
    if (oldestKey !== undefined) recoveryWorkoutCache.delete(oldestKey);
  }
  recoveryWorkoutCache.set(suggestionId, workout);
}

/** Read-only lookup for callers that already have a ranked Suggestion.id — the card
 *  renderer and pick-post-workout-suggestion.ts's start-adapter both use this instead of
 *  re-deriving. Returns undefined on a cache miss (cap eviction, or a suggestion from a
 *  different session/reload) — callers must degrade gracefully, not assume a hit. */
export function getCachedRecoveryWorkout(suggestionId: string): GeneratedWorkout | undefined {
  return recoveryWorkoutCache.get(suggestionId);
}

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
  // 'home' added (17.8 build-plan, Stage 4, 25.08.2026): rest-day-aware ranking on the home
  // surface (todayGoal:'recovery' boosting goalMatch for goalTags:['recovery']) only has a
  // real recovery suggestion to boost if this generator can actually run there —
  // safety-net alone is a deliberately-medium generic fallback, not "the good one."
  surfaces: ['post_workout', 'home'],

  eligible: () => useUserStore.getState().profile !== null,

  generate: async (): Promise<Suggestion | null> => {
    const profile = useUserStore.getState().profile;
    if (!profile) return null;

    const workout = await buildRecoveryFollowUpWorkout(profile);
    if (!workout) return null;

    const id = `recovery-follow-up-${Date.now()}`;
    cacheRecoveryWorkout(id, workout);

    return {
      id,
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
