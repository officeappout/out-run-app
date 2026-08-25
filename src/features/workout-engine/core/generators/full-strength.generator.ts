/**
 * full-strength.generator — Generator retrofit for the home full-strength trio (§11.3).
 * Wraps `generateHomeWorkoutTrio` (home-workout.service.ts) as-is — zero touched existing
 * files, zero live call sites.
 *
 * Profile resolution: reads `useUserStore.getState().profile` directly, at `generate()` time
 * — the SAME store, SAME pattern `composeFullParkWorkout` already uses
 * (start-hybrid-session.ts:164) and the home page's instant park/home toggle already reads
 * (StatsOverview.tsx:309). Verified before building (not assumed): the profile is loaded
 * once on app boot via Zustand `persist`/localStorage rehydration and is a free synchronous
 * read from both call sites — this generator adds no new fetch and cannot regress the home
 * page's toggle speed, since it's an entirely separate call site into an already-warm store.
 * `UserContext` deliberately does NOT carry a profile reference — this was considered and
 * rejected; every real generator resolves its own profile the same way.
 *
 * Subsumes what would have been a separate `tabata.generator.ts`: tabata is not
 * independently generatable today — it is a finisher attached to a full-strength
 * generation (`WorkoutGenerator`'s `tabataProbability` roll), so its presence is reported
 * here via `methodsUsed`, not as its own Generator.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { generateHomeWorkoutTrio } from '../../services/home-workout.service';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED } from '@/config/feature-flags';

export const fullStrengthGenerator: Generator = {
  id: 'full-strength',
  name: 'כוח מלא',
  surfaces: ['home', 'map'],

  eligible: () => useUserStore.getState().profile !== null,

  generate: async (context): Promise<Suggestion | null> => {
    const profile = useUserStore.getState().profile;
    if (!profile) return null;

    // Cheap ranking (see feature-flags.ts) — no real generateHomeWorkoutTrio call (that's
    // the exact per-exercise scoring pass map-suggestion-pipeline-thrash.md fixed the waste
    // on). Still preserves the real self-exclusion the full generation applies today
    // (needsAssessment=true → null) via a cheap synchronous read of the already-loaded
    // profile — "has the user assessed ANY domain/track at all" — instead of running the
    // full pipeline just to discover the same answer.
    if (IS_CHEAP_SUGGESTION_RANKING_ENABLED) {
      const hasAnyAssessedDomain =
        Object.keys(profile.progression?.domains ?? {}).length > 0 ||
        Object.keys(profile.progression?.tracks ?? {}).length > 0;
      if (!hasAnyAssessedDomain) return null;
      return {
        id: `full-strength-cheap-${context.userId}`,
        type: 'daily_workout',
        generatorId: 'full-strength',
        title: 'אימון כוח',
        structure: { segments: 1, durationMin: context.availableTimeMin },
        methodsUsed: ['straight'],
        difficulty: 2,
        goalTags: ['strength'],
        surfaceEligibility: ['home', 'map'],
        requiresLocation: false,
        score: 0,
        scoreBreakdown: {
          goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
          recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0, alreadyTrained: 0,
        },
      };
    }

    const trio = await generateHomeWorkoutTrio({
      userProfile: profile,
      availableTime: context.availableTimeMin,
      difficulty: 2,
    });

    const option = trio.options[1]; // balanced — matches the map generators' default bolt
    const { workout } = option.result;
    if (workout.needsAssessment) return null;

    // Real detection, not a hardcoded guess: 'straight' as the baseline (warmup/cooldown are
    // never superset/pyramid/tabata-tagged), plus superset/pyramid presence read off the same
    // exercise fields the live player/preview dispatch on (pairedWith / pyramidSequence —
    // advance-registry.ts's resolveExerciseProtocol uses the identical check).
    const methodsUsed: string[] = ['straight'];
    if (workout.exercises.some((ex) => ex.pairedWith)) methodsUsed.push('superset');
    if (workout.exercises.some((ex) => Array.isArray(ex.pyramidSequence) && ex.pyramidSequence.length > 0)) {
      methodsUsed.push('pyramid');
    }
    if (workout.tabataBlock) methodsUsed.push('tabata');

    return {
      id: `full-strength-${Date.now()}`,
      type: 'daily_workout',
      generatorId: 'full-strength',
      title: workout.title,
      subtitle: option.label,
      structure: {
        segments: workout.exercises.length,
        durationMin: workout.estimatedDuration,
        totalSets: workout.totalPlannedSets,
      },
      methodsUsed,
      difficulty: workout.difficulty,
      goalTags: ['strength'],
      surfaceEligibility: ['home', 'map'],
      requiresLocation: false,
      score: 0,
      scoreBreakdown: {
        goalMatch: 0,
        gapFilling: 0,
        stepDeficit: 0,
        preferenceMatch: 0,
        recoveryMatch: 0,
        locationBonus: 0,
        timeOfDayMatch: 0, alreadyTrained: 0,
      },
    };
  },
};
