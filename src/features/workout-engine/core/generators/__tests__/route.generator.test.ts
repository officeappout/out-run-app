import { describe, it, expect, vi } from 'vitest';

// 17.8 build-plan Section 1 follow-up (26.08.2026) — Tier-2 real-build resolver for route,
// mirroring full-strength.generator.test.ts's convention. generate() itself is untouched
// (still the IS_CHEAP_SUGGESTION_RANKING_ENABLED placeholder for ranking), so only
// resolveRouteWorkout/getCachedRoute need coverage here.
vi.mock('@/features/parks/core/services/route-generator.service', () => ({
  generateDynamicRoutes: vi.fn(),
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({
  fetchRealParks: vi.fn().mockResolvedValue([]),
}));

import { generateDynamicRoutes } from '@/features/parks/core/services/route-generator.service';
import { getCachedRoute, resolveRouteWorkout } from '../route.generator';
import type { UserContext } from '../../types/user-context.types';
import type { Route } from '@/features/parks/core/types/route.types';

function makeContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'u1',
    baseLevel: 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
    todayCompletedDomains: [],
    todayGoal: null,
    stepGoal: 8000,
    stepsToday: 2000,
    stepsRemaining: 6000,
    availableTimeMin: 30,
    preferences: {},
    questionnaires: {},
    location: { lat: 32.08, lng: 34.78 },
    timeOfDay: 'morning',
    surface: 'home',
    venue: null,
    transitState: null,
    workdayState: null,
    activitySignal: null,
    ...overrides,
  };
}

const mockRoute = { id: 'r1', name: 'מסלול', distance: 4, duration: 40, score: 0, type: 'walking', difficulty: 'medium' } as unknown as Route;

describe('resolveRouteWorkout — Tier-2 real build', () => {
  it('calls generateDynamicRoutes with a walking activity + stepsToTargetKm-derived distance, caches by suggestion id', async () => {
    vi.mocked(generateDynamicRoutes).mockResolvedValue([mockRoute]);

    const resolved = await resolveRouteWorkout('sug-route-1', makeContext({ stepsRemaining: 6000 }));

    expect(generateDynamicRoutes).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: 'walking',
        preferences: expect.objectContaining({ includeStrength: false, maxRoutes: 1, surface: 'road' }),
      }),
    );
    const call = vi.mocked(generateDynamicRoutes).mock.calls[0][0] as { targetDistance: number };
    expect(call.targetDistance).toBeGreaterThan(0);
    expect(resolved).toBe(mockRoute);
    expect(getCachedRoute('sug-route-1')).toBe(mockRoute);
  });

  it('returns cached result on a second call without calling generateDynamicRoutes again', async () => {
    vi.mocked(generateDynamicRoutes).mockClear();
    const resolved = await resolveRouteWorkout('sug-route-1', makeContext());
    expect(resolved).toBe(mockRoute);
    expect(generateDynamicRoutes).not.toHaveBeenCalled();
  });

  it('returns null and skips the real call when location is unavailable', async () => {
    vi.mocked(generateDynamicRoutes).mockClear();
    const resolved = await resolveRouteWorkout('sug-route-no-location', makeContext({ location: null }));
    expect(resolved).toBeNull();
    expect(generateDynamicRoutes).not.toHaveBeenCalled();
  });

  it('returns null and skips the real call when the step goal is already met', async () => {
    vi.mocked(generateDynamicRoutes).mockClear();
    const resolved = await resolveRouteWorkout('sug-route-goal-met', makeContext({ stepsRemaining: 0 }));
    expect(resolved).toBeNull();
    expect(generateDynamicRoutes).not.toHaveBeenCalled();
  });

  it('returns null and skips the real call for a running-day context (stepsToTargetKm is walking-specific)', async () => {
    vi.mocked(generateDynamicRoutes).mockClear();
    const resolved = await resolveRouteWorkout('sug-route-running', makeContext({ todayGoal: 'run' }));
    expect(resolved).toBeNull();
    expect(generateDynamicRoutes).not.toHaveBeenCalled();
  });

  it('returns null when generateDynamicRoutes finds no route', async () => {
    vi.mocked(generateDynamicRoutes).mockClear();
    vi.mocked(generateDynamicRoutes).mockResolvedValue([]);
    const resolved = await resolveRouteWorkout('sug-route-empty', makeContext());
    expect(resolved).toBeNull();
    expect(getCachedRoute('sug-route-empty')).toBeUndefined();
  });

  it('de-dupes concurrent calls for the same not-yet-cached id to a single generateDynamicRoutes call', async () => {
    vi.mocked(generateDynamicRoutes).mockClear();
    let resolveRoutes!: (v: Route[]) => void;
    const pending = new Promise<Route[]>((res) => { resolveRoutes = res; });
    vi.mocked(generateDynamicRoutes).mockReturnValue(pending);

    const context = makeContext();
    const call1 = resolveRouteWorkout('sug-route-concurrent', context);
    const call2 = resolveRouteWorkout('sug-route-concurrent', context);

    resolveRoutes([mockRoute]);
    const [result1, result2] = await Promise.all([call1, call2]);

    expect(generateDynamicRoutes).toHaveBeenCalledTimes(1);
    expect(result1).toBe(mockRoute);
    expect(result2).toBe(mockRoute);
  });
});

describe('getCachedRoute', () => {
  it('returns undefined for an id never resolved', () => {
    expect(getCachedRoute('never-resolved-route-id')).toBeUndefined();
  });
});
