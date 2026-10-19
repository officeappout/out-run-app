import { describe, expect, it, vi } from 'vitest';
import { nearbyRunRoutes, suggestRoutesForWorkout } from '../suggest-routes-for-workout';
import type { WorkoutRouteNeeds } from '../types';
import { ORIGIN, makeRoute, profileWithClimb, squareLoop } from './fixtures';

const easy: WorkoutRouteNeeds = { kind: 'easy', category: 'easy_run', targetKm: 5, durationMin: 30, hill: null, afterDark: false };

describe('nearbyRunRoutes', () => {
  it('keeps on-foot routes within the radius, nearest first, capped', () => {
    const near = makeRoute({ id: 'near', path: squareLoop(5000, 100) });
    const mid = makeRoute({ id: 'mid', path: squareLoop(5000, 1500) });
    const far = makeRoute({ id: 'far', path: squareLoop(5000, 9000) });
    const bike = makeRoute({ id: 'bike', type: 'cycling', activityType: 'cycling', path: squareLoop(5000, 50) });
    expect(nearbyRunRoutes([far, mid, bike, near], ORIGIN, 2.5).map((r) => r.id)).toEqual(['near', 'mid']);
    expect(nearbyRunRoutes([far, mid, near], ORIGIN, 2.5, 1).map((r) => r.id)).toEqual(['near']);
  });
});

describe('suggestRoutesForWorkout', () => {
  it('returns up to 3 official routes best-first and skips the generator when enough are good', async () => {
    const routes = [
      makeRoute({ id: 'a', distance: 5, path: squareLoop(5000, 100), featureTags: ['water_fountain'] }),
      makeRoute({ id: 'b', distance: 2.5, path: squareLoop(2500, 300) }),
      makeRoute({ id: 'c', distance: 5, path: squareLoop(5000, 800) }),
      makeRoute({ id: 'd', distance: 5, path: squareLoop(5000, 1200) }),
      makeRoute({ id: 'too-long', distance: 20, path: squareLoop(20000, 50) }),
    ];
    const generateRoutes = vi.fn();
    const out = await suggestRoutesForWorkout(ORIGIN, easy, { deps: { getOfficialRoutes: async () => routes, generateRoutes } });
    expect(out).toHaveLength(3);
    expect(out[0].route.id).toBe('a');
    expect(out.map((s) => s.route.id)).not.toContain('too-long');
    expect(out.every((s) => !s.isGenerated)).toBe(true);
    expect(generateRoutes).not.toHaveBeenCalled();
  });

  it('tops up from the generator when official routes are thin', async () => {
    const generated = [makeRoute({ id: 'gen-1', distance: 5, path: squareLoop(5000) })];
    const generateRoutes = vi.fn(async () => generated);
    const out = await suggestRoutesForWorkout(ORIGIN, easy, {
      deps: { getOfficialRoutes: async () => [], generateRoutes },
      attempt: 2,
      cityName: 'תל אביב',
    });
    expect(generateRoutes).toHaveBeenCalledWith({ origin: ORIGIN, targetKm: 5, attempt: 2, cityName: 'תל אביב' });
    expect(out.map((s) => s.route.id)).toEqual(['gen-1']);
    expect(out[0].isGenerated).toBe(true);
  });

  it('survives a failing cache and a failing generator', async () => {
    const out = await suggestRoutesForWorkout(ORIGIN, easy, {
      deps: {
        getOfficialRoutes: async () => { throw new Error('offline'); },
        generateRoutes: async () => { throw new Error('mapbox'); },
      },
    });
    expect(out).toEqual([]);
  });

  it('hill workout: the route with the right climb comes first', async () => {
    const hill: WorkoutRouteNeeds = { ...easy, kind: 'interval', category: 'hill_short', targetKm: 6, hill: { repLengthM: 300, minGradePct: 5, reps: 6 } };
    const flat = makeRoute({ id: 'flat', distance: 3, path: squareLoop(3000, 50), elevationProfile: { stepM: 30, elevationsM: Array(101).fill(5) } });
    const hilly = makeRoute({ id: 'hilly', distance: 3, path: squareLoop(3000, 600), elevationProfile: profileWithClimb(3000, 30, 900, 330, 7) });
    const out = await suggestRoutesForWorkout(ORIGIN, hill, { allowGenerated: false, deps: { getOfficialRoutes: async () => [flat, hilly] } });
    expect(out[0].route.id).toBe('hilly');
    expect(out[0].score.reasons[0]).toMatch(/^עלייה של 7%/);
  });
});
