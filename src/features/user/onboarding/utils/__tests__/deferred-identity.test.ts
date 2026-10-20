import { describe, it, expect } from 'vitest';
import { demographicsFromSession, needsIdentityBeforeSave } from '../deferred-identity';
import { onboardingEntryHref } from '../onboarding-entry';
import { strengthResultNextRoute, HEALTH_ROUTE } from '../add-track-routing';
import { runSignupNextRoute, RUN_SIGNUP_ROUTES } from '../run-signup-routing';

const known = { name: 'דנה', gender: 'female', birthDate: new Date(1990, 4, 1) };
const noSession = { name: null, gender: null, dob: null };

describe('onboardingEntryHref', () => {
  it('flag off / other callers: unknown identity → the identity form first (unchanged)', () => {
    expect(onboardingEntryHref('STRENGTH', false)).toBe('/onboarding-new/profile');
    expect(onboardingEntryHref('RUNNING', false)).toBe('/onboarding-new/profile');
  });

  it('known identity → the track step', () => {
    expect(onboardingEntryHref('STRENGTH', true)).toBe('/onboarding-new/program-path');
    expect(onboardingEntryHref('RUNNING', true)).toBe('/onboarding-new/dynamic');
  });

  it('home v2 program cards (deferIdentity) → the track step even without identity', () => {
    expect(onboardingEntryHref('STRENGTH', false, { deferIdentity: true })).toBe('/onboarding-new/program-path');
    expect(onboardingEntryHref('RUNNING', false, { deferIdentity: true })).toBe('/onboarding-new/dynamic');
  });
});

describe('needsIdentityBeforeSave', () => {
  it('flag off → never (the identity form already came first)', () => {
    expect(needsIdentityBeforeSave({ v2: false, profileCore: null, session: noSession })).toBe(false);
  });

  it('v2 + unknown identity → asked inside the flow', () => {
    expect(needsIdentityBeforeSave({ v2: true, profileCore: { name: 'x' }, session: noSession })).toBe(true);
  });

  it('v2 + known from the profile → not asked', () => {
    expect(needsIdentityBeforeSave({ v2: true, profileCore: known, session: noSession })).toBe(false);
  });

  it('v2 + filled in this session (identity form) → not asked again', () => {
    expect(needsIdentityBeforeSave({
      v2: true,
      profileCore: null,
      session: { name: 'דנה', gender: 'female', dob: '1990-05-01' },
    })).toBe(false);
  });
});

describe('demographicsFromSession', () => {
  it('age in whole years', () => {
    expect(demographicsFromSession('1990-05-01', 'female', new Date(2026, 9, 20))).toEqual({ age: 36, gender: 'female' });
    expect(demographicsFromSession('1990-12-01', 'male', new Date(2026, 9, 20))).toEqual({ age: 35, gender: 'male' });
  });

  it('missing / invalid → null', () => {
    expect(demographicsFromSession(null, 'male')).toBeNull();
    expect(demographicsFromSession('1990-05-01', null)).toBeNull();
    expect(demographicsFromSession('nope', 'male')).toBeNull();
  });
});

describe('the health declaration sits inside each flow, once (journeys J1 / J2)', () => {
  it('J1: a new strength user goes from the accepted result to the health step', () => {
    expect(strengthResultNextRoute({ v2: true, hasRunningTrack: false, healthAccepted: false })).toBe(HEALTH_ROUTE);
  });

  it('J2 (v2): run questionnaire → length → week + reminders → summary (which then opens health)', () => {
    expect(runSignupNextRoute('dynamic', true)).toBe(RUN_SIGNUP_ROUTES.planLength);
    expect(runSignupNextRoute('running-plan-length', true)).toBe(RUN_SIGNUP_ROUTES.schedule);
    expect(runSignupNextRoute('running-schedule', true)).toBe(RUN_SIGNUP_ROUTES.summary);
  });
});
