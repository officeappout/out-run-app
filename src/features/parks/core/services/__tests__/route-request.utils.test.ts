import { describe, it, expect } from 'vitest';
import { buildRouteGenRequest, computeTargetKm, type DrawerExtras, type DrawerGoal } from '../route-request.utils';

const goal = (over: Partial<DrawerGoal> = {}): DrawerGoal => ({
  goalType: 'time', timeValue: 30, distanceValue: 5, caloriesValue: 350, ...over,
});
const extras = (over: Partial<DrawerExtras> = {}): DrawerExtras => ({
  circular: false, gymParks: false, benches: false, stairs: false, trail: false, ...over,
});

describe('computeTargetKm', () => {
  it('distance goal passes through', () => {
    expect(computeTargetKm(goal({ goalType: 'distance', distanceValue: 4.2 }), 'running')).toBe(4.2);
  });
  it('time goal converts via planning speed (walk 5 / run 10 / cycle 20 km/h)', () => {
    expect(computeTargetKm(goal({ goalType: 'time', timeValue: 30 }), 'walking')).toBe(2.5);
    expect(computeTargetKm(goal({ goalType: 'time', timeValue: 30 }), 'running')).toBe(5);
    expect(computeTargetKm(goal({ goalType: 'time', timeValue: 30 }), 'cycling')).toBe(10);
  });
  it('calories goal converts via kcal/km (walk 50 / run 70 / cycle 25)', () => {
    expect(computeTargetKm(goal({ goalType: 'calories', caloriesValue: 350 }), 'running')).toBe(5);
    expect(computeTargetKm(goal({ goalType: 'calories', caloriesValue: 100 }), 'walking')).toBe(2);
  });
  it('floors at 0.5 km', () => {
    expect(computeTargetKm(goal({ goalType: 'time', timeValue: 1 }), 'walking')).toBe(0.5);
  });
});

describe('buildRouteGenRequest — extras wiring contract', () => {
  it('gymParks → includeStrength (WORKING toggle)', () => {
    expect(buildRouteGenRequest(goal(), 'running', extras({ gymParks: true })).includeStrength).toBe(true);
    expect(buildRouteGenRequest(goal(), 'running', extras()).includeStrength).toBe(false);
  });
  it('trail → surface (WORKING toggle)', () => {
    expect(buildRouteGenRequest(goal(), 'running', extras({ trail: true })).surface).toBe('trail');
    expect(buildRouteGenRequest(goal(), 'running', extras()).surface).toBe('road');
  });
  it('DOCUMENTED DEAD TOGGLES: circular/benches/stairs do not affect the request today — ' +
     'wiring them is DELIBERATE Phase-2 hybrid work and must change this test', () => {
    const base = buildRouteGenRequest(goal(), 'running', extras());
    const withDead = buildRouteGenRequest(goal(), 'running', extras({ circular: true, benches: true, stairs: true }));
    expect(withDead).toEqual(base);
  });
});
