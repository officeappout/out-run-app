import { describe, it, expect } from 'vitest';
import { buildPlannedRun, sanitizePlannedRun, type PlannedRunDrawerState } from '../planned-run';

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
