/**
 * i18n wave 2 (namespace `community`): the community / arena cards, sheets and the session banner in
 * src/features/arena/components (group-details/, the create-group wizard and the league boards are
 * not part of this batch). The snapshots below were recorded BEFORE the extraction from unmodified
 * origin/main; the extracted components must render the same Hebrew in every state a static render
 * reaches — v1 and v2 (enable_home_v2), male / female / unset, each card variant, each banner phase.
 *
 * Static markup (react-dom/server, node env). Zustand: useUserStore / useGPSStore are replaced by
 * selector-hook fakes (the real user store pulls Firebase in); the injected i18n gender is written
 * into useLocaleStore.getInitialState() (react-dom/server reads a store's INITIAL state).
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text
 * nodes — `{total} {label}` is several nodes before, one `t()` string after; it is not rendered text).
 *
 * States behind a tap / an effect (loaded creator drawer, code entry, late picker, sent states,
 * share / mail texts) are pinned by arena-components-i18n-jsdom-parity.test.tsx.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
const userState: { profile: Record<string, unknown> | null } = { profile: null };
const smart = { text: '', subText: '' };
const myGroups: { groups: unknown[]; isLoading: boolean } = { groups: [], isLoading: false };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: async () => {},
  collection: () => ({}),
  serverTimestamp: () => 0,
  doc: () => ({}),
  getDoc: () => new Promise(() => {}),
}));
vi.mock('@/features/parks/core/store/useGPSStore', () => {
  const state = { coords: null, requestPermissionIfAllowed: () => {} };
  const useGPSStore = (sel: (s: typeof state) => unknown) => sel(state);
  useGPSStore.getState = () => state;
  return { useGPSStore };
});
vi.mock('@/features/arena/services/group.service', () => ({
  joinGroup: async () => {},
  getGroupById: () => new Promise(() => {}),
  getGroupMembers: () => new Promise(() => {}),
  makeGroupAdmin: async () => {},
  removeGroupAdmin: async () => {},
  removeGroupMember: async () => {},
}));
vi.mock('@/features/arena/services/booking.service', () => ({ bookSession: async () => ({ success: true }) }));
vi.mock('@/features/arena/services/session-phase.service', () => ({
  setMyAttendeeStatus: async () => {},
  extendLobby: async () => {},
}));
vi.mock('@/features/messages', () => ({ useSmartMessage: () => smart }));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({
  useSharedSession: { getState: () => ({ startGroupSession: () => {} }) },
}));
vi.mock('@/features/arena/services/pressure.service', () => ({ logMunicipalPressure: async () => true }));
vi.mock('@/features/arena/services/message-templates.service', () => ({ pickTemplate: async () => null }));
vi.mock('@/features/arena/services/ranking.service', () => ({ getLeagueBoard: () => new Promise(() => {}) }));
vi.mock('@/features/user/scheduling/services/communitySchedule.service', () => ({
  generateCommunityICS: () => '',
  downloadICS: () => {},
}));
vi.mock('@/features/arena/hooks/useMyGroups', () => ({ useMyGroups: () => myGroups }));
vi.mock('@/features/social/hooks/useChatInbox', () => ({ useChatInbox: () => ({ threads: [] }) }));
vi.mock('@/components/ui/UnitIconBadge', () => ({
  default: (p: { name: string }) => <span data-stub="unit-icon" data-name={p.name} />,
}));

import AttendeesPreview from '../AttendeesPreview';
import MapCard from '../MapCard';
import GroupCard from '../GroupCard';
import EventCard from '../EventCard';
import InviteBonusCard from '../InviteBonusCard';
import MunicipalPressureCard from '../MunicipalPressureCard';
import SchoolOutreachCard from '../SchoolOutreachCard';
import { WorkoutGoalEditor } from '../WorkoutGoalEditor';
import CommunitySessionBanner from '../CommunitySessionBanner';
import NavigationSheet from '../NavigationSheet';
import ReportContentSheet from '../ReportContentSheet';
import PostJoinSuccessDrawer from '../PostJoinSuccessDrawer';
import SessionDrawer from '../SessionDrawer';
import CommunityCircles from '../CommunityCircles';
import CreatorManagementDrawer from '../CreatorManagementDrawer';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { CommunityEvent, CommunityGroup, EventRegistration, LiveSessionPhase } from '@/types/community.types';
import type { Authority } from '@/types/admin-types';

// Monday 19.10.2026 09:00 local.
const NOW = new Date('2026-10-19T09:00:00');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/arena-components-i18n/${name}.html`;
const V = [false, true] as const;
const vName = (v2: boolean) => (v2 ? 'v2' : 'v1');
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

const setUser = (gender?: 'male' | 'female', extra: Record<string, unknown> = {}) => {
  userState.profile = { id: 'u1', core: { name: 'דנה כהן', isSuperAdmin: false, ...(gender ? { gender } : {}), ...extra } };
  Object.assign(useLocaleStore.getInitialState(), { gender: gender ?? 'other' });
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
});
beforeEach(() => {
  flags.enableHomeV2 = false;
  smart.text = '';
  smart.subText = '';
  myGroups.groups = [];
  myGroups.isLoading = false;
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  setUser();
});

const REGS = [
  { uid: 'a', name: 'אבי', photoURL: 'https://cdn.example/a.jpg' },
  { uid: 'b', name: 'בתיה' },
] as unknown as EventRegistration[];

// ── AttendeesPreview / MapCard ────────────────────────────────────────────────

describe('AttendeesPreview + MapCard', () => {
  it.each([0, 1, 2, 1234])('attendees total=%s', async (total) => {
    await expect(html(<AttendeesPreview attendees={REGS} total={total} />)).toMatchFileSnapshot(snap(`attendees-${total}`));
  });
  it('map card: no token / token, with and without label', async () => {
    const out = [
      html(<MapCard lat={32.1} lng={34.8} />),
      html(<MapCard lat={32.1} lng={34.8} label="פארק הירקון" />),
    ];
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test';
    out.push(html(<MapCard lat={32.1} lng={34.8} />), html(<MapCard lat={32.1} lng={34.8} label="פארק הירקון" />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('map-card'));
  });
});

// ── GroupCard ─────────────────────────────────────────────────────────────────

const GROUP = {
  id: 'g1', name: 'רצי הירקון', description: 'ריצה קלה בבקרים', category: 'running', source: 'user',
  isPublic: true, currentParticipants: 7, price: 20,
  meetingLocation: { address: 'פארק הירקון, תל אביב', location: { lat: 32.1, lng: 34.8 } },
  scheduleSlots: [{ dayOfWeek: 1, time: '18:00', frequency: 'weekly' }, { dayOfWeek: 3, time: '07:30', frequency: 'weekly', price: 15 }],
} as unknown as CommunityGroup;

describe('GroupCard', () => {
  const CATS = ['walking', 'running', 'yoga', 'calisthenics', 'cycling', 'other'] as const;
  it.each(CATS)('compact, category %s, no name', async (category) => {
    const g = { ...GROUP, name: '', category, images: [] } as unknown as CommunityGroup;
    await expect(html(<GroupCard group={g} compact distanceKm={0.4} />)).toMatchFileSnapshot(snap(`group-card-compact-${category}`));
  });
  it('compact: live / soon badges, travel times, city precision, legacy schedule', async () => {
    const out = [
      html(<GroupCard group={GROUP} compact livePhase="active" distanceKm={3} />),
      html(<GroupCard group={GROUP} compact livePhase="lobby" distanceKm={500} />),
      html(<GroupCard group={{ ...GROUP, scheduleSlots: [], schedule: { dayOfWeek: 6, time: '20:15' } } as unknown as CommunityGroup} compact />),
      html(<GroupCard group={{ ...GROUP, meetingLocation: { address: 'מודיעין', precision: 'city' } } as unknown as CommunityGroup} compact distanceKm={2} />),
      html(<GroupCard group={{ ...GROUP, groupType: 'military', authorityId: 'b1' } as unknown as CommunityGroup} compact />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('group-card-compact-states'));
  });
  it.each(CATS)('full, category %s, no name, no address', async (category) => {
    const g = { ...GROUP, name: '', category, meetingLocation: undefined } as unknown as CommunityGroup;
    await expect(html(<GroupCard group={g} />)).toMatchFileSnapshot(snap(`group-card-full-${category}`));
  });
  it('full: public / private / joined, live badges, today price, distance, update location', async () => {
    const out = [
      html(<GroupCard group={GROUP} members={REGS} distanceKm={0.3} onUpdateLocation={noop} livePhase="active" />),
      html(<GroupCard group={{ ...GROUP, isPublic: false }} livePhase="approaching" distanceKm={12} />),
      html(<GroupCard group={GROUP} isJoined />),
      html(<GroupCard group={{ ...GROUP, scheduleSlots: [{ dayOfWeek: 1, time: '18:00', frequency: 'weekly', price: 35 }] } as unknown as CommunityGroup} />),
      html(<GroupCard group={{ ...GROUP, price: 0, scheduleSlots: [{ dayOfWeek: 1, time: '06:00', frequency: 'weekly' }] } as unknown as CommunityGroup} />),
      html(<GroupCard group={{ ...GROUP, currentParticipants: 1 }} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('group-card-full-states'));
  });
});

// ── EventCard ─────────────────────────────────────────────────────────────────

const EVENT = {
  id: 'e1', authorityId: 'a1', name: 'מרוץ הרצליה', description: 'מרוץ 5 ק״מ', category: 'race',
  date: new Date('2026-10-23T07:00:00'), startTime: '07:00', endTime: '09:00',
  location: { address: 'פארק הרצליה', location: { lat: 32.16, lng: 34.84 } },
  registrationRequired: true, currentRegistrations: 12, isActive: true, createdBy: 'm1',
  createdAt: new Date(0), updatedAt: new Date(0),
} as unknown as CommunityEvent;

describe('EventCard', () => {
  it.each(['race', 'fitness_day', 'workshop', 'community_meetup', 'other'] as const)('category %s', async (category) => {
    const e = { ...EVENT, category } as CommunityEvent;
    await expect(html(<EventCard event={e} onJoin={noop} />)).toMatchFileSnapshot(snap(`event-card-${category}`));
  });
  it('official / joined / joining / no join / one registration', async () => {
    const out = [
      html(<EventCard event={{ ...EVENT, isOfficial: true, authorityLogoUrl: 'https://cdn.example/l.png' }} registrations={REGS} onJoin={noop} />),
      html(<EventCard event={EVENT} onJoin={noop} isJoined />),
      html(<EventCard event={EVENT} onJoin={noop} joining />),
      html(<EventCard event={{ ...EVENT, endTime: undefined }} registrationCount={1} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('event-card-states'));
  });
});

// ── League-tab promo cards ────────────────────────────────────────────────────

describe('InviteBonusCard / MunicipalPressureCard / SchoolOutreachCard', () => {
  it.each([undefined, 0, 3, 9])('invite bonus, referralCount=%s', async (referralCount) => {
    setUser('female', referralCount === undefined ? {} : { referralCount });
    const out = [html(<InviteBonusCard />), html(<InviteBonusCard scopeName="נווה צדק" />)];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`invite-bonus-${referralCount ?? 'none'}`));
  });

  const AUTH = { id: 'a1', name: 'הרצליה', contactPersonName: 'יוסי', contactType: 'whatsapp', contactValue: '050-1234567' } as unknown as Authority;
  it.each([undefined, 'male', 'female'] as const)('municipal pressure, gender=%s', async (gender) => {
    setUser(gender);
    const out = [
      html(<MunicipalPressureCard cityName="העיר שלך" authority={null} />),
      html(<MunicipalPressureCard cityName="העיר שלך" authority={AUTH} />),
      html(<MunicipalPressureCard cityName="רעננה" authority={{ ...AUTH, name: '', contactPersonName: '' } as Authority} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`municipal-pressure-${gender ?? 'unset'}`));
  });

  it.each([undefined, 'male', 'female'] as const)('school outreach, gender=%s', async (gender) => {
    setUser(gender);
    const out = [
      html(<SchoolOutreachCard schoolName="תיכון הרצוג" />),
      html(<SchoolOutreachCard schoolName="אינטל" orgType="company" />),
      html(<SchoolOutreachCard schoolName="הצופים" orgType="youth_movement" />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`school-outreach-${gender ?? 'unset'}`));
  });
});

// ── WorkoutGoalEditor ─────────────────────────────────────────────────────────

describe('WorkoutGoalEditor', () => {
  it.each(['app', 'admin'] as const)('variant %s: none / distance / time', async (variant) => {
    const out = [
      html(<WorkoutGoalEditor value={undefined} onChange={noop} variant={variant} />),
      html(<WorkoutGoalEditor value={{ kind: 'goal', type: 'distance', value: 7.5 } as never} onChange={noop} variant={variant} />),
      html(<WorkoutGoalEditor value={{ kind: 'goal', type: 'time', value: 2700 } as never} onChange={noop} variant={variant} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`goal-editor-${variant}`));
  });
});

// ── CommunitySessionBanner ────────────────────────────────────────────────────

const PHASES: LiveSessionPhase[] = ['far', 'approaching', 'lobby', 'active', 'ended'];
const session = (over: Partial<UpcomingSession> = {}): UpcomingSession => ({
  groupId: 'g1', groupName: 'רצי הירקון', category: 'running', date: '2026-10-21', time: '18:00',
  slot: { dayOfWeek: 3, time: '18:00', frequency: 'weekly', maxParticipants: 12, price: 25, workoutGoal: { kind: 'goal', type: 'distance', value: 5 } } as UpcomingSession['slot'],
  isToday: false, isTomorrow: false, minutesUntil: 135, phase: 'far',
  attendance: {
    groupId: 'g1', date: '2026-10-21', time: '18:00', attendees: ['a', 'b'], currentCount: 2,
    attendeeProfiles: { a: { name: 'אבי' }, b: { name: 'בתיה', photoURL: 'https://cdn.example/b.jpg' } },
    collectiveProgress: { activeCount: 2, totalXP: 340 },
  } as unknown as UpcomingSession['attendance'],
  ...over,
});

describe('CommunitySessionBanner', () => {
  for (const phase of PHASES) {
    it.each([
      ['unset', undefined, undefined],
      ['female-user', 'female', undefined],
      ['male-user-women-group', 'male', 'female'],
      ['female-user-men-group', 'female', 'male'],
    ] as const)(`${phase}: %s`, async (name, gender, targetGender) => {
      setUser(gender);
      const s = session({ phase, targetGender: targetGender as UpcomingSession['targetGender'] });
      const out = [
        html(<CommunitySessionBanner session={s} onDismiss={noop} onOpenGroup={noop} />),
        html(<CommunitySessionBanner session={s} onDismiss={noop} compact isJoined={false} onDropIn={noop} />),
      ];
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`banner-${phase}-${name}`));
    });
  }

  it('countdown, date label, goal and attendance variants', async () => {
    const out: string[] = [];
    for (const minutesUntil of [-75, -12.4, 0.4, 1, 37.6, 60, 95, 120, 150, 180, 245, 600])
      out.push(html(<CommunitySessionBanner session={session({ minutesUntil })} onDismiss={noop} />));
    out.push(
      html(<CommunitySessionBanner session={session({ isToday: true })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ isTomorrow: true })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ date: '2026-10-24', slot: { ...session().slot, price: undefined, workoutGoal: { kind: 'goal', type: 'time', value: 2700 } } as UpcomingSession['slot'] })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ phase: 'lobby', minutesUntil: -70, slot: { ...session().slot, maxParticipants: undefined, workoutGoal: undefined } as UpcomingSession['slot'], attendance: { ...session().attendance!, maxParticipants: undefined } as UpcomingSession['attendance'] })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ phase: 'lobby', attendance: undefined })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ phase: 'active', attendance: { ...session().attendance!, collectiveProgress: { activeCount: 0 } } as UpcomingSession['attendance'] })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ phase: 'ended', attendance: undefined })} onDismiss={noop} />),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap('banner-variants'));
  });

  it('smart-message copy wins over the fallbacks', async () => {
    smart.text = 'הודעה מהפאנל';
    smart.subText = 'תת הודעה';
    const out = [
      html(<CommunitySessionBanner session={session({ phase: 'approaching' })} onDismiss={noop} />),
      html(<CommunitySessionBanner session={session({ phase: 'ended' })} onDismiss={noop} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('banner-smart-message'));
  });
});

// ── Sheets (v1 + v2) ──────────────────────────────────────────────────────────

describe.each(V)('sheets, enable_home_v2=%s', (v2) => {
  beforeEach(() => { flags.enableHomeV2 = v2; });

  it('NavigationSheet', async () => {
    const out = [
      html(<NavigationSheet isOpen onClose={noop} lat={32.1} lng={34.8} label="פארק הירקון" />),
      html(<NavigationSheet isOpen onClose={noop} lat={32.1} lng={34.8} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`navigation-sheet-${vName(v2)}`));
  });

  it('ReportContentSheet, every target type', async () => {
    const out = (['group', 'event', 'post', 'user'] as const).map((targetType) =>
      html(<ReportContentSheet isOpen onClose={noop} targetId="x1" targetType={targetType} targetName="רצי הירקון" reporterId="u1" />),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`report-sheet-${vName(v2)}`));
  });

  it('PostJoinSuccessDrawer, with and without slots', async () => {
    const out = [
      html(<PostJoinSuccessDrawer isOpen onClose={noop} name="רצי הירקון" verb="ירוץ" scheduleSlots={[{ dayOfWeek: 1, time: '18:00' } as never]} />),
      html(<PostJoinSuccessDrawer isOpen onClose={noop} name="יוגה בפארק" verb="יתאמן" />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`post-join-${vName(v2)}`));
  });

  it('SessionDrawer, every category and state', async () => {
    const out = (['race', 'fitness_day', 'workshop', 'community_meetup', 'other', 'mystery'] as const).map((category) =>
      html(<SessionDrawer isOpen onClose={noop} event={{ ...EVENT, category } as unknown as CommunityEvent} />),
    );
    const parent = { ...GROUP, targetMuscles: ['רגליים', 'ליבה'], equipment: ['מזרן'], maxParticipants: 12 } as unknown as CommunityGroup;
    out.push(
      html(<SessionDrawer isOpen onClose={noop} event={{ ...EVENT, isOfficial: true, specialNotice: 'להביא מים', externalLink: 'https://x.example', price: 40 }} parentGroup={parent} registrations={REGS} onJoin={noop} />),
      html(<SessionDrawer isOpen onClose={noop} event={{ ...EVENT, maxParticipants: 12, currentRegistrations: 12 }} onJoin={noop} isJoined />),
      html(<SessionDrawer isOpen onClose={noop} event={{ ...EVENT, currentRegistrations: 1 }} onJoin={noop} joining />),
      html(<SessionDrawer isOpen onClose={noop} event={{ ...EVENT, location: { address: '', location: { lat: 0, lng: 0 } } }} parentGroup={{ ...GROUP, meetingLocation: { address: 'נמל תל אביב' } } as unknown as CommunityGroup} />),
    );
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test';
    out.push(
      html(<SessionDrawer isOpen onClose={noop} event={EVENT} />),
      html(<SessionDrawer isOpen onClose={noop} event={{ ...EVENT, location: { address: '', location: { lat: 32.1, lng: 34.8 } } }} />),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`session-drawer-${vName(v2)}`));
  });

  it('CreatorManagementDrawer (loading)', async () => {
    await expect(html(<CreatorManagementDrawer isOpen onClose={noop} groupId="g1" onEditGroup={noop} />)).toMatchFileSnapshot(
      snap(`creator-drawer-loading-${vName(v2)}`),
    );
  });
});

describe('CommunityCircles', () => {
  it('loading / groups / create circle', async () => {
    const out: string[] = [];
    myGroups.isLoading = true;
    out.push(html(<CommunityCircles onGroupClick={noop} onCreatePress={noop} />));
    myGroups.isLoading = false;
    myGroups.groups = [{ id: 'g1', name: 'רצי הירקון', category: 'running' }, { id: 'g2', name: 'יוגה', category: 'yoga', images: ['https://cdn.example/y.jpg'] }];
    out.push(html(<CommunityCircles onGroupClick={noop} onCreatePress={noop} />), html(<CommunityCircles onGroupClick={noop} />));
    await expect(out.join('\n')).toMatchFileSnapshot(snap('community-circles'));
  });
});
