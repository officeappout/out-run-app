/**
 * apply-ranked-slot-order — the map surface's explicit "apply" layer (plan §"סבב 9" חלק ב').
 * The screen calls this ITSELF, after calling the existing `resolveSlots` unchanged — this
 * function never runs inside `resolveSlots`, never replaces it, never hides where a result
 * came from.
 *
 * Safety-net, written as explicit early-returns so it's auditable at a glance: whenever the
 * ranking engine hasn't produced a usable result (not ready, errored, or ranked nothing that
 * maps to a real slot), this returns `baseSlots` completely unchanged — byte-identical to
 * today's behavior. Never fabricates a new slot; title/subtitle/accent always come from the
 * real resolver.
 *
 * Badge-only, NOT physical reordering (revised 08.08.2026 — real UX finding, not
 * implemented on a guess): resolveSlots' fast synchronous render happens before the async
 * ranking can possibly resolve, so physically moving cards once ranking arrives would make
 * the carousel visibly "jump" a moment after load. Position is purely cosmetic — tapping any
 * slot, in any position, already calls the SAME intent regardless of array order — so this
 * only flips WHICH slot carries `recommended: true`. If the ranked winner already matches
 * resolveSlots' own default recommended slot (the expected common case), this returns
 * `baseSlots` by reference, completely unchanged — no new array, no re-render at all.
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

  const currentRecommendedId = baseSlots.find((slot) => slot.recommended)?.id;
  if (currentRecommendedId === winnerSlotId) return baseSlots; // already agrees -> unchanged

  return baseSlots.map((slot) => (slot.recommended !== (slot.id === winnerSlotId)
    ? { ...slot, recommended: slot.id === winnerSlotId }
    : slot));
}
