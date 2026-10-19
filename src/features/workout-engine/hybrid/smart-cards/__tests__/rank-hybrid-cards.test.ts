import { describe, it, expect } from 'vitest';
import { rankHybridCards, FULL_PARK_RADIUS_M } from '../rank-hybrid-cards';
import { sessionTypesForRoute } from '../route-session-types';
import type { HybridSituation, RouteWithStops } from '../situation.types';

const route = (over: Partial<RouteWithStops> = {}): RouteWithStops => {
  const base = { routeId: 'r1', name: 'טיילת', distanceFromUserM: 200, focused: false, stopCount: 3, strengthStopCount: 1, ...over };
  return { ...base, sessionTypes: over.sessionTypes ?? sessionTypesForRoute(base) };
};

const sit = (over: Partial<HybridSituation> = {}): HybridSituation => ({
  hasGps: true,
  aerobicKind: 'walking',
  gender: 'male',
  nearestEquippedPark: { id: 'p1', name: 'גינת הכושר', distanceM: 400 },
  routesWithStops: [route()],
  steps: { stepsRemaining: 4200, stepGoal: 8000 },
  strength: { weeklyBudget: 40, totalSetsCompleted: 38 - 2 }, // 4 left
  todayScheduled: 'none',
  hasStrengthProgram: true,
  hour: 17,
  weatherFlag: null,
  flags: { walkStrength: true, fullPark: true, routeStops: true },
  ...over,
});
const ids = (s: HybridSituation) => rankHybridCards(s).map((c) => c.id);

describe('rankHybridCards — visibility', () => {
  it('everything available → all three cards', () => {
    expect(ids(sit()).sort()).toEqual(['full_park', 'route_stops', 'walk_strength']);
  });

  it('no GPS → nothing', () => {
    expect(ids(sit({ hasGps: false }))).toEqual([]);
  });

  it('NO equipped park nearby → "הליכה + כוח" and the full park card do not appear at all', () => {
    expect(ids(sit({ nearestEquippedPark: null }))).toEqual(['route_stops']);
  });

  it('park beyond the walking radius hides walk_strength but full park can still reach it', () => {
    const r = ids(sit({ nearestEquippedPark: { id: 'p', distanceM: 1500 } }));
    expect(r).not.toContain('walk_strength');
    expect(r).toContain('full_park');
    expect(ids(sit({ nearestEquippedPark: { id: 'p', distanceM: FULL_PARK_RADIUS_M + 1 } }))).not.toContain('full_park');
  });

  it('running uses a wider radius for walk_strength', () => {
    expect(ids(sit({ aerobicKind: 'running', nearestEquippedPark: { id: 'p', distanceM: 1500 } }))).toContain('walk_strength');
  });

  it('step goal met AND weekly strength spent → no walk_strength', () => {
    const r = ids(sit({ steps: { stepsRemaining: 0, stepGoal: 8000 }, strength: { weeklyBudget: 40, totalSetsCompleted: 40 } }));
    expect(r).not.toContain('walk_strength');
  });

  it('strength spent and nothing scheduled → no full park; scheduled strength → full park anyway', () => {
    const spent = { weeklyBudget: 40, totalSetsCompleted: 40 };
    expect(ids(sit({ strength: spent }))).not.toContain('full_park');
    expect(ids(sit({ strength: spent, todayScheduled: 'strength' }))).toContain('full_park');
  });

  it('unknown budget (store not initialised) keeps full park, ranked low', () => {
    const r = rankHybridCards(sit({ strength: { weeklyBudget: 0, totalSetsCompleted: 0 } }));
    expect(r.map((c) => c.id)).toContain('full_park');
    expect(r[r.length - 1].id).toBe('full_park');
  });

  it('no route with stops near → no route_stops card', () => {
    expect(ids(sit({ routesWithStops: [] }))).not.toContain('route_stops');
    expect(ids(sit({ routesWithStops: [route({ stopCount: 0, strengthStopCount: 0 })] }))).not.toContain('route_stops');
  });

  it('each panel sub-flag hides its own card only', () => {
    expect(ids(sit({ flags: { walkStrength: false, fullPark: true, routeStops: true } }))).not.toContain('walk_strength');
    expect(ids(sit({ flags: { walkStrength: true, fullPark: false, routeStops: true } }))).not.toContain('full_park');
    expect(ids(sit({ flags: { walkStrength: true, fullPark: true, routeStops: false } }))).not.toContain('route_stops');
  });
});

