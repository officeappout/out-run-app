/**
 * suggestion-engine — the PULL entry point (doc §8): "מקבל UserContext, מחזיר רשימת
 * Suggestion מדורגת." Composes the generator registry (§7) with the ranker (§8.1).
 *
 * Live on the map surface today via useSuggestionEngineStore (DiscoverLayer.tsx), badge-only
 * (apply-ranked-slot-order.ts) — not yet driving real card selection/content on any surface,
 * and not called at all from home or post_workout. Wiring those is separate, staged work
 * (home-generator-v2 plan), not done here.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import { GENERATOR_REGISTRY } from './generator-registry';
import { rankSuggestions } from './rank-suggestions';

export async function runSuggestionEngine(context: UserContext): Promise<Suggestion[]> {
  // Each generator declares which surfaces it's meant for (Generator.surfaces) — enforce it
  // here, not just eligible(context), so a surface-specific generator (e.g. a future
  // post_workout-only one) can never leak into an unrelated surface's ranked results.
  const eligible = GENERATOR_REGISTRY.filter(
    (generator) => generator.surfaces.includes(context.surface) && generator.eligible(context),
  );

  const results = await Promise.all(
    eligible.map(async (generator) => {
      try {
        return await generator.generate(context);
      } catch (err) {
        console.error(`[suggestion-engine] generator "${generator.id}" threw`, err);
        return null;
      }
    }),
  );

  const candidates = results.filter((s): s is Suggestion => s !== null);
  return rankSuggestions(context, candidates);
}
