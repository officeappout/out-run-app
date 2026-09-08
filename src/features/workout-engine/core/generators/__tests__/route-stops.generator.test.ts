import { describe, it, expect, vi } from 'vitest';

/**
 * Tripwire (wave 1, 08.09.2026, deferred-gap decision): route-stops.generator.ts's
 * generate() calls the REAL composeHybridPlan whenever IS_CHEAP_SUGGESTION_RANKING_ENABLED
 * is false — and composeHybridPlan's internal route_stops gate (start-hybrid-session.ts
 * ~line 1016) still reads the FROZEN compile constant MAP_ROUTE_STOPS_V1, not the live
 * admin-panel flag (system_config/feature_flags.enable_route_stops, wired into
 * resolveSlots' SlotEnv). That's accepted ONLY because this real-compose branch is
 * unreachable today (IS_CHEAP_SUGGESTION_RANKING_ENABLED = true in feature-flags.ts).
 *
 * This test pins that precondition directly against the generator's actual behaviour,
 * not by asserting the flag's raw value: it proves composeHybridPlan is NEVER called
 * under today's real config. The day someone flips IS_CHEAP_SUGGESTION_RANKING_ENABLED to
 * false, this test fails — forcing whoever does that to re-thread the admin flag into
 * composeHybridPlan (see start-hybrid-session.ts's comment at that line) instead of
 * silently reviving a dead compile constant as a live gate again.
 */
vi.mock('@/features/workout-engine/hybrid/start-hybrid-session', () => ({
  composeHybridPlan: vi.fn(() => {
    throw new Error('composeHybridPlan must not be called while IS_CHEAP_SUGGESTION_RANKING_ENABLED is true');
  }),
}));

import { composeHybridPlan } from '@/features/workout-engine/hybrid/start-hybrid-session';
import { routeStopsGenerator } from '../route-stops.generator';
import type { UserContext } from '../../types/user-context.types';

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
    surface: 'map',
    venue: null,
    transitState: null,
    workdayState: null,
    activitySignal: null,
    ...overrides,
  };
}

describe('routeStopsGenerator — real-compose branch stays dormant under today\'s config', () => {
  it('never calls composeHybridPlan and returns the cheap-ranking placeholder', async () => {
    const suggestion = await routeStopsGenerator.generate(makeContext());
    expect(composeHybridPlan).not.toHaveBeenCalled();
    expect(suggestion?.id).toMatch(/^route-stops-cheap-/);
    expect(suggestion?.generatorId).toBe('route-stops');
  });
});
