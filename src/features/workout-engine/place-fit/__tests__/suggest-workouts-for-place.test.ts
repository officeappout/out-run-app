import { describe, expect, it } from 'vitest';
import {
  suggestWorkoutsForPlace, pickPlaceBanner, HYBRID_MAX_KM, MAX_SUGGESTIONS,
  type ParkPlace, type PlaceUserContext, type RoutePlace,
} from '..';
import { parkTraits, barKindOf } from '../park-traits';
import { parkNearRoute, nearestRouteKmFromPark } from '../place-geo';
import type { WorkoutRouteNeeds } from '../../players/running/lib/route-fit/types';
import { ORIGIN, at, makeRoute, profileWithClimb, qs, squareLoop } from '../../players/running/lib/route-fit/__tests__/fixtures';

const noPlan: PlaceUserContext = {
  persona: null,
  today: { strength: null, run: null, walk: null },
  hasStrengthPlan: false, hasRunPlan: false, hasWalkPlan: false,
  weeklyStrength: null, easyPaceSecPerKm: 360, afterDark: false,
};

const bars = [
  { id: 'e1', name: 'מתח', iconKey: 'pullupbar' },
  { id: 'e2', name: 'מקבילים', iconKey: 'parallelbars' },
  { id: 'e3', name: 'ספסל בטן' },
];
const park = (over: Partial<ParkPlace> = {}): ParkPlace => ({ kind: 'park', parkId: 'p1', equipment: bars, nearestRouteKm: null, ...over });

const easyNeeds: WorkoutRouteNeeds = { kind: 'easy', category: 'easy_run', targetKm: 5, durationMin: 30, hill: null, afterDark: false };
const hillNeeds: WorkoutRouteNeeds = { kind: 'interval', category: 'hill_short', targetKm: 6, durationMin: 35, hill: { repLengthM: 300, minGradePct: 5, reps: 6 } as never, afterDark: false };
const planRun = (needs: WorkoutRouteNeeds) => ({ workoutId: 'w1', week: 2, day: 3, title: 'ריצה מהתוכנית', needs });

const styles = (s: { style: string }[]) => s.map((x) => x.style);

describe('park-traits', () => {
  it('finds pull and dip bars by icon, pattern or name', () => {
    expect(barKindOf({ id: 'a', name: 'x', iconKey: 'parallelbars' })).toBe('push');
    expect(barKindOf({ id: 'a', name: 'x', iconKey: 'pullupbar' })).toBe('pull');
    expect(barKindOf({ id: 'a', name: 'x', movementPattern: 'vertical_pull' })).toBe('pull');
    expect(barKindOf({ id: 'a', name: 'מקבילים' })).toBe('push');
    expect(barKindOf({ id: 'a', name: 'ספסל בטן' })).toBeNull();
    const t = parkTraits(bars);
    expect(t).toMatchObject({ hasPullBar: true, hasDipBars: true });
    expect(t.highlightNames).toEqual(['מתח', 'מקבילים', 'ספסל בטן']);
  });
});

