/**
 * suggestion-engine — the PULL entry point (doc §8): "מקבל UserContext, מחזיר רשימת
 * Suggestion מדורגת." Composes the generator registry (§7) with the ranker (§8.1).
 *
 * Live on the map surface via useSuggestionEngineStore (DiscoverLayer.tsx), badge-only
 * (apply-ranked-slot-order.ts). Also live on home since Stage 3 (17.8 build-plan, 25.08.2026) —
 * home/page.tsx calls runSuggestionEngine(surface:'home') to drive the pre-workout suggestion
 * carousel, behind HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import { GENERATOR_REGISTRY } from './generator-registry';
import { rankSuggestions, scoreSuggestion, sumBreakdown } from './rank-suggestions';
import type { Generator } from '../types/generator.types';

// Each generator declares which surfaces it's meant for (Generator.surfaces) — enforce it here,
// not just eligible(context), so a surface-specific generator (e.g. a future post_workout-only
// one) can never leak into an unrelated surface's ranked results.
function getEligibleGenerators(context: UserContext): Generator[] {
  return GENERATOR_REGISTRY.filter(
    (generator) => generator.surfaces.includes(context.surface) && generator.eligible(context),
  );
}

export async function runSuggestionEngine(context: UserContext): Promise<Suggestion[]> {
  const eligible = getEligibleGenerators(context);

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

  let candidates = results.filter((s): s is Suggestion => s !== null);

  // post_workout dedup (Section K, 31.08.2026): route and complementary-short can both be
  // eligible at once (stepsRemaining>0 + a resolved location) — route wins, complementary-short
  // is dropped entirely rather than just re-ordered, so the carousel never shows both. A new rule
  // at this layer, not a change to either generator. No surface check needed: complementary-short
  // declares surfaces:['post_workout'] only, so its id can never appear in `candidates` unless
  // context.surface is already 'post_workout'.
  if (candidates.some((s) => s.generatorId === 'route')) {
    candidates = candidates.filter((s) => s.generatorId !== 'complementary-short');
  }

  return rankSuggestions(context, candidates);
}

/**
 * Streaming variant (17.8 build-plan Section 1, 26.08.2026): identical eligibility/generation to
 * runSuggestionEngine, but invokes `onSuggestion` with each scored Suggestion the moment its own
 * generator resolves — instead of waiting for every generator in Promise.all to settle before the
 * caller sees anything. Each Suggestion is independently scorable (scoreSuggestion never compares
 * across candidates), so streaming a per-suggestion score is exact, not an approximation — only
 * the FINAL array's relative order can still shift as later suggestions arrive, which is why the
 * resolved return value re-sorts once every generator has settled.
 *
 * Motivation: the home carousel wants to show its focused/center card and start real generation
 * for it as soon as ONE strong candidate exists, not after the slowest eligible generator on the
 * page settles (see full-strength.generator.ts's own Tier-1/Tier-2 split for the complementary
 * per-generator half of this optimization).
 *
 * Deliberately does NOT carry runSuggestionEngine's own post_workout route-vs-complementary-short
 * dedup (Section K, above): this function's only live caller (home/page.tsx) always passes
 * surface:'home', where complementary-short is never eligible. If this is ever called with
 * surface:'post_workout', add the same dedup here too — onSuggestion would otherwise still stream
 * the card the plain function suppresses.
 */
export async function runSuggestionEngineStreaming(
  context: UserContext,
  onSuggestion: (suggestion: Suggestion) => void,
): Promise<Suggestion[]> {
  const eligible = getEligibleGenerators(context);

  const results = await Promise.all(
    eligible.map(async (generator) => {
      try {
        const suggestion = await generator.generate(context);
        if (!suggestion) return null;
        const scoreBreakdown = scoreSuggestion(context, suggestion);
        const scored: Suggestion = { ...suggestion, scoreBreakdown, score: sumBreakdown(scoreBreakdown) };
        onSuggestion(scored);
        return scored;
      } catch (err) {
        console.error(`[suggestion-engine] generator "${generator.id}" threw`, err);
        return null;
      }
    }),
  );

  return results
    .filter((s): s is Suggestion => s !== null)
    .sort((a, b) => b.score - a.score);
}
