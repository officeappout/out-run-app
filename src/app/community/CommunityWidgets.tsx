'use client';

/**
 * Community widgets, each in its own WidgetBoundary (drop-in replacements for
 * the original imports). A board that throws disappears and is reported to
 * Sentry instead of replacing the whole app with the global error screen.
 * List items (FeedPostCard, GroupCard) are wrapped per item, so one bad post
 * or group hides only itself.
 */
import { withWidgetBoundary } from '@/components/system/WidgetBoundary';
import { compactWidgetFallback } from '@/components/system/CompactWidgetFallback';
import FeedPostCardRaw from '@/features/social/components/FeedPostCard';
import GroupCardRaw from '@/features/arena/components/GroupCard';
import CommunityCirclesRaw from '@/features/arena/components/CommunityCircles';
import CityArenaViewRaw from '@/features/arena/components/CityArenaView';
import NeighborhoodLeaderboardRaw from '@/features/arena/components/NeighborhoodLeaderboard';
import UnitLeagueTableRaw from '@/features/arena/components/UnitLeagueTable';
import GroupLeaderboardRaw from '@/features/arena/components/GroupLeaderboard';
import ScopeCompetitionLeaderboardRaw from '@/features/arena/components/ScopeCompetitionLeaderboard';
import ScopeBattleCardRaw from '@/features/arena/components/ScopeBattleCard';
import NationalLeagueBoardRaw from '@/features/arena/components/NationalLeagueBoard';
import InviteBonusCardRaw from '@/features/arena/components/InviteBonusCard';
import CityChallengeCardRaw from '@/features/arena/components/CityChallengeCard';
import MunicipalPressureCardRaw from '@/features/arena/components/MunicipalPressureCard';
import SchoolOutreachCardRaw from '@/features/arena/components/SchoolOutreachCard';
import GroupLeagueStatsBoardRaw from '@/features/arena/components/GroupLeagueStatsBoard';
import LeagueCarouselRaw from '@/features/arena/components/LeagueCarousel';

export const FeedPostCard = withWidgetBoundary(FeedPostCardRaw, 'community.FeedPostCard');
export const GroupCard = withWidgetBoundary(GroupCardRaw, 'community.GroupCard');
export const CommunityCircles = withWidgetBoundary(CommunityCirclesRaw, 'community.CommunityCircles');
export const LeagueCarousel = withWidgetBoundary(LeagueCarouselRaw, 'community.LeagueCarousel', compactWidgetFallback);
export const CityArenaView = withWidgetBoundary(CityArenaViewRaw, 'community.CityArenaView', compactWidgetFallback);
export const NeighborhoodLeaderboard = withWidgetBoundary(NeighborhoodLeaderboardRaw, 'community.NeighborhoodLeaderboard', compactWidgetFallback);
export const UnitLeagueTable = withWidgetBoundary(UnitLeagueTableRaw, 'community.UnitLeagueTable', compactWidgetFallback);
export const GroupLeaderboard = withWidgetBoundary(GroupLeaderboardRaw, 'community.GroupLeaderboard', compactWidgetFallback);
export const ScopeCompetitionLeaderboard = withWidgetBoundary(ScopeCompetitionLeaderboardRaw, 'community.ScopeCompetitionLeaderboard', compactWidgetFallback);
export const ScopeBattleCard = withWidgetBoundary(ScopeBattleCardRaw, 'community.ScopeBattleCard', compactWidgetFallback);
export const NationalLeagueBoard = withWidgetBoundary(NationalLeagueBoardRaw, 'community.NationalLeagueBoard', compactWidgetFallback);
export const GroupLeagueStatsBoard = withWidgetBoundary(GroupLeagueStatsBoardRaw, 'community.GroupLeagueStatsBoard', compactWidgetFallback);
export const InviteBonusCard = withWidgetBoundary(InviteBonusCardRaw, 'community.InviteBonusCard');
export const CityChallengeCard = withWidgetBoundary(CityChallengeCardRaw, 'community.CityChallengeCard');
export const MunicipalPressureCard = withWidgetBoundary(MunicipalPressureCardRaw, 'community.MunicipalPressureCard');
export const SchoolOutreachCard = withWidgetBoundary(SchoolOutreachCardRaw, 'community.SchoolOutreachCard');
