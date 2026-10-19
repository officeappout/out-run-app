/**
 * /community — pure logic (no React, no Firestore). Unit-tested in
 * __tests__/community-logic.test.ts.
 */
import type { FeedPost } from '@/features/social/services/feed.service';
import type { LeaderboardCategory, LeaderboardTimeWindow } from '@/features/arena/services/ranking.service';
import type { CommunityEvent, CommunityGroup, ScheduleSlot } from '@/types/community.types';
import {
  EVENT_VERB,
  GROUP_VERB,
  HEBREW_MONTHS,
  type CommunityTopTab,
  type FeedFilter,
} from './community-constants';

/** What the post-join success drawer shows. */
export interface JoinSuccessData {
  name: string;
  verb: string;
  groupId?: string;
  scheduleSlots?: ScheduleSlot[];
  category?: string;
  address?: string;
}

// ── Top-level tab ───────────────────────────────────────────────────────────

/**
 * The tab to show for a ?tab= value. A stale deep link or the default can
 * never land on a tab that isn't enabled — falls through to whichever
 * surface is live, or 'feed' as an inert default when neither is.
 */
export function resolveCommunityTopTab(input: {
  tabParam: string | null;
  isFeedTabAvailable: boolean;
  enableLeagues: boolean;
  leaguesFirst: boolean;
}): CommunityTopTab {
  const { tabParam, isFeedTabAvailable, enableLeagues, leaguesFirst } = input;
  return tabParam === 'leagues' && enableLeagues ? 'leagues'
    : tabParam === 'feed' && isFeedTabAvailable ? 'feed'
    : leaguesFirst ? 'leagues'
    : isFeedTabAvailable ? 'feed'
    : enableLeagues ? 'leagues'
    : 'feed';
}

// ── Join success ────────────────────────────────────────────────────────────

/** Success-drawer data after joining a group (legacy single `schedule` folded in). */
export function groupJoinSuccess(group: CommunityGroup): JoinSuccessData {
  const allSlots = group.scheduleSlots?.length
    ? group.scheduleSlots
    : group.schedule
      ? [group.schedule]
      : [];
  return {
    name: group.name,
    verb: GROUP_VERB[group.category] ?? 'יתאמן',
    groupId: group.id,
    scheduleSlots: allSlots,
    category: group.category,
    address: group.meetingLocation?.address,
  };
}

/** Success-drawer data after joining an event. */
export function eventJoinSuccess(event: CommunityEvent): JoinSuccessData {
  return { name: event.name, verb: EVENT_VERB[event.category] ?? 'יתאמן' };
}

// ── Feed ────────────────────────────────────────────────────────────────────

/** Partners first, then newest first. Sorts IN PLACE (and returns the array). */
export function sortFeedPostsPartnersFirst(posts: FeedPost[], isPartner: (uid: string) => boolean): FeedPost[] {
  return posts.sort((a, b) => {
    const aPartner = isPartner(a.authorUid) ? 0 : 1;
    const bPartner = isPartner(b.authorUid) ? 0 : 1;
    return aPartner - bPartner || b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** Home v2 feed filter (all / partners / my neighborhood / my groups); off-v2 shows all. */
export function filterFeedPosts(
  posts: FeedPost[],
  opts: {
    v2: boolean;
    filter: FeedFilter;
    isPartner: (uid: string) => boolean;
    myHood: string | null;
    myGroups: Set<string>;
  },
): FeedPost[] {
  const { v2, filter, isPartner, myHood, myGroups } = opts;
  return !v2 || filter === 'all'
    ? posts
    : posts.filter((p) =>
        filter === 'partners'
          ? isPartner(p.authorUid)
          : filter === 'neighborhood'
            ? !!myHood && p.neighborhoodId === myHood
            : (p.groupIds ?? []).some((g) => myGroups.has(g)),
      );
}

// ── Leaderboard labels ──────────────────────────────────────────────────────

/** "יומי" / "שבועי" / "חודשי". */
export function timeWindowLabel(window: LeaderboardTimeWindow): string {
  return window === 'daily' ? 'יומי' : window === 'weekly' ? 'שבועי' : 'חודשי';
}

/** "היום" / "השבוע" / "החודש". */
export function timeWindowPhrase(window: LeaderboardTimeWindow): string {
  return window === 'daily' ? 'היום' : window === 'weekly' ? 'השבוע' : 'החודש';
}

/** The small "<category> • <window>" label on the active league card. */
export function leaderboardFilterLabel(category: LeaderboardCategory, window: LeaderboardTimeWindow): string {
  const categoryLabel =
    category === 'overall'
      ? 'כללי'
      : category === 'cardio'
        ? 'ריצה'
        : 'כוח';
  const windowLabel = timeWindowLabel(window);
  return `${categoryLabel} • ${windowLabel}`;
}

/** v2 leagues header: this month's league name and the week-closes chip. */
export function leagueCalendarChips(now: Date): { month: string; weekCloses: string } {
  const daysLeft = 6 - now.getDay(); // the Israeli week ends on Saturday
  const month = HEBREW_MONTHS[now.getMonth()];
  return {
    month,
    weekCloses: daysLeft === 0 ? 'השבוע נסגר הלילה' : `השבוע נסגר בעוד ${daysLeft === 1 ? 'יום' : `${daysLeft} ימים`}`,
  };
}
