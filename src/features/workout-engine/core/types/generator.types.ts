/**
 * generator.types — the shared workout-generator contract (docs/architecture/
 * workout-recommendation-engine.md §7.1). TYPES ONLY, Step 1 of the build order (§11.1).
 *
 * A `Generator` builds a whole `Suggestion` from a `UserContext`; it does not know where it
 * will be displayed or why it was picked — the suggestion engine (§8, §11.5) owns ranking.
 */

import type { UserContext, UserContextSurface } from './user-context.types';
import type { Suggestion } from './suggestion.types';

export interface Generator {
  id: string;
  name: string;

  /** Can this generator produce a suggestion at all in the current context? (e.g. tabata
   *  needs `userLevel>=4` and `difficulty>=2`; running needs the running questionnaire done —
   *  UserContext.questionnaires.running.) */
  eligible: (context: UserContext) => boolean;

  /** Build a full `Suggestion`. Async because most real generators (home-workout.service,
   *  route-generator.service, composeHybridPlan's branches) already do async work
   *  (Firestore reads, route computation). Returns null when generation legitimately
   *  produces nothing (e.g. empty pool → rest-day fallback with no suggestion to rank). */
  generate: (context: UserContext) => Promise<Suggestion | null>;

  surfaces: UserContextSurface[];
}
