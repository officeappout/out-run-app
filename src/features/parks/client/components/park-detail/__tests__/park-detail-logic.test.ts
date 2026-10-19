import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/arena/services/group.service', () => ({ getMyPersonaKeys: () => [], personaCollectionName: () => '' }));

import {
  categorizeParkEquipment,
  mergeLocalArrivals,
  filterVisibleParkEvents,
  selectRegistrableEventIds,
  totalParkAttendees,
  averageReviewRating,
  buildParkPhotoGallery,
  resolveArrivalWindow,
  recurringEventDate,
  recurringEventTime,
} from '../utils/park-detail-logic';
import { minutesToLabel, toLocalDateInputValue, sessionRowTimeLabel, formatDate } from '../utils/park-detail-format';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';

const ev = (o: Partial<SessionEnrichment>): SessionEnrichment => ({
  eventId: 'e', eventLabel: 'l', nextStartTime: '2026-10-19T10:00:00.000Z', currentRegistrations: 0, plannedCount: 0, avatars: [], ...o,
});

describe('park-detail logic', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('categorizes equipment: cardio wins, then functional, else hydraulic; empty sections dropped', () => {
    const out = categorizeParkEquipment([
      { id: 'a', isCardio: true, isFunctional: true },
      { id: 'b', isFunctional: true },
      { id: 'c' },
    ] as never);
    expect(out.map((s) => [s.key, s.items.map((i) => i.id)])).toEqual([
      ['aerobic', ['a']], ['functional', ['b']], ['hydraulic', ['c']],
    ]);
    expect(categorizeParkEquipment([{ id: 'x', isCardio: true }] as never).map((s) => s.key)).toEqual(['aerobic']);
  });

  it('merges optimistic arrivals until the snapshot catches up', () => {
    const live = [ev({ eventId: 'l1', nextStartTime: 'b', isPersonalArrival: true, avatars: [{ uid: 'u1', name: 'n' }] })];
    expect(mergeLocalArrivals(live, [])).toBe(live);
    const dup = ev({ eventId: 'x', nextStartTime: 'b', avatars: [{ uid: 'u1', name: 'n' }] });
    expect(mergeLocalArrivals(live, [dup])).toBe(live);
    const fresh = ev({ eventId: 'y', nextStartTime: 'a', avatars: [{ uid: 'u1', name: 'n' }] });
    expect(mergeLocalArrivals(live, [fresh]).map((e) => e.eventId)).toEqual(['y', 'l1']);
  });

  it('filters by day; hides others\' squad arrivals but keeps own', () => {
    const today = new Date(2026, 9, 19, 18).toISOString();
    const tomorrow = new Date(2026, 9, 20, 18).toISOString();
    const events = [
      ev({ eventId: 't', nextStartTime: today }),
      ev({ eventId: 'm', nextStartTime: tomorrow }),
      ev({ eventId: 'own', nextStartTime: today, isPersonalArrival: true, privacyMode: 'squad', avatars: [{ uid: 'me', name: 'n' }] }),
      ev({ eventId: 'pub', nextStartTime: today, isPersonalArrival: true, privacyMode: 'verified_global', avatars: [{ uid: 'x', name: 'n' }] }),
      ev({ eventId: 'sq', nextStartTime: today, isPersonalArrival: true, privacyMode: 'squad', avatars: [{ uid: 'x', name: 'n' }] }),
    ];
    expect(filterVisibleParkEvents(events, 'today', 'me').map((e) => e.eventId)).toEqual(['t', 'own', 'pub']);
    expect(filterVisibleParkEvents(events, 'tomorrow', 'me').map((e) => e.eventId)).toEqual(['m']);
    expect(filterVisibleParkEvents(events, 'week', undefined).map((e) => e.eventId)).toEqual(['t', 'm', 'pub']);
  });

  it('only real events are registrable; attendee badge counts each session ≥ 1', () => {
    const events = [ev({ eventId: 'a' }), ev({ eventId: 'r', isRecurring: true, currentRegistrations: 4 }), ev({ eventId: 'p', isPersonalArrival: true })];
    expect(selectRegistrableEventIds(events)).toEqual(['a']);
    expect(totalParkAttendees(events)).toBe(6);
  });

  it('average rating falls back to the park rating; gallery prefers imageUrl, caps at 8', () => {
    expect(averageReviewRating([{ rating: 4 }, { rating: 2 }, {}] as never, 1)).toBe(3);
    expect(averageReviewRating([{}] as never, 4.5)).toBe(4.5);
    expect(averageReviewRating([], undefined)).toBeNull();
    const reviews = Array.from({ length: 10 }, (_, i) => ({ photoUrl: `r${i}` }));
    expect(buildParkPhotoGallery({ imageUrl: 'u', images: ['i'] } as never, reviews as never)).toEqual(['u', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    expect(buildParkPhotoGallery({ images: ['i1', 'i2'] } as never, [])).toEqual(['i1', 'i2']);
    expect(buildParkPhotoGallery({ image: 'x' } as never, [])).toEqual(['x']);
  });

  it('arrival window: today / tomorrow / picked date, widened when degenerate, invalid date rejected', () => {
    const now = new Date(2026, 9, 19, 9, 0);
    const t = resolveArrivalWindow('today', '', [17 * 60, 19 * 60], now);
    expect(t.ok && [t.startTime.getHours(), t.endTime.getHours(), t.startTime.getDate()]).toEqual([17, 19, 19]);
    const m = resolveArrivalWindow('tomorrow', '', [60, 60], now);
    expect(m.ok && [m.startTime.getDate(), m.endTime.getTime() - m.startTime.getTime()]).toEqual([20, 15 * 60 * 1000]);
    const w = resolveArrivalWindow('week', '2026-10-23', [600, 660], now);
    expect(w.ok && [w.startTime.getDate(), w.startTime.getHours()]).toEqual([23, 10]);
    expect(resolveArrivalWindow('week', 'nope', [0, 15], now)).toEqual({ ok: false, reason: 'invalid-date' });
  });

  it('recurring event id/time parsing', () => {
    expect(recurringEventDate('g1_slot_2026-10-19')).toBe('2026-10-19');
    expect(recurringEventDate('g1')).toBeUndefined();
    expect(recurringEventTime('2026-10-19T17:30:00.000Z')).toBe('17:30');
    expect(recurringEventTime('2026-10-19')).toBe('18:00');
  });

  it('formatting helpers', () => {
    expect(minutesToLabel(17 * 60 + 15)).toBe('17:15');
    expect(minutesToLabel(1440)).toBe('00:00');
    expect(toLocalDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
    const now = new Date(2026, 9, 19, 9, 0);
    expect(sessionRowTimeLabel(new Date(2026, 9, 19, 7, 5).toISOString(), now)).toBe('07:05');
    expect(sessionRowTimeLabel(new Date(2026, 9, 20, 18, 0).toISOString(), now)).toBe('מחר 18:00');
    expect(sessionRowTimeLabel(new Date(2026, 9, 22, 6, 0).toISOString(), now)).toMatch(/06:00$/);
    expect(sessionRowTimeLabel('garbage', now)).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate({ toDate: () => new Date(2026, 9, 1) })).toBe(formatDate(new Date(2026, 9, 1)));
  });
});
