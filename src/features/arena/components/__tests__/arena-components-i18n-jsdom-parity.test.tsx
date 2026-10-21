// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `community`): the arena components' states that only appear after an
 * effect or a tap — the loaded creator drawer (member actions, remove confirm), the group card's
 * code entry + wrong code, the session banner's late picker / confirmations, the report sheet's
 * "sent" state, the city challenge card after its board load, the outreach / pressure cards' sent
 * state — and the texts that leave the app (navigator.share / clipboard / window.open URLs).
 * Recorded BEFORE the extraction from unmodified origin/main.
 *
 * react-dom/client in jsdom, framer-motion animations skipped (MotionGlobalConfig.skipAnimations);
 * `style` attributes and React `:rN:` ids are normalised before comparing (animation values, not
 * text). Static states live in arena-components-i18n-parity.test.tsx.
 */
process.env.TZ = 'UTC';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const log: string[] = [];
const record = (name: string, ...args: unknown[]) => log.push(`${name}(${JSON.stringify(args)})`);
const flags = { enableHomeV2: false };
const userState: { profile: Record<string, unknown> | null } = { profile: null };
const svc = {
  group: null as Record<string, unknown> | null,
  members: [] as Record<string, unknown>[],
  joinFails: false,
  board: null as { entries: Record<string, unknown>[]; unavailable?: boolean } | null,
  template: null as string | null,
};

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (...a: unknown[]) => record('router.push', ...a) }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: async (_c: unknown, data: Record<string, unknown>) => record('addDoc', { ...data, createdAt: 'ts' }),
  collection: () => ({}),
  serverTimestamp: () => 0,
  doc: () => ({}),
  getDoc: () => new Promise(() => {}),
}));
vi.mock('@/features/arena/services/group.service', () => ({
  joinGroup: async (...a: unknown[]) => {
    record('joinGroup', ...a);
    if (svc.joinFails) throw new Error('wrong code');
  },
  getGroupById: async () => svc.group,
  getGroupMembers: async () => svc.members,
  makeGroupAdmin: async (...a: unknown[]) => record('makeGroupAdmin', ...a),
  removeGroupAdmin: async (...a: unknown[]) => record('removeGroupAdmin', ...a),
  removeGroupMember: async (...a: unknown[]) => record('removeGroupMember', ...a),
}));
vi.mock('@/features/arena/services/booking.service', () => ({
  bookSession: async (...a: unknown[]) => { record('bookSession', ...a); return { success: true }; },
}));
vi.mock('@/features/arena/services/session-phase.service', () => ({
  setMyAttendeeStatus: async (...a: unknown[]) => record('setMyAttendeeStatus', ...a),
  extendLobby: async () => {},
}));
vi.mock('@/features/messages', () => ({ useSmartMessage: () => ({ text: '', subText: '' }) }));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({
  useSharedSession: { getState: () => ({ startGroupSession: (...a: unknown[]) => record('startGroupSession', a[0]) }) },
}));
vi.mock('@/features/arena/services/pressure.service', () => ({
  logMunicipalPressure: async (...a: unknown[]) => { record('logMunicipalPressure', ...a); return true; },
}));
vi.mock('@/features/arena/services/message-templates.service', () => ({ pickTemplate: async () => svc.template }));
vi.mock('@/features/arena/services/ranking.service', () => ({ getLeagueBoard: async () => svc.board }));
vi.mock('@/features/user/scheduling/services/communitySchedule.service', () => ({
  generateCommunityICS: () => '',
  downloadICS: () => {},
}));
vi.mock('@/components/ui/UnitIconBadge', () => ({ default: () => <span data-stub="unit-icon" /> }));

