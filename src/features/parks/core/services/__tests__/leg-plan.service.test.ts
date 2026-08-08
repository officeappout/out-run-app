import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSmartPathMock = vi.fn();

vi.mock('../mapbox.service', () => ({
  MapboxService: {
    getSmartPath: (...args: unknown[]) => getSmartPathMock(...args),
  },
}));

import {
  compileLegPlan,
  MAX_LEGS_PER_PLAN,
  LegPlanTooLongError,
  EmptyLegPlanError,
  LegPlanNoRouteError,
  type RouteLeg,
  type RouteLegPlan,
} from '../leg-plan.service';

const ORIGIN = { lat: 32.05, lng: 34.77 };
const legTo = (id: string, lat: number, lng: number): RouteLeg => ({
  kind: 'to_point',
  id,
  destination: { lat, lng },
});

beforeEach(() => {
  getSmartPathMock.mockReset();
});

describe('MAX_LEGS_PER_PLAN — derived from Mapbox\'s real coordinate limit, not a product-chosen number (David, 08.08)', () => {
  it('is exactly 24 (Mapbox\'s 25-coordinate cap minus 1 for the plan origin)', () => {
    expect(MAX_LEGS_PER_PLAN).toBe(24);
  });
});

describe('compileLegPlan — guards', () => {
  it('throws EmptyLegPlanError for a plan with zero legs', async () => {
    const plan: RouteLegPlan = { activity: 'running', origin: ORIGIN, legs: [] };
    await expect(compileLegPlan(plan)).rejects.toThrow(EmptyLegPlanError);
    expect(getSmartPathMock).not.toHaveBeenCalled();
  });

  it('throws LegPlanTooLongError for a plan exceeding MAX_LEGS_PER_PLAN, with a Hebrew user-facing message', async () => {
    const legs = Array.from({ length: MAX_LEGS_PER_PLAN + 1 }, (_, i) => legTo(`leg-${i}`, 32.05 + i * 0.01, 34.77));
    const plan: RouteLegPlan = { activity: 'running', origin: ORIGIN, legs };
    await expect(compileLegPlan(plan)).rejects.toThrow(LegPlanTooLongError);
    await expect(compileLegPlan(plan)).rejects.toThrow(/עצירות/);
    expect(getSmartPathMock).not.toHaveBeenCalled();
  });

  it('accepts a plan at exactly MAX_LEGS_PER_PLAN legs (boundary, not off-by-one)', async () => {
    getSmartPathMock.mockResolvedValue({
      path: [[34.77, 32.05], [34.78, 32.06]],
      distance: 5000,
      duration: 3600,
      steps: [],
      legs: [],
    });
    const legs = Array.from({ length: MAX_LEGS_PER_PLAN }, (_, i) => legTo(`leg-${i}`, 32.05 + i * 0.001, 34.77));
    const plan: RouteLegPlan = { activity: 'running', origin: ORIGIN, legs };
    await expect(compileLegPlan(plan)).resolves.toBeDefined();
  });

  it('throws LegPlanNoRouteError when Mapbox returns null (no route found)', async () => {
    getSmartPathMock.mockResolvedValue(null);
    const plan: RouteLegPlan = { activity: 'running', origin: ORIGIN, legs: [legTo('a', 32.06, 34.78)] };
    await expect(compileLegPlan(plan)).rejects.toThrow(LegPlanNoRouteError);
  });

  it('throws LegPlanNoRouteError when Mapbox returns an empty path', async () => {
    getSmartPathMock.mockResolvedValue({ path: [], distance: 0, duration: 0, steps: [], legs: [] });
    const plan: RouteLegPlan = { activity: 'running', origin: ORIGIN, legs: [legTo('a', 32.06, 34.78)] };
    await expect(compileLegPlan(plan)).rejects.toThrow(LegPlanNoRouteError);
  });

  it('rejects a via_point leg (not supported until capability ד\' ships)', async () => {
    const plan: RouteLegPlan = {
      activity: 'running',
      origin: ORIGIN,
      legs: [{ kind: 'via_point', id: 'v1', viaPoint: { lat: 32.06, lng: 34.78 }, destination: { lat: 32.07, lng: 34.79 } }],
    };
    await expect(compileLegPlan(plan)).rejects.toThrow(/via_point/);
    expect(getSmartPathMock).not.toHaveBeenCalled();
  });
});

