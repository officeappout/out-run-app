// @vitest-environment jsdom
/**
 * i18n wave 2 batch am: Hebrew markup parity of four route pages and the help hub —
 * `pages` globalError.* (src/app/global-error.tsx), `social` chatPage.* (src/app/chat/[chatId]),
 * `profile` activityLog.* (src/app/progress), `onboarding` healthPage.* (src/app/onboarding-new/health),
 * `legal` help.* (src/features/help: HelpHub, HelpChapterCard, the tour-preview illustrations + screen).
 *
 * Snapshots recorded BEFORE the extraction, from unmodified origin/main. jsdom + react-dom/client
 * (shared harness: src/features/user/onboarding/components/steps/__tests__/i18n-dom-harness.tsx):
 * services are mocked, framer-motion is replaced by plain elements, heavy children are stubs that print
 * the props under test. `<!-- -->` is stripped and React `:rN:` ids are normalised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({
  user: { profile: null as null | Record<string, unknown>, _hasHydrated: true },
  authUser: null as null | { uid: string },
  chatDoc: null as null | Record<string, unknown>,
  chatFails: false,
  v2: false,
  track: null as string | null,
  accepted: false,
  help: [] as Array<{ id: string; q: string; a: string[]; tags: string[] }>,
}));

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} };
  return { useRouter: () => router };
});
vi.mock('framer-motion', () => motionStub);
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));
vi.mock('@/lib/chunk-reload', () => ({ clearChunkReloadFlag: () => {}, reloadOnceForChunkError: () => {} }));
vi.mock('@/lib/firebase', () => ({
  db: {},
  app: {},
  get auth() {
    return { currentUser: S.authUser };
  },
}));
vi.mock('firebase/firestore', () => {
  class Timestamp {
    toDate() {
      return new Date(0);
    }
  }
  return {
    Timestamp,
    doc: () => ({}),
    getDoc: async () => {
      if (S.chatFails) throw new Error('boom');
      return { id: 'c1', exists: () => S.chatDoc !== null, data: () => S.chatDoc ?? {} };
    },
  };
});
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const useUserStore = (sel?: (s: unknown) => unknown) => {
    const state = { ...S.user, refreshProfile: async () => {} };
    return sel ? sel(state) : state;
  };
  return { useUserStore };
});
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(S.user) : S.user);
  return { useUserStore };
});
// chat
vi.mock('@/features/social/store/useChatStore', () => ({ useChatStore: { setState: () => {} } }));
vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'kelly-uid' }));
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: async () => false }));
// progress
vi.mock('@/features/home/components/agenda/AgendaDayCard', () => ({
  default: (p: { date: string }) => createElement('div', { 'data-day': p.date }),
}));
vi.mock('@/features/home/components/AddWorkoutModal', () => ({ default: () => null }));
// health
vi.mock('@/features/user/onboarding/store/useOnboardingStore', () => ({ useOnboardingStore: () => ({ data: {} }) }));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({ useOnboardingV2: () => S.v2 }));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => S.track }));
vi.mock('@/lib/health-declaration', () => ({ isHealthDeclarationSatisfied: () => S.accepted }));
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({ syncOnboardingToFirestore: async () => {} }));
vi.mock('@/features/analytics/onboarding-funnel', () => ({ logOnboardingFunnelStep: () => {} }));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: () => {}, extractErrorCode: () => '' }));
vi.mock('@/features/user/onboarding/components/HealthDeclarationStep', () => ({
  default: (p: { title: string; description: string }) =>
    createElement('section', { 'data-health-step': '' }, createElement('h1', null, p.title), createElement('p', null, p.description)),
}));
vi.mock('@/features/user/onboarding/components/OnboardingLayout', () => ({
  default: (p: { phaseLabel?: string; children?: ReactNode }) =>
    createElement('main', { 'data-phase': p.phaseLabel }, p.children),
}));
// help
vi.mock('@/lib/app-help/loader', () => ({ loadHelpEntries: async () => S.help }));

import { useLocaleStore } from '@/store/useLocaleStore';
import GlobalError from '@/app/global-error';
import ChatDeepLinkPage from '@/app/chat/[chatId]/page';
import ProgressPage from '@/app/progress/page';
import HealthDeclarationPage from '@/app/onboarding-new/health/page';
import HelpHub from '@/features/help/components/HelpHub';
import HelpChapterCard from '@/features/help/components/HelpChapterCard';
import TourPreviewScreen from '@/features/help/components/tour-preview/TourPreviewScreen';
import { HELP_CHAPTERS } from '@/lib/app-help/chapters';

const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const snap = (name: string) => `./__snapshots__/batch-am/${name}.html`;
const noop = () => {};
let mounted: Mounted | null = null;
const flush = async (m: Mounted) => {
  for (let i = 0; i < 5; i++) await m.advance(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  S.user = { profile: null, _hasHydrated: true };
  S.authUser = null;
  S.chatDoc = null;
  S.chatFails = false;
  S.v2 = false;
  S.track = null;
  S.accepted = false;
  S.help = [];
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
  useLocaleStore.setState(LOCALE_DEFAULTS);
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
});

describe('global-error', () => {
  it.each([
    ['plain', new Error('x')],
    ['chunk', Object.assign(new Error('Loading chunk 12 failed'), { name: 'ChunkLoadError' })],
  ] as const)('%s', async (name, error) => {
    mounted = await mount(<GlobalError error={error} reset={noop} />);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`global-error-${name}`));
  });
});

describe('/chat/[chatId]', () => {
  it('loading', async () => {
    S.chatDoc = { participants: [] };
    mounted = await mount(<ChatDeepLinkPage params={{ chatId: 'c1' }} />);
    await expect(mounted.html()).toMatchFileSnapshot(snap('chat-loading'));
  });
  it.each([
    ['ready', { participants: ['a', 'b'] }, false],
    ['not-found', null, false],
    ['error', null, true],
  ] as const)('%s', async (name, chatDoc, fails) => {
    S.chatDoc = chatDoc as Record<string, unknown> | null;
    S.chatFails = fails;
    mounted = await mount(<ChatDeepLinkPage params={{ chatId: 'c1' }} />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`chat-${name}`));
  });
  it('no chat id', async () => {
    mounted = await mount(<ChatDeepLinkPage params={{ chatId: '' }} />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('chat-no-id'));
  });
});

describe('/progress', () => {
  it('not hydrated', async () => {
    S.user = { profile: null, _hasHydrated: false };
    mounted = await mount(<ProgressPage />);
    await expect(mounted.html()).toMatchFileSnapshot(snap('progress-loading'));
  });
  it('no profile', async () => {
    mounted = await mount(<ProgressPage />);
    await expect(mounted.html()).toMatchFileSnapshot(snap('progress-no-profile'));
  });
  it.each(['הכל', 'כוח', 'ריצה'])('log, segment %s', async (segment) => {
    S.user = { profile: { id: 'u1', lifestyle: {} }, _hasHydrated: true };
    mounted = await mount(<ProgressPage />);
    await mounted.clickText(segment);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`progress-${segment === 'הכל' ? 'all' : segment === 'כוח' ? 'strength' : 'running'}`));
  });
});

describe('/onboarding-new/health', () => {
  it.each([
    ['form-strength-v1', false, null],
    ['form-strength-v2', true, null],
    ['form-running-v2', true, 'RUNNING'],
  ] as const)('%s', async (name, v2, track) => {
    S.v2 = v2;
    S.track = track;
    mounted = await mount(<HealthDeclarationPage />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`health-${name}`));
  });
  it.each([false, true])('loading (not hydrated), v2=%s', async (v2) => {
    S.v2 = v2;
    S.user = { profile: null, _hasHydrated: false };
    mounted = await mount(<HealthDeclarationPage />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`health-loading-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('auto-skip failed (no auth), v2=%s', async (v2) => {
    S.v2 = v2;
    S.accepted = true;
    mounted = await mount(<HealthDeclarationPage />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`health-skip-failed-v${v2 ? 2 : 1}`));
  });
});

describe('help hub', () => {
  const ENTRIES = [
    { id: 'e1', q: 'איך מוסיפים אימון?', a: ['מהבית'], tags: ['אימון'] },
    { id: 'e2', q: 'מה זה צעדים?', a: ['צעדים'], tags: ['צעדים'] },
  ];
  it('home: chapters, tours, all questions', async () => {
    S.help = ENTRIES;
    mounted = await mount(<HelpHub onClose={noop} />);
    await flush(mounted);
    await expect(mounted.html()).toMatchFileSnapshot(snap('help-hub'));
  });
  it('search with no result', async () => {
    S.help = ENTRIES;
    mounted = await mount(<HelpHub onClose={noop} />);
    await flush(mounted);
    await mounted.type('input', 'zzzz');
    await expect(mounted.html()).toMatchFileSnapshot(snap('help-hub-no-result'));
  });
  it('chapter card: tour / screen', async () => {
    const withTour = HELP_CHAPTERS.find((c) => c.tour)!;
    const withHref = { ...withTour, tour: undefined, href: '/map' };
    mounted = await mount(
      <div>
        <HelpChapterCard chapter={withTour} onShow={noop} onSelect={noop} selected />
        <HelpChapterCard chapter={withHref as never} onShow={noop} onSelect={noop} selected={false} />
      </div>,
    );
    await expect(mounted.html()).toMatchFileSnapshot(snap('help-chapter-cards'));
  });
  it.each(['player', 'route', 'route-player', 'station'] as const)('tour preview %s', async (tour) => {
    mounted = await mount(<TourPreviewScreen tour={tour} step={0} gender="male" onClose={noop} />);
    await expect(mounted.html()).toMatchFileSnapshot(snap(`tour-preview-${tour}`));
  });
});
