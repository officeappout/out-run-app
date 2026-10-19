/**
 * Situation-aware hybrid cards (enable_hybrid_cards_v2) — shared types.
 *
 * The map's "מה עושים היום?" carousel decides WHICH hybrid cards to show, in what order and
 * with what one-line reason, from a plain `HybridSituation` snapshot. Everything in this
 * folder except `useHybridSituation` / `smart-walk-backbone` is pure (no hooks, no I/O).
 */

import type { RouteSessionType } from './route-session-types';

export type AerobicKindLite = 'walking' | 'running';
export type UserGender = 'male' | 'female';

/** What today's schedule says (userSchedule/{uid}_{today}); 'unknown' = not loaded / no read. */
export type TodayScheduledKind = 'strength' | 'run' | 'walk' | 'rest' | 'none' | 'unknown';

export interface NearbyPark {
  id: string;
  name?: string;
  /** Straight-line distance from the user (m). */
  distanceM: number;
}

/** A published route near the user (or near the place the user is looking at on the map). */
export interface RouteWithStops {
  routeId: string;
  name?: string;
  /** Closest route vertex to the user (m). */
  distanceFromUserM: number;
  /** True when the route was found near the map focus (viewport centre / selected park). */
  focused: boolean;
  stopCount: number;
  strengthStopCount: number;
  /** What kinds of session this route can host (only 'walk_with_stops' is implemented). */
  sessionTypes: RouteSessionType[];
}

export interface StepSnapshot {
  stepsRemaining: number;
  stepGoal: number;
}

export interface StrengthBudgetSnapshot {
  weeklyBudget: number;
  totalSetsCompleted: number;
}

export interface HybridSituation {
  hasGps: boolean;
  aerobicKind: AerobicKindLite;
  gender?: UserGender;
  /** Nearest EQUIPPED fitness park (any distance — the ranker applies its own radius). */
  nearestEquippedPark: NearbyPark | null;
  routesWithStops: RouteWithStops[];
  /** null = no step data (health not connected / not loaded). */
  steps: StepSnapshot | null;
  /** null or weeklyBudget<=0 = unknown (store not initialised). */
  strength: StrengthBudgetSnapshot | null;
  todayScheduled: TodayScheduledKind;
  hasStrengthProgram: boolean;
  /** Local hour 0-23. */
  hour: number;
  weatherFlag?: 'rain' | 'heat' | 'cold' | 'uv' | null;
  /** Runner base pace (s/km) for the running walk-minutes estimate. */
  basePaceSecPerKm?: number;
  /** Per-card panel sub-flags (all already AND-ed with enable_hybrid_slots by the caller). */
  flags: { walkStrength: boolean; fullPark: boolean; routeStops: boolean };
}

export type HybridCardId = 'walk_strength' | 'full_park' | 'route_stops';

export interface SmartSessionSizing {
  walkKm: number;
  walkMin: number;
  strengthSets: number;
  strengthMin: number;
  timeBudgetMin: number;
  aerobicShare: number;
  stepsSource: 'steps' | 'goal_met' | 'unknown';
  setsSource: 'budget' | 'unknown' | 'spent';
}

export interface RankedHybridCard {
  id: HybridCardId;
  score: number;
  /** One short Hebrew line explaining why this card is here. */
  reason: string;
  /** walk_strength only. */
  sizing?: SmartSessionSizing;
  /** walk_strength / full_park: the park the session goes through. */
  park?: NearbyPark;
  /** route_stops only: the route the card is about. */
  route?: RouteWithStops;
}

/** The few profile fields the smart cards read (all optional — field-guards). */
export interface SmartProfileLite {
  id?: string;
  core?: { gender?: string | null } | null;
  running?: { paceProfile?: { basePace?: number | null } | null } | null;
}
