/**
 * The league selector's cards, derived from `access` + the bubbled rank of
 * the active league (no extra queries). Pure — unit-tested in
 * __tests__/league-cards.test.ts.
 */
import type { LeagueCardData } from '@/features/arena/components/LeagueCarousel';
import type { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import type { ArenaData } from '@/features/arena/hooks/useArenaData';
import type { LeaderboardEntry } from '@/features/arena/services/ranking.service';
import type { CommunityGroup } from '@/types/community.types';
import type { LeagueT } from '@/features/arena/components/league-t';
import { SHOW_PARK_LEAGUE } from './community-constants';

type ArenaAccess = ReturnType<typeof useArenaAccess>;

export interface LeagueCardsInput {
  access: Pick<
    ArenaAccess,
    'hasCityAccess' | 'cityName' | 'orgType' | 'orgName' | 'preferredParkId' | 'preferredParkName' | 'hasReserveAccess'
  >;
  authority: ArenaData['authority'];
  selectedLeague: string;
  activeMyEntry: LeaderboardEntry | null;
  socialGroups: CommunityGroup[];
}

/** `t`: the caller's translator (`useT(community)`), for the card names (`communityPage.cards.*`). */
export function buildLeagueCards({ access, authority, selectedLeague, activeMyEntry, socialGroups }: LeagueCardsInput, t: LeagueT): LeagueCardData[] {
  const cards: LeagueCardData[] = [];

  // Order requested by spec: city → global → org → park.
  if (access.hasCityAccess) {
    cards.push({
      key: 'city',
      name: t('communityPage.cards.city'),
      subtitle: access.cityName ?? undefined,
      emoji: '🏙️',
      logoUrl: authority?.logoUrl,
      // authority.userCount is denormalized on the authority doc — already
      // loaded by useArenaData, so no extra query needed.
      memberCount: authority?.userCount ?? null,
      rank: selectedLeague === 'city' ? activeMyEntry?.rank ?? null : null,
    });
  }

  cards.push({
    key: 'global',
    name: t('communityPage.cards.national'),
    subtitle: t('communityPage.cards.nationalSubtitle'),
    emoji: '🌍',
    memberCount:
      selectedLeague === 'global' && activeMyEntry
        ? // Active card → use the bubbled entries.length proxy (no extra
          //  query). For inactive cards we deliberately show "—".
          null
        : null,
    rank: selectedLeague === 'global' ? activeMyEntry?.rank ?? null : null,
  });

  if (access.orgType) {
    const orgEmoji =
      access.orgType === 'work'
        ? '🏢'
        : access.orgType === 'university'
          ? '🎓'
          : access.orgType === 'youth_movement'
            ? '⛺'
            : '🏫';
    const orgName = t('communityPage.cards.org', { orgType: access.orgType });
    cards.push({
      key: 'org',
      name: orgName,
      subtitle: access.orgName ?? undefined,
      emoji: orgEmoji,
      memberCount: null,
      rank: selectedLeague === 'org' ? activeMyEntry?.rank ?? null : null,
    });
  }

  // 16.08.2026 design review: park league hidden from the selector for
  // now — code/data path untouched (ParkSegment, scope='park'
  // queries all still work), flip SHOW_PARK_LEAGUE back to re-surface it.
  if (SHOW_PARK_LEAGUE && access.preferredParkId) {
    cards.push({
      key: 'park',
      name: t('communityPage.cards.park'),
      subtitle: access.preferredParkName ?? undefined,
      emoji: '🌳',
      memberCount: null,
      rank: selectedLeague === 'park' ? activeMyEntry?.rank ?? null : null,
    });
  }

  // Phase 6a — reservist league. Gated on access.hasReserveAccess (actual
  // community_groups membership, auto-joined server-side) — never shown to
  // a user who hasn't declared reserve status. Deliberately NOT part of the
  // per-group loop below: that loop is feed_posts-backed (getLeagueLeaderboard)
  // and excludes groupType:'military' anyway (INSTITUTIONAL_GROUP_TYPES,
  // see useSocialLeagueGroups) — this card uses the reserve scope's
  // own streaks/dailyActivity-backed leaderboard instead.
  //
  // 07.09.2026 — David: the league selector had grown a 4th, structurally
  // wrong card ("תחרות יחידות") sitting alongside this one instead of
  // living inside it. Removed that card outright; <ReserveSegment>
  // now folds unit-vs-unit competition into a "קבוצות" tab here, exactly
  // mirroring how the national league's own יחידים/קבוצות toggle works
  // (<CompetitionToggle>, reused verbatim, not a second copy). This
  // card's OWN gate stays hasReserveAccess-only, unchanged — a
  // career/regular soldier who has hasUnitLeagueAccess but not
  // hasReserveAccess no longer gets a standalone card for it (previously
  // did, see the old unit_league card this replaced). Deliberate, per
  // David's explicit "three cards, no exceptions" — flagged, not silently
  // dropped; trivial to restore as a 4th visibility condition here if that
  // population turns out to matter.
  if (access.hasReserveAccess) {
    cards.push({
      key: 'reserve',
      name: t('communityPage.cards.reserve'),
      subtitle: undefined,
      emoji: '🎖️',
      memberCount: null,
      rank: selectedLeague === 'reserve' ? activeMyEntry?.rank ?? null : null,
    });
  }

  // Per-group league cards — all non-institutional groups the user belongs to
  for (const g of socialGroups) {
    const cardKey = `league_${g.id}`;
    const emoji =
      g.groupType === 'family'       ? '👨‍👩‍👧' :
      g.groupType === 'friends'      ? '👥' :
      g.groupType === 'neighborhood' ? '🏘️' :
      g.groupType === 'park'         ? '🌳' :
      '🏃';
    cards.push({
      key: cardKey,
      name: g.name,
      subtitle: g.memberCount ? t('communityPage.cards.members', { count: String(g.memberCount) }) : undefined,
      emoji,
      memberCount: g.memberCount ?? null,
      rank: selectedLeague === cardKey ? activeMyEntry?.rank ?? null : null,
    });
  }

  return cards;
}
