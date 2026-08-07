/**
 * suggestion-engine — the PULL entry point (doc §8): "מקבל UserContext, מחזיר רשימת
 * Suggestion מדורגת." Composes the generator registry (§7) with the ranker (§8.1).
 *
 * Not wired into any real UI surface yet (§11.5's next sub-steps — map first, per plan):
 * both real map-surface integration gaps found during pre-flight are still open —
 * (1) HybridSlot ↔ Suggestion needs an adapter layer, (2) HybridOverviewScreen needs the
 * real ComposedHybridSession after a winner is picked, ranking output alone isn't enough to
 * render it. This function is usable and testable today; wiring it to a screen is separate,
 * deliberately deferred work, not done here.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import { GENERATOR_REGISTRY } from './generator-registry';
import { rankSuggestions } from './rank-suggestions';

export async function runSuggestionEngine(context: UserContext): Promise<Suggestion[]> {
  const eligible = GENERATOR_REGISTRY.filter((generator) => generator.eligible(context));

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