import { MotionGlobalConfig } from 'framer-motion';
import GroupCard from '../GroupCard';
import CommunitySessionBanner from '../CommunitySessionBanner';
import ReportContentSheet from '../ReportContentSheet';
import PostJoinSuccessDrawer from '../PostJoinSuccessDrawer';
import CreatorManagementDrawer from '../CreatorManagementDrawer';
import CityChallengeCard from '../CityChallengeCard';
import MunicipalPressureCard from '../MunicipalPressureCard';
import SchoolOutreachCard from '../SchoolOutreachCard';
import InviteBonusCard from '../InviteBonusCard';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import type { CommunityGroup } from '@/types/community.types';
import type { Authority } from '@/types/admin-types';

MotionGlobalConfig.skipAnimations = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Monday 19.10.2026 09:00 UTC.
const NOW = new Date('2026-10-19T09:00:00Z');
const noop = () => {};
const snap = (name: string) => `./__snapshots__/arena-components-i18n/jsdom-${name.includes(".") ? name : `${name}.html`}`;
const LOCALE_DEFAULTS = { ...useLocaleStore.getState() };

const normalise = (s: string) =>
  s.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replace(/«r[0-9a-z]+»/g, '«r»');
const body = () => normalise(document.body.innerHTML);

let root: Root | null = null;
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
}
async function mount(el: ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  await flush();
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
}
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}
async function typeInto(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const btn = (text: string) => buttons().find((b) => b.textContent?.includes(text));

const setUser = (gender?: 'male' | 'female', extra: Record<string, unknown> = {}) => {
  userState.profile = { id: 'u1', core: { name: 'דנה כהן', isSuperAdmin: false, ...(gender ? { gender } : {}), ...extra } };
  useLocaleStore.setState({ gender: gender ?? 'other' });
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.defineProperty(window, 'open', { configurable: true, value: (...a: unknown[]) => record('window.open', ...a) });
});
afterAll(() => {
  vi.useRealTimers();
  useLocaleStore.setState(LOCALE_DEFAULTS);
});
beforeEach(() => {
  flags.enableHomeV2 = false;
  svc.group = null;
  svc.members = [];
  svc.joinFails = false;
  svc.board = null;
  svc.template = null;
  setUser();
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (data: unknown) => record('navigator.share', data),
  });
});
afterEach(async () => {
  await unmount();
  log.length = 0;
});

// ── CreatorManagementDrawer ───────────────────────────────────────────────────

describe.each([false, true])('CreatorManagementDrawer, enable_home_v2=%s', (v2) => {
  const v = v2 ? 'v2' : 'v1';
  it('loaded: header, members, member actions, remove confirm', async () => {
    flags.enableHomeV2 = v2;
    svc.group = { id: 'g1', name: 'רצי הירקון', category: 'running', createdBy: 'u1', memberCount: 1234 };
    svc.members = [
      { uid: 'u3', name: 'מיכל', role: 'member' },
      { uid: 'u1', name: 'דנה כהן', role: 'member' },
      { uid: 'u2', name: 'אורי לוי', role: 'admin' },
    ];
    await mount(<CreatorManagementDrawer isOpen onClose={noop} groupId="g1" onEditGroup={noop} />);
    const out = [body()];
    await click(btn('מיכל'));
    out.push(body());
    await click(btn('אורי לוי'));
    out.push(body());
    await click(btn('הסר מהקבוצה'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`creator-loaded-${v}`));
  });
  it('loaded: unknown category, no member count, no members', async () => {
    flags.enableHomeV2 = v2;
    svc.group = { id: 'g1', name: 'קבוצה', category: 'mystery', createdBy: 'u1' };
    svc.members = [];
    await mount(<CreatorManagementDrawer isOpen onClose={noop} groupId="g1" onEditGroup={noop} />);
    await expect(body()).toMatchFileSnapshot(snap(`creator-empty-${v}`));
  });
});

// ── GroupCard code entry ──────────────────────────────────────────────────────

