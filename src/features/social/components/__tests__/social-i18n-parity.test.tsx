/**
 * i18n wave 2 (namespace `community`, `social.*` keys): the live components in
 * src/features/social/components — the activity panel, the follow card, the feed
 * post (v2 + classic), the feed publishing sheets, the route line and the v2
 * share-image sheet. The snapshots below were recorded from the components BEFORE
 * the extraction; the extracted components must render byte-identical markup in Hebrew.
 *
 * - `<!-- -->` is stripped before comparing (react-dom/server's separator between
 *   adjacent text nodes — not rendered text). The BEFORE snapshots were recorded
 *   already stripped.
 * - Stores that pull in Firebase are replaced by selector-hook fakes; the locale
 *   store is real and its INITIAL state is written (renderToStaticMarkup reads
 *   getInitialState()).
 * - Text only reachable by a tap (the post menu, the picked photo, the sticker
 *   colour label) is replayed in social-i18n-taps.test.tsx (jsdom); toasts / alert
 *   copy is pinned by src/lib/i18n/__tests__/community-social-he.test.ts.
 * - ChatInbox / ChatThread (busy files) and DiscoverSection (dead) are not covered.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

// ── module stubs ─────────────────────────────────────────────────────────────
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));

const flags = { enableHomeV2: true };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));

const userState = { profile: { id: 'u1', core: { isSuperAdmin: false, name: 'דנה' } } };
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));

const feed: { isLoading: boolean; items: unknown[] } = { isLoading: false, items: [] };
vi.mock('@/features/social/hooks/useActivityFeed', () => ({ useActivityFeed: () => feed }));
vi.mock('@/features/safecity/services/kudos.service', () => ({ sendKudo: async () => {} }));
vi.mock('@/features/social/utils/activity-seen', () => ({ markActivitySeen: () => {} }));

const social = { followed: false };
vi.mock('@/features/social/store/useSocialStore', () => ({
  useSocialStore: () => ({ isFollowing: () => social.followed, followUser: async () => {}, unfollowUser: async () => {} }),
}));

vi.mock('@/features/social/services/reactions.service', () => ({ toggleReaction: async () => {}, hasUserReacted: () => Promise.resolve(false) }));
vi.mock('@/features/social/services/feed.service', () => ({ deleteFeedPost: async () => {}, createWorkoutPost: async () => null }));
vi.mock('@/features/social/services/feed-photo', () => ({ pickFeedPhoto: async () => null }));
vi.mock('@/features/social/services/save-to-gallery', () => ({ saveImageToGallery: async () => 'saved' }));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({
  default: ({ targetName }: { targetName: string }) => <i data-report={targetName} />,
}));
vi.mock('@/features/social/components/share-v2/useSharePreviews', () => ({
  useSharePhoto: (url: string | null) => (url ? { status: 'ready', img: null } : { status: 'idle' }),
  useSharePreviews: () => ({}),
}));

import ActivityPanel from '../ActivityPanel';
import PartnerCard from '../PartnerCard';
import RouteLine from '../RouteLine';
import FeedPostCard from '../FeedPostCard';
import ShareImageSheet from '../ShareImageSheet';
import { FeedPrivacySheet, FeedShareSheet, SharePromptCard, SummaryShareCard, type ShareableWorkout } from '../FeedPublishSheets';
import ShareImageSheetV2 from '../share-v2/ShareImageSheetV2';
import ShareBackgroundTiles from '../share-v2/ShareBackgroundTiles';
import ShareFormatControl from '../share-v2/ShareFormatControl';
import ShareStickerInkTiles from '../share-v2/ShareStickerInkTiles';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { FeedPost } from '../../services/feed.service';
import type { FeedPrefs } from '../../services/feed-prefs';
import type { ShareImageInput } from '../../services/share-image';

const NOW = new Date('2026-10-15T12:00:00');
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/social-i18n/${name}.html`;
const noop = () => {};
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  flags.enableHomeV2 = true;
  feed.isLoading = false;
  feed.items = [];
  social.followed = false;
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
});

// ── ActivityPanel ────────────────────────────────────────────────────────────
const ITEMS = [
  { id: 'a1', type: 'high_five', fromUid: 'u2', fromName: 'נועה', read: false, createdAt: ago(10), message: 'x' },
  { id: 'a2', type: 'high_five', fromUid: 'u1', read: true, createdAt: ago(5 * 60), message: 'הודעה שמורה' },
  { id: 'a3', type: 'group_join', fromName: 'אבי', groupName: 'רצי הירקון', read: false, createdAt: ago(3 * 3600), message: 'x' },
  { id: 'a4', type: 'group_join', groupName: 'רצי הירקון', read: true, createdAt: ago(2 * 86400), message: 'x' },
  { id: 'a5', type: 'group_join', read: true, createdAt: ago(1234 * 86400), message: 'הצטרפות' },
  { id: 'a6', type: 'leaderboard_badge', read: true, createdAt: ago(59 * 60), message: 'עלית לטופ 10' },
];

describe('ActivityPanel', () => {
  it.each([false, true])('loading, v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    feed.isLoading = true;
    await expect(html(<ActivityPanel isOpen onClose={noop} />)).toMatchFileSnapshot(snap(`activity-loading-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('empty, v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    await expect(html(<ActivityPanel isOpen onClose={noop} />)).toMatchFileSnapshot(snap(`activity-empty-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('items (every type, every age), v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    feed.items = ITEMS;
    await expect(html(<ActivityPanel isOpen onClose={noop} />)).toMatchFileSnapshot(snap(`activity-items-v${v2 ? 2 : 1}`));
  });
});

// ── PartnerCard (legacy /search) ─────────────────────────────────────────────
describe('PartnerCard', () => {
  const user = { uid: 'u2', name: 'נועה', currentLevel: 'מתקדמת' };
  it('not followed', async () => {
    await expect(html(<PartnerCard user={user} myUid="u1" />)).toMatchFileSnapshot(snap('partner-follow'));
  });
  it('followed', async () => {
    social.followed = true;
    await expect(html(<PartnerCard user={user} myUid="u1" />)).toMatchFileSnapshot(snap('partner-following'));
  });
  it('self', async () => {
    await expect(html(<PartnerCard user={{ uid: 'u1', name: 'דנה' }} myUid="u1" />)).toMatchFileSnapshot(snap('partner-self'));
  });
});

// ── RouteLine ────────────────────────────────────────────────────────────────
describe('RouteLine', () => {
  const shape = [0, 0, 500, 400, 1000, 100];
  it('default label, card + hero', async () => {
    await expect(html(<div><RouteLine shape={shape} /><RouteLine shape={shape} variant="hero" /></div>)).toMatchFileSnapshot(snap('route-line-default'));
  });
});

// ── FeedPostCard ─────────────────────────────────────────────────────────────
const post = (over: Partial<FeedPost>): FeedPost =>
  ({
    id: 'p1',
    authorUid: 'u2',
    authorName: 'נועה',
    type: 'workout',
    activityCategory: 'cardio',
    durationMinutes: 30,
    activityCredit: 30,
    distanceKm: 5.2,
    paceMinPerKm: 5.8,
    audience: 'partners',
    createdAt: ago(30),
    ...over,
  }) as FeedPost;

const POSTS: Array<[string, Partial<FeedPost>]> = [
  ['run-plain', {}],
  ['run-route', { routeShape: [0, 0, 500, 400, 1000, 100], paceSplits: [330, 315, 300], runSegment: '5k', streakDays: 6, title: 'ריצת בוקר', createdAt: ago(5 * 60) }],
  ['run-photo-route', { photoUrl: 'https://x/p.jpg', routeShape: [0, 0, 500, 400, 1000, 100], audience: 'public', createdAt: ago(3 * 3600) }],
  ['run-nohero-segment-park', { runSegment: '10k', parkName: 'פארק הירקון', audience: 'private', createdAt: ago(30 * 3600) }],
  ['strength-bare', { activityCategory: 'strength', durationMinutes: 35, activityCredit: 70, intensityLevel: 'בינונית', createdAt: ago(3 * 86400) }],
  [
    'strength-full',
    {
      activityCategory: 'strength',
      durationMinutes: 42,
      programName: 'פלג גוף עליון',
      title: 'אימון מעולה',
      levelIndex: 4,
      levelCount: 12,
      topExercises: [
        { name: 'מתח', sets: 3, setsDone: 3, value: 8, unit: 'reps' },
        { name: 'פלאנק', sets: 4, setsDone: 2, value: 30, unit: 'seconds' },
      ],
      moreExercises: 3,
      personalBest: 'שיפור במתח מהפעם הקודמת',
      photoUrl: 'https://x/s.jpg',
      streakDays: 12,
      parkName: 'גן העיר',
      createdAt: ago(1500 * 86400),
    } as Partial<FeedPost>,
  ],
  ['maintenance', { activityCategory: 'maintenance', durationMinutes: 20, activityCredit: 20 }],
  ['other-category', { activityCategory: 'yoga' as FeedPost['activityCategory'], durationMinutes: 20, activityCredit: 20 }],
];

describe('FeedPostCard', () => {
  it.each(POSTS)('v2 %s (reader, cheered)', async (name, over) => {
    await expect(html(<FeedPostCard post={post(over)} currentUid="u1" v2 />)).toMatchFileSnapshot(snap(`post-v2-${name}`));
  });
  it('v2 author view (share button, no report)', async () => {
    await expect(html(<FeedPostCard post={post({ activityCategory: 'strength', title: 'כוח' })} currentUid="u2" v2 />)).toMatchFileSnapshot(
      snap('post-v2-author'),
    );
  });
  it('v2 signed out', async () => {
    await expect(html(<FeedPostCard post={post({})} v2 />)).toMatchFileSnapshot(snap('post-v2-signed-out'));
  });
  it.each(POSTS)('classic (v1) %s', async (name, over) => {
    await expect(html(<FeedPostCard post={post(over)} currentUid="u1" />)).toMatchFileSnapshot(snap(`post-v1-${name}`));
  });
  it('classic (v1) without a title → report target name', async () => {
    await expect(html(<FeedPostCard post={post({ title: undefined })} currentUid="u1" />)).toMatchFileSnapshot(snap('post-v1-report-name'));
  });
});

// ── FeedPublishSheets ────────────────────────────────────────────────────────
const RUN: ShareableWorkout = { activityCategory: 'cardio', durationMinutes: 31, distanceKm: 5.25, routeShape: [0, 0, 500, 400, 1000, 100], parkName: 'פארק הירקון' };
const LIFT: ShareableWorkout = { activityCategory: 'strength', durationMinutes: 45, title: 'אימון גב' };
const WALK: ShareableWorkout = { activityCategory: 'maintenance', durationMinutes: 1200 };
const PREFS: FeedPrefs = {
  audience: 'partners',
  showPark: true,
  showRoute: true,
  autoPublish: { strength: true, cardio: false, maintenance: false },
} as FeedPrefs;

describe('FeedPublishSheets', () => {
  it('SharePromptCard (titled / untitled)', async () => {
    await expect(
      html(
        <div>
          <SharePromptCard workout={RUN} onShare={noop} />
          <SharePromptCard workout={LIFT} onShare={noop} />
          <SharePromptCard workout={WALK} onShare={noop} />
        </div>,
      ),
    ).toMatchFileSnapshot(snap('publish-prompt'));
  });
  it.each(['ask', 'published', 'queued'] as const)('SummaryShareCard %s (with / without image share)', async (status) => {
    await expect(
      html(
        <div>
          <SummaryShareCard workout={RUN} status={status} onShare={noop} onDismiss={noop} onShareImage={noop} />
          <SummaryShareCard workout={LIFT} status={status} onShare={noop} onDismiss={noop} />
        </div>,
      ),
    ).toMatchFileSnapshot(snap(`publish-summary-${status}`));
  });
  it('FeedShareSheet — cardio with park + route, photo allowed', async () => {
    await expect(
      html(<FeedShareSheet open workout={RUN} defaults={PREFS} onPublish={noop} onSkip={noop} onClose={noop} onOpenPrivacy={noop} allowPhoto />),
    ).toMatchFileSnapshot(snap('publish-share-run'));
  });
  it('FeedShareSheet — strength, private audience (save button), no photo', async () => {
    await expect(
      html(
        <FeedShareSheet open workout={LIFT} defaults={{ ...PREFS, audience: 'private' }} onPublish={noop} onSkip={noop} onClose={noop} onOpenPrivacy={noop} />,
      ),
    ).toMatchFileSnapshot(snap('publish-share-private'));
  });
  it('FeedPrivacySheet', async () => {
    await expect(html(<FeedPrivacySheet open prefs={PREFS} onSave={noop} onClose={noop} />)).toMatchFileSnapshot(snap('publish-privacy'));
  });
});

// ── Share image sheets ───────────────────────────────────────────────────────
const LIFT_IN: ShareImageInput = { kind: 'strength', durationMinutes: 44.6, programName: 'פלג גוף עליון', title: 'אימון גב' } as ShareImageInput;
const LIFT_TITLE_IN: ShareImageInput = { kind: 'strength', durationMinutes: 20, title: 'אימון גב' } as ShareImageInput;
const RUN_IN: ShareImageInput = { kind: 'cardio', durationMinutes: 31, distanceKm: 5.25 } as ShareImageInput;
const RUN_NOKM_IN: ShareImageInput = { kind: 'cardio', durationMinutes: 31 } as ShareImageInput;

describe('Share image sheets', () => {
  it.each([
    ['strength', LIFT_IN],
    ['strength-title', LIFT_TITLE_IN],
    ['cardio', RUN_IN],
    ['cardio-no-km', RUN_NOKM_IN],
  ] as const)('ShareImageSheetV2 %s', async (name, input) => {
    await expect(html(<ShareImageSheetV2 open onClose={noop} input={input} />)).toMatchFileSnapshot(snap(`share-v2-${name}`));
  });
  it('ShareImageSheetV2 with a photo', async () => {
    await expect(html(<ShareImageSheetV2 open onClose={noop} input={RUN_IN} photoUrl="https://x/p.jpg" />)).toMatchFileSnapshot(
      snap('share-v2-photo'),
    );
  });
  it.each([
    ['legacy-no-photo', undefined],
    ['legacy-photo', 'https://x/p.jpg'],
  ] as const)('ShareImageSheet v1 (%s)', async (name, photoUrl) => {
    flags.enableHomeV2 = false;
    await expect(html(<ShareImageSheet open onClose={noop} input={RUN_IN} photoUrl={photoUrl} />)).toMatchFileSnapshot(snap(`share-${name}`));
  });
  it('ShareFormatControl (all / subset)', async () => {
    await expect(
      html(
        <div>
          <ShareFormatControl value="sticker" onChange={noop} />
          <ShareFormatControl value="story" onChange={noop} formats={['story', 'square']} />
        </div>,
      ),
    ).toMatchFileSnapshot(snap('share-format'));
  });
  it('ShareStickerInkTiles', async () => {
    await expect(html(<ShareStickerInkTiles value="dark" onChange={noop} />)).toMatchFileSnapshot(snap('share-ink'));
  });
  it.each([
    ['none', null, 'idle', 'strength', 'cyan'],
    ['ready', 'https://x/p.jpg', 'ready', 'cardio', 'night'],
    ['failed', 'https://x/p.jpg', 'failed', 'cardio', 'cyan'],
  ] as const)('ShareBackgroundTiles (photo %s)', async (name, photoUrl, status, kind, brand) => {
    await expect(
      html(
        <ShareBackgroundTiles
          value="brand"
          kind={kind}
          brand={brand}
          photoUrl={photoUrl}
          photo={{ status } as never}
          onChange={noop}
          onPickPhoto={noop}
        />,
      ),
    ).toMatchFileSnapshot(snap(`share-bg-${name}`));
  });
});
