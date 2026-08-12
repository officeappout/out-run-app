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
 * Intent fidelity (added closing plan §ד gaps 1/2): builds the `HybridStartIntent` via the
 * SAME `presetToIntent(HYBRID_PRESETS.walk_balanced/run_balanced, timeBudgetMin)` the live
 * slot carousel already uses (`hybrid-slots.ts:172-173`), not a hand-rolled literal — so a
 * ranked winner from this generator produces an intent byte-identical in shape to a real
 * user tap on the "מומלץ לך" slot. Only `timeBudgetMin` differs by source: this reads
 * `context.availableTimeMin` (the contract's own time field) instead of
 * `preset.defaultTimeBudgetMin`.
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
import { HYBRID_PRESETS, presetToIntent } from '../../hybrid/hybrid-slots';
import { IS_CHEAP_SUGGESTION_RANKING_ENABLED } from '@/config/feature-flags';

export const anchorLoopGenerator: Generator = {
  id: 'anchor-loop',
  name: 'המומלץ',
  surfaces: ['map'],

  eligible: (context) => context.location !== null,

  generate: async (context): Promise<Suggestion | null> => {
    if (!context.location) return null;

    // Cheap ranking (see feature-flags.ts) — see route.generator.ts for the same rationale.
    // difficulty:2 already matched the real path's own Gate D hardcode (see file header).
    if (IS_CHEAP_SUGGESTION_RANKING_ENABLED) {
      return {
        id: `anchor-loop-cheap-${context.userId}`,
        type: 'daily_workout',
        generatorId: 'anchor-loop',
        title: 'המומלץ',
        structure: { segments: 1, durationMin: context.availableTimeMin },
        methodsUsed: [],
        difficulty: 2,
        goalTags: ['strength', 'walk'],
        surfaceEligibility: ['map'],
        requiresLocation: true,
        score: 0,
        scoreBreakdown: {
          goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
          recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0,
        },
      };
    }

    const preset = context.todayGoal === 'run' ? HYBRID_PRESETS.run_balanced : HYBRID_PRESETS.walk_balanced;
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
