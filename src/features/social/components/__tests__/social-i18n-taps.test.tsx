// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `community`, `social.*` keys): the text in
 * src/features/social/components that only shows after a tap — the feed post's
 * menu (delete / confirm / report, v2 and classic), the share sheet's picked
 * photo, and the v2 share sheet's sticker colour label. Recorded BEFORE the
 * extraction; the extracted components must render the same markup.
 *
 * Rendered with react-dom/client in jsdom so the taps can be replayed: the client
 * DOM has no `<!-- -->` separators, so nothing is stripped. Animations are skipped
 * and inline `style` attributes are dropped before comparing (framer-motion
 * writes in-flight transforms there — not text).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: true } }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'u1', core: { isSuperAdmin: false, name: 'דנה' } } };
  return { useUserStore: (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state) };
});
vi.mock('@/features/social/services/reactions.service', () => ({ toggleReaction: async () => {}, hasUserReacted: () => Promise.resolve(false) }));
vi.mock('@/features/social/services/feed.service', () => ({ deleteFeedPost: async () => {} }));
vi.mock('@/features/social/services/feed-photo', () => ({
  pickFeedPhoto: async () => ({ previewUrl: 'blob:picked', blob: new Blob(['x']) }),
}));
vi.mock('@/features/social/services/save-to-gallery', () => ({ saveImageToGallery: async () => 'saved' }));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({
  default: ({ isOpen, targetName }: { isOpen: boolean; targetName: string }) => (isOpen ? <i data-report-open={targetName} /> : null),
}));
vi.mock('@/features/social/components/share-v2/useSharePreviews', () => ({
  useSharePhoto: () => ({ status: 'idle' }),
  useSharePreviews: () => ({}),
}));

import { MotionGlobalConfig } from 'framer-motion';
import FeedPostCard from '../FeedPostCard';
import { FeedShareSheet, type ShareableWorkout } from '../FeedPublishSheets';
import ShareImageSheetV2 from '../share-v2/ShareImageSheetV2';
import type { FeedPost } from '../../services/feed.service';
import type { FeedPrefs } from '../../services/feed-prefs';
import type { ShareImageInput } from '../../services/share-image';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
MotionGlobalConfig.skipAnimations = true;

const NOW = new Date('2026-10-15T12:00:00');
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(el: ReactElement): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}
const dump = () => document.body.innerHTML.replace(/ style="[^"]*"/g, '');
function click(el: Element | undefined, what: string): void {
  if (!el) throw new Error(`nothing to tap: ${what}`);
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
const button = (pred: (b: HTMLButtonElement) => boolean) => Array.from(document.querySelectorAll('button')).find(pred);
const byText = (text: string) => button((b) => !!b.textContent?.includes(text));
const byLabel = (label: string) => button((b) => b.getAttribute('aria-label') === label);
const snap = (name: string) => `./__snapshots__/social-i18n/${name}.html`;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
});

const post = (over: Partial<FeedPost> = {}): FeedPost =>
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
    createdAt: new Date(NOW.getTime() - 60_000),
    ...over,
  }) as FeedPost;

describe('FeedPostCard menu', () => {
  it.each([false, true])('author: menu, then the delete confirmation (v2=%s)', async (v2) => {
    mount(<FeedPostCard post={post()} currentUid="u2" v2={v2} />);
    click(document.querySelector('[aria-haspopup="menu"]') ?? undefined, 'menu');
    await expect(dump()).toMatchFileSnapshot(snap(`tap-post-author-menu-v${v2 ? 2 : 1}`));
    click(button((b) => b.getAttribute('role') === 'menuitem'), 'delete item');
    await expect(dump()).toMatchFileSnapshot(snap(`tap-post-author-confirm-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('reader: menu, then the report sheet (v2=%s)', async (v2) => {
    mount(<FeedPostCard post={post({ title: undefined })} currentUid="u1" v2={v2} />);
    click(document.querySelector('[aria-haspopup="menu"]') ?? undefined, 'menu');
    await expect(dump()).toMatchFileSnapshot(snap(`tap-post-reader-menu-v${v2 ? 2 : 1}`));
    click(button((b) => b.getAttribute('role') === 'menuitem'), 'report item');
    await expect(dump()).toMatchFileSnapshot(snap(`tap-post-reader-report-v${v2 ? 2 : 1}`));
  });
});

const RUN: ShareableWorkout = { activityCategory: 'cardio', durationMinutes: 31, distanceKm: 5.25 };
const PREFS = { audience: 'public', showPark: true, showRoute: true, autoPublish: { strength: true, cardio: false, maintenance: false } } as FeedPrefs;

describe('FeedShareSheet', () => {
  it('a picked photo shows its preview + remove button; picking "רק אני" swaps the CTA', async () => {
    mount(<FeedShareSheet open workout={RUN} defaults={PREFS} onPublish={() => {}} onSkip={() => {}} onClose={() => {}} onOpenPrivacy={() => {}} allowPhoto />);
    click(byText('הוספת תמונה'), 'add photo');
    await act(async () => {
      await Promise.resolve();
    });
    click(byText('רק אני'), 'private audience');
    await expect(dump()).toMatchFileSnapshot(snap('tap-publish-photo-private'));
  });
});

describe('ShareImageSheetV2', () => {
  it('sticker format: the sticker colour label + ink tiles', async () => {
    const input = { kind: 'cardio', durationMinutes: 31, distanceKm: 5.25 } as ShareImageInput;
    mount(<ShareImageSheetV2 open onClose={() => {}} input={input} />);
    click(button((b) => b.getAttribute('role') === 'radio' && !!b.textContent?.includes('PNG')), 'sticker');
    await expect(dump()).toMatchFileSnapshot(snap('tap-share-v2-sticker'));
    expect(byLabel('סגירה')).toBeTruthy();
  });
});
