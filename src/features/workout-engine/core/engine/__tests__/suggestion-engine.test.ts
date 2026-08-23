import { describe, it, expect, vi } from 'vitest';
import { runSuggestionEngine } from '../suggestion-engine';
import type { UserContext } from '../../types/user-context.types';

// Home-daily-goal-v1 Stage 2: proves runSuggestionEngine(surface:'home') actually reaches
// fullStrengthGenerator (previously "zero live call sites") and returns a valid Suggestion,
// without disturbing its pre-existing surface:'map' behavior. Uses the REAL
// GENERATOR_REGISTRY/runSuggestionEngine/rankSuggestions — not a mocked engine — so this is
// a genuine wiring proof, not just an eligible()-level unit check.
//
// `location: null` on every context here (not just the home ones) is deliberate: it keeps
// every location-gated generator (route/route-stops/full-park-workout/anchor-loop —
// eligible: context => context.location !== null) ineligible, so their Firestore/network-
// touching generate() never runs. fullStrengthGenerator itself has no location dependency,
// and — with IS_CHEAP_SUGGESTION_RANKING_ENABLED true in this codebase today — its generate()
// takes the cheap, zero-I/O branch (a synchronous read of the already-mocked profile), so
// this test needs no Firestore/network mocking at all, matching the profile mock's own
// documented convention (full-park-needs-assessment.test.ts) rather than the untested
// generate()-with-real-I/O boundary post-workout-generators.test.ts documents for the other
// generators.
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: {
    getState: () => ({
      id: 'u1',
      profile: { core: { weight: 70 }, progression: { domains: { push: 5 } } },
    }),
  },
}));

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
    surface: 'home',
    venue: null,
    transitState: null,
    workdayState: null,
    activitySignal: null,
    ...overrides,
  };
}

describe('runSuggestionEngine — surface:\'home\' reaches fullStrengthGenerator', () => {
  it('returns a valid full-strength Suggestion for surface:\'home\'', async () => {
    const ranked = await runSuggestionEngine(makeContext({ surface: 'home' }));
    const fullStrength = ranked.find((s) => s.generatorId === 'full-strength');

    expect(fullStrength).toBeDefined();
    expect(fullStrength!.type).toBe('daily_workout');
    expect(fullStrength!.surfaceEligibility).toEqual(['home', 'map']);
    expect(fullStrength!.requiresLocation).toBe(false);
    expect(fullStrength!.structure.durationMin).toBeGreaterThan(0);
  });

  it('still returns a valid full-strength Suggestion for surface:\'map\' (pre-existing behavior unchanged)', async () => {
    const ranked = await runSuggestionEngine(makeContext({ surface: 'map' }));
    const fullStrength = ranked.find((s) => s.generatorId === 'full-strength');

    expect(fullStrength).toBeDefined();
    expect(fullStrength!.requiresLocation).toBe(false);
  });

  // No post_workout case here: fullStrengthGenerator.surfaces is ['home','map'] only, so
  // it's provably excluded by suggestion-engine.ts's own surfaces.includes(context.surface)
  // filter before eligible() ever runs — that's a static fact of the file
  // (full-strength.generator.ts:31), not something worth exercising through the real engine.
  // Running it through here would also make recoveryFollowUpGenerator eligible (its
  // eligible() has no context-based escape, only `profile !== null`), triggering its real,
  // Firestore-touching generate() — outside this test file's deliberately zero-I/O design.
});
