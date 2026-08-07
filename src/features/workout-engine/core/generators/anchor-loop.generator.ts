/**
 * anchor-loop.generator — Generator retrofit for composeHybridPlan's default/"recommended"
 * branch (§11.3) — the 3rd and last of the 3 map/hybrid generators. Wraps the PUBLIC
 * `composeHybridPlan(intent, ctx)` with `intent.mode` omitted (falls through past the
 * `full_park_workout`/`route_stops` branches into the default anchor-biased-loop path,
 * `start-hybrid-session.ts:759-925`).
 *
 * Profile: same pattern as the other 2 map generators — `composeHybridPlan`'s default
 * branch also reads `useUserStore.getState().profile` internally
 * (start-hybrid-session.ts:774); this wrapper supplies no profile, only intent+ctx.
 *
 * Gate D (plan §ד, NOT resolved by this commit — deliberately): this branch computes a
 * real difficulty value internally (fed into `generationContext.difficulty`) but never
 * exposes it as a selectable `bolts` field — the live UI hardcodes a static
 * `<DifficultyBolts difficulty={2}>` regardless of the actual composed value
 * (`HybridOverviewScreen.tsx:521-524`). This wrapper reports `difficulty: 2` to match
 * CURRENT UI behavior honestly, not to "fix" the gap silently — surfacing the real value
 * is a product decision (Gate D), not an engineering call to make here.
 */

import type { Generator } from '../types/generator.types';
import type { Suggestion } from '../types/suggestion.types';
import { composeHybridPlan } from '../../hybrid/start-hybrid-session';

export const anchorLoopGenerator: Generator = {
  id: 'anchor-loop',
  name: 'המומלץ',
  surfaces: ['map'],

  eligible: (context) => context.location !== null,

  generate: async (context): Promise<Suggestion | null> => {
    if (!context.location) return null;

    const composed = await composeHybridPlan(
      {
        timeBudgetMin: context.availableTimeMin,
        aerobicShare: 0.5,
        emphasis: 'balanced',
        aerobicKind: context.todayGoal === 'run' ? 'running' : 'walking',
      },
      {
        userPosition: context.location,
        startRun: () => {},
      },
    );
    if (!composed) return null;

    const { plan } = composed;
    const durationMin = Math.round(plan.totals.aerobicMin + plan.totals.strengthMin);

    return {
      id: `anchor-loop-${Date.now()}`,
      type: 'daily_workout',
      generatorId: 'anchor-loop',
      title: 'המומלץ',
      structure: { segments: plan.segments.length, durationMin },
      methodsUsed: [],
      difficulty: 2, // Gate D — see file header; NOT the real internal value, matches current UI
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
        timeOfDayMatch: 0,
      },
    };
  },
};
