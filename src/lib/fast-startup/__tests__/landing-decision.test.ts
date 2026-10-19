import { describe, it, expect } from 'vitest';
import { decideLandingRoute, canFastPathToHome, fastStartGuardTarget } from '../landing-decision';

describe('decideLandingRoute — mirrors the branch order `/` always used', () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'IDENTITY' }, '/onboarding-new/profile'],
    [{ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'ASSESSMENT' }, '/onboarding-new/assessment-visual'],
    [{ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'VISUAL_ASSESSMENT_COMPLETE' }, '/onboarding-new/health'],
    [{ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'HEALTH' }, '/onboarding-new/health'],
    [{ onboardingStatus: 'PENDING_LIFESTYLE' }, '/home'],
    [{ onboardingStatus: 'COMPLETED' }, '/home'],
    [{ onboardingComplete: true }, '/home'],
    [{ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'OTHER', onboardingComplete: true }, '/home'],
    [{ onboardingPath: 'MAP_ONLY' }, '/explorer'],
    [{ onboardingStatus: 'MAP_ONLY' }, '/explorer'],
    // COMPLETED wins over a MAP_ONLY path (order matters)
    [{ onboardingStatus: 'COMPLETED', onboardingPath: 'MAP_ONLY' }, '/home'],
    // IN_PROGRESS identity wins over onboardingComplete (order matters)
    [{ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'IDENTITY', onboardingComplete: true }, '/onboarding-new/profile'],
    [{ onboardingStatus: 'ONBOARDING' }, '/gateway'],
    [{}, '/gateway'],
  ];
  it.each(cases)('%j → %s', (data, route) => {
    expect(decideLandingRoute(data)).toBe(route);
  });
  it('null/undefined data → /gateway', () => {
    expect(decideLandingRoute(null)).toBe('/gateway');
    expect(decideLandingRoute(undefined)).toBe('/gateway');
  });
});

describe('canFastPathToHome', () => {
  const done = { id: 'u1', onboardingStatus: 'COMPLETED' };
  it('fires only when hint + matching uid + home-bound profile all agree', () => {
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: done })).toBe(true);
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: { id: 'u1', onboardingStatus: 'PENDING_LIFESTYLE' } })).toBe(true);
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: { id: 'u1', onboardingComplete: true } })).toBe(true);
  });
  it('no session hint (signed out) → slow path', () => {
    expect(canFastPathToHome({ hasSessionHint: false, lastAuthUid: 'u1', persistedProfile: done })).toBe(false);
  });
  it('unknown / different uid (stale profile of another account) → slow path', () => {
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: null, persistedProfile: done })).toBe(false);
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u2', persistedProfile: done })).toBe(false);
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: { ...done, id: undefined } })).toBe(false);
  });
  it('no persisted profile → slow path', () => {
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: null })).toBe(false);
  });
  it('not onboarded / MAP_ONLY / mid-onboarding → slow path (their redirects stay server-decided)', () => {
    for (const p of [
      { id: 'u1', onboardingStatus: 'IN_PROGRESS', onboardingStep: 'HEALTH' },
      { id: 'u1', onboardingStatus: 'MAP_ONLY' },
      { id: 'u1', onboardingPath: 'MAP_ONLY' },
      { id: 'u1', onboardingStatus: 'ONBOARDING' },
      { id: 'u1' },
    ]) {
      expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: p })).toBe(false);
    }
  });
});

describe('fastStartGuardTarget — home re-check after a fast path', () => {
  it('signed out / other account → back to /', () => {
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: null, doc: 'unknown' })).toBe('/');
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u2', doc: { onboardingStatus: 'COMPLETED' } })).toBe('/');
  });
  it('deleted users doc → back to / (its MAP_ONLY recovery / gateway)', () => {
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u1', doc: 'missing' })).toBe('/');
  });
  it('doc says not-home → the route `/` would have picked', () => {
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u1', doc: { onboardingStatus: 'MAP_ONLY' } })).toBe('/explorer');
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u1', doc: { onboardingStatus: 'IN_PROGRESS', onboardingStep: 'IDENTITY' } })).toBe('/onboarding-new/profile');
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u1', doc: {} })).toBe('/gateway');
  });
  it('confirmed home, or doc unknown (timeout/offline) → stay', () => {
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u1', doc: { onboardingStatus: 'COMPLETED' } })).toBeNull();
    expect(fastStartGuardTarget({ expectedUid: 'u1', authUid: 'u1', doc: 'unknown' })).toBeNull();
  });
});
