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
 *
 * Tier-2 real-build resolver (17.8 build-plan Section 1 follow-up, 26.08.2026), mirroring
 * full-strength.generator.ts's own resolveFullStrengthWorkout: resolveRouteWorkout builds a
 * real Route for one specific, already-ranked suggestion id, on demand — never eagerly during
 * generate() (which stays on the cheap placeholder for ranking, per
 * IS_CHEAP_SUGGESTION_RANKING_ENABLED). Deliberately reuses useStepDeficitRoute.ts's OWN
 * distance formula (stepsToTargetKm) and generateDynamicRoutes call shape verbatim — NOT
 * deriveAerobicTargetKm (the formula generate()'s own real branch above uses) — per David's
 * explicit instruction: a home step-deficit route must match what useStepDeficitRoute's
 * existing rest-day card / the /map?openRun=walking&targetSteps= deep-link would produce for
 * the SAME user, not a second, independently-computed distance. Scoped to walking only
 * (stepsToTargetKm's own AVG_WALK_STRIDE_METERS math isn't valid for a running pace) — a
 * running-day suggestion stays on the cheap placeholder; not the ask here.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import type { UserContext } from '../types/user-context.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { deriveAerobicTargetKm } from '../../hybrid/hybrid-aerobic.util';
import { stepsToTargetKm } from '@/features/parks/core/services/route-request.utils';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED, IS_STEP_GOAL_SHORT_ROUTE_ENABLED } from '@/config/feature-flags';

const DIFFICULTY_MAP = { easy: 1, medium: 2, hard: 3 } as const;

const ROUTE_CACHE_CAP = 10;
const routeCache = new Map<string, Route>();
const routeInFlight = new Map<string, Promise<Route | null>>();

function cacheRoute(suggestionId: string, route: Route): void {
  if (routeCache.size >= ROUTE_CACHE_CAP) {
    const oldestKey = routeCache.keys().next().value;
    if (oldestKey !== undefined) routeCache.delete(oldestKey);
  }
  routeCache.set(suggestionId, route);
}

/** Read-only lookup, mirrors getCachedFullStrengthWorkout exactly. Returns undefined on a cache
 *  miss (cap eviction, not yet resolved, or a suggestion from a different session/reload). */
export function getCachedRoute(suggestionId: string): Route | undefined {
  return routeCache.get(suggestionId);
}

/**
 * Tier-2 — the real, full build for one specific, already-ranked suggestion id. Null when:
 * location is unavailable (shouldn't happen — route's own eligible() already requires it, but
 * defensive against a stale/rebuilt context), the step goal is already met (stepsRemaining<=0 —
 * matches useStepDeficitRoute's own "nothing to suggest" gate), or activity isn't walking
 * (see file header — stepsToTargetKm is walking-specific).
 */
export async function resolveRouteWorkout(
  suggestionId: string,
  context: UserContext,
): Promise<Route | null> {
  const cached = routeCache.get(suggestionId);
  if (cached) return cached;

  const inFlight = routeInFlight.get(suggestionId);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<Route | null> => {
    if (!context.location) return null;
    if (context.todayGoal === 'run') return null;
    if (context.stepsRemaining <= 0) return null;

    const targetDistance = stepsToTargetKm(context.stepsRemaining);
    const parks = await fetchRealParks();
    const routes = await generateDynamicRoutes({
      userLocation: context.location,
      targetDistance,
      activity: 'walking',
      routeGenerationIndex: 0,
      shortRouteMode: IS_STEP_GOAL_SHORT_ROUTE_ENABLED,
      preferences: { includeStrength: false, maxRoutes: 1, surface: 'road' },
      parks,
    });

    const top = routes[0];
    if (!top) return null;

    cacheRoute(suggestionId, top);
    return top;
  })();

  routeInFlight.set(suggestionId, promise);
  try {
    return await promise;
  } finally {
    routeInFlight.delete(suggestionId);
  }
}

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
          recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0, alreadyTrained: 0,
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
        timeOfDayMatch: 0, alreadyTrained: 0,
      },
    };
  },
};
