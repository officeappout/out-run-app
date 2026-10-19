// @vitest-environment jsdom
/**
 * GroupDetailsDrawer split (no-monster-files refactor) — the safety net.
 *
 * The committed snapshot was recorded from the single-file component BEFORE
 * it was split into group-details/sections/* + hooks + utils. Every case must
 * stay byte-identical in BOTH flag states (enable_home_v2 off/on), including
 * after interactions, and the data-access log (which reads fire, with which
 * args, in which order) must match too.
 */
process.env.TZ = 'UTC';
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: string[] = [];
const log = (name: string, ...args: unknown[]) => calls.push(`${name}(${JSON.stringify(args)})`);

const flags = { enableHomeV2: false };
const profile: { id: string; core: Record<string, unknown> } = {
  id: 'u1',
  core: { isSuperAdmin: false, name: 'דנה', photoURL: 'https://cdn.example/me.jpg', authorityId: 'tlv' },
};
const scenario: {
  members: unknown[];
  attendance: Record<string, unknown>;
  inviteCode: string | null;
  fallbackLive: unknown;
} = { members: [], attendance: {}, inviteCode: null, fallbackLive: null };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: { profile: typeof profile }) => unknown) => (sel ? sel({ profile }) : { profile }),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: {} }));
vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, path: string) => ({ path }),
  getDoc: (ref: { path: string }) => {
    log('getDoc', ref.path);
    return Promise.resolve({ exists: () => true, data: () => ({ currentCount: ref.path.includes('18-00') ? 3 : 0 }) });
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (u: string) => log('router.push', u) }) }));
vi.mock('@/features/arena/components/CommunityAddressSearch', () => ({
  default: (p: { value: string }) => <div data-stub="address-search" data-value={p.value} />,
}));
vi.mock('@/features/admin/components/MiniLocationPicker', () => ({
  default: (p: { value: { lat: number; lng: number } }) => <div data-stub="mini-picker" data-lat={p.value.lat} data-lng={p.value.lng} />,
}));
vi.mock('@/features/arena/components/WorkoutGoalEditor', () => ({
  WorkoutGoalEditor: (p: { value?: unknown; variant: string }) => <div data-stub="goal-editor" data-value={JSON.stringify(p.value ?? null)} data-variant={p.variant} />,
}));
vi.mock('@/features/arena/components/CommunitySessionBanner', () => ({
  default: (p: { session: { phase: string }; compact?: boolean; isJoined?: boolean; onDropIn?: () => void }) => (
    <div data-stub="session-banner" data-phase={p.session.phase} data-compact={String(!!p.compact)} data-joined={String(!!p.isJoined)}>
      {p.onDropIn && <button onClick={p.onDropIn}>drop-in</button>}
    </div>
  ),
}));
vi.mock('@/features/arena/hooks/useGroupLiveSession', () => ({
  useGroupLiveSession: (g: { id: string } | null, enabled: boolean) => {
    log('useGroupLiveSession', g?.id ?? null, enabled);
    return enabled ? scenario.fallbackLive : null;
  },
}));
vi.mock('@/features/arena/services/session-phase.service', () => ({
  setMyAttendeeStatus: async (...a: unknown[]) => log('setMyAttendeeStatus', ...a),
}));
vi.mock('@/features/arena/components/GroupLeagueStatsBoard', () => ({
  default: (p: { groupId: string; timeWindow: string }) => <div data-stub="league-stats" data-group={p.groupId} data-window={p.timeWindow} />,
}));
vi.mock('@/features/parks/core/store/useGPSStore', () => ({
  useGPSStore: Object.assign(
    (sel: (s: { coords: null }) => unknown) => sel({ coords: null }),
    { getState: () => ({ requestPermissionIfAllowed: () => log('gps.requestPermissionIfAllowed') }) },
  ),
}));
vi.mock('@/features/arena/components/NavigationSheet', () => ({
  default: (p: { isOpen: boolean; lat: number; lng: number; label?: string }) => (
    <div data-stub="nav-sheet" data-open={String(p.isOpen)} data-lat={p.lat} data-lng={p.lng} data-label={p.label ?? ''} />
  ),
}));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({
  default: (p: { isOpen: boolean; targetId: string; targetName: string; reporterId: string }) => (
    <div data-stub="report-sheet" data-open={String(p.isOpen)} data-target={p.targetId} data-name={p.targetName} data-reporter={p.reporterId} />
  ),
}));
vi.mock('@/features/arena/services/booking.service', () => ({
  bookSession: async (...a: unknown[]) => {
    log('bookSession', ...a);
    return { success: true, waitlisted: false };
  },
  cancelBooking: async (...a: unknown[]) => log('cancelBooking', ...a),
  leaveWaitlist: async (...a: unknown[]) => log('leaveWaitlist', ...a),
  getSessionAttendance: (groupId: string, date: string, time: string) => {
    log('getSessionAttendance', groupId, date, time);
    return Promise.resolve(scenario.attendance[`${date}_${time}`] ?? null);
  },
  // Same algorithm as booking.service's (pure); copied so the mock is self-contained.
  computeNextSession: (slots: { dayOfWeek: number; time: string }[]) => {
    if (!slots?.length) return null;
    const now = new Date();
    let best: { date: string; time: string; slot: unknown } | null = null;
    let bestDt: Date | null = null;
    for (const slot of slots) {
      const [hour, minute] = slot.time.split(':').map(Number);
      let daysAhead = slot.dayOfWeek - now.getDay();
      if (daysAhead < 0 || (daysAhead === 0 && now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute)) daysAhead += 7;
      const next = new Date(now);
      next.setDate(now.getDate() + daysAhead);
      next.setHours(hour, minute, 0, 0);
      if (!bestDt || next < bestDt) {
        bestDt = next;
        best = { date: next.toISOString().split('T')[0], time: slot.time, slot };
      }
    }
    return best;
  },
}));
vi.mock('@/features/arena/services/group.service', () => ({
  getGroupMembers: (id: string) => {
    log('getGroupMembers', id);
    return Promise.resolve(scenario.members);
  },
  getGroupInviteCode: (id: string) => {
    log('getGroupInviteCode', id);
    return Promise.resolve(scenario.inviteCode);
  },
  joinGroup: async (...a: unknown[]) => log('joinGroup', ...a),
  leaveGroup: async (...a: unknown[]) => log('leaveGroup', ...a),
  makeGroupAdmin: async (...a: unknown[]) => log('makeGroupAdmin', ...a),
  removeGroupAdmin: async (...a: unknown[]) => log('removeGroupAdmin', ...a),
  removeGroupMember: async (...a: unknown[]) => log('removeGroupMember', ...a),
  updateGroup: async (...a: unknown[]) => log('updateGroup', ...a),
}));
vi.mock('@/components/ui/AccessCodeGate', () => ({
  default: (p: { orgName: string; groupType?: string; tenantType?: string; compact?: boolean; hideSkip?: boolean; onSuccess: (r: { tenantId: string }) => void }) => (
    <div data-stub="access-gate" data-org={p.orgName} data-type={p.groupType ?? ''} data-tenant={p.tenantType ?? ''} data-compact={String(!!p.compact)} data-hideskip={String(!!p.hideSkip)}>
      <button onClick={() => p.onSuccess({ tenantId: 'other' })}>gate-wrong</button>
      <button onClick={() => p.onSuccess({ tenantId: 'tlv' })}>gate-ok</button>
    </div>
  ),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: (t: string, m: string) => log('toast', t, m) }) }));
