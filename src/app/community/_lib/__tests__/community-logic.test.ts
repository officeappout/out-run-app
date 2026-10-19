import { describe, it, expect } from 'vitest';
import type { FeedPost } from '@/features/social/services/feed.service';
import type { CommunityEvent, CommunityGroup } from '@/types/community.types';
import {
  eventJoinSuccess,
  filterFeedPosts,
  groupJoinSuccess,
  leaderboardFilterLabel,
  leagueCalendarChips,
  resolveCommunityTopTab,
  sortFeedPostsPartnersFirst,
  timeWindowLabel,
  timeWindowPhrase,
} from '../community-logic';

describe('resolveCommunityTopTab', () => {
  const base = { tabParam: null, isFeedTabAvailable: true, enableLeagues: true, leaguesFirst: false };
  it('honours ?tab= only for an enabled surface', () => {
    expect(resolveCommunityTopTab({ ...base, tabParam: 'leagues' })).toBe('leagues');
    expect(resolveCommunityTopTab({ ...base, tabParam: 'leagues', enableLeagues: false })).toBe('feed');
    expect(resolveCommunityTopTab({ ...base, tabParam: 'feed', leaguesFirst: true })).toBe('feed');
    expect(resolveCommunityTopTab({ ...base, tabParam: 'feed', isFeedTabAvailable: false })).toBe('leagues');
  });
  it('defaults: leagues first in v2, else feed, else leagues, else inert feed', () => {
    expect(resolveCommunityTopTab({ ...base, leaguesFirst: true })).toBe('leagues');
    expect(resolveCommunityTopTab(base)).toBe('feed');
    expect(resolveCommunityTopTab({ ...base, isFeedTabAvailable: false })).toBe('leagues');
    expect(resolveCommunityTopTab({ ...base, isFeedTabAvailable: false, enableLeagues: false })).toBe('feed');
    expect(resolveCommunityTopTab({ ...base, tabParam: 'bogus' })).toBe('feed');
  });
});

describe('join success data', () => {
  it('group: verb by category, slots preferred over the legacy schedule', () => {
    const slot = { dayOfWeek: 2, time: '19:00', frequency: 'weekly' as const };
    const legacy = { dayOfWeek: 4, time: '07:00', frequency: 'weekly' as const };
    const g = { id: 'g1', name: 'רצים', category: 'running', scheduleSlots: [slot], schedule: legacy, meetingLocation: { address: 'פארק' } } as unknown as CommunityGroup;
    expect(groupJoinSuccess(g)).toEqual({
      name: 'רצים', verb: 'ירוץ', groupId: 'g1', scheduleSlots: [slot], category: 'running', address: 'פארק',
    });
    const old = { id: 'g2', name: 'ישן', category: 'mystery', schedule: legacy } as unknown as CommunityGroup;
    expect(groupJoinSuccess(old)).toMatchObject({ verb: 'יתאמן', scheduleSlots: [legacy], address: undefined });
    const none = { id: 'g3', name: 'ריק', category: 'cycling' } as unknown as CommunityGroup;
    expect(groupJoinSuccess(none)).toMatchObject({ verb: 'ירכב', scheduleSlots: [] });
  });
  it('event: name + verb only', () => {
    expect(eventJoinSuccess({ id: 'e1', name: 'מרוץ', category: 'race' } as unknown as CommunityEvent)).toEqual({ name: 'מרוץ', verb: 'ירוץ' });
    expect(eventJoinSuccess({ id: 'e2', name: 'x', category: '??' } as unknown as CommunityEvent)).toEqual({ name: 'x', verb: 'יתאמן' });
  });
});

const post = (id: string, authorUid: string, iso: string, extra: Partial<FeedPost> = {}) =>
  ({ id, authorUid, createdAt: new Date(iso), ...extra }) as unknown as FeedPost;

describe('feed posts', () => {
  const isPartner = (uid: string) => uid === 'p';
  it('sorts partners first, then newest — in place', () => {
    const arr = [post('a', 'x', '2026-01-02'), post('b', 'p', '2026-01-01'), post('c', 'y', '2026-01-03')];
    const out = sortFeedPostsPartnersFirst(arr, isPartner);
    expect(out).toBe(arr);
    expect(arr.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
  it('filters only in v2', () => {
    const posts = [
      post('a', 'p', '2026-01-01', { neighborhoodId: 'n1' }),
      post('b', 'x', '2026-01-01', { neighborhoodId: 'n2', groupIds: ['g1'] }),
      post('c', 'y', '2026-01-01'),
    ];
    const opts = { v2: true, isPartner, myHood: 'n1', myGroups: new Set(['g1']) };
    expect(filterFeedPosts(posts, { ...opts, v2: false, filter: 'partners' })).toBe(posts);
    expect(filterFeedPosts(posts, { ...opts, filter: 'all' })).toBe(posts);
    expect(filterFeedPosts(posts, { ...opts, filter: 'partners' }).map((p) => p.id)).toEqual(['a']);
    expect(filterFeedPosts(posts, { ...opts, filter: 'neighborhood' }).map((p) => p.id)).toEqual(['a']);
    expect(filterFeedPosts(posts, { ...opts, filter: 'neighborhood', myHood: null })).toEqual([]);
    expect(filterFeedPosts(posts, { ...opts, filter: 'groups' }).map((p) => p.id)).toEqual(['b']);
  });
});

describe('leaderboard labels', () => {
  it('window label / phrase', () => {
    expect([timeWindowLabel('daily'), timeWindowLabel('weekly'), timeWindowLabel('monthly')]).toEqual(['יומי', 'שבועי', 'חודשי']);
    expect([timeWindowPhrase('daily'), timeWindowPhrase('weekly'), timeWindowPhrase('monthly')]).toEqual(['היום', 'השבוע', 'החודש']);
  });
  it('filter label', () => {
    expect(leaderboardFilterLabel('overall', 'weekly')).toBe('כללי • שבועי');
    expect(leaderboardFilterLabel('cardio', 'daily')).toBe('ריצה • יומי');
    expect(leaderboardFilterLabel('strength', 'monthly')).toBe('כוח • חודשי');
  });
  it('calendar chips: Saturday closes tonight, Friday in a day, Monday in 5 days', () => {
    expect(leagueCalendarChips(new Date(2026, 9, 24))).toEqual({ month: 'אוקטובר', weekCloses: 'השבוע נסגר הלילה' });
    expect(leagueCalendarChips(new Date(2026, 9, 23)).weekCloses).toBe('השבוע נסגר בעוד יום');
    expect(leagueCalendarChips(new Date(2026, 0, 19))).toEqual({ month: 'ינואר', weekCloses: 'השבוע נסגר בעוד 5 ימים' });
  });
});
