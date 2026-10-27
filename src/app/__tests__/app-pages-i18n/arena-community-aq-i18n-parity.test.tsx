// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `community`): src/app/community/[id]/page.tsx (group hub: loading, not found,
 * full page in every category / frequency, empty members / events, free vs paid). Snapshots recorded BEFORE the
 * extraction from unmodified origin/main (jsdom mount, `<!-- -->` stripped, ids normalised).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  group: null as unknown,
  members: [] as unknown[],
  events: [] as unknown[],
  flagsLoading: false,
  hang: false,
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'g1' }),
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableLeagues: true, enableCommunityFeed: true, enableGroupFixesV1: false }, loading: h.flagsLoading }),
}));
vi.mock('@/features/user', () => {
  const state = () => ({ profile: { id: 'u1', core: { name: 'דנה' } } });
  return { useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state()) };
});
vi.mock('@/features/admin/services/community.service', () => ({
  getGroup: () => (h.hang ? new Promise(() => {}) : Promise.resolve(h.group)),
  getGroupMembers: async () => h.members,
  getEventsByGroup: async () => h.events,
  getEventRegistrations: async () => [],
  isUserRegistered: async () => false,
  joinEvent: async () => {},
}));
vi.mock('@/features/arena/components/EventCard', () => ({ default: (p: { event: { id: string } }) => <div data-event={p.event.id} /> }));
vi.mock('@/features/arena/components/SessionDrawer', () => ({ default: () => null }));
vi.mock('@/features/arena/components/MapCard', () => ({ default: (p: { label?: string }) => <div data-map={p.label} /> }));
vi.mock('@/lib/resolveJoinLanding', () => ({ resolveJoinLanding: () => '/home' }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import CommunityHubPage from '../../community/[id]/page';

const snap = (name: string) => `./__snapshots__/arena-community-aq-i18n/${name}.html`;
let m: Mounted | null = null;
const settle = async () => {
  for (let i = 0; i < 6; i++) await m!.advance(0);
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.group = null;
  h.members = [];
  h.events = [];
  h.flagsLoading = false;
  h.hang = false;
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const baseGroup = {
  id: 'g1', name: 'ריצת בוקר', category: 'running', description: 'קבוצת ריצה', currentParticipants: 12, price: 0,
  meetingLocation: { address: 'פארק הירקון', location: { lat: 0, lng: 0 } }, groupType: 'open',
};

describe('community/[id] page', () => {
  it('loading, not found', async () => {
    const parts: string[] = [];
    h.hang = true;
    m = await mount(<CommunityHubPage />);
    await settle();
    parts.push(m.html());
    m.unmount();
    h.hang = false;
    m = await mount(<CommunityHubPage />);
    await settle();
    parts.push(m.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('hub-loading-notfound'));
  });

  it('full group: free, paid, every category and frequency, with / without members and events', async () => {
    const parts: string[] = [];
    const render = async () => {
      m?.unmount();
      m = await mount(<CommunityHubPage />);
      await settle();
      parts.push(m.html());
    };
    h.group = {
      ...baseGroup,
      targetMuscles: ['חזה', 'גב'], equipment: ['מתח', 'גומיות'],
      scheduleSlots: [
        { dayOfWeek: 0, time: '18:00', frequency: 'weekly' },
        { dayOfWeek: 3, time: '06:30', frequency: 'biweekly' },
        { dayOfWeek: 6, time: '09:00', frequency: 'monthly' },
        { dayOfWeek: 2, time: '07:00', frequency: 'custom' },
      ],
      images: ['https://x/cover.png'], price: 40,
    };
    h.members = [
      { uid: 'a', name: 'יוסי', joinedAt: new Date() },
      { uid: 'b', name: 'נועה', photoURL: 'https://x/p.png', joinedAt: new Date() },
    ];
    h.events = [{ id: 'e1', isActive: true }, { id: 'e2', isActive: false }];
    await render();
    for (const category of ['walking', 'yoga', 'calisthenics', 'cycling', 'other', 'swimming']) {
      h.group = { ...baseGroup, category, schedule: { dayOfWeek: 1, time: '20:00', frequency: 'weekly' } };
      h.members = [];
      h.events = [];
      await render();
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('hub-full'));
  });
});
