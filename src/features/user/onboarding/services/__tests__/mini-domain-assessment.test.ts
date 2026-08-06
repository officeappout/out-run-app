import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vitest.config.ts runs in a plain 'node' environment (no jsdom/window/sessionStorage
// globals — component/browser testing is an explicit separate decision for this repo).
// This module only needs `window` to exist (truthy) + a Storage-shaped `sessionStorage`,
// so a minimal in-memory stub exercises the REAL module logic without adding a jsdom
// dependency or changing the project's test environment.
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

let sessionStorageStub: FakeStorage;

beforeEach(() => {
  sessionStorageStub = new FakeStorage();
  vi.stubGlobal('sessionStorage', sessionStorageStub);
  vi.stubGlobal('window', { location: { pathname: '/current-test-page' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// The launcher reads the profile from useUserStore for the demographics
// fallback — mock it so this stays a pure logic test (no Firebase/store setup).
const mockProfile: any = {
  core: { name: 'Dana', gender: 'female', birthDate: new Date('1995-05-01') },
};
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: mockProfile }) },
}));

import {
  startMiniDomainAssessment,
  isMiniAssessmentActive,
  consumeMiniAssessmentState,
  resolveBaseCategoryForProgramId,
  MINI_ASSESSMENT_ACTIVE_KEY,
  MINI_ASSESSMENT_DOMAIN_KEY,
  MINI_ASSESSMENT_RETURN_TO_KEY,
} from '../mini-domain-assessment';

describe('startMiniDomainAssessment — shared launcher used by all 3 entry points', () => {
  it('seeds the body_focus single-category path config for the requested domain', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'legs');
    expect(sessionStorageStub.getItem('onboarding_program_path')).toBe('body_focus');
    expect(sessionStorageStub.getItem('onboarding_muscle_focus')).toBe(JSON.stringify(['legs']));
  });

  it('sets the mini-mode flags (active + domain + returnTo) consumed by assessment-visual/page.tsx', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'push', '/profile');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_ACTIVE_KEY)).toBe('1');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_DOMAIN_KEY)).toBe('push');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_RETURN_TO_KEY)).toBe('/profile');
  });

  it('navigates to the existing assessment-visual route (not a new/rebuilt route)', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'core');
    expect(router.push).toHaveBeenCalledWith('/onboarding-new/assessment-visual');
  });

  it('falls back to the current pathname when returnTo is omitted', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'pull');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_RETURN_TO_KEY)).toBe('/current-test-page');
  });

  it('backfills demographics from the profile store when sessionStorage is empty ' +
     '(so the page\'s auth/demographics gate does not bounce the user to /profile)', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'legs');
    expect(sessionStorageStub.getItem('onboarding_personal_gender')).toBe('female');
    expect(sessionStorageStub.getItem('onboarding_personal_dob')).toBe('1995-05-01');
    expect(sessionStorageStub.getItem('onboarding_personal_name')).toBe('Dana');
  });

  it('does not overwrite demographics already present in sessionStorage', () => {
    sessionStorageStub.setItem('onboarding_personal_gender', 'male');
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'legs');
    expect(sessionStorageStub.getItem('onboarding_personal_gender')).toBe('male');
  });
});

describe('startMiniDomainAssessment — domainType "skill" (handstand/planche/etc via the skills path)', () => {
  it('seeds the skills single-skill path config instead of body_focus', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'handstand', undefined, 'skill');
    expect(sessionStorageStub.getItem('onboarding_program_path')).toBe('skills');
    expect(sessionStorageStub.getItem('onboarding_skill_focus')).toBe(JSON.stringify(['handstand']));
  });

  it('does NOT touch onboarding_muscle_focus for a skill domain', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'planche', undefined, 'skill');
    expect(sessionStorageStub.getItem('onboarding_muscle_focus')).toBeNull();
  });

  it('still sets the mini-mode flags + navigates to the same shared route as a category domain', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'front_lever', '/profile', 'skill');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_ACTIVE_KEY)).toBe('1');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_DOMAIN_KEY)).toBe('front_lever');
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_RETURN_TO_KEY)).toBe('/profile');
    expect(router.push).toHaveBeenCalledWith('/onboarding-new/assessment-visual');
  });

  it('defaults to domainType "category" when omitted — the 3 existing entry points are unaffected', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'push', '/profile');
    expect(sessionStorageStub.getItem('onboarding_program_path')).toBe('body_focus');
    expect(sessionStorageStub.getItem('onboarding_muscle_focus')).toBe(JSON.stringify(['push']));
    expect(sessionStorageStub.getItem('onboarding_skill_focus')).toBeNull();
  });
});

describe('isMiniAssessmentActive / consumeMiniAssessmentState', () => {
  it('is false before a mini assessment starts', () => {
    expect(isMiniAssessmentActive()).toBe(false);
  });

  it('is true after startMiniDomainAssessment, false again after consuming', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'legs', '/home');
    expect(isMiniAssessmentActive()).toBe(true);

    const { domain, returnTo } = consumeMiniAssessmentState();
    expect(domain).toBe('legs');
    expect(returnTo).toBe('/home');
    expect(isMiniAssessmentActive()).toBe(false);
  });

  it('consuming clears all 3 mini-mode keys (no stale state for the next launch)', () => {
    const router = { push: vi.fn() };
    startMiniDomainAssessment(router, 'core', '/profile');
    consumeMiniAssessmentState();
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_ACTIVE_KEY)).toBeNull();
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_DOMAIN_KEY)).toBeNull();
    expect(sessionStorageStub.getItem(MINI_ASSESSMENT_RETURN_TO_KEY)).toBeNull();
  });
});

describe('resolveBaseCategoryForProgramId — WorkoutBuilderSheet unlock CTA domain resolution', () => {
  const DOMAIN_ENROLLMENT_SLUGS: Record<string, string[]> = {
    push: ['push', 'upper_body', 'full_body', 'calisthenics_upper', 'planche', 'handstand'],
    pull: ['pull', 'upper_body', 'full_body', 'calisthenics_upper', 'front_lever', 'back_lever'],
    legs: ['legs', 'lower_body', 'full_body'],
    core: ['core', 'lower_body', 'full_body'],
  };

  it('resolves a skill slug to its biomechanical parent category', () => {
    expect(resolveBaseCategoryForProgramId('front_lever', DOMAIN_ENROLLMENT_SLUGS)).toBe('pull');
    expect(resolveBaseCategoryForProgramId('planche', DOMAIN_ENROLLMENT_SLUGS)).toBe('push');
  });

  it('a base category passes through unchanged', () => {
    expect(resolveBaseCategoryForProgramId('legs', DOMAIN_ENROLLMENT_SLUGS)).toBe('legs');
  });

  it('applies the slug resolver before matching when provided', () => {
    const slugResolver = (id: string) => (id === 'someHashId' ? 'front_lever' : id);
    expect(resolveBaseCategoryForProgramId('someHashId', DOMAIN_ENROLLMENT_SLUGS, slugResolver)).toBe('pull');
  });

  it('falls back to the (slug-resolved) id when nothing matches', () => {
    expect(resolveBaseCategoryForProgramId('mystery_program', DOMAIN_ENROLLMENT_SLUGS)).toBe('mystery_program');
  });
});
