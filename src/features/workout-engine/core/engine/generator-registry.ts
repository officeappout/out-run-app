/**
 * generator-registry — the list of all real Generators built so far (§11.3 retrofits).
 * Adding a new generator later means one new entry here, nothing else — the engine
 * (`suggestion-engine.ts`) and ranker (`rank-suggestions.ts`) don't need to change.
 *
 * Order matters on a score TIE: rankSuggestions' sort is stable, and candidates are built in
 * this array's order (suggestion-engine.ts: GENERATOR_REGISTRY.filter → Promise.all →
 * rankSuggestions) — a tie preserves registry order. recoveryFollowUpGenerator is listed before
 * safetyNetGenerator (26.08.2026 fix, confirmed on-device) specifically so a rest-day tie
 * (both goalTags:['recovery'], both scoring goalMatch-only after the double-dip fix in
 * safety-net.generator.ts) breaks toward the real generated recovery workout, not the generic
 * last-resort fallback. Keep this order if either generator's tags/scoring change again.
 */

import type { Generator } from '../types/generator.types';
import { routeGenerator } from '../generators/route.generator';
import { routeStopsGenerator } from '../generators/route-stops.generator';
import { fullParkWorkoutGenerator } from '../generators/full-park-workout.generator';
import { fullStrengthGenerator } from '../generators/full-strength.generator';
import { anchorLoopGenerator } from '../generators/anchor-loop.generator';
import { safetyNetGenerator } from '../generators/safety-net.generator';
import { recoveryFollowUpGenerator } from '../generators/recovery-follow-up.generator';
import { complementaryShortGenerator } from '../generators/complementary-short.generator';
import { partialCompletionGenerator } from '../generators/partial-completion.generator';

export const GENERATOR_REGISTRY: Generator[] = [
  routeGenerator,
  routeStopsGenerator,
  fullParkWorkoutGenerator,
  fullStrengthGenerator,
  anchorLoopGenerator,
  recoveryFollowUpGenerator,
  safetyNetGenerator,
  complementaryShortGenerator,
  partialCompletionGenerator,
];
