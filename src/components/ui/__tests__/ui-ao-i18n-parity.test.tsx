/**
 * i18n wave 2 batch ao (namespace `common`, keys `ui.*`): small shared UI under src/components/ui.
 *
 * The snapshots below were recorded BEFORE the extraction; the extracted components must render the same Hebrew
 * markup in every state reached here. Static markup (react-dom/server, node env). Zustand stores render their INITIAL
 * state under react-dom/server, so state is written into getInitialState(). `<!-- -->` is stripped before comparing
 * (react-dom/server's separator between adjacent text nodes; not rendered text). Text only a click reaches (toasts,
 * errors, the "deleting" button, the sync chip) is pinned key by key in src/lib/i18n/__tests__/common-ao-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

const flags = vi.hoisted(() => ({ enableHomeV2: false, kellyUnifiedV1: false }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableHomeV2: flags.enableHomeV2 }, rawFlags: { kellyUnifiedV1: flags.kellyUnifiedV1 } }),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {} }) }));
vi.mock('next/link', () => ({ default: (p: { href: string; children?: ReactNode; className?: string; 'aria-label'?: string }) => <a href={p.href} className={p.className} aria-label={p['aria-label']}>{p.children}</a> }));
vi.mock('@/features/legal/components/LegalDocModal', () => ({ default: () => null }));
vi.mock('@/components/ui/v2/Sheet', () => ({
  SHEET_TITLE_CLASS: 'title',
  default: (p: { open: boolean; ariaLabel?: string; header?: ReactNode; children?: ReactNode }) =>
    p.open ? (
      <section data-sheet="" aria-label={p.ariaLabel}>
        {p.header}
        {p.children}
      </section>
    ) : null,
}));

const store = vi.hoisted(() => ({
  profile: null as null | Record<string, unknown>,
  activity: { todayActivity: null as unknown, streak: 0, isLoading: false },
  activityUnread: 0,
  chatUnread: 0,
}));
vi.mock('@/features/user', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const hook = (sel?: (s: unknown) => unknown) => {
    const s = { profile: store.profile, updateProfile() {} };
    return sel ? sel(s) : s;
  };
  (hook as unknown as { getState: () => unknown }).getState = () => ({ profile: store.profile });
  return { ...actual, useUserStore: hook };
});
vi.mock('@/features/activity', () => ({ useDailyActivity: () => store.activity }));
vi.mock('@/features/social/hooks/useActivityFeed', () => ({ useActivityFeed: () => ({ unreadCount: store.activityUnread, items: [] }) }));
vi.mock('@/features/social/hooks/useChatInbox', () => ({ useChatInbox: () => ({ totalUnread: store.chatUnread, threads: [] }) }));
vi.mock('@/features/ai-coach/hooks/useKellyThread', () => ({ useKellyThreadMeta: () => ({ unreadForUser: 0 }) }));
vi.mock('@/components/ui/CollapsingHeader', () => ({ default: (p: { children?: ReactNode }) => <header>{p.children}</header> }));
vi.mock('@/components/ui/AnimatedFlame', () => ({ default: () => <i data-flame="" /> }));
vi.mock('@/components/ui/v2/StreakFlame', () => ({ default: () => <i data-flame2="" /> }));
vi.mock('@/components/ui/CommunityCoLogo', () => ({ default: () => null }));

import HealthConnectDisclosureModal from '../HealthConnectDisclosureModal';
import AccessCodeGate from '../AccessCodeGate';
import WeightInlineRow from '../WeightInlineRow';
import DeleteWorkoutConfirmModal from '../DeleteWorkoutConfirmModal';
import ProfilePhotoUploader from '../ProfilePhotoUploader';
import AppHeader from '../AppHeader';
import OfflineBanner from '../OfflineBanner';
import CoachMarks from '../CoachMarks';
import { useLocaleStore } from '@/store/useLocaleStore';

const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/ui-ao-i18n/${name}.html`;
const noop = () => {};

beforeEach(() => {
  Object.assign(flags, { enableHomeV2: false, kellyUnifiedV1: false });
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
  store.profile = { id: 'u1', core: { name: 'דנה', photoURL: null } };
  store.activity = { todayActivity: null, streak: 0, isLoading: false };
  store.activityUnread = 0;
  store.chatUnread = 0;
});

describe('HealthConnectDisclosureModal', () => {
  it.each([
    ['v1-open', false, true],
    ['v1-closed', false, false],
    ['v2-open', true, true],
  ] as const)('%s', async (name, v2, open) => {
    flags.enableHomeV2 = v2;
    await expect(html(<HealthConnectDisclosureModal isOpen={open} onConfirm={noop} onDismiss={noop} />)).toMatchFileSnapshot(snap(`health-${name}`));
  });
  it('custom platform label', async () => {
    await expect(
      html(<HealthConnectDisclosureModal isOpen onConfirm={noop} onDismiss={noop} platformLabel="Apple Health" />),
    ).toMatchFileSnapshot(snap('health-platform'));
  });
});

describe('AccessCodeGate', () => {
  it.each([
    ['required', {}],
    ['optional-compact-noskip', { optional: true, compact: true, hideSkip: true }],
    ['military-skip', { groupType: 'military', onSkip: noop, personaLabel: 'חייל סדיר' }],
    ['tenant-school', { tenantType: 'school', onSkip: noop, optional: true }],
  ] as const)('%s', async (name, props) => {
    await expect(html(<AccessCodeGate orgName="גדוד 7" onSuccess={noop} {...props} />)).toMatchFileSnapshot(snap(`access-${name}`));
  });
});

describe('WeightInlineRow', () => {
  it.each([['other', undefined], ['female', 'female'], ['male', 'male']] as const)('weight nudge, %s', async (name, g) => {
    store.profile = { id: 'u1', core: { name: 'דנה', gender: g } };
    await expect(html(<WeightInlineRow />)).toMatchFileSnapshot(snap(`weight-${name}`));
  });
});

describe('DeleteWorkoutConfirmModal', () => {
  it.each([
    ['no-xp', 0],
    ['xp', 120],
  ] as const)('%s', async (name, xp) => {
    await expect(
      html(<DeleteWorkoutConfirmModal isOpen activityLabel="ריצה" dateLabel="12.08.2026" xpToReverse={xp} onConfirm={noop} onCancel={noop} />),
    ).toMatchFileSnapshot(snap(`delete-workout-${name}`));
  });
  it('closed', async () => {
    await expect(
      html(<DeleteWorkoutConfirmModal isOpen={false} activityLabel="ריצה" dateLabel="היום" onConfirm={noop} onCancel={noop} />),
    ).toMatchFileSnapshot(snap('delete-workout-closed'));
  });
});

describe('ProfilePhotoUploader', () => {
  it('with and without photo', async () => {
    await expect(html(<ProfilePhotoUploader photoURL="/a.jpg" displayName="דנה" />)).toMatchFileSnapshot(snap('photo-with'));
    await expect(html(<ProfilePhotoUploader />)).toMatchFileSnapshot(snap('photo-without'));
  });
});

describe('AppHeader', () => {
  it.each([
    ['v1-plain', false, 0, 0, 0],
    ['v1-streak-unread', false, 5, 3, 120],
    ['v2-plain', true, 0, 0, 0],
    ['v2-streak', true, 7, 0, 4],
  ] as const)('%s', async (name, v2, streak, act, chat) => {
    flags.enableHomeV2 = v2;
    store.activity = { todayActivity: null, streak, isLoading: false };
    store.activityUnread = act;
    store.chatUnread = chat;
    await expect(html(<AppHeader v2={v2} />)).toMatchFileSnapshot(snap(`header-${name}`));
  });
  it('overlay, nameless user', async () => {
    store.profile = { id: 'u1', core: {} };
    await expect(html(<AppHeader asOverlay />)).toMatchFileSnapshot(snap('header-overlay'));
  });
});

describe('OfflineBanner', () => {
  it('online (renders nothing until the effect runs)', async () => {
    await expect(html(<OfflineBanner />)).toMatchFileSnapshot(snap('offline-online'));
  });
});

describe('CoachMarks', () => {
  it.each([
    ['light-default-labels', {}],
    ['light-custom-labels', { skipLabel: 'X', nextLabel: 'Y', doneLabel: 'Z' }],
  ] as const)('%s', async (name, extra) => {
    const steps = [
      { target: 'a', title: 'כותרת', text: 'טקסט' },
      { target: 'b', title: 'עוד', text: 'סוף' },
    ];
    await expect(html(<CoachMarks steps={steps as never} onFinish={noop} {...extra} />)).toMatchFileSnapshot(snap(`coach-${name}`));
  });
});