describe('rankHybridCards — order', () => {
  it('a strength workout scheduled today puts the full park first', () => {
    expect(ids(sit({ todayScheduled: 'strength' }))[0]).toBe('full_park');
  });

  it('a big step gap puts walk + strength first', () => {
    expect(ids(sit({ steps: { stepsRemaining: 7000, stepGoal: 8000 } }))[0]).toBe('walk_strength');
  });

  it('browsing a route on the map puts route + stops first', () => {
    expect(ids(sit({ routesWithStops: [route({ focused: true })] }))[0]).toBe('route_stops');
  });

  it('prefers the focused route over a nearer one', () => {
    const card = rankHybridCards(sit({
      routesWithStops: [route({ routeId: 'near', distanceFromUserM: 50 }), route({ routeId: 'browsed', focused: true, distanceFromUserM: 1500 })],
    })).find((c) => c.id === 'route_stops');
    expect(card?.route?.routeId).toBe('browsed');
  });

  it('is deterministic and sorted by score', () => {
    const r = rankHybridCards(sit());
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    expect(rankHybridCards(sit())).toEqual(r);
  });

  it('night lowers the full park more than the walk', () => {
    const day = rankHybridCards(sit({ strength: { weeklyBudget: 40, totalSetsCompleted: 10 } }));
    const night = rankHybridCards(sit({ hour: 22, strength: { weeklyBudget: 40, totalSetsCompleted: 10 } }));
    const d = (r: typeof day, id: string) => r.find((c) => c.id === id)!.score;
    expect(d(day, 'full_park') - d(night, 'full_park')).toBeGreaterThan(d(day, 'walk_strength') - d(night, 'walk_strength'));
  });

  it('rain lowers every outdoor card', () => {
    const dry = rankHybridCards(sit());
    const wet = rankHybridCards(sit({ weatherFlag: 'rain' }));
    for (const c of wet) expect(c.score).toBeLessThan(dry.find((x) => x.id === c.id)!.score);
  });
});

describe('rankHybridCards — reason lines (Hebrew)', () => {
  it('walk_strength names the remaining steps and sets', () => {
    const c = rankHybridCards(sit({ strength: { weeklyBudget: 40, totalSetsCompleted: 38 } , steps: { stepsRemaining: 4200, stepGoal: 8000 } }))
      .find((x) => x.id === 'walk_strength');
    // 2 sets left = spent → still the steps line
    expect(c?.reason).toContain('4,200 צעדים');
    const c2 = rankHybridCards(sit({ strength: { weeklyBudget: 40, totalSetsCompleted: 30 } })).find((x) => x.id === 'walk_strength');
    expect(c2?.reason).toBe('נשארו לך 4,200 צעדים ו־10 סטים של כוח');
  });

  it('male / female variants, never a slash', () => {
    const goalMet = { steps: { stepsRemaining: 0, stepGoal: 8000 }, strength: { weeklyBudget: 40, totalSetsCompleted: 30 } };
    const m = rankHybridCards(sit({ ...goalMet, gender: 'male' })).find((x) => x.id === 'walk_strength')!.reason;
    const f = rankHybridCards(sit({ ...goalMet, gender: 'female' })).find((x) => x.id === 'walk_strength')!.reason;
    expect(m).toContain('בוא ');
    expect(f).toContain('בואי ');
    for (const card of [...rankHybridCards(sit({ gender: 'female' })), ...rankHybridCards(sit({ gender: 'male' }))]) {
      expect(card.reason).not.toMatch(/\//);
      expect(card.reason.length).toBeGreaterThan(0);
    }
  });

  it('full park on a strength day says so', () => {
    const c = rankHybridCards(sit({ todayScheduled: 'strength' })).find((x) => x.id === 'full_park');
    expect(c?.reason).toContain('אימון כוח היום');
  });

  it('focused route reason is gendered', () => {
    const r = [route({ focused: true })];
    expect(rankHybridCards(sit({ routesWithStops: r, gender: 'female' })).find((x) => x.id === 'route_stops')!.reason).toContain('את מסתכלת');
    expect(rankHybridCards(sit({ routesWithStops: r, gender: 'male' })).find((x) => x.id === 'route_stops')!.reason).toContain('אתה מסתכל');
  });
});