vi.mock('@/lib/planned-run', () => ({ stashPendingPlannedRun: (...a: unknown[]) => log('stashPendingPlannedRun', ...a) }));

import { MotionGlobalConfig } from 'framer-motion';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
MotionGlobalConfig.skipAnimations = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Monday 19.10.2026 09:00 UTC.
const NOW = new Date('2026-10-19T09:00:00Z');

const SLOTS = [
  {
    dayOfWeek: 1, time: '18:00', frequency: 'weekly', maxParticipants: 4, label: 'ריצת ערב', tags: ['ריצה', 'קבוצתי'],
    images: ['https://cdn.example/slot.jpg'], price: 30, targetMuscles: ['רגליים'], requiredEquipment: ['נעליים'],
    workoutGoal: { type: 'distance', value: 5 },
    location: { address: 'פארק הירקון, תל אביב', lat: 32.1, lng: 34.8 },
  },
  { dayOfWeek: 3, time: '07:30', frequency: 'weekly' },
];

const MEMBERS = [
  { uid: 'u1', name: 'דנה כהן', role: 'member', joinedAt: new Date(0) },
  { uid: 'u2', name: 'אורי לוי', role: 'admin', joinedAt: new Date(0) },
  { uid: 'u3', name: 'מיכל', role: 'member', joinedAt: new Date(0) },
];

const ATTENDANCE = {
  '2026-10-19_18:00': {
    groupId: 'g1', date: '2026-10-19', time: '18:00', attendees: ['a', 'b', 'c'], currentCount: 3,
    attendeeProfiles: { a: { name: 'אבי', photoURL: 'https://cdn.example/a.jpg' }, b: { name: 'בתיה' }, c: { name: 'גיל' } },
    waitlist: ['w'],
  },
  '2026-10-21_07:30': { groupId: 'g1', date: '2026-10-21', time: '07:30', attendees: [], currentCount: 0 },
};

