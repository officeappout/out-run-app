/**
 * build-hybrid-input — pure helpers that turn drawer intent into engine inputs
 * (Phase 3b). No React, no Firebase, no I/O.
 *
 * The continuous aerobic↔strength slider (design U2) yields an `aerobicShare`.
 * The MVP composer still takes the `emphasis` ENUM (the `aerobicShareOverride`
 * hook is documented but not yet consumed), so `shareToEmphasis` snaps the
 * slider to the nearest of the three anchors. The 3 anchors:
 *   aerobic 0.70 · balanced 0.55 · strength 0.35   (EMPHASIS_AEROBIC_SHARE).
 */

import type {
  HybridComposeInput,
  HybridEmphasis,
  AerobicKind,
} from './compose-hybrid-session.service';
import type { HybridShapeConfig } from './hybrid-shape';
import { shapeToComposeInput } from './hybrid-shape';

export type HybridGoalType = 'time' | 'distance' | 'calories';

/** Slider bounds (design U2): the middle band of the spectrum. */
export const AEROBIC_SHARE_MIN = 0.30;
export const AEROBIC_SHARE_MAX = 0.70;
/** The recommended default = the balanced anchor. */
export const RECOMMENDED_AEROBIC_SHARE = 0.55;

/** Drawer-captured intent; the parent composes the plan from it (item 2 seam). */
export interface HybridStartIntent {
  timeBudgetMin: number;
  /** Continuous slider value, 0.30–0.70. */
  aerobicShare: number;
  /** Nearest preset (what the MVP composer consumes). */
  emphasis: Exclude<HybridEmphasis, 'weekly_smart'>;
  aerobicKind: AerobicKind;
  /**
   * Strength difficulty (⚡ bolts → 1|2|3), threaded into
   * generationContext.difficulty so the slot's intensity actually drives
   * generateStrengthBlock. Omitted by the drawer path (slider has no ⚡
   * control) → composeHybridPlan keeps the historical default of 2, so the
   * drawer flow is byte-identical.
   */
  difficulty?: number;
  /**
   * Compose-branch selector (additive; Phase 0.2). When `'full_park_workout'`,
   * composeHybridPlan will (Phase 1) route to a dedicated composeParkWorkoutPlan
   * path — walk to a nearby equipped park, do the FULL home-recommended strength
   * workout there, walk back — reusing the home recommendation instead of the
   * ad-hoc station. Omitted / undefined → the existing budget-split path runs,
   * byte-identical. NOTE: nothing reads this field yet; it is scaffolding for the
   * Phase 1 branch.
   *
   * `'route_stops'` (MAP_ROUTE_STOPS_V1) → composeHybridPlan routes to
   * composeRouteStopsWorkout: a REAL official_route backbone + generic stops placed
   * on it (the generalization of full_park). Gated by the flag; omitted → unchanged.
   */
  mode?: 'full_park_workout' | 'route_stops';
}

/**
 * Snap a continuous share to the nearest emphasis anchor. Boundaries are the
 * anchor midpoints: strength|balanced = 0.45, balanced|aerobic = 0.625.
 */
export function shareToEmphasis(aerobicShare: number): Exclude<HybridEmphasis, 'weekly_smart'> {
  if (aerobicShare < 0.45) return 'strength';
  if (aerobicShare < 0.625) return 'balanced';
  return 'aerobic';
}

/** Minutes split for a budget + share (rounded; strength = remainder). */
export function splitMinutes(
  timeBudgetMin: number,
  aerobicShare: number,
): { aerobicMin: number; strengthMin: number } {
  const aerobicMin = Math.round(timeBudgetMin * aerobicShare);
  return { aerobicMin, strengthMin: Math.max(0, timeBudgetMin - aerobicMin) };
}

/** §4.2 shifting helper text keyed to the goal. `stations` = resolved count (MVP = 1). */
export function splitHelperText(
  goalType: HybridGoalType,
  timeBudgetMin: number,
  aerobicShare: number,
  stations: number,
): string {
  const { aerobicMin, strengthMin } = splitMinutes(timeBudgetMin, aerobicShare);
  const st = stations === 1 ? 'תחנה אחת' : `${stations} תחנות`;
  if (goalType === 'distance') {
    return `ריצה + ~${strengthMin} דק' כוח ב${st} (~${timeBudgetMin} דק' סה"כ).`;
  }
  if (goalType === 'calories') {
    return `שילוב — ריצה + ~${strengthMin} דק' כוח ב${st}.`;
  }
  return `מתוך ${timeBudgetMin} דק': ~${aerobicMin} תנועה · ~${strengthMin} כוח ב${st}.`;
}

/** Everything the caller must fetch/resolve before composing a sandwich session. */
export interface SandwichInputArgs {
  timeBudgetMin: number;
  emphasis: HybridEmphasis;
  aerobicKind: AerobicKind;
  paceProfile: HybridComposeInput['paceProfile'];
  routePath: HybridComposeInput['routePath'];
  stopCandidates: HybridComposeInput['stopCandidates'];
  masterExercises: HybridComposeInput['masterExercises'];
  filterContext: HybridComposeInput['filterContext'];
  generationContext: HybridComposeInput['generationContext'];
  weeklyGaps: HybridComposeInput['weeklyGaps'];
  userWeightKg: number;
  shape: HybridShapeConfig;
}

/**
 * Assemble a `HybridComposeInput` for the sandwich MVP. Pure: the caller fetches
 * the heavy data (exercise pool, contexts, pace, route + synthesized stop) and
 * passes it in. Applies the shape's compose deltas (sandwich → stationOverride 1).
 */
export function buildSandwichComposeInput(a: SandwichInputArgs): HybridComposeInput {
  return {
    timeBudgetMin: a.timeBudgetMin,
    emphasis: a.emphasis,
    aerobicKind: a.aerobicKind,
    paceProfile: a.paceProfile,
    routePath: a.routePath,
    stopCandidates: a.stopCandidates,
    masterExercises: a.masterExercises,
    filterContext: a.filterContext,
    generationContext: a.generationContext,
    weeklyGaps: a.weeklyGaps,
    userWeightKg: a.userWeightKg,
    ...shapeToComposeInput(a.shape), // sandwich → { stationOverride: 1 }
  };
}
