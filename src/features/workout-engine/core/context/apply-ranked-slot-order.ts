/**
 * apply-ranked-slot-order — the map surface's explicit "apply" layer (plan §"סבב 9" חלק ב').
 * The screen calls this ITSELF, after calling the existing `resolveSlots` unchanged — this
 * function never runs inside `resolveSlots`, never replaces it, never hides where a result
 * came from.
 *
 * Safety-net, written as explicit early-returns so it's auditable at a glance: whenever the
 * ranking engine hasn't produced a usable result (not ready, errored, or ranked nothing that
 * maps to a real slot), this returns `baseSlots` completely unchanged — byte-identical to
 * today's behavior. Only reorders/relabels EXISTING slot objects from `resolveSlots` — never
 * fabricates a new slot; title/subtitle/accent always come from the real resolver.
 */

import type { HybridSlot } from '../../hybrid/hybrid-slots';
import type { Suggestion } from '../types/suggestion.types';

const GENERATOR_ID_TO_SLOT_ID: Record<string, string> = {
  'anchor-loop': 'recommended',
  'full-park-workout': 'full_park',
  'route-stops': 'route_stops',
};

export function applyRankedSlotOrder(
  baseSlots: HybridSlot[],
  ranked: Suggestion[] | null,
): HybridSlot[] {
  if (!ranked || ranked.length === 0) return baseSlots;

  const winnerSlotId = ranked
    .map((s) => GENERATOR_ID_TO_SLOT_ID[s.generatorId])
    .find((slotId) => slotId != null && baseSlots.some((slot) => slot.id === slotId));

  if (!winnerSlotId) return baseSlots; // nothing ranked maps to a real slot -> unchanged

  const winnerIndex = baseSlots.findIndex((slot) => slot.id === winnerSlotId);
  if (winnerIndex === -1) return baseSlots;

  const reordered = [...baseSlots];
  const [winner] = reordered.splice(winnerIndex, 1);
  reordered.unshift({ ...winner, recommended: true });

  return reordered.map((slot, i) => (i === 0 ? slot : { ...slot, recommended: false }));
}
