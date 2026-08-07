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
    recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0,
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
