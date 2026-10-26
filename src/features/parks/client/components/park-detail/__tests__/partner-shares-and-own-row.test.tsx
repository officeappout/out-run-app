/**
 * enable_where_to_train_v1 — the park page's "מתאמנים כאן": mutual partners' shares (server-vetted)
 * show whatever their privacyMode; my own row shows the workout and "ביטול" (phone 7) only when
 * ownArrivalActions is passed — without it the row is exactly today's ("פרסמת").
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));

import ParkSessionRow from '../sections/ParkSessionRow';
import { arrivalSessionId, filterVisibleParkEvents } from '../utils/park-detail-logic';
import { partnerShareToArrival } from '../utils/partner-park-shares';
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const today = new Date();
today.setHours(18, 0, 0, 0);
const own: SessionEnrichment = {
  eventId: 'arrival_s1', eventLabel: 'דנה', nextStartTime: today.toISOString(), currentRegistrations: 1, plannedCount: 1,
  avatars: [{ uid: 'me', name: 'דנה' }], isPersonalArrival: true, privacyMode: 'ghost', workoutTitle: 'אימון עליון',
};
const noop = () => {};
const row = (extra: Partial<React.ComponentProps<typeof ParkSessionRow>> = {}) =>
  html(<ParkSessionRow ev={own} v2 isJoining={false} alreadyJoined={false} isOwnArrival onJoin={noop} onOpenProfile={noop} {...extra} />);

describe('own row (phone 7)', () => {
  it('flag off (no ownArrivalActions): today\'s row — name + "פרסמת", no workout, no ביטול', () => {
    const out = row();
    expect(out).toContain('פרסמת');
    expect(out).not.toContain('ביטול');
    expect(out).not.toContain('אימון עליון');
  });
  it('flag on: "<name> · <workout>" + ביטול', () => {
    const out = row({ ownArrivalActions: { onCancel: noop, cancellingId: null } });
    expect(out).toContain('דנה · אימון עליון');
    expect(out).toContain('>ביטול</button>');
    expect(out).not.toContain('פרסמת');
  });
});

describe('partner shares on the park list', () => {
  const share = {
    id: 's9', userId: 'noa', displayName: 'נועה', photoURL: null, gender: 'female' as const, parkId: 'p', parkName: 'P',
    lat: null, lng: null, activityType: 'workout', workoutTitle: 'גוף מלא', startTime: today.toISOString(), endTime: null, audience: 'partners' as const,
  };
  it('maps to a personal-arrival row that the visibility filter keeps (server already vetted it)', () => {
    const ev = partnerShareToArrival(share);
    expect(ev).toMatchObject({ eventId: 'arrival_s9', eventLabel: 'נועה', isPersonalArrival: true, partnerShare: true, workoutTitle: 'גוף מלא' });
    expect(filterVisibleParkEvents([ev], 'today', 'me')).toHaveLength(1);
    // a ghost arrival that is NOT a vetted partner share stays hidden from others, as before
    expect(filterVisibleParkEvents([{ ...ev, partnerShare: undefined, privacyMode: 'ghost' }], 'today', 'me')).toHaveLength(0);
  });
  it('arrivalSessionId → the planned_sessions id', () => {
    expect(arrivalSessionId(own)).toBe('s1');
    expect(arrivalSessionId({ eventId: 'ev1', isPersonalArrival: false })).toBeNull();
  });
});