const CREATOR_GROUP = {
  id: 'g1', name: 'רצי הירקון', category: 'running', createdBy: 'u1', isPublic: false, description: 'קבוצת ריצה שבועית.',
  rules: 'מגיעים בזמן.\nשומרים על הניקיון.', targetMuscles: ['ליבה'], equipment: ['מים'], price: 20,
  registrationLink: 'https://register.example/g1', images: ['https://cdn.example/group.jpg'],
  meetingLocation: { address: 'נמל תל אביב', location: { lat: 32.09, lng: 34.77 } },
  scheduleSlots: SLOTS,
};

const VISITOR_GROUP = {
  id: 'g2', name: 'יוגה בפארק', category: 'yoga', createdBy: 'zz', isPublic: true, authorityId: 'tlv',
  meetingLocation: { address: 'רמת גן, מרכז', precision: 'city', location: { lat: 32.07, lng: 34.82 } },
  schedule: { dayOfWeek: 1, time: '18:00', frequency: 'weekly' },
};

const LOCKED_GROUP = {
  id: 'g3', name: 'יחידה 8200', category: 'calisthenics', createdBy: 'zz', isPublic: false, isLocked: true,
  authorityId: 'tlv', groupType: 'military', requiredAccessCodeType: 'military',
};

const PRIVATE_GROUP = { id: 'g4', name: 'חברים', category: 'other', createdBy: 'zz', isPublic: false, scheduleSlots: [] };

const RUN_GROUP = {
  id: 'g5', name: 'ריצה מתוזמנת', category: 'running', createdBy: 'zz', isPublic: true, type: 'ephemeral', groupType: 'military',
  plannedRun: { km: 5 }, scheduleSlots: [{ dayOfWeek: 1, time: '18:00', frequency: 'weekly' }],
};

const live = (groupId: string, phase: string) => ({
  groupId, groupName: 'x', category: 'running', date: '2026-10-19', time: '18:00', slot: SLOTS[0], isToday: true,
  isTomorrow: false, minutesUntil: -5, phase,
});

let root: Root | null = null;
let host: HTMLElement | null = null;

async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
}
async function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  await flush();
}
async function rerender(el: React.ReactElement) {
  await act(async () => root!.render(el));
  await flush();
}

/** sha256 + length snapshot; PARITY_DUMP=<dir> also writes the full markup. */
function markup(name: string) {
  const html = document.body.innerHTML;
  const dir = process.env.PARITY_DUMP;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const file = `${expect.getState().currentTestName}--${name}`.replace(/[^\w֐-׿-]+/g, '_');
    writeFileSync(join(dir, `group--${file}.html`), html);
  }
  return { sha256: createHash('sha256').update(html).digest('hex'), length: html.length };
}

function byText(text: string, tag = 'button'): HTMLElement {
  const el = Array.from(document.body.querySelectorAll<HTMLElement>(tag)).find((n) => n.textContent?.includes(text));
  if (!el) throw new Error(`no <${tag}> with text "${text}"`);
  return el;
}
async function click(el: Element | null) {
  if (!el) throw new Error('missing element');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}
async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  calls.length = 0;
  scenario.members = MEMBERS;
  scenario.attendance = ATTENDANCE;
  scenario.inviteCode = 'ABC123';
  scenario.fallbackLive = null;
  profile.id = 'u1';
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  flags.enableHomeV2 = false;
  vi.useRealTimers();
});

const noop = () => {};
const asyncNoop = async () => {};

