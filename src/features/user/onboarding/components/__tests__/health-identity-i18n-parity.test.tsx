// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, batch t): HealthDeclarationStep and IdentityProfileScreen —
 * snapshots recorded BEFORE the extraction, from unmodified origin/main. The extraction commit must
 * render the same Hebrew markup (and raise the same alert() text).
 *
 * HealthDeclarationStep: v1 / v2, male / female / unset, with / without a signer name, the word
 * animation after its timers, the fast track, a "yes" answer (warning + blocked state), the progress
 * hint, signing (received pill, terms hint), submitting, the privacy & safety sheet. The PAR-Q
 * questions and the legal text come from ../data (not extracted here) and are rendered as they are.
 * IdentityProfileScreen: v1 / v2, every context (default, profile-only, express with / without a
 * group, workout, program), every gender pick, under-14 / invalid date, the no-uid wait screen,
 * saving, and the three alert() paths.
 * jsdom + react-dom/client; framer-motion is replaced by plain elements. Inline `style` attributes
 * are stripped (animation values only, never text). `<!-- -->` is stripped before comparing.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const S = vi.hoisted(() => ({
  v2: false,
  jit: false,
  profile: null as Record<string, unknown> | null,
  router: { push: () => {}, replace: () => {}, back: () => {} },
  user: { uid: 'u1', getIdToken: async () => 'tok' as string | null } as
    | { uid: string; getIdToken: () => Promise<string | null> }
    | null,
  alerts: [] as string[],
}));

vi.mock('framer-motion', async () => (await import('../steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({
  db: {},
  app: {},
  auth: {
    get currentUser() {
      return S.user;
    },
  },
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    cb(S.user);
    return () => {};
  },
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => S.router, usePathname: () => '/onboarding-new/profile' }));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({
  useOnboardingV2: () => S.v2,
  useOnboardingV2State: () => ({ v2: S.v2, ready: true, quizHintV2: false }),
}));
vi.mock('@/features/user/onboarding/hooks/useJitIdentityV1', () => ({ useJitIdentityV1: () => S.jit }));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({
    profile: S.profile,
    updateProfile: async () => {},
    refreshProfile: async () => {},
    _hasHydrated: true,
  });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/lib/onboardingPrefs', () => ({
  setOnboardingPref: () => {},
  getOnboardingPref: () => null,
  getOnboardingPrefAsync: async () => null,
  removeOnboardingPref: () => {},
}));
vi.mock('@/features/user/onboarding/services/health-declaration-local', () => ({
  markHealthDeclarationAcceptedLocally: () => {},
}));
vi.mock('@/features/user/onboarding/services/health-declaration-record', () => ({
  submitHealthDeclaration: () => {},
  signatureFits: () => true,
  SIGNATURE_WIDTHS: [520],
}));
vi.mock('@/features/user/onboarding/services/pdf-service', () => ({}));
vi.mock('@/features/legal/components/LegalDocModal', () => ({
  default: (p: { type: string; isOpen: boolean }) => <div data-stub="legal" data-type={p.type} data-open={String(p.isOpen)} />,
}));
vi.mock('@/features/user/onboarding/utils/onboarding-confetti', () => ({ firePhaseConfetti: () => {} }));
vi.mock('@/lib/resolveJoinLanding', () => ({ resolveJoinLanding: () => '/x' }));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: () => {}, extractErrorCode: () => 'x' }));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ isMiniAssessmentActive: () => false }));
vi.mock('@/features/user/onboarding/hooks/useLandingRealFallback', () => ({
  useLandingRealFallback: () => ({ enabled: false }),
}));

import { mount, type Mounted } from '../steps/__tests__/i18n-dom-harness';
import HealthDeclarationStep from '../HealthDeclarationStep';
import IdentityProfileScreen from '../IdentityProfileScreen';

const snap = (name: string) => `./__snapshots__/health-identity-i18n/${name}.html`;
const noop = () => {};
const V = (v2: boolean) => `v${v2 ? 2 : 1}`;
let m: Mounted | null = null;

const html = (r: Mounted) => r.html().replace(/ style="[^"]*"/g, '');

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
const buttons = () => Array.from(document.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => (b.textContent ?? '').includes(text));
const flush = async () => {
  const { act } = await import('react');
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
};
async function fire(el: Element, type: string) {
  const { act } = await import('react');
  await act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 }));
  });
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.alert = (msg?: unknown) => {
    S.alerts.push(String(msg));
  };
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  S.v2 = false;
  S.jit = false;
  S.profile = null;
  S.user = { uid: 'u1', getIdToken: async () => 'tok' };
  S.alerts = [];
  sessionStorage.clear();
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(() => {
  m?.unmount();
  m = null;
});

