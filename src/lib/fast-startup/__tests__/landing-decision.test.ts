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

describe('decideLandingRoute — enable_landing_real_fallback', () => {
  const on = { realFallback: true };
  const withStrength = { progression: { domains: { upper_body: { currentLevel: 3 } } } };
  const withActive = { progression: { domains: {}, activePrograms: [{ id: 'p1' }] } };
  const withRun = { running: { activeProgram: { programId: 'r1' } } };

  it('flag off (default / explicit false) → every old branch unchanged, /gateway stays', () => {
    for (const opts of [undefined, { realFallback: false }]) {
      expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING' }, opts)).toBe('/gateway');
      expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING', ...withStrength }, opts)).toBe('/gateway');
      expect(decideLandingRoute({}, opts)).toBe('/gateway');
      expect(decideLandingRoute(null, opts)).toBe('/gateway');
      expect(decideLandingRoute({ onboardingStatus: 'LEGACY_X', ...withRun }, opts)).toBe('/gateway');
      expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING', onboardingPath: 'MAP_ONLY', ...withStrength }, opts)).toBe('/explorer');
    }
  });

  it('flag on → never /gateway', () => {
    for (const d of [null, undefined, {}, { onboardingStatus: 'ONBOARDING' }, { onboardingStatus: 'WHATEVER' }]) {
      expect(decideLandingRoute(d, on)).not.toBe('/gateway');
    }
  });

  it('flag on: ONBOARDING / unknown / missing status without a program → /explorer', () => {
    expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING', onboardingStep: 'PROCESSING', onboardingPath: 'FULL_PROGRAM' }, on)).toBe('/explorer');
    expect(decideLandingRoute({ onboardingStatus: 'LEGACY_X' }, on)).toBe('/explorer');
    expect(decideLandingRoute({}, on)).toBe('/explorer');
    expect(decideLandingRoute(null, on)).toBe('/explorer');
    // the quick-signup scaffold's empty program fields are "no program"
    expect(decideLandingRoute({ progression: { domains: {}, activePrograms: [] }, running: { activeProgram: null } }, on)).toBe('/explorer');
  });

  it('flag on: ONBOARDING / unknown / missing status WITH a program → /home', () => {
    for (const prog of [withStrength, withActive, withRun]) {
      expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING', ...prog }, on)).toBe('/home');
      expect(decideLandingRoute({ onboardingStatus: 'LEGACY_X', ...prog }, on)).toBe('/home');
      expect(decideLandingRoute({ ...prog }, on)).toBe('/home');
    }
  });

  it('flag on: ONBOARDING is checked before the MAP_ONLY path (a program goes home)', () => {
    expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING', onboardingPath: 'MAP_ONLY', ...withRun }, on)).toBe('/home');
    expect(decideLandingRoute({ onboardingStatus: 'ONBOARDING', onboardingPath: 'MAP_ONLY' }, on)).toBe('/explorer');
  });

  it('flag on: the known branches are untouched', () => {
    expect(decideLandingRoute({ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'IDENTITY', ...withStrength }, on)).toBe('/onboarding-new/profile');
    expect(decideLandingRoute({ onboardingStatus: 'IN_PROGRESS', onboardingStep: 'HEALTH' }, on)).toBe('/onboarding-new/health');
    expect(decideLandingRoute({ onboardingStatus: 'COMPLETED' }, on)).toBe('/home');
    expect(decideLandingRoute({ onboardingStatus: 'MAP_ONLY', ...withStrength }, on)).toBe('/explorer');
    expect(decideLandingRoute({ onboardingPath: 'MAP_ONLY' }, on)).toBe('/explorer');
  });

  it('canFastPathToHome stays strict (no flag): an ONBOARDING user with a program takes the slow path', () => {
    expect(canFastPathToHome({ hasSessionHint: true, lastAuthUid: 'u1', persistedProfile: { id: 'u1', onboardingStatus: 'ONBOARDING', ...withStrength } })).toBe(false);
  });

  it('fastStartGuardTarget passes the flag through', () => {
    const base = { expectedUid: 'u1', authUid: 'u1' };
    expect(fastStartGuardTarget({ ...base, doc: { onboardingStatus: 'ONBOARDING' } })).toBe('/gateway');
    expect(fastStartGuardTarget({ ...base, doc: { onboardingStatus: 'ONBOARDING' }, realFallback: true })).toBe('/explorer');
    expect(fastStartGuardTarget({ ...base, doc: { onboardingStatus: 'ONBOARDING', ...withStrength }, realFallback: true })).toBeNull();
    expect(fastStartGuardTarget({ ...base, doc: 'missing', realFallback: true })).toBe('/');
  });
});
