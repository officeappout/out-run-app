/**
 * route-stops.generator — Generator retrofit for composeHybridPlan's `route_stops` branch
 * (§11.3). Wraps the PUBLIC `composeHybridPlan(intent, ctx)` entry point rather than reaching
 * into the private `composeRouteStopsWorkout` — that function isn't exported, and going
 * through the real public dispatcher is more faithful anyway (it's the actual live call
 * path). Zero touched existing files.
 *
 * Dark by construction, not by a flag check here: `composeHybridPlan` itself returns null
 * for `mode:'route_stops'` while `MAP_ROUTE_STOPS_V1` is false (start-hybrid-session.ts) —
 * this wrapper inherits that dormancy for free, honestly, without duplicating the flag check.
 *
 * `Suggestion.difficulty` uses the plan's already-selected bolt (index 1 = balanced,
 * matching the existing UI default) — this generator does NOT attempt to expose the real
 * 3-difficulty model as 3 separate Suggestions; that's Gate D territory (see
 * .claude/plans/happy-jumping-flask.md part ד), not an engineering call to make here.
 *
 * Intent fidelity (added closing plan §ד gaps 1/2): builds the intent via
 * `presetToIntent(HYBRID_PRESETS.route_stops, timeBudgetMin)` — the SAME real preset object
 * `resolveSlots`'s `route_stops` slot uses (`hybrid-slots.ts:224`), including its `mode:
 * 'route_stops'` marker, instead of a hand-rolled literal.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import { composeHybridPlan } from '../../hybrid/start-hybrid-session';
import { HYBRID_PRESETS, presetToIntent } from '../../hybrid/hybrid-slots';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED } from '@/config/feature-flags';

export const routeStopsGenerator: Generator = {
  id: 'route-stops',
  name: 'מסלול רב-עצירות',
  surfaces: ['map'],

  eligible: (context) => context.location !== null,

  generate: async (context): Promise<Suggestion | null> => {
    if (!context.location) return null;

    // Cheap ranking (see feature-flags.ts) — see route.generator.ts for the same rationale.
    if (IS_CHEAP_SUGGESTION_RANKING_ENABLED) {
      return {
        id: `route-stops-cheap-${context.userId}`,
        type: 'daily_workout',
        generatorId: 'route-stops',
        title: 'מסלול רב-עצירות',
        structure: { segments: 1, durationMin: context.availableTimeMin },
        methodsUsed: [],
        difficulty: 2,
        goalTags: ['run', 'strength'],
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
      ...HYBRID_PRESETS.route_stops,
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
    const boltDifficulty = composed.bolts?.selectedIndex ?? 1;

    return {
      id: `route-stops-${Date.now()}`,
      type: 'daily_workout',
      generatorId: 'route-stops',
      title: 'מסלול רב-עצירות',
      structure: { segments: plan.segments.length, durationMin },
      methodsUsed: [],
      difficulty: ((boltDifficulty + 1) as 1 | 2 | 3),
      goalTags: ['run', 'strength'],
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
