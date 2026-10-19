/**
 * Smart "הליכה + כוח" sizing (enable_hybrid_cards_v2) — pure.
 *
 *   walk     ← today's REMAINING steps (goal − steps so far) → kilometres
 *   strength ← the REMAINING weekly strength sets (budget − sets done) → sets for this session
 *
 * The result feeds the existing route-stops composer through plain intent fields
 * (timeBudgetMin = walk + strength minutes, aerobicShare = walk share), so the composer's own
 * planner sizes the stations from `timeBudgetMin − walk time` — no composer internals change.
 */

import { MIN_COHERENT_STATION_SETS } from '../weekly-budget-gate';
import type { BudgetLightDecision } from '../../budget-light/policy';
import { CYCLING_MIN_PER_KM, type HybridAerobicKind } from '../aerobic-kind';
import type {
  AerobicKindLite, SmartSessionSizing, StepSnapshot, StrengthBudgetSnapshot,
} from './situation.types';

/** Average stride (m/step). Walking ≈ 1,330 steps per km; running strides are longer. */
export const WALK_STRIDE_M = 0.75;
export const RUN_STRIDE_M = 1.05;

export const MIN_WALK_KM = 1;
export const MAX_WALK_KM = 8;
export const MAX_RUN_KM = 12;
/** A ride (free-run drawer "רכיבה" + stations). */
export const MAX_RIDE_KM = 30;
/** Step goal already met → a short loop through the park. */
export const GOAL_MET_WALK_KM = 1.5;
/** No step data at all → a regular medium loop. */
export const UNKNOWN_STEPS_WALK_KM = 2.5;

/** Weekly budget unknown (store not initialised) → a regular station. */
export const DEFAULT_SESSION_SETS = 6;
/** One session never takes more than this many sets, even with a big weekly balance. */
export const MAX_SESSION_SETS = 12;
/** Work + rest per set (min). */
export const MIN_PER_SET = 1.5;
/** Budget spent → the station still exists (core default downstream), but short. */
export const SPENT_BUDGET_STATION_MIN = 5;

/** Walking speed the hybrid composer already assumes (min/km). */
export const WALK_MIN_PER_KM = 12;

/** Max straight-line distance to the park the loop goes through (m). Beyond it → no card. */
export function smartParkRadiusM(kind: HybridAerobicKind): number {
  if (kind === 'cycling') return 5000;
  return kind === 'running' ? 2500 : 1200;
}

export function stepsToKm(steps: number, kind: AerobicKindLite): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  return (steps * (kind === 'running' ? RUN_STRIDE_M : WALK_STRIDE_M)) / 1000;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function sizeWalkKm(
  steps: StepSnapshot | null,
  kind: AerobicKindLite,
): { km: number; source: SmartSessionSizing['stepsSource'] } {
  const maxKm = kind === 'running' ? MAX_RUN_KM : MAX_WALK_KM;
  if (!steps || !(steps.stepGoal > 0) || !Number.isFinite(steps.stepsRemaining)) {
    return { km: UNKNOWN_STEPS_WALK_KM, source: 'unknown' };
  }
  if (steps.stepsRemaining <= 0) return { km: GOAL_MET_WALK_KM, source: 'goal_met' };
  return { km: round1(clamp(stepsToKm(steps.stepsRemaining, kind), MIN_WALK_KM, maxKm)), source: 'steps' };
}

export function remainingWeeklySets(strength: StrengthBudgetSnapshot | null): number | null {
  if (!strength || !Number.isFinite(strength.weeklyBudget) || strength.weeklyBudget <= 0) return null;
  return Math.max(0, strength.weeklyBudget - (strength.totalSetsCompleted || 0));
}

export function sizeStrengthSets(
  strength: StrengthBudgetSnapshot | null,
  light?: BudgetLightDecision | null,
): { sets: number; source: SmartSessionSizing['setsSource']; remaining: number | null } {
  const remaining = remainingWeeklySets(strength);
  // Budget light mode: a spent budget → a real but lighter strength part (never 0 sets).
  if (light?.mode === 'light' && light.setsCap) return { sets: light.setsCap, source: 'light', remaining };
  if (remaining == null) return { sets: DEFAULT_SESSION_SETS, source: 'unknown', remaining };
  if (remaining < MIN_COHERENT_STATION_SETS) return { sets: 0, source: 'spent', remaining };
  return { sets: Math.min(remaining, MAX_SESSION_SETS), source: 'budget', remaining };
}

export function walkMinutes(km: number, kind: HybridAerobicKind, basePaceSecPerKm?: number): number {
  if (kind === 'walking') return km * WALK_MIN_PER_KM;
  if (kind === 'cycling') return km * CYCLING_MIN_PER_KM;
  const pace = basePaceSecPerKm && basePaceSecPerKm > 0 ? basePaceSecPerKm / 60 : 6.5;
  return km * pace;
}

/**
 * The whole session. `parkDistanceM` makes sure the loop can reach the park and come back:
 * the walk is never shorter than the out-and-back to the park (+15% for real streets).
 */
export function sizeSmartSession(args: {
  steps: StepSnapshot | null;
  strength: StrengthBudgetSnapshot | null;
  kind: AerobicKindLite;
  parkDistanceM: number;
  basePaceSecPerKm?: number;
  /** Budget light mode decision (rank-hybrid-cards); absent → as before. */
  light?: BudgetLightDecision | null;
}): SmartSessionSizing {
  const walk = sizeWalkKm(args.steps, args.kind);
  const reachKm = round1((Math.max(0, args.parkDistanceM) * 2 * 1.15) / 1000);
  const walkKm = Math.max(walk.km, reachKm);
  const sets = sizeStrengthSets(args.strength, args.light);
  const walkMin = Math.round(walkMinutes(walkKm, args.kind, args.basePaceSecPerKm));
  const strengthMin = sets.source === 'spent' ? SPENT_BUDGET_STATION_MIN : Math.round(sets.sets * MIN_PER_SET);
  const timeBudgetMin = walkMin + strengthMin;
  const aerobicShare = timeBudgetMin > 0 ? clamp(walkMin / timeBudgetMin, 0.3, 0.85) : 0.55;
  return {
    walkKm, walkMin, strengthSets: sets.sets, strengthMin, timeBudgetMin,
    aerobicShare: Math.round(aerobicShare * 100) / 100,
    stepsSource: walk.source, setsSource: sets.source,
    ...(sets.source === 'light' && args.light?.reasonKey ? { lightReasonKey: args.light.reasonKey } : {}),
  };
}

/**
 * Walk minutes per km the route-stops station planner assumes for walking (the fixed walk
 * pace zone, 8:30–11:30 → midpoint 10:00). Used only to turn the REAL route into a time budget.
 */
export const PLANNER_WALK_MIN_PER_KM = 10;

/**
 * Time budget for the composed smart session: the planner computes strength = budget − walk
 * time, so budget = (real route km × the planner's pace) + the card's strength minutes.
 */
export function smartComposeBudgetMin(
  routeKm: number,
  kind: HybridAerobicKind,
  strengthMin: number,
  basePaceSecPerKm?: number,
): number {
  const perKm = kind === 'walking'
    ? PLANNER_WALK_MIN_PER_KM
    : kind === 'cycling'
      ? CYCLING_MIN_PER_KM
      : (basePaceSecPerKm && basePaceSecPerKm > 0 ? basePaceSecPerKm / 60 : 6.5);
  const km = Number.isFinite(routeKm) && routeKm > 0 ? routeKm : 0;
  return Math.max(10, Math.round(km * perKm + Math.max(0, strengthMin)));
}