describe('suggestWorkoutsForPlace — park', () => {
  it('a strength day: the plan card first, flagged and starting the park workout', () => {
    const s = suggestWorkoutsForPlace(park(), { ...noPlan, hasStrengthPlan: true, today: { ...noPlan.today, strength: { title: 'גוף מלא' } } });
    expect(s[0]).toMatchObject({ style: 'strength', isFromPlan: true, planTitle: 'גוף מלא', start: { kind: 'park_strength', parkId: 'p1' } });
    expect(styles(s)).toEqual(['strength', 'strength_short']);
  });

  it('hybrid only with a route within 400 m', () => {
    expect(styles(suggestWorkoutsForPlace(park({ nearestRouteKm: 0.35 }), noPlan))).toContain('hybrid');
    expect(styles(suggestWorkoutsForPlace(park({ nearestRouteKm: HYBRID_MAX_KM + 0.05 }), noPlan))).not.toContain('hybrid');
    expect(styles(suggestWorkoutsForPlace(park({ nearestRouteKm: null }), noPlan))).not.toContain('hybrid');
  });

  it('no bars → no short pull/push card', () => {
    const s = suggestWorkoutsForPlace(park({ equipment: [{ id: 'x', name: 'ספסל' }] }), noPlan);
    expect(styles(s)).toEqual(['strength']);
  });

  it('weekly strength budget spent → no extra strength, a hybrid still fits', () => {
    const ctx = { ...noPlan, weeklyStrength: { weeklyBudget: 30, totalSetsCompleted: 29 } };
    const s = suggestWorkoutsForPlace(park({ nearestRouteKm: 0.2 }), ctx);
    expect(styles(s)).toEqual(['hybrid']);
    expect(pickPlaceBanner(park(), ctx, s)).toBe('budget_spent');
    // An uninitialised budget (0) is unknown, never "spent".
    expect(styles(suggestWorkoutsForPlace(park(), { ...noPlan, weeklyStrength: { weeklyBudget: 0, totalSetsCompleted: 0 } }))).toContain('strength');
  });

  it('no plan: the persona orders the styles; a walker gets a walking hybrid', () => {
    const p = park({ nearestRouteKm: 0.1 });
    expect(styles(suggestWorkoutsForPlace(p, { ...noPlan, persona: 'strength' }))[0]).toBe('strength');
    const walker = suggestWorkoutsForPlace(p, { ...noPlan, persona: 'walk' });
    expect(walker[0]).toMatchObject({ style: 'hybrid', start: { kind: 'hybrid', aerobicKind: 'walking' } });
    expect(suggestWorkoutsForPlace(p, { ...noPlan, persona: 'run' })[0].start).toMatchObject({ aerobicKind: 'running' });
  });

  it("today's run shows on a park page only with a route close by", () => {
    const ctx = { ...noPlan, hasRunPlan: true, today: { ...noPlan.today, run: planRun(easyNeeds) } };
    expect(suggestWorkoutsForPlace(park(), ctx).some((s) => s.isFromPlan)).toBe(false);
    const s = suggestWorkoutsForPlace(park({ nearestRouteKm: 0.2 }), ctx);
    expect(s[0]).toMatchObject({ isFromPlan: true, style: 'run_easy', start: { kind: 'planned_run', workoutId: 'w1' } });
  });

  it('never more than 3 cards, one per style', () => {
    const ctx = { ...noPlan, hasStrengthPlan: true, hasRunPlan: true, today: { strength: { title: 'כוח' }, run: planRun(easyNeeds), walk: null } };
    const s = suggestWorkoutsForPlace(park({ nearestRouteKm: 0.1 }), ctx);
    expect(s.length).toBe(MAX_SUGGESTIONS);
    expect(new Set(styles(s)).size).toBe(s.length);
  });
});