describe('GroupCard', () => {
  it('private group: code entry, then a wrong code', async () => {
    const group = { id: 'g1', name: 'רצי הירקון', category: 'running', isPublic: false, currentParticipants: 3 } as unknown as CommunityGroup;
    await mount(<GroupCard group={group} onJoin={noop} />);
    await click(btn('הזן קוד'));
    const out = [body()];
    svc.joinFails = true;
    await typeInto(document.body.querySelector('input') as HTMLInputElement, 'ab12cd');
    await click(btn('אישור'));
    out.push(body(), log.join('\n'));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('group-card-code'));
  });
  it('private group, joined user without a name: joinGroup fallback name', async () => {
    userState.profile = { id: 'u1', core: {} };
    const group = { id: 'g1', name: 'רצי הירקון', category: 'running', isPublic: false, currentParticipants: 3 } as unknown as CommunityGroup;
    await mount(<GroupCard group={group} onJoin={(id) => record('onJoin', id)} />);
    await click(btn('הזן קוד'));
    await typeInto(document.body.querySelector('input') as HTMLInputElement, 'ZZ99');
    await click(btn('אישור'));
    await expect(`${body()}\n\n${log.join('\n')}`).toMatchFileSnapshot(snap('group-card-code-ok'));
  });
});

// ── CommunitySessionBanner taps ───────────────────────────────────────────────

const session = (over: Partial<UpcomingSession> = {}): UpcomingSession => ({
  groupId: 'g1', groupName: 'רצי הירקון', category: 'running', date: '2026-10-19', time: '18:00',
  slot: { dayOfWeek: 1, time: '18:00', frequency: 'weekly', maxParticipants: 12 } as UpcomingSession['slot'],
  isToday: true, isTomorrow: false, minutesUntil: 25, phase: 'approaching',
  attendance: { groupId: 'g1', date: '2026-10-19', time: '18:00', attendees: [], currentCount: 0, attendeeProfiles: {} } as unknown as UpcomingSession['attendance'],
  ...over,
});

describe.each([
  ['unset', undefined],
  ['female', 'female'],
] as const)('CommunitySessionBanner taps (%s)', (name, gender) => {
  it('late picker, then +5 → "we will wait"', async () => {
    setUser(gender);
    await mount(<CommunitySessionBanner session={session()} onDismiss={noop} />);
    await click(btn(gender === 'female' ? 'מאחרת?' : 'מאחר?'));
    const out = [body()];
    await click(btn('+5'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`banner-late-${name}`));
  });
  it('approaching → on my way; far → booked; lobby → here', async () => {
    setUser(gender);
    await mount(<CommunitySessionBanner session={session()} onDismiss={noop} />);
    await click(btn('אני בדרך'));
    const out = [body()];
    await unmount();
    await mount(<CommunitySessionBanner session={session({ phase: 'far', isToday: false, minutesUntil: 150 })} onDismiss={noop} />);
    await click(btn(gender === 'female' ? 'הירשמי' : 'הירשם'));
    out.push(body());
    await unmount();
    await mount(<CommunitySessionBanner session={session({ phase: 'lobby', minutesUntil: 3 })} onDismiss={noop} />);
    await click(btn(gender === 'female' ? 'הצטרפי לאימון' : 'הצטרף לאימון'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`banner-taps-${name}`));
  });
});

// ── ReportContentSheet sent ───────────────────────────────────────────────────

describe.each([false, true])('ReportContentSheet sent, enable_home_v2=%s', (v2) => {
  it('pick a reason, send', async () => {
    flags.enableHomeV2 = v2;
    await mount(<ReportContentSheet isOpen onClose={noop} targetId="p1" targetType="post" targetName="פוסט" reporterId="u1" />);
    await click(btn('מידע מטעה'));
    const out = [body()];
    await click(btn('שלח דיווח'));
    out.push(body(), log.join('\n'));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`report-sent-${v2 ? 'v2' : 'v1'}`));
  });
});

// ── Texts that leave the app ──────────────────────────────────────────────────

