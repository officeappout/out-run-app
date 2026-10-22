// @vitest-environment jsdom
/**
 * i18n wave 2 batch ab (namespace `profile`, prefix `publicProfile.*`): Hebrew markup parity of the public
 * profile page (src/app/profile/[userId]/page.tsx). Snapshots recorded BEFORE the extraction, from
 * unmodified origin/main.
 *
 * jsdom + react-dom/client (shared harness: src/features/user/onboarding/components/steps/__tests__/
 * i18n-dom-harness.tsx): the page loads the profile in an effect, so Firestore / feed / partners are
 * mocked and driven by hand, framer-motion is replaced by plain elements, and the already-migrated
 * children (ProfileHeader, PartnersHighlightsRow, PublicActivityGrid) are stubs that print the props this
 * page builds (stat labels, bio placeholder, actions). `<!-- -->` stripped (react-dom/client emits none).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({
  params: { userId: 'u2' } as Record<string, string>,
  me: null as null | { id: string; core?: Record<string, unknown> },
  flags: { enableHomeV2: false },
  flagsReady: true,
  doc: null as null | Record<string, unknown>,
  docPending: false,
  following: false,
  partners: [] as unknown[],
}));

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }; // stable
  return { useRouter: () => router, useParams: () => S.params };
});
vi.mock('framer-motion', () => motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () =>
    S.docPending
      ? new Promise(() => {})
      : Promise.resolve({ exists: () => S.doc !== null, data: () => S.doc }),
}));
vi.mock('@/features/user', () => ({
  useUserStore: (sel: (s: { profile: unknown }) => unknown) => sel({ profile: S.me }),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: S.flags, ready: S.flagsReady }),
}));
vi.mock('@/components/ui/v2/ScreenSkeleton', () => ({ default: () => createElement('div', null, 'skeleton') }));
vi.mock('@/features/social/store/useSocialStore', () => {
  const api = {
    isFollowing: () => S.following,
    followUser: () => {},
    unfollowUser: () => {},
    isLoaded: true,
    loadConnections: () => {},
  };
  return { useSocialStore: () => api };
});
vi.mock('@/features/social/store/useChatStore', () => ({ useChatStore: { getState: () => ({ openDM: async () => {} }) } }));
vi.mock('@/features/social/services/feed.service', () => ({ getUserPosts: async () => [] }));
vi.mock('@/features/social/services/mutual-partners.service', () => ({ getMutualPartners: async () => S.partners }));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({ default: () => null }));
vi.mock('@/components/LinkAccountPrompt', () => ({ default: () => null }));
vi.mock('@/features/profile/components/ProfileHeader', () => ({
  default: (p: {
    name: string;
    stats: Array<{ key: string; value: ReactNode; label: string }>;
    bioPlaceholder?: string;
    actions?: ReactNode;
  }) =>
    createElement('section', null,
      createElement('p', null, `name:${p.name}`),
      ...p.stats.map((s) => createElement('p', { key: s.key }, s.value, `|${s.label}`)),
      createElement('p', null, `bio:${p.bioPlaceholder ?? ''}`),
      p.actions ?? null),
}));
vi.mock('@/features/profile/components/PartnersHighlightsRow', () => ({ default: () => null }));
vi.mock('@/features/profile/components/PublicActivityGrid', () => ({ default: () => null }));

import PublicProfilePage from '@/app/profile/[userId]/page';

const snap = (name: string) => `./__snapshots__/public-profile/${name}.html`;
const flush = async (m: Mounted) => {
  for (let i = 0; i < 6; i++) await m.advance(0);
};

let mounted: Mounted | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  S.params = { userId: 'u2' };
  S.me = { id: 'u1', core: { ageGroup: 'adult', name: 'אני' } };
  S.flags = { enableHomeV2: false };
  S.flagsReady = true;
  S.doc = { name: 'דנה', ageGroup: 'adult', currentStreak: 4, workoutCount: 1234 };
  S.docPending = false;
  S.following = false;
  S.partners = [];
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function render(name: string) {
  mounted = await mount(<PublicProfilePage />);
  await flush(mounted);
  await expect(mounted.html()).toMatchFileSnapshot(snap(name));
}

describe('/profile/[userId]', () => {
  it('loading, v1 (flags ready)', async () => {
    S.docPending = true;
    await render('loading-v1');
  });

  it('loading, v2 (skeleton)', async () => {
    S.docPending = true;
    S.flags = { enableHomeV2: true };
    await render('loading-v2');
  });

  it('not found', async () => {
    S.doc = null;
    await render('not-found');
  });

  it.each([false, true])('other user, not followed, can message, v2=%s', async (v2) => {
    S.flags = { enableHomeV2: v2 };
    await render(`other-v${v2 ? 2 : 1}`);
  });

  it('other user, followed, minor (no DM), no stats mirrored', async () => {
    S.following = true;
    S.doc = { name: 'נוער', ageGroup: 'minor' };
    await render('other-followed-minor');
  });

  it('other user, viewer signed out (no actions, no report)', async () => {
    S.me = null;
    await render('other-signed-out');
  });

  it.each([false, true])('own profile, v2=%s', async (v2) => {
    S.flags = { enableHomeV2: v2 };
    S.params = { userId: 'u1' };
    S.doc = { core: { name: 'אני', ageGroup: 'adult' }, progression: { currentStreak: 0, workoutCount: 7 } };
    await render(`self-v${v2 ? 2 : 1}`);
  });

  it('fallback name (doc without a name)', async () => {
    S.doc = { ageGroup: 'adult' };
    await render('fallback-name');
  });
});
