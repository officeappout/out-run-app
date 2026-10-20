import { describe, expect, it } from 'vitest';
import { firstWeekRunSlots, runLevelFromAnswers } from '../run-signup-slots';
import { ADD_TRACK_COMBINED_WEEK_ROUTE, RUN_SIGNUP_ROUTES, runSignupNextRoute } from '../run-signup-routing';

const improve10k = { goalPath: 'improve_time', targetDistance: '10k', paceInputSeconds: 3300, runningPlanWeeks: 8 };

describe('firstWeekRunSlots — the generator’s own week-1 slots', () => {
  it('2 runs = the two required slots', () => {
    expect(firstWeekRunSlots(improve10k, 2)).toEqual(['quality_primary', 'long_run']);
  });
  it('3 runs adds the second quality slot, 4 adds the easy run', () => {
    expect(firstWeekRunSlots(improve10k, 3)).toEqual(['quality_primary', 'long_run', 'quality_secondary']);
    expect(firstWeekRunSlots(improve10k, 4)).toEqual(['quality_primary', 'long_run', 'quality_secondary', 'easy_run']);
  });
  it('clamps the frequency to 2–4', () => {
    expect(firstWeekRunSlots(improve10k, 1)).toHaveLength(2);
    expect(firstWeekRunSlots(improve10k, 7)).toHaveLength(4);
  });
});

describe('runLevelFromAnswers', () => {
  it('beginner tiers and start-running are beginners', () => {
    expect(runLevelFromAnswers({ abilityTier: 'none' })).toBe('beginner');
    expect(runLevelFromAnswers({ abilityTier: '5_15' })).toBe('beginner');
    expect(runLevelFromAnswers({ goalPath: 'start_running' })).toBe('beginner');
  });
  it('everyone else is intermediate', () => {
    expect(runLevelFromAnswers({ abilityTier: '30_45' })).toBe('intermediate');
    expect(runLevelFromAnswers({ goalPath: 'improve_time' })).toBe('intermediate');
  });
});

describe('runSignupNextRoute', () => {
  it('flag off keeps today’s order', () => {
    expect(runSignupNextRoute('dynamic', false)).toBe(RUN_SIGNUP_ROUTES.schedule);
    expect(runSignupNextRoute('running-schedule', false)).toBe(RUN_SIGNUP_ROUTES.planLength);
    expect(runSignupNextRoute('running-plan-length', false)).toBe(RUN_SIGNUP_ROUTES.summary);
  });
  it('v2 asks the plan length first, the days right before the summary', () => {
    expect(runSignupNextRoute('dynamic', true)).toBe(RUN_SIGNUP_ROUTES.planLength);
    expect(runSignupNextRoute('running-plan-length', true)).toBe(RUN_SIGNUP_ROUTES.schedule);
    expect(runSignupNextRoute('running-schedule', true)).toBe(RUN_SIGNUP_ROUTES.summary);
  });
  it('a strength user is handed off to the combined add-track week', () => {
    expect(ADD_TRACK_COMBINED_WEEK_ROUTE).toBe('/onboarding-new/add-track-week?added=running');
  });
});