describe('share / message texts', () => {
  it('PostJoinSuccessDrawer invite', async () => {
    await mount(<PostJoinSuccessDrawer isOpen onClose={noop} name="רצי הירקון" verb="ירוץ" />);
    await click(btn('הזמן שותף/ה'));
    await expect(log.join('\n')).toMatchFileSnapshot(snap('post-join-share.txt'));
  });

  it('InviteBonusCard invite, with and without a scope', async () => {
    await mount(<InviteBonusCard scopeName="נווה צדק" />);
    await click(btn('הזמנת חבר'));
    await unmount();
    await mount(<InviteBonusCard />);
    await click(btn('הזמנת חבר'));
    await expect(log.join('\n')).toMatchFileSnapshot(snap('invite-bonus-share.txt'));
  });

  const AUTH = { id: 'a1', name: 'הרצליה', contactPersonName: 'יוסי', contactType: 'whatsapp', contactValue: '050-1234567' };
  it.each([undefined, 'male', 'female'] as const)('MunicipalPressureCard, gender=%s: whatsapp / email / share + sent', async (gender) => {
    setUser(gender);
    const out: string[] = [];
    for (const auth of [
      AUTH,
      { ...AUTH, contactType: 'email', contactValue: 'sport@herzliya.example' },
      { ...AUTH, contactType: 'link', contactValue: 'https://herzliya.example/form', contactPersonName: '' },
    ]) {
      await mount(<MunicipalPressureCard cityName="העיר שלך" authority={auth as unknown as Authority} />);
      await click(btn('הודעה לעירייה'));
      out.push(body());
      await unmount();
    }
    // Before the authority loads the message isn't generated yet: the click builds the fallback.
    await mount(<MunicipalPressureCard cityName="רעננה" authority={null} />);
    await click(btn('הודעה לעירייה'));
    // A remote template wins over the defaults.
    await unmount();
    svc.template = 'שלום {{contactPerson}} מ-${cityName}';
    await mount(<MunicipalPressureCard cityName="העיר שלך" authority={AUTH as unknown as Authority} />);
    await click(btn('הודעה לעירייה'));
    out.push(log.join('\n'));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`municipal-pressure-${gender ?? 'unset'}`));
  });

  it.each([undefined, 'male', 'female'] as const)('SchoolOutreachCard, gender=%s: every org + sent', async (gender) => {
    setUser(gender);
    const out: string[] = [];
    for (const [orgType, label] of [['school', 'למנהל/ת'], ['company', 'ל-HR'], ['youth_movement', 'לרכז/ת']] as const) {
      await mount(<SchoolOutreachCard schoolName="תיכון הרצוג" orgType={orgType} />);
      await click(btn(label));
      out.push(body());
      await unmount();
    }
    svc.template = 'היי מ-{{schoolName}} / ${orgName}';
    await mount(<SchoolOutreachCard schoolName="תיכון הרצוג" />);
    await click(btn('למנהל/ת'));
    out.push(log.join('\n'));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`school-outreach-${gender ?? 'unset'}`));
  });
});

// ── CityChallengeCard after its board load ────────────────────────────────────

describe('CityChallengeCard', () => {
  const entry = (totalScore: number) => ({ scopeId: 'c1', scopeName: 'הרצליה', totalScore, activeMemberCount: 4321 });
  it.each([0, 123456, 1000000, 1500000])('totalScore=%s', async (score) => {
    svc.board = { entries: [entry(score)] };
    await mount(<CityChallengeCard cityId="c1" cityName={score === 0 ? null : 'הרצליה רבתי'} />);
    await expect(body()).toMatchFileSnapshot(snap(`city-challenge-${score}`));
  });
  it('no row / unavailable / no city → nothing', async () => {
    svc.board = { entries: [], unavailable: true };
    await mount(<CityChallengeCard cityId="c1" />);
    const a = body();
    await unmount();
    await mount(<CityChallengeCard cityId={null} />);
    expect([a, body()]).toEqual(['<div></div>', '<div></div>']);
  });
});
