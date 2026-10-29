// @vitest-environment jsdom
/**
 * i18n wave 2 batch ak (namespace `onboarding`, keys `landing.*`): Hebrew markup parity of the root
 * page (`/`). Snapshots recorded BEFORE the extraction, from unmodified origin/main.
 *
 * jsdom + react-dom/client via the shared harness (framer-motion stubbed, `<!-- -->` stripped).
 * The page is driven by hand: the auth listener reports a guest (landing UI), the login drawer is
 * opened and its loading states entered, the carousel taglines are cycled with fake timers, and
 * every `showToast` message is recorded. Heavy collaborators are stubs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({
  introOn: false,
  exploreResult: false as boolean | 'throw',
  googleThrows: true,
  toasts: [] as Array<[string, string]>,
  hang: null as null | Promise<never>,
}));

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} };
  return { useRouter: () => router };
});
vi.mock('framer-motion', () => motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: { currentUser: null } }));
vi.mock('@/lib/auth.service', () => ({
  signInWithGoogle: async () => { if (S.hang) return S.hang; throw new Error('google'); },
  signInWithApple: async () => { if (S.hang) return S.hang; throw new Error('apple'); },
  linkWithGoogleAccount: async () => ({}),
  linkWithAppleAccount: async () => ({}),
  signInWithGoogleDirect: async () => ({}),
  signInWithAppleDirect: async () => ({}),
  onAuthStateChange: (cb: (u: unknown) => void) => { void cb(null); return () => {}; },
  SESSION_HINT_NATIVE_KEY: 'k',
}));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPrefAsync: async () => null }));
vi.mock('@/lib/resolveJoinLanding', () => ({ resolveJoinLanding: () => '/home' }));
vi.mock('@/features/user/onboarding/services/run-explore-map-flow', () => ({
  runExploreMapFlow: async () => { if (S.exploreResult === 'throw') throw new Error('x'); return S.exploreResult; },
}));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: () => {}, extractErrorCode: () => 'x' }));
vi.mock('@/components/BrandedSplashScreen', () => ({ default: () => createElement('div', { 'data-splash': '1' }) }));
vi.mock('@/lib/fast-startup/useLandingFastPath', () => ({ useLandingFastPath: () => ({ current: false }) }));
vi.mock('@/lib/fast-startup/flag', () => ({ isFastStartupOn: () => false }));
vi.mock('@/lib/fast-startup/session-uid', () => ({ writeLastAuthUid: () => {} }));
vi.mock('@/lib/fast-startup/perf', () => ({ startupMark: () => {} }));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: (type: string, msg: string) => { S.toasts.push([type, msg]); } }),
}));
vi.mock('@/components/ExistingAccountModal', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/hooks/useEntryIntroV1', () => ({ useEntryIntroV1: () => ({ enabled: S.introOn }) }));
vi.mock('@/features/user/onboarding/hooks/useLandingRealFallback', () => ({ useLandingRealFallback: () => ({ enabled: false }) }));
vi.mock('@/lib/landing-fallback/flag', () => ({ isLandingRealFallbackOn: () => false }));
vi.mock('@/features/user/onboarding/services/run-new-account-flow', () => ({ runNewAccountFlow: async () => true }));
vi.mock('@/features/user/onboarding/services/consume-pending-invites', () => ({
  consumePendingInvites: async () => null,
  hasPendingInvite: () => false,
}));
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: async () => false }));
// Language pill on the intro landing: flags off (no options) renders null, so the snapshots stay byte-identical.
vi.mock('@/hooks/useLanguageSetting', () => ({ useLanguageSetting: () => ({ options: [], locale: 'he', choose: async () => {} }) }));

import LandingPage from '@/app/page';

const snap = (name: string) => `./__snapshots__/landing/${name}.html`;
const flush = async (m: Mounted) => {
  for (let i = 0; i < 5; i++) await m.advance(0);
};

let mounted: Mounted | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  S.introOn = false;
  S.exploreResult = false;
  S.hang = null;
  S.toasts = [];
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mountPage() {
  mounted = await mount(createElement(LandingPage));
  await flush(mounted);
  return mounted;
}

describe('/ (landing page)', () => {
  it.each([0, 1, 2])('guest landing, tagline %i', async (i) => {
    const m = await mountPage();
    for (let k = 0; k < i; k++) await m.advance(4000);
    await expect(m.html()).toMatchFileSnapshot(snap(`guest-tagline-${i}`));
  });

  it('guest landing, entry intro on', async () => {
    S.introOn = true;
    const m = await mountPage();
    await expect(m.html()).toMatchFileSnapshot(snap('guest-intro'));
  });

  it('login drawer', async () => {
    const m = await mountPage();
    await m.clickText('התחברות');
    await expect(m.html()).toMatchFileSnapshot(snap('drawer'));
  });

  it.each(['google', 'apple'])('login drawer, %s loading', async (provider) => {
    const m = await mountPage();
    await m.clickText('התחברות');
    S.hang = new Promise<never>(() => {});
    await m.clickText(provider === 'google' ? 'המשך עם Google' : 'המשך עם Apple');
    await expect(m.html()).toMatchFileSnapshot(snap(`drawer-${provider}-loading`));
  });

  it('toasts: quick signup declined / threw, google / apple sign-in threw', async () => {
    const m = await mountPage();
    S.exploreResult = false;
    await m.clickText('הרשמה מהירה');
    await flush(m);
    S.exploreResult = 'throw';
    await m.clickText('הרשמה מהירה');
    await flush(m);
    await m.clickText('התחברות');
    await m.clickText('המשך עם Google');
    await flush(m);
    await m.clickText('התחברות');
    await m.clickText('המשך עם Apple');
    await flush(m);
    expect(S.toasts.map(([, msg]) => msg).join('\n')).toMatchFileSnapshot(snap('toasts').replace('.html', '.txt'));
  });
});
