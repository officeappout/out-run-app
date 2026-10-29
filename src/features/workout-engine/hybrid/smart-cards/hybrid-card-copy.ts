/**
 * Copy for the situation-aware hybrid cards (enable_hybrid_cards_v2), from the `map` catalog (`hybrid.card.*`).
 * Simple website voice; the Hebrew has separate male and female strings (never "צא/י").
 * Pure — no I/O.
 */

import type { AerobicKindLite, NearbyPark, RouteWithStops, SmartSessionSizing, UserGender } from './situation.types';
import { budgetLightText } from '../../budget-light/copy';
import type { BudgetLightReasonKey } from '../../budget-light/policy';
import { makeLiveT } from '@/lib/i18n/live-t';
import { map } from '@/messages/ns/map';

type G = UserGender | undefined;
/** Hebrew picked male for everything but 'female' (an unknown / 'other' gender read the male string). */
const genderOf = (g: G): 'male' | 'female' => (g === 'female' ? 'female' : 'male');

const tMap = makeLiveT(map);

/** 4200 → "4,200" (deterministic, no locale dependency). */
export function formatCount(n: number): string {
  return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const km = (n: number) => (Math.round(n * 10) / 10).toString();

/** Walking minutes to the park (straight line × 1.2 for streets, 12 min/km). */
export function parkWalkMin(distanceM: number): number {
  return Math.max(1, Math.round(((distanceM * 1.2) / 1000) * 12));
}

export function walkStrengthTitle(kind: AerobicKindLite): string {
  return tMap(kind === 'running' ? 'hybrid.card.walkStrength.title.run' : 'hybrid.card.walkStrength.title.walk');
}

export function walkStrengthSubtitle(sizing: SmartSessionSizing, park: NearbyPark | undefined): string {
  return park?.name
    ? tMap('hybrid.card.walkStrength.subtitle.park', { km: km(sizing.walkKm), name: park.name })
    : tMap('hybrid.card.walkStrength.subtitle.nearest', { km: km(sizing.walkKm) });
}

export function walkStrengthReason(
  sizing: SmartSessionSizing,
  stepsRemaining: number | null,
  g: G,
): string {
  const steps = stepsRemaining != null ? formatCount(stepsRemaining) : null;
  if (sizing.setsSource === 'light' && sizing.lightReasonKey) {
    const why = budgetLightText(sizing.lightReasonKey, 'card', g);
    return sizing.stepsSource === 'steps' && steps ? tMap('hybrid.card.walkStrength.reason.light', { steps, why }) : why;
  }
  if (sizing.stepsSource === 'steps' && steps) {
    if (sizing.setsSource === 'budget') return tMap('hybrid.card.walkStrength.reason.stepsBudget', { steps, sets: sizing.strengthSets });
    if (sizing.setsSource === 'spent') return tMap('hybrid.card.walkStrength.reason.stepsSpent', { steps });
    return tMap('hybrid.card.walkStrength.reason.stepsOnly', { steps });
  }
  if (sizing.stepsSource === 'goal_met') {
    return tMap('hybrid.card.walkStrength.reason.goalMet', { gender: genderOf(g), sets: sizing.strengthSets });
  }
  return tMap('hybrid.card.walkStrength.reason.default', { gender: genderOf(g), km: km(sizing.walkKm) });
}

/**
 * Pilot O8 (29.10.2026): steps and weekly strength are both done. The card stays (last) and
 * says so, instead of leaving the map with a bare free walk and no word about the goal.
 */
export function goalReachedReason(g: G): string {
  return tMap('hybrid.card.goalReached', { gender: g ?? 'other' });
}

export function fullParkReason(
  why: 'scheduled' | 'budget' | 'unknown',
  park: NearbyPark,
  remainingSets: number | null,
  g: G,
): string {
  const min = parkWalkMin(park.distanceM);
  if (why === 'scheduled') return tMap('hybrid.card.fullPark.scheduled', { min });
  if (why === 'budget' && remainingSets != null) return tMap('hybrid.card.fullPark.budget', { sets: remainingSets });
  return tMap('hybrid.card.fullPark.nearby', { gender: genderOf(g), min });
}

/** Budget light mode: the full-park card's "why" when the strength budget is spent. */
export function fullParkLightReason(key: BudgetLightReasonKey, g: G): string {
  return budgetLightText(key, 'card', g);
}

export function routeStopsSubtitle(route: RouteWithStops): string {
  const name = route.name?.trim() || tMap('hybrid.card.routeStops.fallbackName');
  return tMap('hybrid.card.routeStops.subtitle', { name, count: route.stopCount });
}

export function routeStopsReason(route: RouteWithStops, g: G): string {
  const suffix = route.strengthStopCount > 0 ? tMap('hybrid.card.routeStops.strengthSuffix', { count: route.strengthStopCount }) : '';
  if (route.focused) {
    return tMap('hybrid.card.routeStops.reasonFocused', { gender: genderOf(g), count: route.stopCount, suffix });
  }
  return tMap('hybrid.card.routeStops.reasonNear', { count: route.stopCount, suffix });
}
