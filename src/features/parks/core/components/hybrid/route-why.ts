/**
 * route-why — the rows of the route card's "למה קיבלתי את המסלול הזה?" drawer (enable_map_tutorial_v1,
 * board M5, pilot note L10). PURE. Only facts the card already knows: no invented numbers.
 */
import type { CardTotal } from '@/features/workout-engine/hybrid/round-trip';

export type RouteWhyIcon = 'steps' | 'near' | 'strength' | 'plan';

export interface RouteWhyRow {
  icon: RouteWhyIcon;
  /** A `map` namespace key + its values (translated at render). */
  key: 'mapTutorial.why.steps' | 'mapTutorial.why.near' | 'mapTutorial.why.strength.one' | 'mapTutorial.why.strength.many' | 'mapTutorial.why.strength.unknown';
  values?: Record<string, string>;
}

export interface RouteWhyInput {
  /** The slot's own "why now" line (smart slots: the program / plan reason). Shown as a row as-is. */
  reason?: string | null;
  /** route_stops: the composed total (null until the settle-preview compose lands). */
  total?: CardTotal | null;
  /** The slot walks (route_stops / walking presets). */
  walks: boolean;
  /** The slot has strength stops at all (every hybrid slot; not aerobic_quick). */
  hasStrength: boolean;
}

export interface RouteWhy {
  rows: RouteWhyRow[];
  reason: string | null;
}

export function routeWhy(input: RouteWhyInput): RouteWhy {
  const rows: RouteWhyRow[] = [];
  if (input.walks) rows.push({ icon: 'steps', key: 'mapTutorial.why.steps' });
  rows.push({ icon: 'near', key: 'mapTutorial.why.near' });
  if (input.hasStrength) {
    const n = input.total?.stations;
    if (n == null || n <= 0) rows.push({ icon: 'strength', key: 'mapTutorial.why.strength.unknown' });
    else if (n === 1) rows.push({ icon: 'strength', key: 'mapTutorial.why.strength.one' });
    else rows.push({ icon: 'strength', key: 'mapTutorial.why.strength.many', values: { n: String(n) } });
  }
  const reason = input.reason?.trim() || null;
  return { rows, reason };
}
