import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildGCalLink,
  buildStaticMapUrl,
  canDropInTo,
  computeWeekSessions,
  formatSessionDate,
  getNextSlotDate,
  groupShareLink,
  haversineKm,
  isLiveSessionPhase,
  memberInitials,
  memberPermissions,
  resolveGroupDestination,
  resolveGroupSlots,
  resolveSessionDetails,
  scheduledRunActivityOf,
  spotsLeftFor,
} from '../utils/group-details-logic';
import { deriveGroupPageView } from '../utils/group-page-view';

const g = (o: Record<string, unknown>) => ({ id: 'g', name: 'n', category: 'running', createdBy: 'c', ...o }) as never;

describe('group-details logic', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 9, 0)); // Monday
  });
  afterEach(() => vi.useRealTimers());

  it('formats session dates relative to today', () => {
    expect(formatSessionDate('2026-10-19', '18:00')).toBe('היום ב-18:00');
    expect(formatSessionDate('2026-10-20', '07:30')).toBe('מחר ב-07:30');
    expect(formatSessionDate('2026-10-22', '06:00')).toMatch(/^יום .+ ב-06:00$/);
  });

  it('haversine ~ distance in km', () => {
    expect(haversineKm(32, 34.8, 32, 34.8)).toBe(0);
    expect(haversineKm(32, 34.8, 32.01, 34.8)).toBeCloseTo(1.112, 2);
  });

  it('Google Calendar link: 1-hour window, wraps midnight', () => {
    const url = new URL(buildGCalLink('T', '2026-10-19', '23:30', 'L', 'D'));
    expect(url.searchParams.get('dates')).toBe('20261019T233000/20261019T003000');
    expect(url.searchParams.get('text')).toBe('T');
    expect(url.searchParams.get('location')).toBe('L');
  });

  it('week sessions: next 7 days, skipping passed times today, sorted', () => {
    const out = computeWeekSessions([
      { dayOfWeek: 3, time: '07:30' },
      { dayOfWeek: 1, time: '08:00' }, // today, already passed → none this week
      { dayOfWeek: 1, time: '18:00' },
    ] as never);
    expect(out.map((s) => `${s.date} ${s.time}`)).toEqual(['2026-10-19 18:00', '2026-10-21 07:30']);
    expect(computeWeekSessions([])).toEqual([]);
  });

  it('next slot date rolls to next week once today\'s time has passed', () => {
    expect(getNextSlotDate(1, '18:00')).toBe('2026-10-19');
    expect(getNextSlotDate(1, '08:00')).toBe('2026-10-26');
    expect(getNextSlotDate(3, '08:00')).toBe('2026-10-21');
  });

  it('slots: scheduleSlots, else legacy schedule, else none', () => {
    expect(resolveGroupSlots(g({ scheduleSlots: [{ time: 'a' }], schedule: { time: 'b' } }))).toEqual([{ time: 'a' }]);
    expect(resolveGroupSlots(g({ scheduleSlots: [], schedule: { time: 'b' } }))).toEqual([{ time: 'b' }]);
    expect(resolveGroupSlots(null)).toEqual([]);
  });

  it('destination: slot override, group point, city precision hides the pin', () => {
    const group = g({ meetingLocation: { address: 'A', location: { lat: 1, lng: 2 } } });
    expect(resolveGroupDestination(group, { location: { address: 'S', lat: 3, lng: 4 } } as never)).toMatchObject({ destLat: 3, destLng: 4, destAddress: 'S' });
    const own = resolveGroupDestination(group, null);
    expect([!!own.hasCoords, own.destLat, own.destAddress]).toEqual([true, 1, 'A']);
    const city = resolveGroupDestination(g({ meetingLocation: { address: 'עיר', precision: 'city', location: { lat: 1, lng: 2 } } }), null);
    expect([!!city.hasCoords, city.destAddress]).toEqual([false, 'עיר']);
    expect(!!resolveGroupDestination(g({ meetingLocation: { address: 'Z', location: { lat: 0, lng: 0 } } }), null).hasCoords).toBe(false);
    expect(buildStaticMapUrl('', true, 1, 2)).toBeNull();
    expect(buildStaticMapUrl('tok', false, 1, 2)).toBeNull();
    expect(buildStaticMapUrl('tok', true, 1, 2)).toContain('pin-l+F97316(2,1)');
  });

  it('session details: slot overrides → group defaults', () => {
    const group = g({ images: ['gi'], targetMuscles: ['gm'], equipment: ['ge'], price: 10 });
    expect(resolveSessionDetails(group, null)).toEqual({ coverImage: 'gi', effectiveTags: [], effectiveMuscles: ['gm'], effectiveEquipment: ['ge'], effectivePrice: 10 });
    expect(resolveSessionDetails(group, { images: ['si'], tags: ['t'], targetMuscles: ['sm'], requiredEquipment: ['se'], price: 0 } as never))
      .toEqual({ coverImage: 'si', effectiveTags: ['t'], effectiveMuscles: ['sm'], effectiveEquipment: ['se'], effectivePrice: 0 });
    expect(resolveSessionDetails(g({}), null).coverImage).toBeNull();
  });

  it('spots, live phases, initials', () => {
    expect(spotsLeftFor(undefined, 3)).toBeNull();
    expect(spotsLeftFor(4, 6)).toBe(0);
    expect(spotsLeftFor(4, undefined)).toBe(4);
    expect(['approaching', 'lobby', 'active', 'far', 'ended', undefined].map((p) => isLiveSessionPhase(p as never))).toEqual([true, true, true, false, false, false]);
    expect(memberInitials('  דנה  כהן לוי ')).toBe('דכ');
  });

  it('member permissions follow the owner/admin rules', () => {
    const ctx = { createdBy: 'owner', userId: 'admin', isCreator: false, isCurrentUserAdmin: true };
    const m = (uid: string, role: 'member' | 'admin') => ({ uid, name: uid, role, joinedAt: new Date(0) });
    expect(memberPermissions(m('owner', 'admin'), ctx)).toMatchObject({ isGroupCreator: true, hasActions: false });
    expect(memberPermissions(m('x', 'member'), ctx)).toMatchObject({ canPromote: true, canDemote: false, canRemove: true });
    expect(memberPermissions(m('y', 'admin'), ctx)).toMatchObject({ isGroupAdminMember: true, canDemote: false, canRemove: false, hasActions: false });
    expect(memberPermissions(m('y', 'admin'), { ...ctx, userId: 'owner', isCreator: true })).toMatchObject({ canDemote: true, canRemove: true });
    expect(memberPermissions(m('admin', 'member'), ctx)).toMatchObject({ canRemove: false, canPromote: true });
  });

  it('drop-in, scheduled run, share link', () => {
    expect(canDropInTo(g({ isPublic: true }), null)).toBe(true);
    expect(canDropInTo(g({ isLocked: true }), null)).toBe(false);
    expect(canDropInTo(g({ isPublic: false }), null)).toBe(false);
    expect(canDropInTo(g({ isCityOnly: true, authorityId: 'a' }), 'a')).toBe(true);
    expect(canDropInTo(g({ isCityOnly: true, authorityId: 'a' }), 'b')).toBe(false);
    expect(scheduledRunActivityOf(g({ type: 'ephemeral', category: 'walking' }))).toBe('walking');
    expect(scheduledRunActivityOf(g({ type: 'ephemeral', category: 'yoga' }))).toBeNull();
    expect(scheduledRunActivityOf(g({ category: 'running' }))).toBeNull();
    expect(groupShareLink('https://o', 'g1', 'ABC')).toBe('https://o/join/ABC');
    expect(groupShareLink('https://o', 'g1', null)).toBe('https://o/community?groupId=g1');
  });

  it('page view: category fallback, price/spots/full, calendar + map only when known', () => {
    const v = deriveGroupPageView(
      g({ category: 'unknown', price: 15, groupType: 'military', meetingLocation: { address: 'A, עיר', location: { lat: 1, lng: 2 } } }),
      { maxParticipants: 3 } as never,
      { date: '2026-10-19', time: '18:00' },
      3,
      'tok',
    );
    expect([v.catConfig.label, v.hasPrice, v.spotsLeft, v.isFull, v.isMilitaryGroup]).toEqual(['אחר', true, 0, true, true]);
    expect(v.staticMapUrl).toContain('access_token=tok');
    expect(new URL(v.calendarUrl!).searchParams.get('details')).toBe('קבוצת אחר — n');
    const bare = deriveGroupPageView(g({}), null, null, undefined, '');
    expect([bare.calendarUrl, bare.staticMapUrl, bare.hasPrice, bare.spotsLeft, bare.scheduledRunActivity]).toEqual([null, null, false, null, null]);
  });
});
