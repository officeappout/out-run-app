/**
 * rankHybridCards — the situation-aware visibility + ranking layer for the map's
 * "מה עושים היום?" carousel (enable_hybrid_cards_v2). PURE: plain situation in, ordered
 * visible cards out, each with a one-line Hebrew reason. Cards that can't work in the current
 * situation are left out entirely (never a dead-end card).
 *
 *   walk_strength — a loop from the user's spot THROUGH a nearby equipped park, sized by
 *                   today's remaining steps + the remaining weekly strength sets.
 *                   Hidden: no GPS, no equipped park within smartParkRadiusM, or nothing
 *                   left to do (step goal met AND weekly strength spent).
 *   full_park     — walk to the park, full strength workout, walk back. Leads when a
 *                   strength workout is scheduled today; shown low when only budget remains;
 *                   hidden when strength is spent and nothing is scheduled.
 *   route_stops   — a published route with stops near the user or near what the user is
 *                   looking at on the map. Hidden when there is no such route, or when its
 *                   stops include no strength stop.
 *
 * Scores are additive and only used for ordering; ties keep the fixed order above.
 */

import {
  fullParkLightReason, fullParkReason, routeStopsReason, walkStrengthReason,
} from './hybrid-card-copy';
import { NORMAL_DECISION, resolveBudgetLightMode, type BudgetLightDecision } from '../../budget-light/policy';
import { remainingWeeklySets, sizeSmartSession, smartParkRadiusM } from './smart-sizing';
import { MIN_COHERENT_STATION_SETS } from '../weekly-budget-gate';
import type { HybridCardId, HybridSituation, RankedHybridCard } from './situation.types';

/** Max straight-line distance to the park for the full-park card (m). */
export const FULL_PARK_RADIUS_M = 2000;

const ORDER: HybridCardId[] = ['walk_strength', 'full_park', 'route_stops'];

export function isNight(hour: number): boolean {
  return hour >= 21 || hour < 5;
}

function weatherPenalty(flag: HybridSituation['weatherFlag']): number {
  if (flag === 'rain') return 15;
  if (flag === 'heat') return 10;
  if (flag === 'cold' || flag === 'uv') return 5;
  return 0;
}

/** Budget light mode (enable_budget_light_mode): the shared policy on the situation's strength sets. */
export function lightDecisionOf(s: HybridSituation): BudgetLightDecision {
  if (!s.budgetLight) return NORMAL_DECISION;
  return resolveBudgetLightMode({ enabled: true, entry: 'recommended', snapshot: s.strength });
}

export function rankWalkStrength(s: HybridSituation): RankedHybridCard | null {
  if (!s.flags.walkStrength || !s.hasGps) return null;
  const park = s.nearestEquippedPark;
  if (!park || park.distanceM > smartParkRadiusM(s.aerobicKind)) return null;
  const light = lightDecisionOf(s);
  const sizing = sizeSmartSession({
    steps: s.steps, strength: s.strength, kind: s.aerobicKind,
    parkDistanceM: park.distanceM, basePaceSecPerKm: s.basePaceSecPerKm,
    ...(light.mode === 'light' ? { light } : {}),
  });
  if (sizing.stepsSource === 'goal_met' && sizing.setsSource === 'spent') return null; // nothing left today

  let score = 50;
  if (s.steps && s.steps.stepGoal > 0 && s.steps.stepsRemaining > 0) {
    score += Math.round(25 * Math.min(1, s.steps.stepsRemaining / s.steps.stepGoal));
  }
  if (sizing.setsSource === 'budget') score += 10;
  if (s.todayScheduled === 'walk') score += 10;
  if (s.todayScheduled === 'strength') score -= 10; // the full park session fits a strength day better
  if (isNight(s.hour)) score -= 10;
  score -= weatherPenalty(s.weatherFlag);

  return {
    id: 'walk_strength', score, sizing, park,
    reason: walkStrengthReason(sizing, s.steps?.stepsRemaining ?? null, s.gender),
  };
}

export function rankFullPark(s: HybridSituation): RankedHybridCard | null {
  if (!s.flags.fullPark || !s.hasGps) return null;
  const park = s.nearestEquippedPark;
  if (!park || park.distanceM > FULL_PARK_RADIUS_M) return null;
  const remaining = remainingWeeklySets(s.strength);
  const scheduled = s.todayScheduled === 'strength';
  const light = lightDecisionOf(s);
  if (light.mode === 'light' && light.reasonKey) {
    // Budget light mode: spent budget → the card stays, as a lighter session with its "why".
    let score = scheduled ? 80 : 30;
    if (!s.hasStrengthProgram) score -= 10;
    if (s.todayScheduled === 'rest') score -= 15;
    if (isNight(s.hour)) score -= 15;
    score -= weatherPenalty(s.weatherFlag);
    return { id: 'full_park', score, park, reason: fullParkLightReason(light.reasonKey, s.gender) };
  }
  const budgetLeft = remaining != null && remaining >= MIN_COHERENT_STATION_SETS;
  if (!scheduled && remaining != null && !budgetLeft) return null; // strength spent, nothing scheduled

  const why: 'scheduled' | 'budget' | 'unknown' = scheduled ? 'scheduled' : budgetLeft ? 'budget' : 'unknown';
  let score = scheduled ? 90 : budgetLeft ? 45 : 35;
  if (!s.hasStrengthProgram) score -= 10;
  if (s.todayScheduled === 'rest') score -= 15;
  if (isNight(s.hour)) score -= 15;
  score -= weatherPenalty(s.weatherFlag);

  return { id: 'full_park', score, park, reason: fullParkReason(why, park, remaining, s.gender) };
}

export function rankRouteStops(s: HybridSituation): RankedHybridCard | null {
  if (!s.flags.routeStops || !s.hasGps) return null;
  // A strength stop is what makes it "מסלול + עצירות" — a route with only view/stretch stops
  // composed into a plain walk with no station (owner report 19.10.2026), so it is not offered.
  const usable = s.routesWithStops.filter((r) =>
    r.stopCount > 0 && r.strengthStopCount > 0 && r.sessionTypes.some((t) => t.implemented));
  if (usable.length === 0) return null;
  const route = [...usable].sort((a, b) =>
    (Number(b.focused) - Number(a.focused)) || (a.distanceFromUserM - b.distanceFromUserM))[0];

  let score = 55;
  if (route.focused) score += 30;
  score += Math.min(10, route.strengthStopCount * 5);
  if (s.todayScheduled === 'walk') score += 10;
  if (isNight(s.hour)) score -= 10;
  score -= weatherPenalty(s.weatherFlag);

  return { id: 'route_stops', score, route, reason: routeStopsReason(route, s.gender) };
}

export function rankHybridCards(s: HybridSituation): RankedHybridCard[] {
  const cards = [rankWalkStrength(s), rankFullPark(s), rankRouteStops(s)]
    .filter((c): c is RankedHybridCard => c != null);
  return cards.sort((a, b) => (b.score - a.score) || (ORDER.indexOf(a.id) - ORDER.indexOf(b.id)));
}
