/**
 * route.generator — Generator retrofit for the standalone GPS route generator (§11.3).
 * Real translator, not a pure delegate: `route-generator.service.ts` predates
 * `WorkoutGenerationContext` entirely (doesn't import it) and needs inputs (`parks`,
 * `targetDistance`, `activity`) that `UserContext` doesn't carry as-is — this is the first
 * UserContext → native-params translator in the build plan, chosen first (per the plan)
 * because it's the cleanest, most standalone target: zero shared state with the
 * strength-generation side, zero prod-live flag, dark until something calls `generate()`.
 *
 * Reuses existing pieces only: `fetchRealParks` (the same cached park-list fetch the 3 map
 * compose paths already use) and `deriveAerobicTargetKm` (the same time-budget → distance
 * math `composeRouteStopsWorkout`/`composeHybridPlan` already use) — no new distance/parks
 * logic invented here.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { deriveAerobicTargetKm } from '../../hybrid/hybrid-aerobic.util';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED } from '@/config/feature-flags';

const DIFFICULTY_MAP = { easy: 1, medium: 2, hard: 3 } as const;

export const routeGenerator: Generator = {
  id: 'route',
  name: 'הליכה / מסלול',
  surfaces: ['map', 'home'],

  eligible: (context) => context.location !== null,

  generate: async (context): Promise<Suggestion | null> => {
    if (!context.location) return null;

    const activity = context.todayGoal === 'run' ? 'running' : 'walking';

    // Cheap ranking (see feature-flags.ts for the full rationale): the ranker only ever
    // reads difficulty/goalTags/requiresLocation off the winning Suggestion — never the
    // real route. A real Mapbox call here bought nothing but ~seconds of wasted latency.
    if (IS_CHEAP_SUGGESTION_RANKING_ENABLED) {
      return {
        id: `route-cheap-${context.userId}`,
        type: 'daily_workout',
        generatorId: 'route',
        title: activity === 'running' ? 'ריצה' : 'הליכה',
        structure: { segments: 1, durationMin: context.availableTimeMin },
        methodsUsed: [],
        difficulty: 2,
        goalTags: [activity === 'running' ? 'run' : 'walk'],
        surfaceEligibility: ['map', 'home'],
        requiresLocation: true,
        score: 0,
        scoreBreakdown: {
          goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
          recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0,
        },
      };
    }

    const targetDistance = deriveAerobicTargetKm(
      { timeBudgetMin: context.availableTimeMin, aerobicShare: 1, aerobicKind: activity },
      0, // no pace-calibration source wired yet — falls back to deriveAerobicTargetKm's own 6.5 min/km default
      { stepsRemaining: context.stepsRemaining, stepGoal: context.stepGoal }, // already plain numbers on UserContext
    );
    const parks = await fetchRealParks();

    const routes = await generateDynamicRoutes({
      userLocation: context.location,
      targetDistance,
      activity,
      routeGenerationIndex: 0,
      preferences: { includeStrength: false, maxRoutes: 1 },
      parks,
    });

    const top = routes[0];
    if (!top) return null;

    return {
      id: `route-${top.id}`,
      type: 'daily_workout',
      generatorId: 'route',
      title: top.name,
      structure: { segments: 1, durationMin: top.duration },
      methodsUsed: [],
      difficulty: DIFFICULTY_MAP[top.difficulty],
      goalTags: [activity === 'running' ? 'run' : 'walk'],
      surfaceEligibility: ['map', 'home'],
      requiresLocation: true,
      score: 0,
      scoreBreakdown: {
        goalMatch: 0,
        gapFilling: 0,
        stepDeficit: 0,
        preferenceMatch: 0,
        recoveryMatch: 0,
        locationBonus: 0,
        timeOfDayMatch: 0,
      },
    };
  },
};
