import { describe, it, expect } from 'vitest';
import { rankSuggestions, scoreSuggestion } from '../rank-suggestions';
import { RANK_WEIGHTS } from '../rank-suggestions.weights';
import type { UserContext } from '../../types/user-context.types';
import type { Suggestion } from '../../types/suggestion.types';

const baseContext: UserContext = {
  userId: 'u1',
  baseLevel: 5,
  domainLevels: {},
  weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
  recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
  todayCompletedDomains: [],
  todayGoal: null,
  stepGoal: 8000,
  stepsToday: 0,
  stepsRemaining: 8000,
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
};

const baseSuggestion: Suggestion = {
  id: 's1',
  type: 'daily_workout',
  generatorId: 'test',
  title: 'test',
  structure: { segments: 1, durationMin: 30 },
  methodsUsed: [],
  difficulty: 2,
  goalTags: ['strength'],
  surfaceEligibility: ['home'],
  requiresLocation: false,
  score: 0,
  scoreBreakdown: {
    goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
    recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0, alreadyTrained: 0,
  },
};

describe('scoreSuggestion — per-factor', () => {
  it('goalMatch: full weight when a goalTag matches todayGoal, 0 otherwise', () => {
    const ctx = { ...baseContext, todayGoal: 'strength' as const };
    expect(scoreSuggestion(ctx, baseSuggestion).goalMatch).toBe(RANK_WEIGHTS.goalMatch);
    expect(scoreSuggestion(baseContext, baseSuggestion).goalMatch).toBe(0); // todayGoal null
    const wrongGoal = { ...ctx, todayGoal: 'run' as const };
    expect(scoreSuggestion(wrongGoal, baseSuggestion).goalMatch).toBe(0);
  });

  it('gapFilling and timeOfDayMatch are documented no-ops (Gate B / §11.7 pending)', () => {
    const breakdown = scoreSuggestion(baseContext, baseSuggestion);
    expect(breakdown.gapFilling).toBe(0);
    expect(breakdown.timeOfDayMatch).toBe(0);
  });

  it('stepDeficit: boosts walk/run suggestions proportionally to remaining steps', () => {
    const walkSuggestion = { ...baseSuggestion, goalTags: ['walk'] };
    const halfway = { ...baseContext, stepGoal: 8000, stepsRemaining: 4000 };
    expect(scoreSuggestion(halfway, walkSuggestion).stepDeficit).toBeCloseTo(RANK_WEIGHTS.stepDeficit * 0.5);

    const fullDeficit = { ...baseContext, stepGoal: 8000, stepsRemaining: 8000 };
    expect(scoreSuggestion(fullDeficit, walkSuggestion).stepDeficit).toBe(RANK_WEIGHTS.stepDeficit);
  });

  it('stepDeficit: goal met -> favors pure-strength (no walk/run tag), zero for walk suggestions', () => {
    const goalMet = { ...baseContext, stepGoal: 8000, stepsToday: 9000, stepsRemaining: 0 };
    const pureStrength = { ...baseSuggestion, goalTags: ['strength'] };
    const strengthPlusWalk = { ...baseSuggestion, goalTags: ['strength', 'walk'] };

    expect(scoreSuggestion(goalMet, pureStrength).stepDeficit).toBe(RANK_WEIGHTS.stepDeficit);
    expect(scoreSuggestion(goalMet, strengthPlusWalk).stepDeficit).toBe(0);
  });

  it('recoveryMatch: only penalizes higher difficulty when isDetrainingLocked', () => {
    const locked = { ...baseContext, recoveryState: { isDetrainingLocked: true, daysInactive: 5 } };
    const d1 = { ...baseSuggestion, difficulty: 1 as const };
    const d3 = { ...baseSuggestion, difficulty: 3 as const };

    expect(scoreSuggestion(locked, d1).recoveryMatch).toBe(RANK_WEIGHTS.recoveryMatch);
    expect(scoreSuggestion(locked, d3).recoveryMatch).toBe(0);
    expect(scoreSuggestion(baseContext, d3).recoveryMatch).toBe(0); // not locked -> neutral
  });

  it('locationBonus: only when the suggestion requires location AND context has one', () => {
    const withLocation = { ...baseContext, location: { lat: 32, lng: 34 } };
    const requiresLoc = { ...baseSuggestion, requiresLocation: true };

    expect(scoreSuggestion(withLocation, requiresLoc).locationBonus).toBe(RANK_WEIGHTS.locationBonus);
    expect(scoreSuggestion(baseContext, requiresLoc).locationBonus).toBe(0); // no location
    expect(scoreSuggestion(withLocation, baseSuggestion).locationBonus).toBe(0); // doesn't require it
  });

  it('preferenceMatch: averages difficulty-match and evening-preference signals', () => {
    const ctx = {
      ...baseContext,
      timeOfDay: 'evening' as const,
      preferences: { preferredDifficulty: 2 as const, eveningWorkoutPreferred: true },
    };
    // both signals hit -> full weight
    expect(scoreSuggestion(ctx, { ...baseSuggestion, difficulty: 2 }).preferenceMatch).toBe(RANK_WEIGHTS.preferenceMatch);
    // only one of two hits -> half weight
    expect(scoreSuggestion(ctx, { ...baseSuggestion, difficulty: 3 }).preferenceMatch).toBeCloseTo(RANK_WEIGHTS.preferenceMatch * 0.5);
  });

  it('alreadyTrained: 0 when no domains completed today, or suggestion has no strength tag', () => {
    expect(scoreSuggestion(baseContext, baseSuggestion).alreadyTrained).toBe(0); // todayCompletedDomains: []
    const someDomainsDone = { ...baseContext, todayCompletedDomains: ['push', 'pull'] };
    const walkSuggestion = { ...baseSuggestion, goalTags: ['walk'] };
    expect(scoreSuggestion(someDomainsDone, walkSuggestion).alreadyTrained).toBe(0);
  });

  it('alreadyTrained: domain-specific suggestion penalized only if its own domain is covered', () => {
    const pushDone = { ...baseContext, todayCompletedDomains: ['push'] };
    const pushSuggestion = { ...baseSuggestion, goalTags: ['strength', 'push'] };
    const legsSuggestion = { ...baseSuggestion, goalTags: ['strength', 'legs'] };

    expect(scoreSuggestion(pushDone, pushSuggestion).alreadyTrained).toBe(-RANK_WEIGHTS.alreadyTrained);
    expect(scoreSuggestion(pushDone, legsSuggestion).alreadyTrained).toBe(0);
  });

  it('alreadyTrained: generic full-body suggestion penalized proportionally to domain coverage', () => {
    const twoDone = { ...baseContext, todayCompletedDomains: ['push', 'pull'] };
    const allFourDone = { ...baseContext, todayCompletedDomains: ['push', 'pull', 'legs', 'core'] };

    expect(scoreSuggestion(twoDone, baseSuggestion).alreadyTrained).toBeCloseTo(-RANK_WEIGHTS.alreadyTrained * 0.5);
    expect(scoreSuggestion(allFourDone, baseSuggestion).alreadyTrained).toBeCloseTo(-RANK_WEIGHTS.alreadyTrained);
  });
});

