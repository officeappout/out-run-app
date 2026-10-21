// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, batch t): the remaining onboarding screens — snapshots
 * recorded BEFORE the extraction, from unmodified origin/main. The extraction commit must render the
 * same Hebrew markup.
 *
 * Covers BlurryBridgeOverlay, WelcomeDrawer, HealthConnectOptInStep, ResultLoading, JITSetupModal,
 * OnboardingLayout, OnboardingWizard (health-declaration step), SignaturePad, DynamicQuestionRenderer
 * (pace input + unknown type) and ProgramResult — v1 and v2 (enable_home_v2), male / female / other
 * / unset, every branch a prop, a timer or a tap reaches. jsdom + react-dom/client; framer-motion is
 * replaced by plain elements and children from other areas are stubs that print the props this
 * extraction feeds them. `<!-- -->` is stripped before comparing (react-dom/server's separator
 * between adjacent text nodes; react-dom/client emits none — stripped anyway, same rule as the
 * static parity tests).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const S = vi.hoisted(() => ({
  v2: false,
  profile: null as Record<string, unknown> | null,
  router: { push: () => {}, replace: () => {}, back: () => {} },
  health: { isRequesting: false, unavailableReason: null as string | null },
  hdAccepted: false,
  userDoc: null as Promise<unknown> | null,
}));

vi.mock('framer-motion', async () => (await import('../steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1', isAnonymous: false } }, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => S.router,
  usePathname: () => '/onboarding-new/health',
  useSearchParams: () => null,
}));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({
  useOnboardingV2: () => S.v2,
  useOnboardingV2State: () => ({ v2: S.v2, ready: true, quizHintV2: false }),
}));
vi.mock('@/features/home/context/HomeV2Context', () => ({ useHomeV2: () => S.v2 }));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: S.profile, refreshProfile: async () => {}, _hasHydrated: true });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/features/user', async () => {
  const m = await import('@/features/user/identity/store/useUserStore');
  return { useUserStore: m.useUserStore };
});
vi.mock('@/features/analytics/AnalyticsService', () => ({
  Analytics: new Proxy({}, { get: () => async () => {} }),
}));
vi.mock('@/lib/onboardingPrefs', () => ({
  setOnboardingPref: () => {},
  getOnboardingPref: () => null,
  getOnboardingPrefAsync: async () => null,
  removeOnboardingPref: () => {},
}));
vi.mock('@/hooks/useHealthWithDisclosure', () => ({
  useHealthWithDisclosure: () => ({
    triggerHealthPermission: () => {},
    disclosureProps: {},
    isRequesting: S.health.isRequesting,
    unavailableReason: S.health.unavailableReason,
  }),
}));
vi.mock('@/components/ui/HealthConnectDisclosureModal', () => ({ default: () => <div data-stub="hc-disclosure" /> }));
vi.mock('@/lib/healthBridge/init', () => ({
  getHealthPermissionState: async () => 'prompt',
  deferHealthPermissionOnboarding: async () => {},
}));
vi.mock('@/lib/health-declaration', () => ({ hasAcceptedHealthDeclaration: () => S.hdAccepted }));
vi.mock('@/features/user/onboarding/components/HealthDeclarationStep', () => ({
  default: (p: { title?: string; description?: string }) => (
    <div data-stub="health-step" data-title={p.title ?? ''} data-description={p.description ?? ''} />
  ),
}));
vi.mock('@/features/user/onboarding/components/IdentityProfileScreen', () => ({
  default: (p: { context?: string }) => <div data-stub="identity" data-context={p.context ?? ''} />,
}));
// OnboardingWizard's steps (other folders / batches) — stubs.
vi.mock('@/features/user/onboarding/components/steps/PersonaStep', () => ({ default: () => <div data-stub="persona" /> }));
vi.mock('@/features/user/onboarding/components/steps/PersonalStatsStep', () => ({ default: () => <div data-stub="stats" /> }));
vi.mock('@/features/user/onboarding/components/steps/UnifiedLocationStep', () => ({ default: () => <div data-stub="location" /> }));
vi.mock('@/features/user/onboarding/components/steps/EquipmentStep', () => ({ default: () => <div data-stub="equipment" /> }));
vi.mock('@/features/user/onboarding/components/steps/ScheduleStep', () => ({ default: () => <div data-stub="schedule" /> }));
vi.mock('@/features/user/onboarding/components/steps/AccountSecureStep', () => ({ default: () => <div data-stub="account" /> }));
vi.mock('@/features/user/onboarding/components/steps/ProcessingStep', () => ({ default: () => <div data-stub="processing" /> }));
vi.mock('@/features/user/onboarding/components/steps/AccessCodeStep', () => ({ default: () => <div data-stub="access" /> }));
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({
  syncOnboardingToFirestore: async () => {},
}));
vi.mock('@/lib/firestore.service', () => ({ getUserFromFirestore: () => S.userDoc ?? Promise.resolve(null) }));
vi.mock('@/features/user/onboarding/hooks/useLandingRealFallback', () => ({ useLandingRealFallback: () => ({ enabled: false }) }));
vi.mock('react-signature-canvas', () => ({ default: () => <canvas data-stub="sig-canvas" /> }));
vi.mock('@/features/content/exercises/core/exercise.service', () => ({ getExercise: async () => null }));
vi.mock('@/features/user/onboarding/components/running-v2/RunningChoiceV2', () => ({
  RunningGoalPickerV2: () => <div data-stub="goal-picker" />,
  RunningAbilityPickerV2: () => <div data-stub="ability-picker" />,
}));
vi.mock('@/features/user/onboarding/components/PremiumExerciseCard', () => ({ default: () => <div data-stub="premium-card" /> }));

