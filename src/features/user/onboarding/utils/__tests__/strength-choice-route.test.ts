import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }));
vi.mock('@/lib/onboardingPrefs', () => ({ setOnboardingPref: vi.fn() }));

import { isStrengthSignupHref, whatNowPlanHref } from '../strength-choice-route';
import { strengthStoryBar, STRENGTH_V3_PHASES } from '../../constants/onboarding-phases';
import { isStrengthQuizV3Entry } from '../../components/strength-quiz-v3/quiz-v3-entry';
import onboardingHe from '@/messages/he/onboarding.json';

describe('whatNowPlanHref (map drawer plan card, owner 27.10.2026)', () => {
  it('running frozen, new user: the details screen first', () => {
    const href = whatNowPlanHref({ aerobicOpen: false, hasProgram: false, identityKnown: false });
    expect(href).toBe('/onboarding-new/profile');
    expect(isStrengthSignupHref(href)).toBe(true);
  });

  it('running frozen, details already known: straight into the v3 questionnaire', () => {
    expect(whatNowPlanHref({ aerobicOpen: false, hasProgram: false, identityKnown: true }))
      .toBe('/onboarding-new/program-path');
  });

  it('running open: the strength / running choice on /home, as today', () => {
    const href = whatNowPlanHref({ aerobicOpen: true, hasProgram: false, identityKnown: false });
    expect(href).toBe('/home');
    expect(isStrengthSignupHref(href)).toBe(false);
  });

  it('already has a program: /home, never a second signup', () => {
    expect(whatNowPlanHref({ aerobicOpen: false, hasProgram: true, identityKnown: true })).toBe('/home');
  });

  it('the program-path target opens the v3 intro for the seeded STRENGTH track', () => {
    expect(isStrengthQuizV3Entry({ flagOn: true, flagsReady: true, gatewayTrack: 'STRENGTH' })).toBe(true);
  });
});

describe('strengthStoryBar (bars count the real screens)', () => {
  it('v3 flow: 4 phases, details → level check → summary → health', () => {
    expect(strengthStoryBar('profile', true)).toMatchObject({ total: 4, current: 1 });
    expect(strengthStoryBar('assessment', true)).toMatchObject({ total: 4, current: 2 });
    expect(strengthStoryBar('result', true)).toMatchObject({ total: 4, current: 3 });
    expect(strengthStoryBar('health', true)).toMatchObject({ total: STRENGTH_V3_PHASES.TOTAL, current: 4 });
  });

  it('legacy flow: unchanged 5 phases', () => {
    expect(strengthStoryBar('profile', false)).toMatchObject({ total: 5, current: 1 });
    expect(strengthStoryBar('assessment', false)).toMatchObject({ total: 5, current: 3 });
    expect(strengthStoryBar('health', false)).toMatchObject({ total: 5, current: 5 });
  });

  it('every label key exists in the Hebrew catalog', () => {
    const he = onboardingHe as Record<string, string>;
    for (const v3 of [true, false]) {
      for (const step of ['profile', 'assessment', 'result', 'health'] as const) {
        expect(he[strengthStoryBar(step, v3).labelKey]).toBeTruthy();
      }
    }
  });
});
