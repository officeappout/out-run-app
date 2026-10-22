import { describe, it, expect } from 'vitest';
import { buildGroupSummary, canReadGroupSummary } from '../group-summary';

describe('buildGroupSummary (P1-2)', () => {
  const attendance = {
    attendees: ['me', 'dana', 'avi'],
    attendeeProfiles: { me: { name: 'אני' }, dana: { name: 'דנה', photoURL: 'p.jpg' }, avi: { name: 'אבי' } },
  };

  it('sums every participant\'s distance — the aggregate the client could never read', () => {
    const ctx = buildGroupSummary({
      groupName: 'רצים', attendance, currentUid: 'me',
      workouts: [
        { userId: 'me', distance: 5, pace: 6 },
        { userId: 'dana', distance: 4.5, pace: 5.5 },
        { userId: 'avi', distance: 3, pace: 0 },
        { userId: 'stranger', distance: 99 },
      ],
    });
    expect(ctx.collectiveDistanceKm).toBe(12.5);
    expect(ctx.participantCount).toBe(3);
    expect(ctx.participants[0].uid).toBe('me');
    expect(ctx.participants.find((p) => p.uid === 'dana')).toEqual({ uid: 'dana', name: 'דנה', photoURL: 'p.jpg', distanceKm: 4.5, pace: 5.5 });
    expect(ctx.participants.find((p) => p.uid === 'avi')?.pace).toBe(0);
  });

  it('siblings not saved yet → activeCount × own distance', () => {
    const ctx = buildGroupSummary({
      groupName: '', currentUid: 'me',
      attendance: { ...attendance, collectiveProgress: { activeCount: 2 } },
      workouts: [],
    });
    expect(ctx.collectiveDistanceKm).toBe(0);
  });
});

describe('canReadGroupSummary', () => {
  it('attendee or member only', () => {
    expect(canReadGroupSummary({ uid: 'a', attendees: ['a'], isMember: false })).toBe(true);
    expect(canReadGroupSummary({ uid: 'a', attendees: ['b'], isMember: true })).toBe(true);
    expect(canReadGroupSummary({ uid: 'a', attendees: ['b'], isMember: false })).toBe(false);
  });
});
