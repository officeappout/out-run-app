import { describe, it, expect } from 'vitest';
import { resolveWizardFirstName, resolveWizardGender } from '../wizard-identity';
import { resolveAccessCodePersonaIds } from '../persona-access-code';
import { GOAL_OPTIONS, RUN_GOAL_OPTIONS, resolvePersonaGoalMode } from '../persona-goals';
import { resolveRunningScheduleCta } from '../running-schedule-cta';
import { derivePrimaryTrack } from '../../services/track-mapper.service';

describe('wizard identity — profile first, sessionStorage fallback', () => {
  it('returning user (no sessionStorage): female profile → female', () => {
    expect(resolveWizardGender('female', null)).toBe('female');
  });
  it('profile wins over a stale stored value', () => {
    expect(resolveWizardGender('male', 'female')).toBe('male');
  });
  it("profile 'other' / missing → the signup's stored answer, else male", () => {
    expect(resolveWizardGender('other', 'female')).toBe('female');
    expect(resolveWizardGender(undefined, 'female')).toBe('female');
    expect(resolveWizardGender(undefined, null)).toBe('male');
  });
  it('first name from the profile display name, else stored name', () => {
    expect(resolveWizardFirstName('  נועה כהן ', 'X')).toBe('נועה');
    expect(resolveWizardFirstName('', 'דני')).toBe('דני');
    expect(resolveWizardFirstName(undefined, null)).toBe('');
  });
});

describe('access-code personas', () => {
  const off = { officeWorker: false, military: false, school: false, university: false };
  it('flag off (default): office worker opens no popup', () => {
    expect(resolveAccessCodePersonaIds(off).has('office_worker')).toBe(false);
    expect(resolveAccessCodePersonaIds(off).size).toBe(0);
  });
  it('flag on: office worker opens the popup', () => {
    expect(Array.from(resolveAccessCodePersonaIds({ ...off, officeWorker: true }))).toEqual(['office_worker']);
  });
  it('the other verticals follow their own flags', () => {
    const ids = resolveAccessCodePersonaIds({ officeWorker: false, military: true, school: true, university: true });
    expect(Array.from(ids).sort()).toEqual(['military', 'pupil', 'student']);
  });
});

describe('persona goal mode', () => {
  const strength = { progression: { domains: { push: { currentLevel: 3 } } } };
  const runner = { running: { isUnlocked: true, currentGoal: 'run_5k' } };

  it('new user (signup, no tracks): goals asked, general list', () => {
    expect(resolvePersonaGoalMode(null)).toEqual({ askGoals: true, options: GOAL_OPTIONS });
  });
  it('strength user (program-path answered): goals skipped', () => {
    expect(resolvePersonaGoalMode(strength).askGoals).toBe(false);
  });
  it('runner (q_run_goal answered): goals skipped', () => {
    expect(resolvePersonaGoalMode(runner).askGoals).toBe(false);
  });
  it('dual track: goals skipped', () => {
    expect(resolvePersonaGoalMode({ ...strength, ...runner }).askGoals).toBe(false);
  });
  it('run-only user without a captured goal: asked, with running goals', () => {
    const mode = resolvePersonaGoalMode({ running: { isUnlocked: true } });
    expect(mode.askGoals).toBe(true);
    expect(mode.options).toBe(RUN_GOAL_OPTIONS);
    expect(mode.options.some((g) => g.id === 'skills' || g.id === 'aesthetics')).toBe(false);
  });
  it('a running domain alone is not a strength track', () => {
    expect(resolvePersonaGoalMode({ progression: { domains: { running: { currentLevel: 2 } } } }).askGoals).toBe(true);
  });
  it('running goal ids map to the run track', () => {
    expect(derivePrimaryTrack(['run_distance'])).toBe('run');
    expect(derivePrimaryTrack(['run_pace', 'run_distance'])).toBe('run');
  });
});

describe('running schedule CTA', () => {
  it('wizard, first choice (system default): "שמירה" / "לוח ריצה נשמר!"', () => {
    expect(resolveRunningScheduleCta({ isJIT: true, isLastStep: false, scheduleDaysSource: 'system-default' }))
      .toEqual({ label: 'שמירה', successLabel: 'לוח ריצה נשמר!' });
    expect(resolveRunningScheduleCta({ isJIT: true, isLastStep: false, scheduleDaysSource: null }).label).toBe('שמירה');
  });
  it('wizard, days already chosen: edit wording kept', () => {
    expect(resolveRunningScheduleCta({ isJIT: true, isLastStep: false, scheduleDaysSource: 'user-chosen' }))
      .toEqual({ label: 'שמירת שינויים', successLabel: 'לוח ריצה עודכן!' });
  });
  it('signup (not JIT): unchanged', () => {
    expect(resolveRunningScheduleCta({ isJIT: false, isLastStep: true, scheduleDaysSource: null }))
      .toEqual({ label: 'בואו נרוץ!', successLabel: undefined });
    expect(resolveRunningScheduleCta({ isJIT: undefined, isLastStep: false, scheduleDaysSource: null }).label).toBe('המשך');
  });
});
