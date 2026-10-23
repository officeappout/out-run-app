import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
import PresenceRail from '@/features/workout-engine/players/shared/v2/PresenceRail';
import type { OrderedParticipant } from '../core/presence-order';

const P = (o: Partial<OrderedParticipant>): OrderedParticipant => ({
  uid: 'u', name: 'דני', kind: 'run', state: 'active', clientMs: 0, seq: 1, serverMs: 1, distanceKm: 2.4, paceSecPerKm: 330,
  isMe: false, freshness: 'live', lastSeenSec: 1, rank: 1, ...o,
});

describe('PresenceRail', () => {
  const html = (ps: OrderedParticipant[]) => renderToStaticMarkup(<PresenceRail participants={ps} topInset={100} bottomInset={300} onSelect={() => {}} />).replaceAll('<!-- -->', '');
  it('renders nothing for an empty session', () => {
    expect(html([])).toBe('');
  });
  it('shows faces with their tiny status, fade mask and collapse control', () => {
    const h = html([P({ uid: 'me', name: 'אני', isMe: true }), P({ uid: 'a', kind: 'amrap', roundsDone: 2 })]);
    expect(h).toContain('2.4 ק״מ · 5:30');
    expect(h).toContain('סבב 3');
    expect(h).toContain('mask-image');
    expect(h).toContain('הסתרת הרשימה');
    expect(h).toContain('disabled');
  });
});

import RaceBar from '../components/RaceBar';
import { computeRace } from '../core/race';
describe('RaceBar', () => {
  const h = (a: object, b: object) => renderToStaticMarkup(<RaceBar race={computeRace(a, b)} name="דני" />).replaceAll('<!-- -->', '');
  it('shows ahead / behind with the pace gap', () => {
    expect(h({ distanceKm: 3, paceSecPerKm: 320 }, { distanceKm: 2.5, paceSecPerKm: 335 })).toContain('אני מול דני');
    expect(h({ distanceKm: 3, paceSecPerKm: 320 }, { distanceKm: 2.5, paceSecPerKm: 335 })).toContain('מקדים ב-0.50 ק״מ · מהיר ב-15 שנ׳/ק״מ');
    expect(h({ distanceKm: 1 }, { distanceKm: 1.2 })).toContain('מאחור ב-0.20 ק״מ');
    expect(h({ distanceKm: 1 }, { distanceKm: 1 })).toContain('ראש בראש');
  });
});
