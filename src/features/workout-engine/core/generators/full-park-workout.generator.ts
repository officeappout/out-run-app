/**
 * full-park-workout.generator — Generator retrofit for composeHybridPlan's
 * `full_park_workout` branch (§11.3). Wraps the PUBLIC `composeHybridPlan(intent, ctx)`
 * entry point (same pattern as route-stops.generator.ts), not the private
 * `composeFullParkWorkout` — that function isn't exported, and the public dispatcher is the
 * real live call path anyway.
 *
 * HIGHER STAKES than route-stops: `HYBRID_FULL_PARK_WORKOUT_ENABLED` is LIVE-TRUE in
 * production today (unlike `MAP_ROUTE_STOPS_V1`, which is still dark). This wrapper does not
 * touch `composeFullParkWorkout`/`park-out-and-back.ts`/`compose-park-workout.service.ts` —
 * it only calls the same public entry point real callers already use. No behavior change is
 * possible through this file alone: nothing calls `generate()` yet.
 *
 * Equivalence: `composeFullParkWorkout` resolves the user profile internally via
 * `useUserStore.getState().profile` (confirmed by reading the function) — this wrapper does
 * NOT need to supply a full profile object, only `intent`+`ctx`, exactly like
 * route-stops.generator.ts. `Suggestion.difficulty` uses the REAL selected bolt
 * (`composed.bolts.selectedIndex`) — full-park is the one of the 3 map branches that
 * genuinely produces a real 3-difficulty trio (per plan §א', "אישור Gate D" only affects the
 * anchor-loop branch, not this one).
 *
 * Intent fidelity (added closing plan §ד gaps 1/2): builds the intent via
 * `presetToIntent(HYBRID_PRESETS.full_park, timeBudgetMin)` — the SAME real preset object
 * `resolveSlots`'s `full_park` slot uses (`hybrid-slots.ts:199`), including its `mode:
 * 'full_park_workout'` marker, instead of a hand-rolled literal.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import { composeHybridPlan } from '../../hybrid/start-hybrid-session';
import { HYBRID_PRESETS, presetToIntent } from '../../hybrid/hybrid-slots';
import { nearestEquippedPark } from '../../hybrid/park-out-and-back';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED } from '@/config/feature-flags';

export const fullParkWorkoutGenerator: Generator = {
  id: 'full-park-workout',
  name: 'אימון מלא בפארק',
  surfaces: ['map'],

  eligible: (context) => context.location !== null,

  generate: async (context): Promise<Suggestion | null> => {
    if (!context.location) return null;

    // Cheap ranking (see feature-flags.ts) — no real compose (no Mapbox, no exercise
    // scoring). Still preserves the real self-exclusion the full compose applies today
    // (composeHybridPlan returns null with no nearby equipped park) via the same pure,
    // already-unit-tested nearestEquippedPark check against the already-cached park list
    // (fetchRealParks — no new network call once warm) — cheap, not free, but the ONLY
    // piece of real signal actually needed to keep this candidate honest.
    if (IS_CHEAP_SUGGESTION_RANKING_ENABLED) {
      const parks = await fetchRealParks();
      if (!nearestEquippedPark(context.location, parks)) return null;
      return {
        id: `full-park-workout-cheap-${context.userId}`,
        type: 'daily_workout',
        generatorId: 'full-park-workout',
        title: 'אימון מלא בפארק · הליכה + תחנת כוח',
        structure: { segments: 1, durationMin: context.availableTimeMin },
        methodsUsed: [],
        difficulty: 2,
        goalTags: ['strength', 'walk'],
        surfaceEligibility: ['map'],
        requiresLocation: true,
        score: 0,
        scoreBreakdown: {
          goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
          recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0, alreadyTrained: 0,
        },
      };
    }

    const preset = {
      ...HYBRID_PRESETS.full_park,
      aerobicKind: context.todayGoal === 'run' ? ('running' as const) : ('walking' as const),
    };
    const intent = presetToIntent(preset, context.availableTimeMin);

    const composed = await composeHybridPlan(
      intent,
      {
        userPosition: context.location,
        startRun: () => {},
      },
    );
    if (!composed) return null;

    const { plan } = composed;
    const durationMin = Math.round(plan.totals.aerobicMin + plan.totals.strengthMin);
    const boltIndex = composed.bolts?.selectedIndex ?? 1;

    return {
      id: `full-park-workout-${Date.now()}`,
      type: 'daily_workout',
      generatorId: 'full-park-workout',
      title: 'אימון מלא בפארק · הליכה + תחנת כוח',
      structure: { segments: plan.segments.length, durationMin },
      methodsUsed: [],
      difficulty: ((boltIndex + 1) as 1 | 2 | 3),
      goalTags: ['strength', 'walk'],
      surfaceEligibility: ['map'],
      requiresLocation: true,
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
