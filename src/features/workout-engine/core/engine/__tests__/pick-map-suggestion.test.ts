import { describe, it, expect } from 'vitest';
import { suggestionToHybridIntent } from '../pick-map-suggestion';
import { HYBRID_PRESETS, presetToIntent } from '../../../hybrid/hybrid-slots';
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
  availableTimeMin: 40,
  preferences: {},
  questionnaires: {},
  location: { lat: 32.08, lng: 34.78 },
  timeOfDay: 'morning',
  surface: 'map',
  venue: null,
  transitState: null,
  workdayState: null,
  activitySignal: null,
};

const baseSuggestion: Suggestion = {
  id: 's1',
  type: 'daily_workout',
  generatorId: 'anchor-loop',
  title: 't',
  structure: { segments: 1, durationMin: 40 },
  methodsUsed: [],
  difficulty: 2,
  goalTags: [],
  surfaceEligibility: ['map'],
  requiresLocation: true,
  score: 0,
  scoreBreakdown: {
    goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0,
    recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0,
  },
};

describe('suggestionToHybridIntent — reconstructs the SAME intent the live slot carousel would produce', () => {
  it('anchor-loop -> walk_balanced when todayGoal is not run', () => {
    const intent = suggestionToHybridIntent(baseContext, { ...baseSuggestion, generatorId: 'anchor-loop' });
    expect(intent).toEqual(presetToIntent(HYBRID_PRESETS.walk_balanced, baseContext.availableTimeMin));
  });

  it('anchor-loop -> run_balanced when todayGoal is run', () => {
    const ctx = { ...baseContext, todayGoal: 'run' as const };
    const intent = suggestionToHybridIntent(ctx, { ...baseSuggestion, generatorId: 'anchor-loop' });
    expect(intent).toEqual(presetToIntent(HYBRID_PRESETS.run_balanced, ctx.availableTimeMin));
  });

  it('full-park-workout -> full_park preset, carries mode:full_park_workout', () => {
    const intent = suggestionToHybridIntent(baseContext, { ...baseSuggestion, generatorId: 'full-park-workout' });
    expect(intent).toEqual(
      presetToIntent({ ...HYBRID_PRESETS.full_park, aerobicKind: 'walking' }, baseContext.availableTimeMin),
    );
    expect(intent?.mode).toBe('full_park_workout');
  });

  it('route-stops -> route_stops preset, carries mode:route_stops', () => {
    const intent = suggestionToHybridIntent(baseContext, { ...baseSuggestion, generatorId: 'route-stops' });
    expect(intent).toEqual(
      presetToIntent({ ...HYBRID_PRESETS.route_stops, aerobicKind: 'walking' }, baseContext.availableTimeMin),
    );
    expect(intent?.mode).toBe('route_stops');
  });

  it('uses context.availableTimeMin, not preset.defaultTimeBudgetMin', () => {
    const ctx = { ...baseContext, availableTimeMin: 17 };
    const intent = suggestionToHybridIntent(ctx, { ...baseSuggestion, generatorId: 'anchor-loop' });
    expect(intent?.timeBudgetMin).toBe(17);
    expect(intent?.timeBudgetMin).not.toBe(HYBRID_PRESETS.walk_balanced.defaultTimeBudgetMin);
  });

  it('returns null for a non-map generatorId', () => {
    expect(suggestionToHybridIntent(baseContext, { ...baseSuggestion, generatorId: 'full-strength' })).toBeNull();
    expect(suggestionToHybridIntent(baseContext, { ...baseSuggestion, generatorId: 'route' })).toBeNull();
  });
});