import { mount, type Mounted } from '../steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import BlurryBridgeOverlay from '../BlurryBridgeOverlay';
import WelcomeDrawer from '../WelcomeDrawer';
import HealthConnectOptInStep from '../HealthConnectOptInStep';
import ResultLoading from '../ResultLoading';
import { JITSetupModal } from '../JITSetupModal';
import OnboardingLayout from '../OnboardingLayout';
import OnboardingWizard from '../OnboardingWizard';
import SignaturePad from '../SignaturePad';
import DynamicQuestionRenderer from '../DynamicQuestionRenderer';
import ProgramResult from '../ProgramResult';

const snap = (name: string) => `./__snapshots__/onboarding-screens-i18n/${name}.html`;
const noop = () => {};
const V = (v2: boolean) => `v${v2 ? 2 : 1}`;
const STORE_DEFAULTS = { ...useOnboardingStore.getState() };
const LOCALE_DEFAULTS = { ...useLocaleStore.getState() };
let m: Mounted | null = null;

/**
 * Markup without inline `style` attributes (animation values only — never text; pitfall 34) and
 * without ProgramResult's empty confetti squares (size only — they carry no text).
 */
const html = (r: Mounted) =>
  r.html()
    .replace(/ style="[^"]*"/g, '')
    .replace(/<div class="absolute w-3 h-3 [^"]*"><\/div>/g, '');

async function render(el: ReactElement): Promise<Mounted> {
  m?.unmount();
  document.body.innerHTML = '';
  m = await mount(el);
  return m;
}
function session(entries: Record<string, string>) {
  sessionStorage.clear();
  for (const [k, v] of Object.entries(entries)) sessionStorage.setItem(k, v);
}
const flush = async () => {
  const { act } = await import('react');
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  S.v2 = false;
  S.profile = null;
  S.health = { isRequesting: false, unavailableReason: null };
  S.hdAccepted = false;
  S.userDoc = null;
  sessionStorage.clear();
  localStorage.clear();
  document.body.innerHTML = '';
  useOnboardingStore.setState({ ...STORE_DEFAULTS });
  useLocaleStore.setState({ ...LOCALE_DEFAULTS });
});
afterEach(() => {
  m?.unmount();
  m = null;
});

describe('BlurryBridgeOverlay', () => {
  it('renders', async () => {
    await expect(html(await render(<BlurryBridgeOverlay onStartWizard={noop} onSkip={noop} />))).toMatchFileSnapshot(
      snap('bridge'),
    );
  });
});

