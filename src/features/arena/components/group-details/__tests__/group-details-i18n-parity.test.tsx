// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `community`, `group.*` keys): the group page's copy
 * (src/features/arena/components/group-details) moves to
 * src/messages/he/community.json. The snapshots below were recorded from the
 * sections BEFORE the extraction; the extracted sections must render the same
 * Hebrew in every state that shows text — v1 and v2 (enable_home_v2 is a
 * `v2` prop here), empty / loading / full / waitlisted / booked, owner /
 * admin / member rows, every join case, the schedule manager after its status
 * fetch, the slot editor, and the toasts + share texts behind a tap.
 *
 * Static cases: renderToStaticMarkup, with `<!-- -->` stripped (react-dom/server
 * inserts it between two adjacent text nodes — `{n} נרשמו` is two nodes,
 * `t('…', { count })` is one; it is not rendered text). Cases that need an
 * effect or a tap (schedule manager status, toasts, share): react-dom/client in
 * jsdom with framer-motion animations skipped, then document.body.innerHTML.
 *
 * The whole drawer is also pinned by
 * src/components/ui/v2/__tests__/group-details-drawer-split-parity.test.tsx
 * (sha256 per state + data-access/toast log), which must stay green as is.
 */
process.env.TZ = 'UTC';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const log: string[] = [];
const record = (name: string, ...args: unknown[]) => log.push(`${name}(${JSON.stringify(args)})`);
const slotStatus: Record<string, { locked: boolean; attendeeCount: number }> = {};
const svc = { updateFails: false };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/arena/services/group.service', () => ({
  updateGroup: async (...a: unknown[]) => {
    record('updateGroup', ...a);
    if (svc.updateFails) throw new Error('nope');
  },
  joinGroup: async (...a: unknown[]) => record('joinGroup', ...a),
}));
vi.mock('@/features/arena/components/group-details/services/slot-status.service', () => ({
  getSlotStatus: async (_groupId: string, slot: { time: string }) => slotStatus[slot.time] ?? { locked: false, attendeeCount: 0 },
}));
vi.mock('@/features/arena/services/booking.service', () => ({ bookSession: async () => ({ success: true }) }));
vi.mock('@/features/arena/services/session-phase.service', () => ({ setMyAttendeeStatus: async () => {} }));
vi.mock('@/features/arena/components/CommunityAddressSearch', () => ({
  default: (p: { value: string }) => <div data-stub="address-search" data-value={p.value} />,
}));
vi.mock('@/features/admin/components/MiniLocationPicker', () => ({
  default: (p: { value: { lat: number; lng: number } }) => <div data-stub="mini-picker" data-lat={p.value.lat} data-lng={p.value.lng} />,
}));
vi.mock('@/features/arena/components/WorkoutGoalEditor', () => ({
  WorkoutGoalEditor: (p: { value?: unknown }) => <div data-stub="goal-editor" data-value={JSON.stringify(p.value ?? null)} />,
}));
vi.mock('@/features/arena/components/CommunitySessionBanner', () => ({
  default: (p: { isJoined?: boolean; onDropIn?: unknown }) => (
    <div data-stub="session-banner" data-joined={String(!!p.isJoined)} data-dropin={String(!!p.onDropIn)} />
  ),
}));
vi.mock('@/components/ui/AccessCodeGate', () => ({
  default: (p: { orgName: string }) => <div data-stub="access-gate" data-org={p.orgName} />,
}));
vi.mock('@/features/arena/components/NavigationSheet', () => ({
  default: (p: { isOpen: boolean }) => <div data-stub="nav-sheet" data-open={String(p.isOpen)} />,
}));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({
  default: (p: { isOpen: boolean }) => <div data-stub="report-sheet" data-open={String(p.isOpen)} />,
}));

import { MotionGlobalConfig, type DragControls } from 'framer-motion';
import {
  DropInJoinPrompt,
  FullScheduleList,
  GroupHero,
  GroupJoinSection,
  GroupLiveBanner,
  GroupLocationCard,
  GroupMemberList,
  GroupMembershipActions,
  GroupOrganizerActions,
  GroupRulesCard,
  GroupShareRow,
  InviteCodePanel,
  NextSessionCard,
  RegistrationLinkButton,
  StartScheduledRunButton,
  WhoIsComingSection,
} from '../sections';
import RemoveMemberModal from '../sections/RemoveMemberModal';
import ScheduleManagerPanel from '../sections/ScheduleManagerPanel';
import SlotEditorSheet from '../sections/SlotEditorSheet';
import GroupDrawerOverlays from '../sections/GroupDrawerOverlays';
import { useGroupJoinActions } from '../hooks/useGroupJoinActions';
import { CATEGORY_CONFIG } from '../utils/group-details-logic';
import type { CommunityGroup, GroupMember, ScheduleSlot, SessionAttendance } from '@/types/community.types';

