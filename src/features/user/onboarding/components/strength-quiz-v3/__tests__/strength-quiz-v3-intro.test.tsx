// @vitest-environment jsdom
/**
 * Strength questionnaire v3 intro (enable_strength_quiz_v3 on): screen 1 → screen 2 → the visual
 * assessment, with the full-body program written exactly as the legacy goal screen writes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const R = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), funnel: vi.fn() }));

vi.mock('framer-motion', async () => (await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: R.push, replace: () => {}, back: R.back }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: {} }));
vi.mock('@/features/content/exercises/core/exercise.service', () => ({ getExercise: async () => null }));
vi.mock('@/features/analytics/onboarding-funnel', () => ({ logOnboardingFunnelStep: R.funnel }));
vi.mock('@/features/user/onboarding/components/OnboardingLayout', () => ({
  default: (p: { continueLabel?: string; phaseLabel?: string; currentSegment?: number; onContinue: () => void; onBack: () => void; children?: React.ReactNode }) => (
    <div data-stub="layout" data-phase={p.phaseLabel ?? ''} data-segment={p.currentSegment}>
      <button data-stub="back" onClick={p.onBack} />
      {p.children}
      <button data-stub="continue" onClick={p.onContinue}>
        {p.continueLabel}
      </button>
    </div>
  ),
}));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import StrengthQuizV3Intro from '../StrengthQuizV3Intro';
import { useLocaleStore } from '@/store/useLocaleStore';

let m: Mounted | null = null;
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const snap = (name: string) => `./__snapshots__/strength-quiz-v3-intro/${name}.html`;

async function open(gender: 'male' | 'female' | 'other') {
  useLocaleStore.setState({ gender });
  m = await mount(<StrengthQuizV3Intro />);
  await m.advance(0);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  sessionStorage.clear();
  R.push.mockReset();
  R.back.mockReset();
  R.funnel.mockReset();
});
afterEach(() => {
  m?.unmount();
  m = null;
  vi.useRealTimers();
});

describe('screens', () => {
  it.each(['male', 'female', 'other'] as const)('screen 1 and screen 2, %s', async (g) => {
    await open(g);
    expect(q('[data-stub="layout"]')!.getAttribute('data-phase')).toBe('שלב 2: מבדק רמה'); // v3 flow: 4 phases (owner 27.10)
    expect(q('[data-stub="layout"]')!.getAttribute('data-segment')).toBe('2');
    await expect(m!.html()).toMatchFileSnapshot(snap(`welcome-${g}`));
    await m!.click('[data-stub="continue"]');
    expect(q('[data-quiz-v3="assessment-intro"]')).not.toBeNull();
    await expect(m!.html()).toMatchFileSnapshot(snap(`assessment-${g}`));
  });
});

describe('flow', () => {
  it('screen 2 CTA: full body written, funnel step, the visual assessment', async () => {
    sessionStorage.setItem('onboarding_running_answers', '{"goalPath":"x"}');
    sessionStorage.setItem('onboarding_goal_note', '{"text":"stale"}');
    await open('male');
    expect(sessionStorage.getItem('onboarding_running_answers')).toBeNull();
    expect(R.push).not.toHaveBeenCalled();
    await m!.click('[data-stub="continue"]');
    expect(sessionStorage.getItem('strength_quiz_v3_intro_step')).toBe('assessment');
    await m!.click('[data-stub="continue"]');
    expect(JSON.parse(sessionStorage.getItem('onboarding_program_path')!)).toEqual(['body_focus']);
    expect(JSON.parse(sessionStorage.getItem('onboarding_muscle_focus')!)).toEqual(['push', 'pull', 'legs', 'core']);
    expect(JSON.parse(sessionStorage.getItem('onboarding_skill_focus')!)).toEqual([]);
    expect(JSON.parse(sessionStorage.getItem('onboarding_exercise_wishlist')!)).toEqual([]);
    expect(sessionStorage.getItem('onboarding_goal_note')).toBeNull();
    expect(R.funnel).toHaveBeenCalledWith('PERSONA');
    expect(R.push).toHaveBeenCalledWith('/onboarding-new/assessment-visual');
  });

  it('back from the assessment returns to screen 2; back on screen 2 returns to screen 1', async () => {
    sessionStorage.setItem('strength_quiz_v3_intro_step', 'assessment');
    await open('female');
    expect(q('[data-quiz-v3="assessment-intro"]')).not.toBeNull();
    await m!.click('[data-stub="back"]');
    expect(q('[data-quiz-v3="welcome"]')).not.toBeNull();
    expect(sessionStorage.getItem('strength_quiz_v3_intro_step')).toBeNull();
    expect(R.back).not.toHaveBeenCalled();
  });

  it('the explainer video link is a stub: clicking it does nothing', async () => {
    await open('male');
    await m!.click('[data-stub="continue"]');
    await m!.clickText('סרטון הסבר קצר');
    expect(R.push).not.toHaveBeenCalled();
  });
});
