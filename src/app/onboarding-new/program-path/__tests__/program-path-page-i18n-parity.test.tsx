// @vitest-environment jsdom
/**
 * i18n wave 2 batch ae (namespace `onboarding`, keys `programPath.page.*`): the strength program-path
 * PAGE's own copy — snapshots recorded BEFORE the extraction, from unmodified origin/main. The
 * extraction commit must render the same Hebrew markup.
 *
 * Covers the legacy three-card screen (male / female; every card expanded; the muscle and skill coach
 * tips with the flipped CTA) and the continue labels the page hands to ProgramPathV2View /
 * ProgramPathSkillsStepV2 / OnboardingLayout (stubs that print the props this extraction feeds them).
 * jsdom + react-dom/client; framer-motion is plain elements. `<!-- -->` is stripped before comparing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({ v2: false }));

vi.mock('framer-motion', async () => (await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({
    exists: () => true,
    data: () => ({ pull: ['ex_pull'], push: ['ex_push'], legs: [], core: [] }),
  }),
}));
vi.mock('@/features/content/exercises/core/exercise.service', () => ({ getExercise: async () => null }));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({ useOnboardingV2: () => S.v2 }));
vi.mock('@/features/user/onboarding/services/visual-content-resolver.service', () => ({
  getOnboardingLevelsForCategory: async (id: string) => (id === 'front_lever' ? [] : [1, 2]),
}));
vi.mock('@/features/user/onboarding/services/goal-image-resolver.service', () => ({
  resolveLibraryGoalImage: async () => null,
}));
vi.mock('@/lib/onboardingPrefs', () => ({
  getOnboardingPref: () => null,
  setOnboardingPref: () => {},
  getOnboardingPrefAsync: async () => null,
  removeOnboardingPref: () => {},
}));
vi.mock('@/features/analytics/onboarding-funnel', () => ({ logOnboardingFunnelStep: () => {} }));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: null });
  const useUserStore = (sel: (s: unknown) => unknown) => sel(state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/features/user/onboarding/components/OnboardingLayout', () => ({
  default: (p: { continueLabel?: string; phaseLabel?: string; onContinue: () => void; children?: React.ReactNode }) => (
    <div data-stub="layout" data-phase={p.phaseLabel ?? ''}>
      {p.children}
      <button data-stub="continue" onClick={p.onContinue}>
        {p.continueLabel}
      </button>
    </div>
  ),
}));
vi.mock('@/features/user/onboarding/components/program-path/ProgramPathV2View', () => ({
  default: (p: {
    continueLabel: string;
    onSelectGoal: (id: string) => void;
    onPickAreaTile: (id: string) => void;
    onContinue: () => void;
  }) => (
    <div data-stub="v2goal" data-continue={p.continueLabel}>
      <button data-stub="goal-body" onClick={() => p.onSelectGoal('body_focus')} />
      <button data-stub="tile-upper" onClick={() => p.onPickAreaTile('upper')} />
      <button data-stub="goal-skills" onClick={() => p.onSelectGoal('skills')} />
      <button data-stub="v2-continue" onClick={p.onContinue} />
    </div>
  ),
}));
vi.mock('@/features/user/onboarding/components/program-path/ProgramPathSkillsStepV2', () => ({
  default: (p: { continueLabel: string; toggleSkill: (id: string) => void; onContinue: () => void }) => (
    <div data-stub="v2skills" data-continue={p.continueLabel}>
      <button data-stub="skill-planche" onClick={() => p.toggleSkill('planche')} />
      <button data-stub="skills-continue" onClick={p.onContinue} />
    </div>
  ),
}));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import ProgramPathPage from '../page';
import { useLocaleStore } from '@/store/useLocaleStore';

const snap = (name: string) => `./__snapshots__/program-path-page-i18n/${name}.html`;
let m: Mounted | null = null;

async function open(gender: 'male' | 'female' | null, v2 = false) {
  S.v2 = v2;
  sessionStorage.clear();
  if (gender) sessionStorage.setItem('onboarding_personal_gender', gender);
  // LocaleSync (not mounted here) copies the onboarding gender into the store that useT() reads.
  useLocaleStore.setState({ gender: gender ?? 'other' });
  m = await mount(<ProgramPathPage />);
  // let the mount-time async reads (foundation exercises, skill readiness) settle
  await m.advance(0);
  await m.advance(0);
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  m?.unmount();
  m = null;
  vi.useRealTimers();
});

describe('legacy three-card screen', () => {
  it.each(['male', 'female'] as const)('collapsed, %s', async (g) => {
    await open(g);
    await expect(m!.html()).toMatchFileSnapshot(snap(`legacy-collapsed-${g}`));
  });

  it('collapsed, gender unset', async () => {
    await open(null);
    await expect(m!.html()).toMatchFileSnapshot(snap('legacy-collapsed-unset'));
  });

  it.each(['male', 'female'] as const)('all cards open, picks made, %s', async (g) => {
    await open(g);
    await m!.clickText('בריאות, כוח ואנרגיה');
    await m!.clickText('עיצוב ושרירים');
    await m!.clickText('לומדים תרגילי קליסטניקס מתקדמים');
    await m!.clickText('רוצה לבחור תרגילים להשתפר בהם?');
    await m!.clickText('חזה');
    await m!.clickText('פלאנץ׳');
    await expect(m!.html()).toMatchFileSnapshot(snap(`legacy-open-${g}`));
  });

  it.each(['male', 'female'] as const)('both coach tips after Continue, %s', async (g) => {
    await open(g);
    await m!.clickText('עיצוב ושרירים');
    await m!.clickText('לומדים תרגילי קליסטניקס מתקדמים');
    await m!.clickText('חזה');
    await m!.clickText('פלאנץ׳');
    await m!.click('[data-stub="continue"]');
    await expect(m!.html()).toMatchFileSnapshot(snap(`legacy-tips-${g}`));
  });

  it.each(['male', 'female'] as const)('muscle tip after the skills tip is overridden, %s', async (g) => {
    await open(g);
    await m!.clickText('עיצוב ושרירים');
    await m!.clickText('לומדים תרגילי קליסטניקס מתקדמים');
    await m!.clickText('חזה');
    await m!.clickText('פלאנץ׳');
    await m!.click('[data-stub="continue"]');
    await m!.click('[data-stub="continue"]');
    await expect(m!.html()).toMatchFileSnapshot(snap(`legacy-muscle-tip-${g}`));
  });

  it('skills tip only', async () => {
    await open('female');
    await m!.clickText('לומדים תרגילי קליסטניקס מתקדמים');
    await m!.clickText('פלאנץ׳');
    await m!.click('[data-stub="continue"]');
    await expect(m!.html()).toMatchFileSnapshot(snap('legacy-skills-tip-only-female'));
  });
});

describe('v2 continue labels handed to the stubs', () => {
  it.each(['male', 'female'] as const)('goal step, %s: default then muscle tip', async (g) => {
    await open(g, true);
    const first = q('[data-stub="v2goal"]').getAttribute('data-continue');
    await m!.click('[data-stub="goal-body"]');
    await m!.click('[data-stub="tile-upper"]');
    await m!.click('[data-stub="v2-continue"]');
    const second = q('[data-stub="v2goal"]').getAttribute('data-continue');
    await expect(`${first}\n${second}\n`).toMatchFileSnapshot(snap(`v2-goal-labels-${g}`));
  });

  it.each(['male', 'female'] as const)('skills step, %s: default then skill tip', async (g) => {
    await open(g, true);
    await m!.click('[data-stub="goal-skills"]');
    await m!.click('[data-stub="v2-continue"]');
    await m!.click('[data-stub="skill-planche"]');
    const first = q('[data-stub="v2skills"]').getAttribute('data-continue');
    await m!.click('[data-stub="skills-continue"]');
    const second = q('[data-stub="v2skills"]').getAttribute('data-continue');
    await expect(`${first}\n${second}\n`).toMatchFileSnapshot(snap(`v2-skills-labels-${g}`));
  });
});
