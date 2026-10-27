// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `community`, keys `chat.*`): ChatThread (DM / group / support, menu, report flow,
 * blocked notice, high-five rows, group admin badge). Snapshots recorded BEFORE the extraction from unmodified
 * origin/main; jsdom mount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ messages: [] as unknown[] }));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return { ...harness.motionStub, m: harness.motionStub.motion };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { isAnonymous: false } }, app: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}), setDoc: async () => {}, deleteDoc: async () => {}, addDoc: async () => ({}), collection: () => ({}),
  serverTimestamp: () => 0,
}));
vi.mock('../../services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'kelly', KELLY_NAME: 'קלי' }));
vi.mock('../../services/chat.service', () => ({
  subscribeToMessages: (_id: string, cb: (m: unknown[]) => void) => {
    cb(h.messages);
    return () => {};
  },
  sendMessage: async () => {},
  markThreadAsRead: async () => {},
}));
vi.mock('@/components/LinkAccountPrompt', () => ({
  default: (p: { isOpen: boolean; message: string }) => <div data-link-prompt={p.isOpen ? p.message : ''} />,
}));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import ChatThread from '../ChatThread';

const snap = (name: string) => `./__snapshots__/chat-thread-aq-i18n/${name}.html`;
let m: Mounted | null = null;
const aria = (label: string) => Array.from(document.querySelectorAll('[aria-label]')).find((e) => e.getAttribute('aria-label') === label)!;
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
  h.messages = [];
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('ChatThread', () => {
  const dm = T('d1', {});
  const group = T('g1', { type: 'group', groupId: 'g1', groupName: 'ריצת בוקר', participants: ['me', 'p1', 'p2'] });
  const support = T('s1', { participants: ['me', 'kelly'], participantNames: { me: 'דנה', kelly: 'קלי' } });
  const msgs = [
    { id: 'm1', senderUid: 'p1', senderName: 'יוסי', text: 'שלום', type: 'text' },
    { id: 'm2', senderUid: 'me', senderName: 'דנה', text: 'היי', type: 'text' },
    { id: 'm3', senderUid: 'p2', senderName: 'רונית', text: 'מה נשמע', type: 'text' },
    { id: 'm4', senderUid: 'p1', senderName: 'יוסי', text: '', type: 'high_five' },
    { id: 'm5', senderUid: 'me', senderName: 'דנה', text: '', type: 'high_five' },
  ];
  const render = async (thread: unknown, createdByUid?: string, mod?: () => Promise<void>) => {
    m?.unmount();
    m = await mount(<ChatThread thread={thread as never} myUid="me" myName="דנה" createdByUid={createdByUid} />);
    await settle();
    if (mod) await mod();
    return m.html();
  };

  it('DM / group / support, with messages', async () => {
    h.messages = msgs;
    const parts = [
      await render(dm),
      await render(group, 'p2'),
      await render(support),
      await render(T('d2', { participants: ['me', 'p3'], participantNames: {} })),
      await render(T('g2', { type: 'group', groupId: 'g3', groupName: undefined, participants: ['me', 'p1'] })),
      await render(T('x', { participants: ['me'], participantNames: {} })),
    ];
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('thread-views'));
  });

  it('menu, report flow, blocked', async () => {
    const menu = async () => m!.click(aria('אפשרויות שיחה'));
    const parts = [
      await render(dm, undefined, menu),
      await render(group, undefined, menu),
      await render(dm, undefined, async () => {
        await menu();
        await m!.clickText('דווח על המשתמש');
      }),
      await render(group, undefined, async () => {
        await menu();
        await m!.clickText('דווח על הקבוצה');
        await m!.clickText('הטרדה או אלימות');
      }),
      await render(dm, undefined, async () => {
        await menu();
        await m!.clickText('דווח על המשתמש');
        await m!.clickText('התחזות');
        await m!.clickText('שלח דיווח');
        await settle();
      }),
      await render(dm, undefined, async () => {
        await menu();
        await m!.clickText('חסום משתמש');
        await settle();
        await menu();
      }),
    ];
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('thread-menu-report'));
  });
});
