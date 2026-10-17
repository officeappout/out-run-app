import { describe, it, expect } from 'vitest';
import {
  buildPlannedRun, sanitizePlannedRun, plannedRunToDrawerState, stashPendingPlannedRun,
  consumePendingPlannedRun, PENDING_PLANNED_RUN_KEY, PLANNED_RUN_DRAWER_RANGES, type PlannedRunDrawerState,
} from '../planned-run';

const base: PlannedRunDrawerState = {
  goalType: 'distance',
  timeValue: 30,
  distanceValue: 5,
  caloriesValue: 350,
  hybridEnabled: false,
  aerobicShare: 0.5,
  extras: { gymParks: false, trail: false },
};

describe('buildPlannedRun', () => {
  it('keeps the chosen goal in the drawer units', () => {
    expect(buildPlannedRun(base).goal).toEqual({ type: 'distance', value: 5 });
    expect(buildPlannedRun({ ...base, goalType: 'time' }).goal).toEqual({ type: 'time', value: 30 });
    expect(buildPlannedRun({ ...base, goalType: 'calories' }).goal).toEqual({ type: 'calories', value: 350 });
  });

  it('carries the hybrid split only when strength stations are on', () => {
    expect(buildPlannedRun(base).hybrid).toBeUndefined();
    expect(buildPlannedRun({ ...base, hybridEnabled: true, aerobicShare: 0.6 }).hybrid).toEqual({ aerobicShare: 0.6 });
  });

  it('maps route extras the same way the route request does', () => {
    expect(buildPlannedRun(base).route).toEqual({ includeStrength: false, surface: 'road' });
    expect(buildPlannedRun({ ...base, extras: { gymParks: true, trail: true } }).route)
      .toEqual({ includeStrength: true, surface: 'trail' });
  });

  it('round-trips through the server sanitizer unchanged', () => {
    const built = buildPlannedRun({ ...base, hybridEnabled: true, extras: { gymParks: true, trail: false } });
    expect(sanitizePlannedRun(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });
});

describe('sanitizePlannedRun', () => {
  it('returns null for absent / malformed input', () => {
    expect(sanitizePlannedRun(undefined)).toBeNull();
    expect(sanitizePlannedRun(null)).toBeNull();
    expect(sanitizePlannedRun('x')).toBeNull();
    expect(sanitizePlannedRun({})).toBeNull();
    expect(sanitizePlannedRun({ goal: { type: 'pace', value: 5 } })).toBeNull();
    expect(sanitizePlannedRun({ goal: { type: 'time', value: '30' } })).toBeNull();
    expect(sanitizePlannedRun({ goal: { type: 'time', value: Number.NaN } })).toBeNull();
  });

  it('rejects out-of-range goals', () => {
    expect(sanitizePlannedRun({ goal: { type: 'time', value: 0 } })).toBeNull();
    expect(sanitizePlannedRun({ goal: { type: 'distance', value: 1e6 } })).toBeNull();
  });

  it('drops unknown keys and invalid optional parts', () => {
    expect(sanitizePlannedRun({
      goal: { type: 'time', value: 45, extra: 1 },
      hybrid: { aerobicShare: 7 },
      route: { includeStrength: 'yes', surface: 'road' },
      evil: true,
    })).toEqual({ goal: { type: 'time', value: 45 } });
  });
});

describe('plannedRunToDrawerState', () => {
  it('pre-fills the saved goal type and value, keeping the other defaults', () => {
    const s = plannedRunToDrawerState({ goal: { type: 'time', value: 45 } }, base);
    expect(s).toEqual({ ...base, goalType: 'time', timeValue: 45 });
  });

  it('round-trips what buildPlannedRun saved', () => {
    const chosen: PlannedRunDrawerState = {
      ...base,
      goalType: 'calories',
      caloriesValue: 400,
      hybridEnabled: true,
      aerobicShare: 0.6,
      extras: { gymParks: true, trail: true },
    };
    expect(plannedRunToDrawerState(buildPlannedRun(chosen), base)).toEqual(chosen);
  });

  it('turns hybrid on with the saved share, and off when absent', () => {
    expect(plannedRunToDrawerState({ goal: { type: 'distance', value: 8 }, hybrid: { aerobicShare: 0.7 } }, base))
      .toMatchObject({ distanceValue: 8, hybridEnabled: true, aerobicShare: 0.7 });
    expect(plannedRunToDrawerState({ goal: { type: 'distance', value: 8 } }, { ...base, hybridEnabled: true }))
      .toMatchObject({ hybridEnabled: false, aerobicShare: base.aerobicShare });
  });

  it('maps route settings to the drawer extras; keeps defaults when route is missing/invalid', () => {
    expect(plannedRunToDrawerState({ goal: { type: 'distance', value: 5 }, route: { includeStrength: true, surface: 'trail' } }, base)?.extras)
      .toEqual({ gymParks: true, trail: true });
    expect(plannedRunToDrawerState({ goal: { type: 'distance', value: 5 }, route: { includeStrength: 'yes', surface: 'trail' } }, base)?.extras)
      .toEqual(base.extras);
  });

  it('clamps/snaps to the drawer slider ranges', () => {
    expect(plannedRunToDrawerState({ goal: { type: 'time', value: 300 } }, base)?.timeValue).toBe(PLANNED_RUN_DRAWER_RANGES.time.max);
    expect(plannedRunToDrawerState({ goal: { type: 'distance', value: 0.2 } }, base)?.distanceValue).toBe(0.5);
    expect(plannedRunToDrawerState({ goal: { type: 'distance', value: 5.3 } }, base)?.distanceValue).toBe(5.5);
    expect(plannedRunToDrawerState({ goal: { type: 'calories', value: 333 } }, base)?.caloriesValue).toBe(350);
  });

  it('ignores invalid data (returns null → drawer keeps its defaults)', () => {
    expect(plannedRunToDrawerState(undefined, base)).toBeNull();
    expect(plannedRunToDrawerState({ goal: { type: 'pace', value: 5 } }, base)).toBeNull();
    expect(plannedRunToDrawerState({ goal: { type: 'time', value: Number.NaN } }, base)).toBeNull();
    expect(plannedRunToDrawerState({ goal: { type: 'time', value: -3 } }, base)).toBeNull();
    expect(plannedRunToDrawerState('{"goal":1}', base)).toBeNull();
  });
});

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    size: () => m.size,
  };
}

describe('stash / consume pending planned run', () => {
  const plan = { goal: { type: 'distance', value: 5 }, route: { includeStrength: false, surface: 'road' } };

  it('hands the settings to the map once, for the same activity', () => {
    const st = memStore();
    expect(stashPendingPlannedRun('running', plan, st, 1000)).toBe(true);
    expect(consumePendingPlannedRun('running', st, 2000)).toEqual(plan);
    expect(consumePendingPlannedRun('running', st, 2000)).toBeNull();
  });

  it('drops a stash for another activity, a stale one, or an invalid one', () => {
    const st = memStore();
    stashPendingPlannedRun('walking', plan, st, 0);
    expect(consumePendingPlannedRun('running', st, 10)).toBeNull();
    expect(st.size()).toBe(0);

    stashPendingPlannedRun('running', plan, st, 0);
    expect(consumePendingPlannedRun('running', st, 11 * 60 * 1000)).toBeNull();

    expect(stashPendingPlannedRun('running', { goal: { type: 'time', value: 0 } }, st, 0)).toBe(false);
    expect(st.size()).toBe(0);

    st.setItem(PENDING_PLANNED_RUN_KEY, 'not json');
    expect(consumePendingPlannedRun('running', st, 0)).toBeNull();
  });
});
