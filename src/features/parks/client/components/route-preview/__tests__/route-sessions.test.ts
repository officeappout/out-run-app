import { describe, expect, it } from 'vitest';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { mergeRouteSessions } from '../route-sessions';
import { filterVisibleParkEvents } from '../../park-detail/utils/park-detail-logic';

const T1 = '2030-01-01T17:00:00.000Z';
const T2 = '2030-01-01T18:00:00.000Z';

function arrival(id: string, uid: string, start: string, extra: Partial<SessionEnrichment> = {}): SessionEnrichment {
  return {
    eventId: id,
    eventLabel: uid,
    nextStartTime: start,
    currentRegistrations: 1,
    plannedCount: 1,
    avatars: [{ uid, name: uid }],
    isPersonalArrival: true,
    ...extra,
  };
}

const event = (id: string, start: string): SessionEnrichment => ({
  eventId: id, eventLabel: id, nextStartTime: start, currentRegistrations: 3, plannedCount: 3, avatars: [],
});

describe('mergeRouteSessions', () => {
  it('adds a partner share the live listener does not have, sorted by start', () => {
    const live = [event('ev1', T2)];
    const partner = [arrival('arrival_p1', 'p', T1, { partnerShare: true, workoutTitle: 'Run' })];
    expect(mergeRouteSessions(live, [], [], partner).map((s) => s.eventId)).toEqual(['arrival_p1', 'ev1']);
  });

  it('drops a partner share already returned by the live listener (same eventId)', () => {
    const live = [arrival('arrival_p1', 'p', T1, { privacyMode: 'verified_global' })];
    const merged = mergeRouteSessions(live, [], [], [arrival('arrival_p1', 'p', T1, { partnerShare: true })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].partnerShare).toBeUndefined();
  });

  it('drops an optimistic local row once the live arrival (same user + start) is in', () => {
    const live = [arrival('arrival_me', 'me', T1)];
    const local = [arrival('local-me-1', 'me', T1)];
    expect(mergeRouteSessions(live, [], local, []).map((s) => s.eventId)).toEqual(['arrival_me']);
  });

  it('keeps the linked-session prop once and keeps different users at the same time', () => {
    const merged = mergeRouteSessions([event('ev1', T1)], [event('ev1', T1)], [], [
      arrival('arrival_a', 'a', T1, { partnerShare: true }),
      arrival('arrival_b', 'b', T1, { partnerShare: true }),
    ]);
    expect(merged.map((s) => s.eventId)).toEqual(['ev1', 'arrival_a', 'arrival_b']);
  });
});

describe('route page visibility (filterVisibleParkEvents)', () => {
  it('shows a partner share (ghost privacy, server-vetted) but not a stranger ghost arrival', () => {
    const rows = [
      arrival('arrival_p1', 'p', T1, { partnerShare: true, privacyMode: 'ghost' }),
      arrival('arrival_x', 'x', T1, { privacyMode: 'ghost' }),
    ];
    expect(filterVisibleParkEvents(rows, 'week', 'me').map((s) => s.eventId)).toEqual(['arrival_p1']);
  });
});