describe('suggestWorkoutsForPlace — route', () => {
  const loop5 = makeRoute({ id: 'loop5', distance: 5, path: squareLoop(5000) });
  const route = (r = loop5, parkNear: RoutePlace['parkNearRoute'] = null): RoutePlace => ({ kind: 'route', route: r, parkNearRoute: parkNear });

  it("today's run first when it fits, with the route on the start payload", () => {
    const ctx = { ...noPlan, hasRunPlan: true, today: { ...noPlan.today, run: planRun(easyNeeds) } };
    const s = suggestWorkoutsForPlace(route(), ctx);
    expect(s[0]).toMatchObject({ isFromPlan: true, style: 'run_easy', start: { kind: 'planned_run', routeId: 'loop5' } });
  });

  it("a run that doesn't fit the distance is not shown", () => {
    const long = { ...easyNeeds, targetKm: 40, durationMin: 200 };
    const ctx = { ...noPlan, hasRunPlan: true, today: { ...noPlan.today, run: planRun(long) } };
    const short = makeRoute({ id: 'short', distance: 1, path: squareLoop(1000) });
    expect(suggestWorkoutsForPlace(route(short), ctx).some((s) => s.isFromPlan)).toBe(false);
  });

  it('hills only when a climb meets the rep spec', () => {
    const hilly = makeRoute({ id: 'hilly', distance: 3, path: squareLoop(3000), elevationProfile: profileWithClimb(3000, 30, 1200, 330, 6) });
    const flat = makeRoute({ id: 'flat', distance: 3, path: squareLoop(3000), elevationProfile: { stepM: 30, elevationsM: Array(101).fill(5) } });
    const noData = makeRoute({ id: 'nodata', distance: 3, path: squareLoop(3000), maxGrade: 9 });
    const ctx = { ...noPlan, hasRunPlan: true, today: { ...noPlan.today, run: planRun(hillNeeds) } };
    const ok = suggestWorkoutsForPlace(route(hilly), ctx);
    expect(ok[0]).toMatchObject({ style: 'run_hills', isFromPlan: true, meta: { kind: 'hill_reps', reps: 6, climbAtKm: 1.2 } });
    expect(pickPlaceBanner(route(hilly), ctx, ok)).toBe('climb_for_plan');
    expect(suggestWorkoutsForPlace(route(flat), ctx).some((s) => s.style === 'run_hills')).toBe(false);
    expect(suggestWorkoutsForPlace(route(noData), ctx).some((s) => s.style === 'run_hills')).toBe(false);
  });

  it('hybrid only with a park on / beside the route', () => {
    expect(styles(suggestWorkoutsForPlace(route(), noPlan))).not.toContain('hybrid');
    const s = suggestWorkoutsForPlace(route(loop5, { name: 'גינת רוקח', atKm: 1.1, offRouteKm: 0.05 }), noPlan);
    expect(s.find((x) => x.style === 'hybrid')).toMatchObject({ meta: { kind: 'stop_at', km: 1.1 }, start: { kind: 'hybrid', routeId: 'loop5' } });
    expect(styles(suggestWorkoutsForPlace(route(loop5, { name: null, atKm: 1, offRouteKm: 0.6 }), noPlan))).not.toContain('hybrid');
  });

  it("a walker gets the plan's walk on the route, then walking alternatives, and no run", () => {
    const ctx: PlaceUserContext = { ...noPlan, persona: 'walk', hasWalkPlan: true, today: { ...noPlan.today, walk: { title: 'הליכה מהירה', minutes: 40 } } };
    const s = suggestWorkoutsForPlace(route(), ctx);
    expect(s[0]).toMatchObject({ style: 'walk', isFromPlan: true, durationMin: 40, start: { kind: 'route_activity', activity: 'walking' } });
    expect(styles(s)).not.toContain('run_easy');
  });

  it('after dark on an unlit route → the safety banner', () => {
    const unlit = makeRoute({ id: 'dark', distance: 5, path: squareLoop(5000), qualitySignals: qs({ lighting: { status: 'computed', litCoveragePct: 5, isLit: false } }) as never });
    const ctx = { ...noPlan, afterDark: true };
    const s = suggestWorkoutsForPlace(route(unlit), ctx);
    expect(pickPlaceBanner(route(unlit), ctx, s)).toBe('unlit_after_dark');
    expect(pickPlaceBanner(route(), noPlan, suggestWorkoutsForPlace(route(), noPlan))).toBeNull();
  });
});

describe('place-geo', () => {
  it('nearest on-foot route to a park, within the hybrid radius', () => {
    const near = makeRoute({ id: 'near', path: squareLoop(2000, 200) });
    const far = makeRoute({ id: 'far', path: squareLoop(2000, 3000) });
    const km = nearestRouteKmFromPark([near, far], ORIGIN);
    expect(km).not.toBeNull();
    expect(km!).toBeCloseTo(0.2, 1);
    expect(nearestRouteKmFromPark([far], ORIGIN)).toBeNull();
  });

  it('the first park along a route, from facility stops or fitness stations', () => {
    const path = squareLoop(4000);
    const r = makeRoute({
      id: 'r', path,
      facilityStops: [{ id: 's', name: 'גינת רוקח', lat: path[2][1], lng: path[2][0], waypointIndex: 2, priority: 'high' as never, type: 'gym_park', stopType: 'pit-stop' }],
      nearbyAmenities: [{ amenityId: 'a', category: 'fitness_station', distanceFromPathMeters: 30, location: { lat: path[1][1], lng: path[1][0] } }],
    });
    expect(parkNearRoute(r)).toMatchObject({ atKm: 1, offRouteKm: 0.03 });
    const water = makeRoute({ id: 'w', path, facilityStops: [{ id: 'x', name: 'ברזייה', lat: at(0, 0)[1], lng: at(0, 0)[0], waypointIndex: 0, priority: 'low' as never, type: 'water', stopType: 'journey' }] });
    expect(parkNearRoute(water)).toBeNull();
  });
});
