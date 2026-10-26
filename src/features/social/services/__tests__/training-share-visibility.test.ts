import { describe, expect, it } from 'vitest';
import {
  canSeeTrainingShare,
  mutualPartnerUids,
  shareAudience,
  trainingShareJson,
} from '../training-share-visibility';

// Author "a": mutual with "me", one-way with "fan" (fan follows a, a doesn't follow fan).
const aConn = { following: ['me'], followers: ['me', 'fan'] };

describe('shareAudience', () => {
  it('an explicit audience wins', () => {
    expect(shareAudience({ audience: 'partners', privacyMode: 'ghost' })).toBe('partners');
    expect(shareAudience({ audience: 'public' })).toBe('public');
  });
  it('older docs fall back to privacyMode, never widened', () => {
    expect(shareAudience({ privacyMode: 'verified_global' })).toBe('public');
    expect(shareAudience({ privacyMode: 'squad' })).toBe('private');
    expect(shareAudience({ privacyMode: 'ghost' })).toBe('private');
    expect(shareAudience({})).toBe('private');
  });
});

describe('canSeeTrainingShare — שותפי אימון = mutual follow', () => {
  const partnersShare = { userId: 'a', audience: 'partners', privacyMode: 'ghost', status: 'planned' };
  it('a mutual follow sees a partners share', () => {
    expect(canSeeTrainingShare(partnersShare, 'me', aConn)).toBe(true);
  });
  it('a one-way follower and a stranger do not', () => {
    expect(canSeeTrainingShare(partnersShare, 'fan', aConn)).toBe(false);
    expect(canSeeTrainingShare(partnersShare, 'stranger', aConn)).toBe(false);
    expect(canSeeTrainingShare(partnersShare, 'me', null)).toBe(false);
  });
  it('the author always; a cancelled share nobody', () => {
    expect(canSeeTrainingShare(partnersShare, 'a', null)).toBe(true);
    expect(canSeeTrainingShare({ ...partnersShare, status: 'cancelled' }, 'me', aConn)).toBe(false);
  });
  it('public reaches anyone; squad without audience reaches no one else', () => {
    expect(canSeeTrainingShare({ userId: 'a', privacyMode: 'verified_global' }, 'stranger', null)).toBe(true);
    expect(canSeeTrainingShare({ userId: 'a', privacyMode: 'squad' }, 'me', aConn)).toBe(false);
  });
});

describe('mutualPartnerUids', () => {
  it('following ∩ followers, self excluded, deduped', () => {
    expect(mutualPartnerUids({ following: ['x', 'y', 'me', 'x'], followers: ['x', 'me', 'z'] }, 'me')).toEqual(['x']);
    expect(mutualPartnerUids(undefined, 'me')).toEqual([]);
  });
});

describe('trainingShareJson', () => {
  it('maps a park share; unknown gender → other', () => {
    const j = trainingShareJson('s1', {
      userId: 'a', displayName: 'Noa', parkId: 'p1', parkName: 'Yarkon', lat: 1, lng: 2,
      activityType: 'workout', workoutTitle: 'Upper', startTime: '2026-10-26T15:00:00.000Z', audience: 'partners',
    }, undefined);
    expect(j).toMatchObject({ id: 's1', parkId: 'p1', parkName: 'Yarkon', gender: 'other', workoutTitle: 'Upper', audience: 'partners' });
  });
  it('null without a place or a start', () => {
    expect(trainingShareJson('s', { userId: 'a', startTime: '2026-10-26T15:00:00Z' }, 'male')).toBeNull();
    expect(trainingShareJson('s', { userId: 'a', parkId: 'p' }, 'male')).toBeNull();
  });
});