for (const v2 of [false, true]) {
  describe(`GroupDetailsDrawer — flag ${v2 ? 'on' : 'off'}`, () => {
    beforeEach(() => {
      flags.enableHomeV2 = v2;
    });

    it('creator + member, private group: initial render + data access', async () => {
      await mount(
        <GroupDetailsDrawer isOpen onClose={noop} group={CREATOR_GROUP as never} isJoined onJoin={noop} onLeave={asyncNoop} onOpenChat={noop} onEdit={noop} />,
      );
      expect(markup('initial')).toMatchSnapshot('initial');
      expect(calls).toMatchSnapshot('calls');
    });

    it('creator: schedule, week tab, member actions, leave confirm, remove modal', async () => {
      await mount(
        <GroupDetailsDrawer isOpen onClose={noop} group={CREATOR_GROUP as never} isJoined onJoin={noop} onLeave={asyncNoop} onOpenChat={noop} onEdit={noop} />,
      );
      calls.length = 0;
      await click(byText('לכל מערכת השעות'));
      expect(markup('schedule open')).toMatchSnapshot('schedule open');
      await click(byText('השבוע'));
      expect(markup('week tab')).toMatchSnapshot('week tab');
      await click(byText('מיכל'));
      expect(markup('member actions')).toMatchSnapshot('member actions');
      await click(byText('הפוך למנהל'));
      expect(markup('promoted')).toMatchSnapshot('promoted');
      await click(byText('אורי לוי'));
      await click(byText('הסר מהקבוצה'));
      expect(markup('remove modal')).toMatchSnapshot('remove modal');
      await click(byText('הסר', 'button'));
      expect(markup('removed')).toMatchSnapshot('removed');
      await click(byText('עזוב קבוצה'));
      expect(markup('leave confirm')).toMatchSnapshot('leave confirm');
      await click(byText('הירשם למפגש'));
      expect(markup('booked')).toMatchSnapshot('booked');
      await click(byText('דיווח על תוכן'));
      expect(markup('report open')).toMatchSnapshot('report open');
      expect(calls).toMatchSnapshot('calls');
    });

    it('creator: schedule manager + slot editor', async () => {
      await mount(
        <GroupDetailsDrawer isOpen onClose={noop} group={CREATOR_GROUP as never} isJoined onJoin={noop} onLeave={asyncNoop} onOpenChat={noop} onEdit={noop} />,
      );
      calls.length = 0;
      await click(byText('ניהול מפגשים'));
      expect(markup('manager')).toMatchSnapshot('manager');
      await click(document.body.querySelector('button[title="ערוך"]'));
      expect(markup('editor')).toMatchSnapshot('editor');
      await click(byText('ש׳'));
      await click(byText('שמור שינויים'));
      expect(markup('saved')).toMatchSnapshot('saved');
      await click(byText('ניהול מפגשים'));
      await click(byText('הוסף מפגש'));
      expect(markup('add editor')).toMatchSnapshot('add editor');
      expect(calls).toMatchSnapshot('calls');
    });

    it('visitor, public city-precision group, live session: drop-in + join prompt', async () => {
      await mount(
        <GroupDetailsDrawer isOpen onClose={noop} group={VISITOR_GROUP as never} onJoin={noop} liveSession={live('g2', 'active') as never} />,
      );
      expect(markup('initial')).toMatchSnapshot('initial');
      await click(byText('drop-in'));
      expect(markup('join prompt')).toMatchSnapshot('join prompt');
      await click(byText('כן, הצטרפי לקבוצה'));
      expect(markup('joined')).toMatchSnapshot('joined');
      expect(calls).toMatchSnapshot('calls');
    });

    it('visitor, live session, no drop-in (city-only other city) + joining spinner', async () => {
      profile.core = { ...profile.core, authorityId: 'other' };
      await mount(
        <GroupDetailsDrawer isOpen onClose={noop} group={{ ...VISITOR_GROUP, isCityOnly: true } as never} onJoin={noop} joining liveSession={live('g2', 'lobby') as never} />,
      );
      profile.core = { ...profile.core, authorityId: 'tlv' };
      expect(markup('locked banner')).toMatchSnapshot('locked banner');
    });

    it('locked group: access-code gate', async () => {
      await mount(<GroupDetailsDrawer isOpen onClose={noop} group={LOCKED_GROUP as never} onJoin={noop} />);
      expect(markup('gate')).toMatchSnapshot('gate');
      await click(byText('gate-wrong'));
      await click(byText('gate-ok'));
      expect(markup('unlocked')).toMatchSnapshot('unlocked');
      expect(calls).toMatchSnapshot('calls');
    });

    it('private group: invite-code entry', async () => {
      await mount(<GroupDetailsDrawer isOpen onClose={noop} group={PRIVATE_GROUP as never} onJoin={noop} />);
      expect(markup('closed entry')).toMatchSnapshot('closed entry');
      await click(byText('הזן קוד הצטרפות'));
      await type(document.body.querySelector('input[aria-label="קוד הצטרפות לקהילה"]')!, 'xyz789');
      expect(markup('typed')).toMatchSnapshot('typed');
      await click(byText('אישור'));
      expect(markup('submitted')).toMatchSnapshot('submitted');
      expect(calls).toMatchSnapshot('calls');
    });

    it('ephemeral scheduled run (joined), fallback live session, military no-location', async () => {
      scenario.fallbackLive = live('g5', 'lobby');
      await mount(<GroupDetailsDrawer isOpen onClose={noop} group={RUN_GROUP as never} isJoined onLeave={asyncNoop} />);
      expect(markup('initial')).toMatchSnapshot('initial');
      if (v2) await click(byText('צא לריצה'));
      expect(calls).toMatchSnapshot('calls');
    });

    it('closed, then null group', async () => {
      await mount(<GroupDetailsDrawer isOpen={false} onClose={noop} group={CREATOR_GROUP as never} isJoined />);
      expect(markup('closed')).toMatchSnapshot('closed');
      await rerender(<GroupDetailsDrawer isOpen onClose={noop} group={null} />);
      expect(markup('null')).toMatchSnapshot('null');
      expect(calls).toMatchSnapshot('calls');
    });
  });
}