describe('compileLegPlan — Mapbox call shape', () => {
  it('calls getSmartPath with origin, the LAST leg as end, and all other legs as intermediate waypoints (in order)', async () => {
    getSmartPathMock.mockResolvedValue({
      path: [[34.77, 32.05], [34.78, 32.06], [34.79, 32.07]],
      distance: 12000,
      duration: 7200,
      steps: [],
      legs: [{ distance: 6000, duration: 3600 }, { distance: 6000, duration: 3600 }],
    });
    const legA = legTo('a', 32.06, 34.78);
    const legB = legTo('b', 32.07, 34.79);
    const plan: RouteLegPlan = { activity: 'cycling', origin: ORIGIN, legs: [legA, legB] };

    await compileLegPlan(plan);

    expect(getSmartPathMock).toHaveBeenCalledTimes(1);
    const [start, end, profile, waypoints] = getSmartPathMock.mock.calls[0];
    expect(start).toEqual(ORIGIN);
    expect(end).toEqual(legB.kind === 'to_point' ? legB.destination : undefined); // last leg = end
    expect(profile).toBe('cycling');
    expect(waypoints).toEqual([legA.kind === 'to_point' ? legA.destination : undefined]); // all-but-last = intermediate waypoints
  });

  it('maps a running/walking activity to the "walking" Mapbox profile', async () => {
    getSmartPathMock.mockResolvedValue({ path: [[0, 0], [1, 1]], distance: 1000, duration: 600, steps: [], legs: [] });
    await compileLegPlan({ activity: 'running', origin: ORIGIN, legs: [legTo('a', 32.06, 34.78)] });
    const [, , profile] = getSmartPathMock.mock.calls[0];
    expect(profile).toBe('walking');
  });

  it('single-leg plan (no intermediate waypoints): end = the one leg, waypoints = []', async () => {
    getSmartPathMock.mockResolvedValue({ path: [[0, 0], [1, 1]], distance: 1000, duration: 600, steps: [], legs: [{ distance: 1000, duration: 600 }] });
    const leg = legTo('only', 32.06, 34.78);
    await compileLegPlan({ activity: 'running', origin: ORIGIN, legs: [leg] });
    const [start, end, , waypoints] = getSmartPathMock.mock.calls[0];
    expect(start).toEqual(ORIGIN);
    expect(end).toEqual(leg.destination);
    expect(waypoints).toEqual([]);
  });
});

describe('compileLegPlan — output shape', () => {
  it('builds a valid Route with distance/duration/calories derived from the Mapbox result', async () => {
    getSmartPathMock.mockResolvedValue({
      path: [[34.77, 32.05], [34.79, 32.07]],
      distance: 10000, // 10km
      duration: 6000, // 100min
      steps: [],
      legs: [{ distance: 10000, duration: 6000 }],
    });
    const result = await compileLegPlan({ activity: 'running', origin: ORIGIN, legs: [legTo('a', 32.07, 34.79)] });
    expect(result.route.distance).toBe(10);
    expect(result.route.duration).toBe(100);
    expect(result.route.calories).toBe(Math.round(10 * 65));
    expect(result.route.path).toEqual([[34.77, 32.05], [34.79, 32.07]]);
    expect(result.route.type).toBe('running');
  });

  it('legBreakdown is index-aligned with plan.legs and uses each leg\'s own id', async () => {
    getSmartPathMock.mockResolvedValue({
      path: [[0, 0], [1, 1], [2, 2]],
      distance: 20000,
      duration: 12000,
      steps: [],
      legs: [{ distance: 8000, duration: 4800 }, { distance: 12000, duration: 7200 }],
    });
    const legA = legTo('leg-alpha', 32.06, 34.78);
    const legB = legTo('leg-beta', 32.08, 34.80);
    const result = await compileLegPlan({ activity: 'walking', origin: ORIGIN, legs: [legA, legB] });

    expect(result.legBreakdown).toEqual([
      { legId: 'leg-alpha', distanceKm: 8, durationMin: 80 },
      { legId: 'leg-beta', distanceKm: 12, durationMin: 120 },
    ]);
  });

  it('legBreakdown is an empty array (not a crash) when Mapbox omits legs[]', async () => {
    getSmartPathMock.mockResolvedValue({ path: [[0, 0], [1, 1]], distance: 1000, duration: 600, steps: [] });
    const result = await compileLegPlan({ activity: 'running', origin: ORIGIN, legs: [legTo('a', 32.06, 34.78)] });
    expect(result.legBreakdown).toEqual([]);
  });
});
