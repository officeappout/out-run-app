// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `community`, keys `chat.*`): ChatInbox (v1 + v2, user / admin, every filter and
 * empty state, search, thread view header). Snapshots recorded BEFORE the extraction from unmodified origin/main;
 * jsdom mount, inline `style` and React ids normalised away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  email: 'user@example.com',
  v2: false,
  kellyUnified: false,
  threads: [] as unknown[],
  allThreads: [] as unknown[],
  loading: false,
  messages: [] as unknown[],
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return { ...harness.motionStub, m: harness.motionStub.motion };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { isAnonymous: false } }, app: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}), setDoc: async () => {}, deleteDoc: async () => {}, addDoc: async () => ({}), collection: () => ({}),
  serverTimestamp: () => 0,
}));
vi.mock('@/features/user', () => {
  const state = () => ({ profile: { id: 'me', core: { name: 'דנה', email: h.email } } });
  return { useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state()) };
});
vi.mock('../../hooks/useChatInbox', () => ({ useChatInbox: () => ({ threads: h.threads, isLoading: h.loading }) }));
vi.mock('../../hooks/useAllChats', () => ({ useAllChats: () => ({ threads: h.allThreads, isLoading: h.loading }) }));
vi.mock('../ChatThread', () => ({
  default: (p: { thread: { id: string }; myUid: string; myName: string }) => (
    <div data-thread={p.thread.id} data-uid={p.myUid} data-name={p.myName} />
  ),
}));
vi.mock('@/features/arena/services/group.service', () => ({ getGroupById: async () => ({ createdBy: 'g-admin' }) }));
vi.mock('../../services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'kelly', KELLY_NAME: 'קלי' }));
vi.mock('../../services/chat.service', () => ({
  subscribeToMessages: (_id: string, cb: (m: unknown[]) => void) => {
    cb(h.messages);
    return () => {};
  },
  sendMessage: async () => {},
  markThreadAsRead: async () => {},
}));
vi.mock('@/config/feature-flags', () => ({ isRootAdmin: (e?: string) => e === 'root@example.com' }));
vi.mock('@/features/ai-coach/components/AiCoachEntry', () => ({
  AiCoachInboxRow: () => <div data-ai-row="" />,
  KellyInboxRow: () => <div data-kelly-row="" />,
}));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableHomeV2: h.v2, kellyUnifiedV1: h.kellyUnified } }),
}));
vi.mock('@/components/ui/v2/Sheet', () => ({
  default: (p: { open: boolean; ariaLabel?: string; header?: React.ReactNode; children?: React.ReactNode }) =>
    p.open ? (
      <div data-sheet={p.ariaLabel}>
        {p.header}
        {p.children}
      </div>
    ) : null,
}));
vi.mock('@/components/LinkAccountPrompt', () => ({
  default: (p: { isOpen: boolean; message: string }) => <div data-link-prompt={p.isOpen ? p.message : ''} />,
}));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import ChatInbox from '../ChatInbox';

const snap = (name: string) => `./__snapshots__/chat-aq-i18n/${name}.html`;
let m: Mounted | null = null;
const aria = (label: string) => Array.from(document.querySelectorAll('[aria-label]')).find((e) => e.getAttribute('aria-label') === label)!;
const clickSearch = async () => m!.click(h.v2 ? aria('חיפוש שיחות') : 'button.p-2');
const settle = async () => {
  for (let i = 0; i < 5; i++) await m!.advance(0);
};
const NOW = new Date('2026-10-15T12:00:00');
const ago = (sec: number) => new Date(NOW.getTime() - sec * 1000);
const T = (id: string, extra: Record<string, unknown>) => ({
  id, participants: ['me', 'p1'], participantNames: { me: 'דנה', p1: 'יוסי' }, lastMessage: 'היי', lastMessageAt: ago(30),
  lastSenderId: 'p1', unreadCount: { me: 0 }, createdAt: ago(900), type: 'dm', ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  h.email = 'user@example.com';
  h.v2 = false;
  h.kellyUnified = false;
  h.threads = [];
  h.allThreads = [];
  h.loading = false;
  h.messages = [];
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const inboxThreads = () => [
  T('t1', { lastMessageAt: ago(30), unreadCount: { me: 2 } }),
  T('t2', { lastMessageAt: ago(600), participantNames: { me: 'דנה' }, participants: ['me', 'p2'] }),
  T('t3', { lastMessageAt: ago(7200), type: 'group', groupId: 'g1', groupName: '', lastMessage: 'שלום לכולם', lastSenderId: 'p1' }),
  T('t4', { lastMessageAt: ago(200000), type: 'group', groupId: 'g2', groupName: 'ריצת בוקר', lastMessage: '', lastSenderId: 'p1' }),
  T('t5', { lastMessageAt: ago(90000), participants: ['me', 'kelly'], participantNames: { me: 'דנה' } }),
];

describe('ChatInbox', () => {
  it.each([false, true])('user: loading, empty, every filter, search, v2=%s', async (v2) => {
    h.v2 = v2;
    const parts: string[] = [];
    const render = async (mod?: () => Promise<void>) => {
      m?.unmount();
      m = await mount(<ChatInbox isOpen onClose={() => {}} />);
      await settle();
      if (mod) await mod();
      parts.push(m.html());
    };
    h.loading = true;
    await render();
    h.loading = false;
    await render();
    await render(async () => m!.clickText('לא נקראו'));
    await render(async () => m!.clickText('קבוצות'));
    h.threads = inboxThreads();
    await render();
    await render(async () => m!.clickText('לא נקראו'));
    await render(async () => m!.clickText('קבוצות'));
    await render(clickSearch);
    await render(async () => {
      await clickSearch();
      await m!.type('input', 'יו');
    });
    h.kellyUnified = true;
    await render();
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`inbox-user-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('user: open thread (DM + group), closed, v2=%s', async (v2) => {
    h.v2 = v2;
    h.threads = inboxThreads();
    const parts: string[] = [];
    m = await mount(<ChatInbox isOpen={false} onClose={() => {}} />);
    parts.push(m.html());
    m.unmount();
    for (const idx of [0, 2]) {
      m = await mount(<ChatInbox isOpen onClose={() => {}} />);
      await settle();
      const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.className.includes('py-3.5'));
      await m.click(buttons[idx]);
      await settle();
      parts.push(m.html());
      m.unmount();
    }
    m = null;
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`inbox-thread-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('admin: empty states, list, v2=%s', async (v2) => {
    h.v2 = v2;
    h.email = 'root@example.com';
    const parts: string[] = [];
    const render = async (mod?: () => Promise<void>) => {
      m?.unmount();
      m = await mount(<ChatInbox isOpen onClose={() => {}} />);
      await settle();
      if (mod) await mod();
      parts.push(m.html());
    };
    await render();
    await render(async () => m!.clickText('לא נקראו'));
    h.allThreads = [
      T('a1', { participants: ['kelly', 'u9'], participantNames: { u9: 'נועה' }, lastSenderId: 'u9' }),
      T('a2', { participants: ['kelly', 'u8'], participantNames: {}, lastSenderId: 'kelly' }),
    ];
    await render();
    await render(async () => m!.clickText('לא נקראו'));
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`inbox-admin-v${v2 ? 2 : 1}`));
  });
});

