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

/** Planning speed/energy assumptions per activity (unchanged values). */
const SPEED_KMH: Record<DrawerActivity, number> = { cycling: 20, running: 10, walking: 5 };
const KCAL_PER_KM: Record<DrawerActivity, number> = { cycling: 25, running: 70, walking: 50 };
const MIN_TARGET_KM = 0.5;

/** Convert the active goal to a target route length (km). */
export function computeTargetKm(goal: DrawerGoal, activity: DrawerActivity): number {
  if (goal.goalType === 'distance') return goal.distanceValue;
  if (goal.goalType === 'time') {
    return Math.max(MIN_TARGET_KM, (goal.timeValue / 60) * SPEED_KMH[activity]);
  }
  return Math.max(MIN_TARGET_KM, goal.caloriesValue / KCAL_PER_KM[activity]);
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