describe('HealthDeclarationStep', () => {
  for (const v2 of [false, true]) {
    it(`intro × gender × name, fast track, yes answer, sign, submit, safety sheet, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female', '']) {
        for (const name of ['דנה', '']) {
          session({
            ...(gender ? { onboarding_personal_gender: gender } : {}),
            ...(name ? { onboarding_personal_name: name } : {}),
          });
          for (const title of [undefined, 'כותרת מבחוץ']) {
            const r = await render(<HealthDeclarationStep title={title} description="תיאור" onContinue={noop} />);
            await r.advance(3000);
            out.push(`<!-- ${gender || 'unset'} / ${name || 'no name'} / ${title ?? 'no title'} -->`, html(r));
          }
        }
      }
      // JIT identity flag: profile gender / name win.
      S.jit = true;
      S.profile = { id: 'u1', core: { name: 'רוני', gender: 'female' } };
      session({});
      let r = await render(<HealthDeclarationStep onContinue={noop} />);
      await r.advance(3000);
      out.push('<!-- jit profile -->', html(r));
      S.jit = false;
      S.profile = null;

      for (const gender of ['male', 'female']) {
        session({ onboarding_personal_gender: gender });
        // Fast track → all "no" → sign → terms → submit.
        r = await render(<HealthDeclarationStep onContinue={noop} />);
        await r.advance(3000);
        await r.click(byText('שכל התשובות הן')!);
        await r.advance(400);
        out.push(`<!-- ${gender} fast track -->`, html(r));
        const canvas = document.querySelector('canvas')!;
        await fire(canvas, 'mousedown');
        await fire(canvas, 'mouseup');
        out.push(`<!-- ${gender} signed -->`, html(r));
        const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
        await r.click(box);
        out.push(`<!-- ${gender} terms -->`, html(r));
        const submit = buttons()[buttons().length - 1];
        await r.click(submit);
        out.push(`<!-- ${gender} submitting -->`, html(r));

        // A "yes" answer → warning; all answered → blocked.
        r = await render(<HealthDeclarationStep onContinue={noop} />);
        await r.advance(3000);
        const yes = buttons().filter((b) => b.textContent === 'כן');
        const no = buttons().filter((b) => b.textContent?.startsWith('לא') && b.textContent.length <= 3);
        await r.click(yes[0]);
        out.push(`<!-- ${gender} one yes -->`, html(r));
        for (const b of no.slice(1)) await r.click(b);
        await r.advance(400);
        out.push(`<!-- ${gender} blocked -->`, html(r));

        // Privacy & safety sheet, clear signature.
        await r.click(byText('מידע על פרטיות ובטיחות')!);
        out.push(`<!-- ${gender} safety sheet -->`, html(r));
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`health-${V(v2)}`));
    });
  }
});

describe('IdentityProfileScreen', () => {
  const CONTEXTS: Array<[string, string | null, Record<string, string>]> = [
    ['default', null, {}],
    ['profile-only', 'profile-only', {}],
    ['express-join', 'express', { pending_invite_group_name: 'הרצים של חולון' }],
    ['express', 'express', {}],
    ['workout', 'workout', {}],
    ['program', 'program', {}],
  ];
  for (const v2 of [false, true]) {
    it(`every context × gender pick, date errors, wait screen, saving, alerts, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const [name, context, local] of CONTEXTS) {
        localStorage.clear();
        for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
        const r = await render(<IdentityProfileScreen context={context} onWorkoutBack={noop} onWorkoutIdentitySaved={noop} />);
        await r.advance(2000);
        out.push(`<!-- ${name} -->`, html(r));
        for (const label of ['אישה', 'גבר', 'אחר']) {
          await r.click(byText(label)!);
          out.push(`<!-- ${name} / ${label} -->`, html(r));
        }
      }
      localStorage.clear();

      // Under 14 (prefilled) and an invalid date (typed).
      S.profile = { id: 'u1', core: { name: 'נועה', gender: 'female', birthDate: '2016-05-05' } };
      let r = await render(<IdentityProfileScreen />);
      await r.advance(500);
      out.push('<!-- under 14 -->', html(r));
      S.profile = null;
      r = await render(<IdentityProfileScreen />);
      await r.type('input[maxlength="2"]', '31');
      const inputs = Array.from(document.querySelectorAll('input[maxlength="2"]'));
      await r.click(inputs[1]);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const { act } = await import('react');
      await act(async () => {
        setter.call(inputs[1], '02');
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      });
      await r.type('input[maxlength="4"]', '2000');
      out.push('<!-- invalid date -->', html(r));

      // No uid anywhere → the wait screen.
      S.user = null;
      r = await render(<IdentityProfileScreen />);
      out.push('<!-- no uid -->', html(r));

      // Saving: a complete prefilled form, the id token never resolves.
      S.user = { uid: 'u1', getIdToken: () => new Promise<string | null>(() => {}) };
      for (const context of [null, 'profile-only']) {
        for (const gender of ['female', 'male']) {
          S.profile = { id: 'u1', core: { name: 'נועה', gender, birthDate: '1990-05-05' } };
          r = await render(<IdentityProfileScreen context={context} />);
          await r.advance(500);
          out.push(`<!-- ready ${context ?? 'default'} / ${gender} -->`, html(r));
          await r.click(buttons()[buttons().length - 1]);
          out.push(`<!-- saving ${context ?? 'default'} / ${gender} -->`, html(r));
        }
      }

      // alert() paths: no id token; server error.
      S.user = { uid: 'u1', getIdToken: async () => null };
      S.profile = { id: 'u1', core: { name: 'נועה', gender: 'male', birthDate: '1990-05-05' } };
      r = await render(<IdentityProfileScreen />);
      await r.advance(500);
      await r.click(buttons()[buttons().length - 1]);
      await flush();
      S.user = { uid: 'u1', getIdToken: async () => 'tok' };
      globalThis.fetch = (async () => ({ ok: false, json: async () => ({ error: 'boom' }) })) as never;
      r = await render(<IdentityProfileScreen />);
      await r.advance(500);
      await r.click(buttons()[buttons().length - 1]);
      await flush();
      out.push('<!-- alerts -->', ...S.alerts);
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`identity-${V(v2)}`));
    });
  }
});
