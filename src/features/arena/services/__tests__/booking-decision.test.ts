import { describe, it, expect } from 'vitest';
import { decideBooking } from '../booking-decision';

describe('decideBooking (P2-12)', () => {
  it('no doc → create', () => expect(decideBooking(undefined, 'u')).toBe('create'));
  it('already in → no-op answers', () => {
    expect(decideBooking({ attendees: ['u'] }, 'u')).toBe('already-booked');
    expect(decideBooking({ attendees: [], waitlist: ['u'] }, 'u')).toBe('already-waitlisted');
  });
  it('capacity: full → waitlist, room → book', () => {
    expect(decideBooking({ attendees: ['a', 'b'], currentCount: 2, maxParticipants: 2 }, 'u')).toBe('waitlist');
    expect(decideBooking({ attendees: ['a'], currentCount: 1, maxParticipants: 2 }, 'u')).toBe('book');
    expect(decideBooking({ attendees: ['a'], currentCount: 1, maxParticipants: null }, 'u')).toBe('book');
  });
  it('a drifted (too low) currentCount cannot overbook — attendees length wins', () => {
    expect(decideBooking({ attendees: ['a', 'b'], currentCount: 1, maxParticipants: 2 }, 'u')).toBe('waitlist');
  });
});
