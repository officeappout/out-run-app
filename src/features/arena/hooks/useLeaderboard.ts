'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { extractFeedScope } from '@/features/social/services/feed-scope.utils';
import { getIndividualBoard } from '@/features/arena/services/individual-board.client';
import {
  getStreakLeaderboard,
  getSegmentLeaderboard,
  getTenantLeaderboard,
  type LeaderboardScope,
  type LeaderboardCategory,
  type LeaderboardTimeWindow,
  type LeaderboardGenderFilter,
  type LeaderboardResult,
  type RunSegmentFilter,
} from '@/features/arena/services/ranking.service';

export type LeaderboardDataMode = 'credit' | 'streak' | 'steps' | 'segment' | 'distance';

export interface UseLeaderboardOptions {
  scope: LeaderboardScope;
  scopeId: string | null;
  category: LeaderboardCategory;
  timeWindow: LeaderboardTimeWindow;
  genderFilter?: LeaderboardGenderFilter;
  programId?: string | null;
  /** 'streak' → streaks collection; 'steps' / 'distance' / 'credit' → /api/leagues/individual-board (server-side sums of dailyActivityPublic / feed_posts); 'segment' → feed_posts by runSegment (unreachable in the UI today) */
  dataMode?: LeaderboardDataMode;
  /** Required when dataMode === 'segment' */
  runSegment?: RunSegmentFilter;
}

export function useLeaderboard(options: UseLeaderboardOptions) {
  const { scope, scopeId, category, timeWindow, genderFilter = 'all', programId, dataMode = 'credit', runSegment } = options;
  const { profile } = useUserStore();

  const [result, setResult] = useState<LeaderboardResult>({
    entries: [],
    myEntry: null,
    totalParticipants: 0,
    window: 'weekly',
    generatedAt: new Date(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!scopeId && scope !== 'global') {
      // Clear any rows from a previously-selected scope so stale entries
      // don't flash while toggling between leagues with no scopeId.
      setResult({
        entries: [],
        myEntry: null,
        totalParticipants: 0,
        window: timeWindow,
        generatedAt: new Date(),
      });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const uid = auth.currentUser?.uid ?? '';

      let data: LeaderboardResult;

      if (scope === 'tenant' && scopeId) {
        // Community (tenant/org) leaderboard — scopeId is the tenantId.
        // Reads leaderboard_shards (onWorkoutCreate CF), independent of the feed.
        data = await getTenantLeaderboard({
          tenantId: scopeId,
          unitId: null, // tenant-wide for the MVP; unit drill-down is a follow-up
          currentUid: uid,
          currentName: profile?.core?.name,
          // SPEC-04 Wave B — unlike dailyActivityPublic's rule-enforced
          // steps leaderboard below, this filter runs client-side only
          // (no matching firestore.rules change — see getTenantLeaderboard's
          // own comment on why), so there's no PERMISSION_DENIED risk from
          // either default. Still defaults to 'minor' for an unresolved
          // caller — the more restrictive cohort — matching this whole
          // spec's fail-closed convention rather than assuming adult.
          callerAgeGroup: extractFeedScope(profile).ageGroup ?? 'minor',
        });
      } else if (scope === 'league' && scopeId) {
        // Group leaderboard — scopeId is the community group ID. 19.10.2026:
        // from the league aggregates (weekly/monthly, enable_league_aggregates:
        // general → all points, steps → steps points, distance → km), else
        // the same feed_posts points sum as before, done on the server.
        data = await getIndividualBoard({
          mode: 'credit',
          scope,
          scopeId,
          category,
          timeWindow,
          genderFilter,
          currentUid: uid,
          currentName: profile?.core?.name,
          groupMeasure: dataMode === 'steps' ? 'stepsPoints' : dataMode === 'distance' ? 'km' : 'points',
        });
      } else if (dataMode === 'streak') {
        data = await getStreakLeaderboard({
          scope,
          scopeId,
          currentUid: uid,
          currentName: profile?.core?.name,
        });
      } else if (dataMode === 'steps' || dataMode === 'distance') {
        // Server-side since 19.10.2026 (/api/leagues/individual-board — was a
        // client scan of up to 5,000 dailyActivityPublic docs / a whole
        // period of feed_posts). Same filters and math. Steps: the caller's
        // cohort is decided on the server from userAge (missing → 'minor',
        // matching the dailyActivityPublic rule); distance keeps the old
        // client default ('adult') as the hint when userAge is missing.
        data = await getIndividualBoard({
          mode: dataMode,
          scope,
          scopeId,
          timeWindow,
          genderFilter,
          ageGroupHint: extractFeedScope(profile).ageGroup ?? (dataMode === 'steps' ? 'minor' : 'adult'),
          currentUid: uid,
          currentName: profile?.core?.name,
        });
      } else if (dataMode === 'segment' && runSegment) {
        const feedScope = extractFeedScope(profile);
        data = await getSegmentLeaderboard({
          scope,
          scopeId,
          runSegment,
          ageGroup: feedScope.ageGroup ?? 'adult',
          genderFilter,
          currentUid: uid,
          currentName: profile?.core?.name,
        });
      } else {
        // Points (activityCredit) board — server-side since 19.10.2026.
        data = await getIndividualBoard({
          mode: 'credit',
          scope,
          scopeId,
          category,
          timeWindow,
          genderFilter,
          programId,
          ageGroupHint: extractFeedScope(profile).ageGroup ?? 'adult',
          currentUid: uid,
          currentName: profile?.core?.name,
        });
      }

      setResult(data);
    } catch (err) {
      console.error('[useLeaderboard]', err);
      setError('Failed to load leaderboard');
    } finally {
      setIsLoading(false);
    }
  }, [scope, scopeId, category, timeWindow, genderFilter, programId, dataMode, runSegment, profile]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return { ...result, isLoading, error, refresh: fetchLeaderboard };
}