describe('rankSuggestions — ordering', () => {
  it('sorts candidates highest-score-first and fills in score/scoreBreakdown', () => {
    const ctx = { ...baseContext, todayGoal: 'strength' as const };
    const low = { ...baseSuggestion, id: 'low', goalTags: ['run'] };
    const high = { ...baseSuggestion, id: 'high', goalTags: ['strength'] };

    const ranked = rankSuggestions(ctx, [low, high]);

    expect(ranked.map((s) => s.id)).toEqual(['high', 'low']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].scoreBreakdown.goalMatch).toBe(RANK_WEIGHTS.goalMatch);
  });

  it('does not mutate the input candidates', () => {
    const original = { ...baseSuggestion };
    rankSuggestions(baseContext, [original]);
    expect(original.score).toBe(0);
  });
});

// 17.8 build-plan, Stage 4 (25.08.2026) — rest-day-aware ranking, downrank not block.
// goalTags below mirror the real generators' own literal values (full-strength.generator.ts,
// safety-net.generator.ts) rather than re-deriving them, so this stays a faithful proxy for
// the real pipeline even though it never touches the generators/engine directly — the whole
// point of testing at this layer is avoiding recoveryFollowUpGenerator's real, Firestore-
// touching generate() now that it's 'home'-eligible too (see suggestion-engine.test.ts's own
// comment on why it stopped testing this scenario through the real engine).
//
// safetyNetLike's goalTags is `['recovery']` (26.08.2026 fix) — was `['recovery', 'walk']`
// until a real device scoreBreakdown log caught a genuine ranking bug: the 'walk' tag let
// safety-net collect BOTH goalMatch (30, via 'recovery') AND stepDeficit (up to 20, via
// stepDeficit()'s own stepsWalking check on 'walk') on a rest day with steps remaining,
// double-dipping past recovery-follow-up's own goalTags:['recovery']-only total of 30 — see
// safety-net.generator.ts's own updated header comment for the full trace.
describe('rankSuggestions — Stage 4 rest-day downranking', () => {
  const fullStrengthLike = { ...baseSuggestion, id: 'full-strength', goalTags: ['strength'] };
  const safetyNetLike = { ...baseSuggestion, id: 'safety-net', goalTags: ['recovery'] };

  it('todayGoal:"recovery" ranks safety-net-like above full-strength-like, without dropping either', () => {
    const ctx = { ...baseContext, todayGoal: 'recovery' as const };
    const ranked = rankSuggestions(ctx, [fullStrengthLike, safetyNetLike]);

    expect(ranked.map((s) => s.id)).toEqual(['safety-net', 'full-strength']);
    expect(ranked.find((s) => s.id === 'full-strength')).toBeDefined(); // downranked, not excluded
  });

  it('todayGoal:"strength" ranks full-strength-like above safety-net-like (training day, unchanged)', () => {
    const ctx = { ...baseContext, todayGoal: 'strength' as const };
    const ranked = rankSuggestions(ctx, [safetyNetLike, fullStrengthLike]);

    expect(ranked.map((s) => s.id)).toEqual(['full-strength', 'safety-net']);
  });

  // Regression for the 26.08.2026 double-dip bug itself (see safety-net.generator.ts's own
  // header for the full trace) — recovery-follow-up-like's goalTags:['recovery'] only ever
  // earns goalMatch; safety-net-like must score no higher on a rest day with steps remaining,
  // not outrank it via a spurious stepDeficit bonus the way the pre-fix ['recovery','walk']
  // tags did.
  it('todayGoal:"recovery" with steps remaining: safety-net-like no longer earns a stepDeficit bonus (the fixed double-dip)', () => {
    const recoveryFollowUpLike = { ...baseSuggestion, id: 'recovery-follow-up', goalTags: ['recovery'] };
    const ctx = { ...baseContext, todayGoal: 'recovery' as const, stepGoal: 8000, stepsRemaining: 8000 };

    const safetyNetBreakdown = scoreSuggestion(ctx, safetyNetLike);
    const recoveryBreakdown = scoreSuggestion(ctx, recoveryFollowUpLike);

    expect(safetyNetBreakdown.stepDeficit).toBe(0);
    expect(safetyNetBreakdown.goalMatch).toBe(recoveryBreakdown.goalMatch);
    // Same tags today => same total. Documented, accepted gap (not fixed here, out of this
    // scope): nothing in the ranker yet distinguishes "a real generated recovery workout" from
    // "a generic last-resort fallback" beyond goalTags — see rank-suggestions.ts's own header
    // on gapFilling/timeOfDayMatch for the same category of documented, deliberate no-op.
    expect(safetyNetBreakdown).toEqual(recoveryBreakdown);
  });
});
