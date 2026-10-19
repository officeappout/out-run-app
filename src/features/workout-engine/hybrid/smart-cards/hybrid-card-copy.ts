/**
 * Hebrew copy for the situation-aware hybrid cards (enable_hybrid_cards_v2).
 * Simple website voice; male and female variants are separate strings (never "צא/י").
 * Pure — no I/O.
 */

import type { AerobicKindLite, NearbyPark, RouteWithStops, SmartSessionSizing, UserGender } from './situation.types';
import { budgetLightText } from '../../budget-light/copy';
import type { BudgetLightReasonKey } from '../../budget-light/policy';

type G = UserGender | undefined;
const pick = (g: G, male: string, female: string) => (g === 'female' ? female : male);

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
  return kind === 'running' ? 'ריצה + כוח' : 'הליכה + כוח';
}

export function walkStrengthSubtitle(sizing: SmartSessionSizing, park: NearbyPark | undefined): string {
  const through = park?.name ? `דרך ${park.name}` : 'דרך גינת הכושר הקרובה';
  return `${km(sizing.walkKm)} ק״מ ${through}`;
}

export function walkStrengthReason(
  sizing: SmartSessionSizing,
  stepsRemaining: number | null,
  g: G,
): string {
  const steps = stepsRemaining != null ? formatCount(stepsRemaining) : null;
  if (sizing.setsSource === 'light' && sizing.lightReasonKey) {
    const why = budgetLightText(sizing.lightReasonKey, 'card', g);
    return sizing.stepsSource === 'steps' && steps ? `נשארו לך ${steps} צעדים. ${why}` : why;
  }
  if (sizing.stepsSource === 'steps' && steps) {
    if (sizing.setsSource === 'budget') return `נשארו לך ${steps} צעדים ו־${sizing.strengthSets} סטים של כוח`;
    if (sizing.setsSource === 'spent') return `נשארו לך ${steps} צעדים. הכוח השבוע כבר סגור, אז עצירה קלה`;
    return `נשארו לך ${steps} צעדים להיום, עם עצירת כוח בדרך`;
  }
  if (sizing.stepsSource === 'goal_met') {
    return pick(g,
      `הצעדים של היום סגורים. בוא נשלים ${sizing.strengthSets} סטים של כוח`,
      `הצעדים של היום סגורים. בואי נשלים ${sizing.strengthSets} סטים של כוח`);
  }
  return pick(g,
    `צא לסיבוב של ${km(sizing.walkKm)} ק״מ עם עצירת כוח בגינה`,
    `צאי לסיבוב של ${km(sizing.walkKm)} ק״מ עם עצירת כוח בגינה`);
}

export function fullParkReason(
  why: 'scheduled' | 'budget' | 'unknown',
  park: NearbyPark,
  remainingSets: number | null,
  g: G,
): string {
  const min = parkWalkMin(park.distanceM);
  if (why === 'scheduled') return `יש לך אימון כוח היום. הגינה במרחק ${min} דק׳ הליכה`;
  if (why === 'budget' && remainingSets != null) return `נשארו לך ${remainingSets} סטים של כוח השבוע`;
  return pick(g,
    `אתה במרחק ${min} דק׳ הליכה מגינת כושר. אימון כוח מלא?`,
    `את במרחק ${min} דק׳ הליכה מגינת כושר. אימון כוח מלא?`);
}

/** Budget light mode: the full-park card's "why" when the strength budget is spent. */
export function fullParkLightReason(key: BudgetLightReasonKey, g: G): string {
  return budgetLightText(key, 'card', g);
}

export function routeStopsSubtitle(route: RouteWithStops): string {
  const name = route.name?.trim() || 'מסלול מסומן';
  return `${name} · ${route.stopCount} עצירות`;
}

export function routeStopsReason(route: RouteWithStops, g: G): string {
  const strength = route.strengthStopCount > 0 ? `, ${route.strengthStopCount} עם מתקני כוח` : '';
  if (route.focused) {
    return pick(g,
      `המסלול שאתה מסתכל עליו: ${route.stopCount} עצירות בדרך${strength}`,
      `המסלול שאת מסתכלת עליו: ${route.stopCount} עצירות בדרך${strength}`);
  }
  return `מסלול עם ${route.stopCount} עצירות ממש לידך${strength}`;
}
