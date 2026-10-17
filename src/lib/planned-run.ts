/**
 * planned-run — the free-run drawer's chosen goal + settings, carried into a
 * run scheduled for later ("אחר כך").
 *
 * Before this, "שמור לאימונים" / "שתף אימון מתוזמן" only sent the date, time
 * and activity to /api/invite/run-session, so the goal the user had just set
 * (e.g. 5 ק״מ), the hybrid strength-stations split and the route extras were
 * silently dropped. The client builds a PlannedRunSettings, the route
 * re-validates it with `sanitizePlannedRun` (never trusts the body) and stores
 * it on the host's schedule entry and on the ephemeral group doc.
 *
 * Pure — no Firebase imports — so the API route, the client and tests share it.
 */

export type PlannedRunGoalType = 'time' | 'distance' | 'calories';

export interface PlannedRunSettings {
  /** time → minutes, distance → km, calories → kcal (the drawer's own units). */
  goal: { type: PlannedRunGoalType; value: number };
  /** Present only when "תחנות כוח בדרך" was on. 0–1 share of aerobic time. */
  hybrid?: { aerobicShare: number };
  /** Route extras the route request actually reads (route-request.utils). */
  route?: { includeStrength: boolean; surface: 'road' | 'trail' };
}

/** Generous sanity bounds (wider than the drawer's sliders), per goal type. */
const GOAL_BOUNDS: Record<PlannedRunGoalType, { min: number; max: number }> = {
  time:     { min: 1,   max: 600 },
  distance: { min: 0.1, max: 300 },
  calories: { min: 1,   max: 10000 },
};

export interface PlannedRunDrawerState {
  goalType: PlannedRunGoalType;
  timeValue: number;
  distanceValue: number;
  caloriesValue: number;
  hybridEnabled: boolean;
  aerobicShare: number;
  extras: { gymParks: boolean; trail: boolean };
}

/** Drawer state → the settings persisted with a scheduled run. */
export function buildPlannedRun(state: PlannedRunDrawerState): PlannedRunSettings {
  const value =
    state.goalType === 'time'     ? state.timeValue :
    state.goalType === 'distance' ? state.distanceValue :
                                    state.caloriesValue;
  const out: PlannedRunSettings = {
    goal: { type: state.goalType, value },
    route: { includeStrength: state.extras.gymParks, surface: state.extras.trail ? 'trail' : 'road' },
  };
  if (state.hybridEnabled) out.hybrid = { aerobicShare: state.aerobicShare };
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Server-side guard: returns a clean copy with only known keys, or null when
 * the input is absent/invalid (the run is then saved exactly as before).
 */
export function sanitizePlannedRun(raw: unknown): PlannedRunSettings | null {
  if (!isObj(raw) || !isObj(raw.goal)) return null;
  const type = raw.goal.type;
  const value = raw.goal.value;
  if (type !== 'time' && type !== 'distance' && type !== 'calories') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const b = GOAL_BOUNDS[type];
  if (value < b.min || value > b.max) return null;

  const out: PlannedRunSettings = { goal: { type, value } };

  if (isObj(raw.hybrid)) {
    const share = raw.hybrid.aerobicShare;
    if (typeof share === 'number' && Number.isFinite(share) && share >= 0 && share <= 1) {
      out.hybrid = { aerobicShare: share };
    }
  }
  if (isObj(raw.route)) {
    const { includeStrength, surface } = raw.route;
    if (typeof includeStrength === 'boolean' && (surface === 'road' || surface === 'trail')) {
      out.route = { includeStrength, surface };
    }
  }
  return out;
}
