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
 *
 * Tier-2 real-build resolver (17.8 build-plan, Section 1, 26.08.2026): generate() itself is
 * UNCHANGED — home still gets whatever IS_CHEAP_SUGGESTION_RANKING_ENABLED's cheap placeholder
 * or the real branch below already returns, exactly as before. What's new is
 * resolveFullStrengthWorkout, a separate, on-demand real build for one specific, already-ranked
 * suggestion id — called by the home carousel's orchestration hook immediately for its
 * focused/center card and via background prefetch for the rest. David's explicit call
 * (26.08.2026): no fabricated Tier-1 preview content for the other cards — they show the app's
 * existing loading-skeleton pattern (CarouselSkeleton's own shimmer, sized per-card) until this
 * resolver's real result lands, not an invented placeholder exercise.
 */

import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import type { UserContext } from '../types/user-context.types';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { generateHomeWorkoutTrio } from '../../services/home-workout.service';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED } from '@/config/feature-flags';

const FULL_STRENGTH_WORKOUT_CACHE_CAP = 10;
const fullStrengthWorkoutCache = new Map<string, GeneratedWorkout>();
// In-flight de-dup (commit 4/4, 26.08.2026): the home carousel now has TWO independent triggers
// that can call resolveFullStrengthWorkout for the same not-yet-cached id — the streaming
// engine's own prefetch-on-discover, and the carousel's onSettle backstop — without this, a
// settle landing mid-prefetch would fire a second, fully redundant generateHomeWorkoutTrio call.
const fullStrengthInFlight = new Map<string, Promise<GeneratedWorkout | null>>();

function cacheFullStrengthWorkout(suggestionId: string, workout: GeneratedWorkout): void {
  if (fullStrengthWorkoutCache.size >= FULL_STRENGTH_WORKOUT_CACHE_CAP) {
    const oldestKey = fullStrengthWorkoutCache.keys().next().value;
    if (oldestKey !== undefined) fullStrengthWorkoutCache.delete(oldestKey);
  }
  fullStrengthWorkoutCache.set(suggestionId, workout);
}

/** Read-only lookup for callers that already have a ranked Suggestion.id — mirrors
 *  recovery-follow-up.generator.ts's getCachedRecoveryWorkout exactly. Returns undefined on a
 *  cache miss (cap eviction, not yet resolved, or a suggestion from a different session/reload)
 *  — callers must degrade gracefully (keep showing a loading skeleton), not assume a hit. */
export function getCachedFullStrengthWorkout(suggestionId: string): GeneratedWorkout | undefined {
  return fullStrengthWorkoutCache.get(suggestionId);
}

/** Real detection, not a hardcoded guess: 'straight' as the baseline (warmup/cooldown are never
 *  superset/pyramid/tabata-tagged), plus superset/pyramid presence read off the same exercise
 *  fields the live player/preview dispatch on (pairedWith / pyramidSequence —
 *  advance-registry.ts's resolveExerciseProtocol uses the identical check). Exported: both the
 *  map real-branch below and resolveFullStrengthWorkout's home Tier-2 build need the identical
 *  logic on the same GeneratedWorkout shape. */
export function detectFullStrengthMethodsUsed(workout: GeneratedWorkout): string[] {
  const methodsUsed: string[] = ['straight'];
  if (workout.exercises.some((ex) => ex.pairedWith)) methodsUsed.push('superset');
  if (workout.exercises.some((ex) => Array.isArray(ex.pyramidSequence) && ex.pyramidSequence.length > 0)) {
    methodsUsed.push('pyramid');
  }
  if (workout.tabataBlock) methodsUsed.push('tabata');
  return methodsUsed;
}

/**
 * Tier-2 — the real, full build for one specific, already-ranked suggestion id. Called
 * immediately for the home carousel's focused/center card, and via background prefetch for the
 * (up to 2) others (17.8 build-plan Section 1) — never eagerly for every candidate.
 *
 * generateSingleOption+targetOptionIndex:1 computes only the balanced slot instead of all 3 trio
 * difficulty options — ~66% less generation work than the map real-branch below, which still
 * computes all 3 (left alone there; the win only matters where a UI is actually waiting on it,
 * which today is home's carousel, not map).
 */