describe('WelcomeDrawer', () => {
  for (const v2 of [false, true]) {
    it(`every geo branch × gender (incl. unset / odd), with / without just-look, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female', 'other', undefined, 'x']) {
        S.profile = gender === undefined ? null : { id: 'u1', core: { gender } };
        for (const geoBranch of ['gardens', 'routes', 'none'] as const) {
          for (const justLook of [true, false]) {
            const r = await render(
              <WelcomeDrawer
                geoBranch={geoBranch}
                onStrengthProgram={noop}
                onSecondaryOption={noop}
                onSkipToMap={noop}
                onJustLook={justLook ? noop : undefined}
              />,
            );
            out.push(`<!-- ${gender ?? 'unset'} / ${geoBranch} / ${justLook} -->`, html(r));
          }
        }
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`welcome-${V(v2)}`));
    });
  }
});

describe('HealthConnectOptInStep', () => {
  for (const v2 of [false, true]) {
    it(`idle / requesting × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female', 'other', '']) {
        for (const isRequesting of [false, true]) {
          session(gender ? { onboarding_personal_gender: gender } : {});
          S.health = { isRequesting, unavailableReason: null };
          const r = await render(<HealthConnectOptInStep onContinue={noop} />);
          await flush();
          out.push(`<!-- ${gender || 'unset'} / ${isRequesting} -->`, html(r));
        }
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`health-connect-${V(v2)}`));
    });
  }
});

describe('ResultLoading', () => {
  for (const v2 of [false, true]) {
    it(`every phrase, he / en / ru, ${V(v2)}`, async () => {
      const out: string[] = [];
      for (const language of ['he', 'en', 'ru'] as const) {
        const r = await render(<ResultLoading targetLevel={5} onComplete={noop} language={language} v2={v2} />);
        out.push(`<!-- ${language} -->`, html(r));
        for (let i = 0; i < 4; i++) {
          await r.advance(800);
          out.push(html(r));
        }
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`result-loading-${V(v2)}`));
    });
  }
});

describe('JITSetupModal', () => {
  const REQS = {
    health: { id: 'health', step: 'HEALTH_DECLARATION', label: 'הצהרת בריאות', isHardBlock: true },
    account: { id: 'account', step: 'ACCOUNT_SECURE', label: 'גיבוי חשבון', isHardBlock: false },
    equipment: { id: 'equipment', step: 'EQUIPMENT', label: 'ציוד', isHardBlock: false },
    other: { id: 'mystery', step: 'PERSONA', label: 'משהו', isHardBlock: false },
    identity: { id: 'identity', step: 'IDENTITY', label: 'פרטים', isHardBlock: true },
  };
  const SETS: Array<[string, unknown[]]> = [
    ['health+account', [REQS.health, REQS.account]],
    ['account', [REQS.account]],
    ['equipment', [REQS.equipment]],
    ['equipment+account', [REQS.equipment, REQS.account]],
    ['unknown', [REQS.other]],
    ['identity', [REQS.identity, REQS.health]],
  ];
  for (const v2 of [false, true]) {
    it(`every requirement set × gender, inline health step, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female', 'other', undefined]) {
        S.profile = gender === undefined ? null : { id: 'u1', core: { gender } };
        for (const [name, requirements] of SETS) {
          const r = await render(
            <JITSetupModal
              isOpen
              requirements={requirements as never}
              onComplete={noop}
              onDismiss={noop}
              onCancel={noop}
            />,
          );
          out.push(`<!-- ${gender ?? 'unset'} / ${name} -->`, html(r));
        }
      }
      // Inline health declaration (tap the CTA on a health hard block).
      S.profile = { id: 'u1', core: { gender: 'female' } };
      const r = await render(
        <JITSetupModal isOpen requirements={[REQS.health] as never} onComplete={noop} onDismiss={noop} onCancel={noop} />,
      );
      await r.click('button');
      out.push('<!-- inline health -->', html(r));
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`jit-${V(v2)}`));
    });
  }
});

describe('OnboardingLayout', () => {
  for (const v2 of [false, true]) {
    it(`continue label (default / dictionary key / override), back, he / en / ru, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const lang of ['he', 'en', 'ru']) {
        session({ onboarding_language: lang });
        for (const props of [
          {},
          { continueLabelKey: 'onboarding.continue' as never },
          { continueLabel: 'יאללה' },
        ]) {
          const r = await render(
            <OnboardingLayout headerType="progress" onContinue={noop} canContinue onBack={noop} showBack {...props}>
              <p>child</p>
            </OnboardingLayout>,
          );
          out.push(`<!-- ${lang} / ${JSON.stringify(props)} -->`, html(r));
        }
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`layout-${V(v2)}`));
    });
  }
});