MotionGlobalConfig.skipAnimations = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Monday 19.10.2026 09:00 UTC.
const NOW = new Date('2026-10-19T09:00:00Z');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/group-details-i18n/${name.includes('.') ? name : `${name}.html`}`;
const V = [false, true] as const;
const vName = (v2: boolean) => (v2 ? 'v2' : 'v1');

const SLOT_A: ScheduleSlot = {
  dayOfWeek: 1, time: '18:00', frequency: 'weekly', maxParticipants: 4, label: 'ריצת ערב',
  price: 30, requiredEquipment: ['נעליים'], workoutGoal: { type: 'distance', value: 5 } as ScheduleSlot['workoutGoal'],
  location: { address: 'פארק הירקון, תל אביב', lat: 32.1, lng: 34.8 },
} as ScheduleSlot;
const SLOT_B = { dayOfWeek: 3, time: '07:30', frequency: 'weekly', workoutGoal: { type: 'duration', value: 1800 } } as unknown as ScheduleSlot;
const SLOT_C = { dayOfWeek: 6, time: '20:15', frequency: 'weekly' } as ScheduleSlot;

const GROUP = {
  id: 'g1', name: 'רצי הירקון', category: 'running', createdBy: 'u1', isPublic: false, price: 20, equipment: ['מים'],
  meetingLocation: { address: 'נמל תל אביב', location: { lat: 32.09, lng: 34.77 } },
  scheduleSlots: [SLOT_A, SLOT_B, SLOT_C],
} as unknown as CommunityGroup;

const MEMBERS: GroupMember[] = [
  { uid: 'u1', name: 'דנה כהן', role: 'member', joinedAt: new Date(0) },
  { uid: 'u2', name: 'אורי לוי', role: 'admin', joinedAt: new Date(0) },
  { uid: 'u3', name: 'מיכל', role: 'member', joinedAt: new Date(0) },
];

const att = (count: number, waitlist = 0, photos = true): SessionAttendance => ({
  groupId: 'g1', date: '2026-10-19', time: '18:00', attendees: [], currentCount: count,
  attendeeProfiles: Object.fromEntries(
    Array.from({ length: Math.min(count, 3) }, (_, i) => [`a${i}`, { name: ['אבי', 'בתיה', 'גיל'][i], ...(photos && i === 0 ? { photoURL: 'https://cdn.example/a.jpg' } : {}) }]),
  ),
  waitlist: Array.from({ length: waitlist }, (_, i) => `w${i}`),
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe('static sections', () => {
  it.each(V)('hero, category badge + cover / gradient (v2=%s)', async (v2) => {
    const controls = { start: noop } as unknown as DragControls;
    const out = [
      ...Object.keys(CATEGORY_CONFIG).map((c) =>
        html(<GroupHero v2={v2} name="רצי הירקון" coverImage={null} catConfig={CATEGORY_CONFIG[c]} dragControls={controls} onClose={noop} />),
      ),
      html(<GroupHero v2={v2} name="רצי הירקון" coverImage="https://cdn.example/g.jpg" catConfig={CATEGORY_CONFIG.yoga} dragControls={controls} onClose={noop} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`hero-${vName(v2)}`));
  });

  it.each(V)('next session card, every booking state (v2=%s)', async (v2) => {
    const base = {
      v2, nextSessionData: { date: '2026-10-19', time: '18:00' }, nextSlot: SLOT_A, categoryLabel: 'ריצה', spotsLeft: 2 as number | null,
      isFull: false, effectivePrice: 30 as number | null, isJoined: true as boolean | undefined, bookingLoading: false, isBooked: false,
      isWaitlisted: false, onBook: noop, hasMultipleSlots: true, scheduleOpen: false, onToggleSchedule: noop,
    };
    const out = [
      html(<NextSessionCard {...base} />),
      html(<NextSessionCard {...base} spotsLeft={1234} />),
      html(<NextSessionCard {...base} isBooked scheduleOpen />),
      html(<NextSessionCard {...base} isWaitlisted spotsLeft={0} isFull />),
      html(<NextSessionCard {...base} spotsLeft={0} isFull />),
      html(<NextSessionCard {...base} bookingLoading />),
      html(<NextSessionCard {...base} nextSlot={SLOT_B} nextSessionData={{ date: '2026-10-20', time: '07:30' }} spotsLeft={null} effectivePrice={null} isJoined={false} hasMultipleSlots={false} />),
      html(<NextSessionCard {...base} nextSlot={null} nextSessionData={{ date: '2026-10-22', time: '06:00' }} effectivePrice={0} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`next-session-${vName(v2)}`));
  });

  it.each(V)('full schedule list (v2=%s)', async (v2) => {
    await expect(html(<FullScheduleList v2={v2} group={GROUP} slots={[SLOT_A, SLOT_B, SLOT_C]} nextSlot={SLOT_A} destAddress="נמל תל אביב" />))
      .toMatchFileSnapshot(snap(`full-schedule-${vName(v2)}`));
  });

  it.each(V)('who is coming — next tab, week tab (v2=%s)', async (v2) => {
    const next = { date: '2026-10-19', time: '18:00' };
    const section = (p: Partial<Parameters<typeof WhoIsComingSection>[0]>) => html(
      <WhoIsComingSection v2={v2} whoTab="next" onSelectNext={noop} onSelectWeek={noop} nextSessionData={next} attendance={null} weekLoading={false} weekSessions={[]} {...p} />,
    );
    const out = [
      section({}),
      section({ attendance: att(0) }),
      section({ attendance: att(1) }),
      section({ attendance: att(3, 2) }),
      section({ attendance: att(1234, 1500, false) }),
      section({ nextSessionData: null }),
      section({ whoTab: 'week', weekLoading: true }),
      section({ whoTab: 'week' }),
      section({
        whoTab: 'week',
        weekSessions: [
          { date: '2026-10-19', time: '18:00', slot: SLOT_A, attendance: att(3) },
          { date: '2026-10-21', time: '07:30', slot: SLOT_B, attendance: att(0) },
          { date: '2026-10-24', time: '20:15', slot: SLOT_C, attendance: null },
          { date: '2026-10-20', time: '20:15', slot: SLOT_C, attendance: att(1234, 0, false) },
        ],
      }),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`who-${vName(v2)}`));
  });

  it.each(V)('member list: loading, owner / admin / member rows, action panels (v2=%s)', async (v2) => {
    const list = (p: Partial<Parameters<typeof GroupMemberList>[0]>) => html(
      <GroupMemberList v2={v2} members={MEMBERS} loading={false} createdBy="u1" userId="u1" isCreator isCurrentUserAdmin activeActionUid={null}
        onToggleActions={noop} actionPending={null} onToggleAdmin={noop} onRemove={noop} {...p} />,
    );
    const out = [
      list({ loading: true }),
      list({ members: [] }),
      list({}),
      list({ activeActionUid: 'u3' }),
      list({ activeActionUid: 'u2' }),
      list({ activeActionUid: 'u2', actionPending: 'u2' }),
      list({ activeActionUid: 'u3', actionPending: 'u3', userId: 'u2', isCreator: false }),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`members-${vName(v2)}`));
  });

  it('remove-member modal + overlays', async () => {
    const out = [
      html(<RemoveMemberModal member={MEMBERS[2]} removing={false} onCancel={noop} onConfirm={noop} />),
      html(<RemoveMemberModal member={MEMBERS[2]} removing onCancel={noop} onConfirm={noop} />),
      html(<RemoveMemberModal member={null} removing={false} onCancel={noop} onConfirm={noop} />),
      html(<GroupDrawerOverlays groupId="g1" groupName="רצי הירקון" userId="u1" confirmRemove={MEMBERS[1]} removing={false} onCancelRemove={noop}
        onConfirmRemove={noop} navOpen={false} onCloseNav={noop} destLat={1} destLng={2} destAddress="נמל" reportOpen={false} onCloseReport={noop} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('remove-modal'));
  });

  it('live banner: member, drop-in, city-only (with / without address), members-only', async () => {
    const session = { groupId: 'g1', phase: 'active' } as never;
    const banner = (p: Partial<Parameters<typeof GroupLiveBanner>[0]>) => html(
      <GroupLiveBanner session={session} isJoined={false} canDropIn={false} isCityOnly={false} destAddress={undefined} onClose={noop} onDropIn={noop} {...p} />,
    );
    const out = [
      banner({ isJoined: true }),
      banner({ canDropIn: true }),
      banner({ isCityOnly: true, destAddress: 'רמת גן, מרכז' }),
      banner({ isCityOnly: true }),
      banner({}),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('live-banner'));
  });

  it('location card: map, no map url, no address, text only, military, nothing', async () => {
    const card = (p: Partial<Parameters<typeof GroupLocationCard>[0]>) => html(
      <GroupLocationCard hasCoords destLat={32.09123456} destLng={34.77123456} destAddress="נמל תל אביב" staticMapUrl="https://map.example/x.png" isMilitaryGroup={false} onOpen={noop} {...p} />,
    );
    const out = [
      card({}),
      card({ staticMapUrl: null }),
      card({ destAddress: undefined }),
      card({ hasCoords: false }),
      card({ hasCoords: false, destAddress: undefined, isMilitaryGroup: true }),
      card({ hasCoords: false, destAddress: undefined }),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('location'));
  });

  it.each(V)('join section: locked gate, private (closed / typing / error / submitting), public, registration (v2=%s)', async (v2) => {
    const join = (p: Partial<Parameters<typeof GroupJoinSection>[0]>) => html(
      <GroupJoinSection v2={v2} group={GROUP} codeUnlocked={false} onAccessCodeSuccess={noop} inviteCodeMode={false} onEnterInviteMode={noop}
        inviteInput="" onInviteInputChange={noop} inviteError={false} inviteSubmitting={false} onInviteSubmit={noop} onInviteCancel={noop}
        joining={false} onJoin={noop} {...p} />,
    );
    const pub = { ...GROUP, isPublic: true } as CommunityGroup;
    const out = [
      join({ group: { ...GROUP, isLocked: true } as CommunityGroup }),
      join({}),
      join({ inviteCodeMode: true }),
      join({ inviteCodeMode: true, inviteInput: 'ABC', inviteError: true }),
      join({ inviteCodeMode: true, inviteInput: 'ABC', inviteSubmitting: true }),
      join({ group: pub }),
      join({ group: pub, joining: true }),
      join({ group: { ...pub, registrationLink: 'https://r.example' } as CommunityGroup }),
      html(<RegistrationLinkButton href="https://r.example" />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`join-${vName(v2)}`));
  });

  it('membership + organizer actions, start run, drop-in prompt, rules, invite code, share row', async () => {
    const membership = (p: Partial<Parameters<typeof GroupMembershipActions>[0]>) => html(
      <GroupMembershipActions startCtaShown={false} onOpenChat={noop} canLeave confirmLeave={false} onAskLeave={noop} onCancelLeave={noop} leaving={false} onConfirmLeave={noop} {...p} />,
    );
    const out = [
      membership({}),
      membership({ startCtaShown: true, canLeave: false }),
      membership({ confirmLeave: true }),
      membership({ confirmLeave: true, leaving: true }),
      html(<GroupOrganizerActions group={GROUP} onEdit={noop} canManageSchedule scheduleMgrOpen={false} editingSlotIndex={null}
        onOpenScheduleMgr={noop} onEditSlot={noop} onCloseScheduleMgr={noop} showToast={noop} />),
      html(<StartScheduledRunButton activity="running" onStart={noop} />),
      html(<StartScheduledRunButton activity="walking" onStart={noop} />),
      html(<StartScheduledRunButton activity={null} onStart={noop} />),
      html(<DropInJoinPrompt joining={false} onJoin={noop} onDismiss={noop} />),
      html(<DropInJoinPrompt joining onJoin={noop} onDismiss={noop} />),
      html(<GroupRulesCard v2={false} rules={'מגיעים בזמן.\nשומרים על הניקיון.'} />),
      html(<GroupRulesCard v2 rules="מגיעים בזמן." />),
      html(<InviteCodePanel code="ABC123" groupName="רצי הירקון" inviteCopied={false} setInviteCopied={noop} />),
      html(<InviteCodePanel code="ABC123" groupName="רצי הירקון" inviteCopied setInviteCopied={noop} />),
      html(<GroupShareRow groupId="g1" groupName="רצי הירקון" categoryLabel="ריצה" inviteCode="ABC123" calendarUrl="https://calendar.example" />),
      html(<GroupShareRow groupId="g1" groupName="רצי הירקון" categoryLabel="ריצה" inviteCode={null} calendarUrl={null} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('actions'));
  });

  it('slot editor (add / edit) + schedule manager while checking', async () => {
    const out = [
      html(<SlotEditorSheet group={GROUP} slotIndex={null} onBack={noop} onSaved={noop} showToast={noop} />),
      html(<SlotEditorSheet group={GROUP} slotIndex={0} onBack={noop} onSaved={noop} showToast={noop} />),
      html(<ScheduleManagerPanel group={GROUP} editingSlotIndex={null} onEdit={noop} onClose={noop} onSaved={noop} showToast={noop} />),
      html(<ScheduleManagerPanel group={{ ...GROUP, scheduleSlots: [SLOT_A] } as CommunityGroup} editingSlotIndex={null} onEdit={noop} onClose={noop} onSaved={noop} showToast={noop} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('slot-editor-static'));
  });
});

// ── Behind an effect or a tap: react-dom/client in jsdom ───────────────────────

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
const toast = (type: string, text: string) => record('toast', type, text);

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  log.length = 0;
  svc.updateFails = false;
  for (const k of Object.keys(slotStatus)) delete slotStatus[k];
});

describe('after an effect / a tap', () => {
  it('schedule manager after the status fetch: active, sign-ups, only slot', async () => {
    slotStatus['18:00'] = { locked: true, attendeeCount: 2 };
    slotStatus['07:30'] = { locked: false, attendeeCount: 1234 };
    await mount(<ScheduleManagerPanel group={GROUP} editingSlotIndex={null} onEdit={noop} onClose={noop} onSaved={noop} showToast={toast} />);
    const many = document.body.innerHTML;
    await act(async () => root!.unmount());
    document.body.innerHTML = '';
    await mount(<ScheduleManagerPanel group={{ ...GROUP, scheduleSlots: [SLOT_B] } as CommunityGroup} editingSlotIndex={null} onEdit={noop} onClose={noop} onSaved={noop} showToast={toast} />);
    await expect(`${many}\n${document.body.innerHTML}`).toMatchFileSnapshot(snap('schedule-manager-loaded'));
  });

  it('toasts: remove slot ok / fails, slot editor bad time / saved / updated / fails', async () => {
    await mount(<ScheduleManagerPanel group={GROUP} editingSlotIndex={null} onEdit={noop} onClose={noop} onSaved={noop} showToast={toast} />);
    await click(document.body.querySelectorAll('button[title="הסר מפגש"]')[1]);
    svc.updateFails = true;
    await click(document.body.querySelectorAll('button[title="הסר מפגש"]')[1]);
    svc.updateFails = false;
    await act(async () => root!.unmount());
    document.body.innerHTML = '';

    for (const slotIndex of [null, 0]) {
      await mount(<SlotEditorSheet group={GROUP} slotIndex={slotIndex} onBack={noop} onSaved={noop} showToast={toast} />);
      const save = buttons().at(-1)!;
      await typeInto(document.body.querySelector('input[type="time"]')!, '');
      await click(save);
      await typeInto(document.body.querySelector('input[type="time"]')!, '09:45');
      await click(save);
      svc.updateFails = true;
      await click(save);
      svc.updateFails = false;
      await act(async () => root!.unmount());
      document.body.innerHTML = '';
    }
    await expect(log.filter((l) => l.startsWith('toast')).join('\n')).toMatchFileSnapshot(snap('toasts-schedule.txt'));
  });

  it('toasts: access code for another tenant / this group', async () => {
    let api: ReturnType<typeof useGroupJoinActions> | null = null;
    function Harness() {
      api = useGroupJoinActions({
        group: { ...GROUP, authorityId: 'tlv' } as CommunityGroup, userId: 'u1', userName: 'דנה', userPhoto: null,
        effectiveLiveSession: null, onJoin: noop, onLeave: noop, onClose: noop, showToast: toast,
      });
      return null;
    }
    await mount(<Harness />);
    await act(async () => api!.handleAccessCodeSuccess({ tenantId: 'other' } as never));
    await act(async () => api!.handleAccessCodeSuccess({ tenantId: 'tlv' } as never));
    await expect(log.join('\n')).toMatchFileSnapshot(snap('toasts-join.txt'));
  });

  it('share texts: group share row (invite link / deep link), invite code panel', async () => {
    const shares: unknown[] = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (d: unknown) => { shares.push(d); return Promise.resolve(); } });
    await mount(
      <>
        <GroupShareRow groupId="g1" groupName="רצי הירקון" categoryLabel="ריצה" inviteCode="ABC123" calendarUrl={null} />
        <GroupShareRow groupId="g1" groupName="רצי הירקון" categoryLabel="יוגה" inviteCode={null} calendarUrl={null} />
        <InviteCodePanel code="ABC123" groupName="רצי הירקון" inviteCopied={false} setInviteCopied={noop} />
      </>,
    );
    for (const b of Array.from(document.body.querySelectorAll('button[aria-label="שיתוף הקבוצה"]'))) await click(b);
    await click(buttons().find((b) => b.textContent?.includes('וואטסאפ')));
    await expect(JSON.stringify(shares, null, 2)).toMatchFileSnapshot(snap('share-texts.json'));
  });
});

