import { describe, expect, it } from 'vitest';
import { canSeePost, feedPostJson, isMutual } from '../feed-visibility';

const conn = { following: ['me', 'x'], followers: ['me'] };

describe('canSeePost', () => {
  it('the author always sees their own posts', () => {
    expect(canSeePost({ authorUid: 'a', audience: 'private' }, 'a', null)).toBe(true);
  });
  it('public → anyone', () => {
    expect(canSeePost({ authorUid: 'a', audience: 'public' }, 'stranger', null)).toBe(true);
  });
  it('private → only the author', () => {
    expect(canSeePost({ authorUid: 'a', audience: 'private' }, 'me', conn)).toBe(false);
  });
  it('partners → only a mutual follow', () => {
    expect(canSeePost({ authorUid: 'a', audience: 'partners' }, 'me', conn)).toBe(true);
    expect(canSeePost({ authorUid: 'a', audience: 'partners' }, 'x', conn)).toBe(false); // one-way
    expect(canSeePost({ authorUid: 'a', audience: 'partners' }, 'stranger', conn)).toBe(false);
  });
  it('legacy post with no audience reads as partners', () => {
    expect(canSeePost({ authorUid: 'a' }, 'stranger', conn)).toBe(false);
    expect(canSeePost({ authorUid: 'a' }, 'me', conn)).toBe(true);
  });
  it('isMutual tolerates a missing doc', () => {
    expect(isMutual(undefined, 'me')).toBe(false);
  });
});

describe('feedPostJson', () => {
  it('Timestamp-like createdAt → ISO, legacy whoPoints → activityCredit', () => {
    const j = feedPostJson('p', { authorUid: 'a', createdAt: { toDate: () => new Date('2026-10-17T08:00:00Z') }, whoPoints: 12 });
    expect(j.createdAt).toBe('2026-10-17T08:00:00.000Z');
    expect(j.activityCredit).toBe(12);
  });
});
