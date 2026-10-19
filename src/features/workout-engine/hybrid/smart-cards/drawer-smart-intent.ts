/**
 * Free-run drawer "תחנות כוח" → the smart "הליכה + כוח" composition (enable_hybrid_cards_v2).
 * PURE. The drawer keeps the user's own parameters (time goal + aerobic/strength slider); only
 * the composition changes: a walk through the nearby equipped park instead of the old
 * one-station budget split.
 */

import type { HybridStartIntent } from '../build-hybrid-input';
import { MAX_RIDE_KM, MAX_RUN_KM, MAX_WALK_KM, MIN_WALK_KM, WALK_MIN_PER_KM } from './smart-sizing';
import { CYCLING_MIN_PER_KM } from '../aerobic-kind';

export function drawerIntentToSmart(
  intent: HybridStartIntent,
  parkId: string,
  basePaceSecPerKm?: number,
): HybridStartIntent {
  const walkMin = intent.timeBudgetMin * intent.aerobicShare;
  const minPerKm = intent.aerobicKind === 'walking'
    ? WALK_MIN_PER_KM
    : intent.aerobicKind === 'cycling'
      ? CYCLING_MIN_PER_KM
      : (basePaceSecPerKm && basePaceSecPerKm > 0 ? basePaceSecPerKm / 60 : 6.5);
  const maxKm = intent.aerobicKind === 'cycling' ? MAX_RIDE_KM : intent.aerobicKind === 'running' ? MAX_RUN_KM : MAX_WALK_KM;
  const targetKm = Math.round(Math.max(MIN_WALK_KM, Math.min(maxKm, walkMin / minPerKm)) * 10) / 10;
  return {
    ...intent,
    mode: 'smart_walk_strength',
    smart: { targetKm, parkId, strengthMin: Math.max(0, Math.round(intent.timeBudgetMin - walkMin)) },
  };
}
