/**
 * useSmartHybridSlots — the ONE seam DiscoverLayer uses for enable_hybrid_cards_v2.
 * Flag off (`enabled` false) → `slots` is null and nothing is read; the caller keeps its
 * existing resolveSlots path byte-identical.
 *
 *   slots          — the situation-ranked carousel (resolveSmartSlots(rankHybridCards(...)))
 *   keySuffix      — per-slot warm-cache key suffix (park / route / size)
 *   drawerParkId   — the equipped park the free-run "תחנות כוח" walk goes through; null =
 *                    no park within reach → the caller hides the toggle
 *   toDrawerIntent — the drawer's own intent, re-routed to the smart walk
 */

'use client';

import { useMemo } from 'react';
import type { HybridSlot, SlotEnv } from '../hybrid-slots';
import type { HybridStartIntent } from '../build-hybrid-input';
import { useHybridSituation } from './useHybridSituation';
import type { SmartProfileLite } from './situation.types';
import { rankHybridCards } from './rank-hybrid-cards';
import { resolveSmartSlots } from './resolve-smart-slots';
import { smartParkRadiusM } from './smart-sizing';
import { drawerIntentToSmart } from './drawer-smart-intent';

export interface SmartHybridSlots {
  slots: HybridSlot[] | null;
  keySuffix: (slotId: string) => string;
  drawerParkId: string | null;
  toDrawerIntent: (intent: HybridStartIntent) => HybridStartIntent;
}

export function useSmartHybridSlots(a: {
  enabled: boolean;
  env: SlotEnv;
  userLocation: { lat: number; lng: number } | null;
  profile: SmartProfileLite | null | undefined;
  hasStrengthProgram: boolean;
  weatherOn: boolean;
  /** Budget light mode (enable_budget_light_mode); absent/false → as before. */
  budgetLight?: boolean;
}): SmartHybridSlots {
  const on = a.enabled && a.env.enableHybridSlots;
  const situation = useHybridSituation({
    enabled: on,
    userLocation: a.userLocation,
    aerobicKind: a.env.aerobicKind,
    profile: a.profile,
    hasStrengthProgram: a.hasStrengthProgram,
    weatherOn: a.weatherOn,
    budgetLight: a.budgetLight === true,
    flags: {
      walkStrength: a.env.enableRecommendedHybrid,
      fullPark: a.env.enableFullParkWorkout,
      routeStops: a.env.enableRouteStops,
    },
  });

  const slots = useMemo(
    () => (on ? resolveSmartSlots(a.env, situation ? rankHybridCards(situation) : []) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [on, situation, a.env.hasGps, a.env.aerobicKind, a.env.hasEquippedPark, a.env.hasStrengthProgram,
      a.env.enableFullParkWorkout, a.env.enableRouteStops, a.env.enableRecommendedHybrid],
  );

  const suffixes = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots ?? []) if (s.cacheKeySuffix) m.set(s.id, s.cacheKeySuffix);
    return m;
  }, [slots]);

  const park = situation?.nearestEquippedPark ?? null;
  const drawerParkId = on && park && park.distanceM <= smartParkRadiusM(a.env.aerobicKind) ? park.id : null;
  const basePace = a.profile?.running?.paceProfile?.basePace ?? undefined;

  return {
    slots,
    keySuffix: (slotId) => suffixes.get(slotId) ?? '',
    drawerParkId,
    toDrawerIntent: (intent) => (drawerParkId ? drawerIntentToSmart(intent, drawerParkId, basePace) : intent),
  };
}
