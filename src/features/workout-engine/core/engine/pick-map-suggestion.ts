/**
 * pick-map-suggestion — closes plan §ד's gap 1 (HybridSlot ↔ Suggestion adapter) and gap 2
 * (don't duplicate the recipe into Suggestion — hand back an intent, let the caller re-call
 * the real composer) for the 3 existing map/hybrid generators specifically.
 *
 * `Suggestion` is deliberately generic (doc §4.2, shared across every surface) — it does not
 * and should not carry a `HybridStartIntent`. This file is the one place that knows how to
 * turn a ranked map Suggestion BACK into the real intent the live slot carousel already
 * produces (`presetToIntent`, `hybrid-slots.ts`) — mirroring, in 3 short cases, exactly what
 * each generator's own `generate()` already builds internally (anchor-loop.generator.ts,
 * full-park-workout.generator.ts, route-stops.generator.ts). This small duplication (one
 * preset-selection line per generator) is the cost of keeping `Suggestion` a clean, portable
 * generic type — the alternative (stuffing an intent field onto Suggestion) would leak a
 * map-specific concept into a contract every surface shares.
 *
 * The result is a `HybridStartIntent`, NOT a `ComposedHybridSession` — the caller is
 * expected to feed it to the real `composeHybridPlan`/`composeAndShowOverview`
 * (start-hybrid-session.ts / DiscoverLayer.tsx) to get the actual session, exactly like a
 * real user tap does. This function does not call the composer itself.
 */

import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import { runSuggestionEngine } from './suggestion-engine';
import { HYBRID_PRESETS, presetToIntent } from '../../hybrid/hybrid-slots';
import type { HybridStartIntent } from '../../hybrid/build-hybrid-input';

const MAP_GENERATOR_IDS = ['anchor-loop', 'full-park-workout', 'route-stops'] as const;
type MapGeneratorId = (typeof MAP_GENERATOR_IDS)[number];

function isMapGeneratorId(id: string): id is MapGeneratorId {
  return (MAP_GENERATOR_IDS as readonly string[]).includes(id);
}

/**
 * Rebuilds the real `HybridStartIntent` for a map-surface Suggestion — the same
 * preset+`presetToIntent` construction each of the 3 map generators uses internally.
 * Returns null for a Suggestion from any other generator (not this adapter's concern).
 */
export function suggestionToHybridIntent(
  context: UserContext,
  suggestion: Suggestion,
): HybridStartIntent | null {
  if (!isMapGeneratorId(suggestion.generatorId)) return null;

  const aerobicKind = context.todayGoal === 'run' ? ('running' as const) : ('walking' as const);

  switch (suggestion.generatorId) {
    case 'anchor-loop': {
      const preset = aerobicKind === 'running' ? HYBRID_PRESETS.run_balanced : HYBRID_PRESETS.walk_balanced;
      return presetToIntent(preset, context.availableTimeMin);
    }
    case 'full-park-workout': {
      const preset = { ...HYBRID_PRESETS.full_park, aerobicKind };
      return presetToIntent(preset, context.availableTimeMin);
    }
    case 'route-stops': {
      const preset = { ...HYBRID_PRESETS.route_stops, aerobicKind };
      return presetToIntent(preset, context.availableTimeMin);
    }
  }
}

/**
 * Runs the full suggestion engine, then picks the top-ranked candidate that is one of the
 * 3 map generators and converts it to a real intent. Returns null when no map-surface
 * suggestion is eligible/ranked (e.g. no location) — the caller's existing fallback (today's
 * hardcoded `resolveSlots` "recommended" choice) should be used in that case, not an error.
 */
export async function pickTopMapIntent(
  context: UserContext,
): Promise<{ suggestion: Suggestion; intent: HybridStartIntent } | null> {
  const ranked = await runSuggestionEngine(context);
  for (const suggestion of ranked) {
    const intent = suggestionToHybridIntent(context, suggestion);
    if (intent) return { suggestion, intent };
  }
  return null;
}