describe('OnboardingWizard', () => {
  for (const v2 of [false, true]) {
    it(`health-declaration step: loading, then the form props, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      let resolve!: (v: unknown) => void;
      S.userDoc = new Promise((res) => {
        resolve = res;
      });
      useOnboardingStore.setState({ ...STORE_DEFAULTS, currentStep: 'HEALTH_DECLARATION' as never });
      const r = await render(<OnboardingWizard />);
      out.push(html(r));
      resolve(null);
      await flush();
      out.push(html(r));
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`wizard-${V(v2)}`));
    });
  }
});

describe('SignaturePad', () => {
  it('renders', async () => {
    await expect(html(await render(<SignaturePad onEnd={noop} />))).toMatchFileSnapshot(snap('signature-pad'));
  });
});

describe('DynamicQuestionRenderer', () => {
  const pace = { id: 'q_run_pace_input', type: 'input', title: 'כותרת', answers: [] };
  const unknown = { id: 'q_x', type: 'mystery', title: 'שאלה', description: 'תיאור', answers: [] };
  for (const v2 of [false, true]) {
    it(`pace input every distance × gender, unknown type, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const [gender, dists] of [['male', ['3k', '5k', '10k']], ['female', ['5k', '10k']], ['', ['']]] as const) {
        for (const dist of dists) {
          session({
            ...(gender ? { onboarding_personal_gender: gender } : {}),
            ...(dist ? { onboarding_running_answers: JSON.stringify({ targetDistance: dist }) } : {}),
          });
          const r = await render(<DynamicQuestionRenderer question={pace as never} onAnswer={noop} />);
          out.push(`<!-- ${gender || 'unset'} / ${dist || 'none'} -->`, html(r));
        }
      }
      session({});
      out.push(html(await render(<DynamicQuestionRenderer question={unknown as never} onAnswer={noop} />)));
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`dynamic-${V(v2)}`));
    });
  }
});

describe('ProgramResult', () => {
  const CASES: Array<[string, Record<string, unknown>]> = [
    ['default', {}],
    ['all-four', { assessedCategories: ['push', 'pull', 'legs', 'core'], assessmentLevels: { push: 3, pull: 2, legs: 4, core: 1 } }],
    ['one', { assessedCategories: ['pull'], assessmentLevels: { pull: 5 } }],
    ['two', { assessedCategories: ['push', 'legs'], assessmentLevels: { push: 3, legs: 0 } }],
    ['three', { assessedCategories: ['push', 'pull', 'core'], assessmentLevels: { push: 3, pull: 2, core: 6 } }],
    ['skills', { skillLevels: { planche: 2, front_lever: 0, handstand: 4, muscle_up: 1, hspu: 3, one_arm_pullup: 2, calisthenics_upper: 5, back_lever_x: 1 } }],
    ['save-error', { saveError: 'השמירה נכשלה', onSkip: () => {} }],
  ];
  for (const v2 of [false, true]) {
    it(`every reveal phase × case × gender, ${V(v2)}`, async () => {
      const out: string[] = [];
      for (const gender of ['male', 'female', '']) {
        for (const [name, extra] of CASES) {
          session(gender ? { onboarding_personal_gender: gender } : {});
          useLocaleStore.setState({ gender: (gender || 'other') as never });
          const r = await render(
            <ProgramResult userName="" levelNumber={4} maxLevel={25} language="he" onContinue={noop} v2={v2} {...(extra as object)} />,
          );
          const frames = [html(r)];
          for (const ms of [2400, 2000]) {
            await r.advance(ms);
            frames.push(html(r));
          }
          out.push(`<!-- ${gender || 'unset'} / ${name} -->`, ...frames);
        }
      }
      // Non-Hebrew languages keep their own literals.
      for (const language of ['en', 'ru'] as const) {
        const r = await render(
          <ProgramResult userName="" levelNumber={4} language={language} onContinue={noop} v2={v2} assessedCategories={['push']} />,
        );
        await r.advance(4400);
        out.push(`<!-- ${language} -->`, html(r));
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`program-result-${V(v2)}`));
    });
  }
});

