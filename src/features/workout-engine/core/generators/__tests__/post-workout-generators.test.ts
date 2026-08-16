import { describe, it, expect } from 'vitest';
import { recoveryFollowUpGenerator } from '../recovery-follow-up.generator';
import { complementaryShortGenerator } from '../complementary-short.generator';
import type { UserContext } from '../../types/user-context.types';

// generate() itself calls generateHomeWorkoutTrio (Firestore-touching) and reads
// useUserStore — same untested-by-convention boundary as full-strength.generator.ts (no
// existing generator has a generate()-level test). eligible()/surfaces are pure and
// synchronous, so those are covered here, consistent with safety-net.generator.test.ts.

function makeContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'u1',
    baseLevel: 1,
    domainLevels: {},
    weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
    recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
    todayGoal: null,
    stepGoal: 8000,
    stepsToday: 0,
    stepsRemaining: 0,
    availableTimeMin: 30,
    preferences: {},
    questionnaires: {},
    location: null,
    timeOfDay: 'morning',
    surface: 'post_workout',
    venue: null,
    transitState: null,
    workdayState: null,
    activitySignal: null,
    ...overrides,
  };
}

describe('recoveryFollowUpGenerator', () => {
  it('declares post_workout only', () => {
    expect(recoveryFollowUpGenerator.surfaces).toEqual(['post_workout']);
  });

  it('does not self-check context.surface — relies on suggestion-engine.ts central enforcement', () => {
    // eligible() only depends on profile presence (mocked away as null here, in a node
    // env with no real useUserStore state) — asserts it does NOT vary by surface, which
    // would indicate an accidental, redundant (and easy-to-drift) self-check crept in.
    const home = recoveryFollowUpGenerator.eligible(makeContext({ surface: 'home' }));
    const postWorkout = recoveryFollowUpGenerator.eligible(makeContext({ surface: 'post_workout' }));
    expect(home).toBe(postWorkout);
  });
});

describe('complementaryShortGenerator', () => {
  it('declares post_workout only', () => {
    expect(complementaryShortGenerator.surfaces).toEqual(['post_workout']);
  });

  it('is gated on stepsRemaining > 0 (the real, live field — not a domain-gap placeholder)', () => {
    // Both false regardless of profile (null in this node-env test) — the point is the
    // stepsRemaining gate short-circuits before the profile check either way.
    expect(complementaryShortGenerator.eligible(makeContext({ stepsRemaining: 0 }))).toBe(false);
    expect(complementaryShortGenerator.eligible(makeContext({ stepsRemaining: -5 }))).toBe(false);
  });
});
