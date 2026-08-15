/**
 * route-request.utils — pure goal→route-request mapping for FreeRunDrawer
 * (extracted for unit-testing, stability Phase 1, 08.07.2026).
 *
 * Extraction locks the CURRENT extras wiring in tests:
 *   gymParks → includeStrength (WORKING) · trail → surface (WORKING)
 *   circular / benches / stairs → intentionally NOT mapped yet (dead
 *   toggles — the tests document this; Phase 2 of the hybrid work wires
 *   them into the generic stop-candidate search).
 */

export type DrawerActivity = 'running' | 'walking' | 'cycling';
export type GoalType = 'time' | 'distance' | 'calories';

export interface DrawerExtras {
  circular: boolean;
  gymParks: boolean;
  benches: boolean;
  stairs: boolean;
  trail: boolean;
}

export interface DrawerGoal {
  goalType: GoalType;
  timeValue: number;      // minutes
  distanceValue: number;  // km
  caloriesValue: number;  // kcal
}

/**
 * Planning speed/energy assumptions per activity (unchanged values).
 * Exported (14.08.2026, Fix 3) so route-generator.service.ts's 3 route-
 * building call sites can share the SAME pace/calorie table instead of their
 * own inline `activity === 'cycling' ? 25 : 70` — the bug this fixes: running
 * duration used Mapbox's walking-paced estimate directly (no running
 * profile exists to ask for instead), and running/walking shared one
 * calorie rate despite this table already distinguishing them (70 vs 50).
 */
export const SPEED_KMH: Record<DrawerActivity, number> = { cycling: 20, running: 10, walking: 5 };
export const KCAL_PER_KM: Record<DrawerActivity, number> = { cycling: 25, running: 70, walking: 50 };
const MIN_TARGET_KM = 0.5;

/** Convert the active goal to a target route length (km). */
export function computeTargetKm(goal: DrawerGoal, activity: DrawerActivity): number {
  if (goal.goalType === 'distance') return goal.distanceValue;
  if (goal.goalType === 'time') {
    return Math.max(MIN_TARGET_KM, (goal.timeValue / 60) * SPEED_KMH[activity]);
  }
  return Math.max(MIN_TARGET_KM, goal.caloriesValue / KCAL_PER_KM[activity]);
}

/** Assumed average walking stride (meters/step) — used only to convert a raw
 * step-count target (e.g. steps_left from the step-goal push) into a route
 * distance target. Deliberately simple: no pace/time-of-day chunking — that's
 * a later design decision, this is the raw-gap test scope. */
const AVG_WALK_STRIDE_METERS = 0.75;

/** Convert a target step count into a route-generation distance (km). */
export function stepsToTargetKm(steps: number): number {
  const safeSteps = Number.isFinite(steps) && steps > 0 ? steps : 0;
  return Math.max(MIN_TARGET_KM, (safeSteps * AVG_WALK_STRIDE_METERS) / 1000);
}

export interface RouteGenRequest {
  targetKm: number;
  includeStrength: boolean;
  surface: 'road' | 'trail';
}

/**
 * Build the route-generation request from goal + extras.
 * NOTE: circular/benches/stairs are consciously ignored here today — they
 * are dead toggles pending the hybrid stop-candidate work (Phase 2). The
 * unit tests assert this so any future wiring is a DELIBERATE test change.
 */
export function buildRouteGenRequest(
  goal: DrawerGoal,
  activity: DrawerActivity,
  extras: DrawerExtras,
): RouteGenRequest {
  return {
    targetKm: computeTargetKm(goal, activity),
    includeStrength: extras.gymParks,
    surface: extras.trail ? 'trail' : 'road',
  };
}
