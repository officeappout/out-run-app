import { describe, it, expect } from 'vitest';
import { safetyNetGenerator } from '../safety-net.generator';
import type { UserContext, UserContextSurface } from '../../types/user-context.types';

function makeContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'u1',
    baseLevel: 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
    todayCompletedDomains: [],
    todayGoal: null,
    stepGoal: 0,
    stepsToday: 0,
    stepsRemaining: 0,
    availableTimeMin: 30,
    preferences: {},
    questionnaires: {},
    location: null,
    timeOfDay: 'morning',
    surface: 'home',
    venue: null,
    transitState: null,
    workdayState: null,
    activitySignal: null,
    ...overrides,
  };
}

describe('safetyNetGenerator', () => {
  it('is eligible on every declared surface, with no profile/location/questionnaire signal', () => {
    const surfaces: UserContextSurface[] = ['home', 'map', 'post_workout'];
    for (const surface of surfaces) {
      expect(safetyNetGenerator.eligible(makeContext({ surface }))).toBe(true);
    }
  });

  it('declares exactly the surfaces it is registered eligible on', () => {
    expect(safetyNetGenerator.surfaces).toEqual(['home', 'map', 'post_workout']);
  });

  it('generate() never returns null and never requires location', async () => {
    const result = await safetyNetGenerator.generate(makeContext({ location: null }));
    expect(result).not.toBeNull();
    expect(result!.requiresLocation).toBe(false);
  });

  it('generate() is a real Suggestion shape, id keyed to the user (stable per-user, no I/O)', async () => {
    const result = await safetyNetGenerator.generate(makeContext({ userId: 'u42' }));
    expect(result!.id).toBe('safety-net-u42');
    expect(result!.type).toBe('daily_workout');
    expect(result!.generatorId).toBe('safety-net');
    expect(result!.structure.durationMin).toBeGreaterThan(0);
  });

  it('falls back to a positive duration when availableTimeMin is falsy', async () => {
    const result = await safetyNetGenerator.generate(makeContext({ availableTimeMin: 0 }));
    expect(result!.structure.durationMin).toBe(10);
  });
});
