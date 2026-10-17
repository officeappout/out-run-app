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

// ── Read side: a saved plannedRun → the free-run drawer ─────────────────────
//
// Starting a run from a scheduled entry ("ריצה מתוזמנת" → צא לריצה) pre-fills
// the drawer with what was saved. The stored object is re-validated here (it
// round-tripped through Firestore); anything invalid → null → drawer defaults.

/** The drawer's own slider ranges (FreeRunDrawer GoalSheet) — prefill clamps to them. */
export const PLANNED_RUN_DRAWER_RANGES: Record<PlannedRunGoalType, { min: number; max: number; step: number }> = {
  time:     { min: 5,   max: 120, step: 5 },
  distance: { min: 0.5, max: 100, step: 0.5 },
  calories: { min: 50,  max: 800, step: 50 },
};

function snapToRange(type: PlannedRunGoalType, value: number): number {
  const r = PLANNED_RUN_DRAWER_RANGES[type];
  const clamped = Math.min(r.max, Math.max(r.min, value));
  const snapped = r.min + Math.round((clamped - r.min) / r.step) * r.step;
  // Avoid 0.1+0.2 noise on the 0.5 km step.
  return Math.min(r.max, Math.round(snapped * 100) / 100);
}

/**
 * Saved plannedRun → drawer state, starting from the drawer's own defaults
 * (`base`). Only the goal type + its value, the hybrid split and the two live
 * route extras change; the other goal values keep their defaults.
 * Returns null when the input doesn't validate.
 */
export function plannedRunToDrawerState(
  raw: unknown,
  base: PlannedRunDrawerState,
): PlannedRunDrawerState | null {
  const plan = sanitizePlannedRun(raw);
  if (!plan) return null;
  const value = snapToRange(plan.goal.type, plan.goal.value);
  return {
    ...base,
    goalType: plan.goal.type,
    timeValue:     plan.goal.type === 'time'     ? value : base.timeValue,
    distanceValue: plan.goal.type === 'distance' ? value : base.distanceValue,
    caloriesValue: plan.goal.type === 'calories' ? value : base.caloriesValue,
    hybridEnabled: !!plan.hybrid,
    aerobicShare: plan.hybrid ? plan.hybrid.aerobicShare : base.aerobicShare,
    extras: plan.route
      ? { gymParks: plan.route.includeStrength, trail: plan.route.surface === 'trail' }
      : { ...base.extras },
  };
}

// ── Hand-off: the start action → /map?openRun=… ─────────────────────────────
// The scheduled run's settings ride in sessionStorage (not the URL) for the one
// navigation to the map, where DiscoverLayer consumes them once.

export const PENDING_PLANNED_RUN_KEY = 'pending_planned_run';
/** A stash older than this is ignored (the user wandered off instead of running). */
const PENDING_PLANNED_RUN_TTL_MS = 10 * 60 * 1000;

type KVStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionStore(): KVStore | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Stash a (validated) plannedRun for the map. Invalid input → nothing stored. */
export function stashPendingPlannedRun(
  activity: 'running' | 'walking',
  raw: unknown,
  store: KVStore | null = sessionStore(),
  now: number = Date.now(),
): boolean {
  const plannedRun = sanitizePlannedRun(raw);
  if (!store) return false;
  try {
    if (!plannedRun) { store.removeItem(PENDING_PLANNED_RUN_KEY); return false; }
    store.setItem(PENDING_PLANNED_RUN_KEY, JSON.stringify({ activity, plannedRun, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

/** Read-once: returns the stash for `activity` (and always clears it). */
export function consumePendingPlannedRun(
  activity: string,
  store: KVStore | null = sessionStore(),
  now: number = Date.now(),
): PlannedRunSettings | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(PENDING_PLANNED_RUN_KEY);
    store.removeItem(PENDING_PLANNED_RUN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { activity?: unknown; plannedRun?: unknown; savedAt?: unknown };
    if (parsed.activity !== activity) return null;
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > PENDING_PLANNED_RUN_TTL_MS || parsed.savedAt > now + 60_000) return null;
    return sanitizePlannedRun(parsed.plannedRun);
  } catch {
    return null;
  }
}
