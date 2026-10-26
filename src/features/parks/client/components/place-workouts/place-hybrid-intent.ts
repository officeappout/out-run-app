/**
 * A place's hybrid card → the HybridStartIntent the map's composer already takes. Pure.
 *   park  → 'smart_walk_strength' through that park (drawerIntentToSmart, enable_hybrid_cards_v2's shape)
 *   route → 'route_stops' on that published route (smart.routeId)
 */

import type { HybridStartIntent } from '@/features/workout-engine/hybrid/build-hybrid-input';
import { RECOMMENDED_AEROBIC_SHARE, shareToEmphasis } from '@/features/workout-engine/hybrid/build-hybrid-input';
import { drawerIntentToSmart } from '@/features/workout-engine/hybrid/smart-cards/drawer-smart-intent';
import type { PlaceWorkoutStart } from '@/features/workout-engine/place-fit';

export function hybridIntentFor(start: Extract<PlaceWorkoutStart, { kind: 'hybrid' }>, basePaceSecPerKm: number | null): HybridStartIntent {
  const base: HybridStartIntent = {
    timeBudgetMin: start.minutes,
    aerobicShare: RECOMMENDED_AEROBIC_SHARE,
    emphasis: shareToEmphasis(RECOMMENDED_AEROBIC_SHARE),
    aerobicKind: start.aerobicKind,
  };
  if (start.routeId) return { ...base, mode: 'route_stops', smart: { routeId: start.routeId } };
  if (start.parkId) return drawerIntentToSmart(base, start.parkId, basePaceSecPerKm ?? undefined);
  return base;
}