export async function resolveFullStrengthWorkout(
  suggestionId: string,
  profile: UserFullProfile,
  context: UserContext,
): Promise<GeneratedWorkout | null> {
  const cached = fullStrengthWorkoutCache.get(suggestionId);
  if (cached) return cached;

  const inFlight = fullStrengthInFlight.get(suggestionId);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<GeneratedWorkout | null> => {
    const trio = await generateHomeWorkoutTrio({
      userProfile: profile,
      availableTime: context.availableTimeMin,
      difficulty: 2,
      generateSingleOption: true,
      targetOptionIndex: 1,
    });
    const { workout } = trio.options[1].result;
    if (workout.needsAssessment) return null;

    cacheFullStrengthWorkout(suggestionId, workout);
    return workout;
  })();

  fullStrengthInFlight.set(suggestionId, promise);
  try {
    return await promise;
  } finally {
    fullStrengthInFlight.delete(suggestionId);
  }
}

const FULL_STRENGTH_TRIO_OPTION_CACHE_CAP = 20;
const fullStrengthTrioOptionCache = new Map<string, GeneratedWorkout>();
// key: `${suggestionId}:${optionIndex}` — deliberately separate from fullStrengthWorkoutCache
// above (keyed by suggestionId alone), so resolving a non-balanced slot here can never touch
// what the hero card itself displays (always index 1, via resolveFullStrengthWorkout).
const fullStrengthTrioOptionInFlight = new Map<string, Promise<GeneratedWorkout | null>>();

/**
 * Regression fix (30.08.2026, "3 intensity toggles disappeared from the workout drawer"):
 * the old StatsOverview-hosted anchor always had all 3 trio difficulty slots pre-computed in
 * the background (its own generateHomeWorkoutTrio effect ran unconditionally on mount); the
 * new pre-workout carousel's hero card only ever resolves index 1/Balanced via
 * resolveFullStrengthWorkout above, on-demand, per suggestion. Switching to Easy/Intense
 * inside WorkoutPreviewDrawer's intensity toggle therefore had nothing to show. This is the
 * on-demand equivalent for the OTHER two slots — called lazily, only when the toggle is
 * actually tapped (David's explicit call: no background pre-generation of all 3 like before,
 * one real build per user action).
 *
 * index 1 delegates to resolveFullStrengthWorkout unchanged (same cache/suggestion-id key) —
 * not duplicated here. 0/2 use their own cache/in-flight map above, so a toggle tap can never
 * overwrite the hero card's own (always-index-1) cached content.
 */
export async function resolveFullStrengthWorkoutAtIndex(
  suggestionId: string,
  profile: UserFullProfile,
  context: UserContext,
  optionIndex: 0 | 1 | 2,
): Promise<GeneratedWorkout | null> {
  if (optionIndex === 1) return resolveFullStrengthWorkout(suggestionId, profile, context);

  const cacheKey = `${suggestionId}:${optionIndex}`;
  const cached = fullStrengthTrioOptionCache.get(cacheKey);
  if (cached) return cached;

  const inFlight = fullStrengthTrioOptionInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<GeneratedWorkout | null> => {
    // No `difficulty` field passed (unlike resolveFullStrengthWorkout's difficulty:2 above) —
    // verified against generateHomeWorkoutTrio's own body (home-workout.service.ts): only
    // options.targetDifficulty is ever read there, options.difficulty is not consulted at all.
    // TRAINING_DAY_CONFIGS[optionIndex] alone determines the actual difficulty (1/2/3 by slot).
    const trio = await generateHomeWorkoutTrio({
      userProfile: profile,
      availableTime: context.availableTimeMin,
      generateSingleOption: true,
      targetOptionIndex: optionIndex,
    });
    const { workout } = trio.options[optionIndex].result;
    if (workout.needsAssessment) return null;

    if (fullStrengthTrioOptionCache.size >= FULL_STRENGTH_TRIO_OPTION_CACHE_CAP) {
      const oldestKey = fullStrengthTrioOptionCache.keys().next().value;
      if (oldestKey !== undefined) fullStrengthTrioOptionCache.delete(oldestKey);
    }
    fullStrengthTrioOptionCache.set(cacheKey, workout);
    return workout;
  })();

  fullStrengthTrioOptionInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    fullStrengthTrioOptionInFlight.delete(cacheKey);
  }
}

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
      methodsUsed: detectFullStrengthMethodsUsed(workout),
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
