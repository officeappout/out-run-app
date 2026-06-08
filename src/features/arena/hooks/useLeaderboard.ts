'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { extractFeedScope } from '@/features/social/services/feed-scope.utils';
import {
  getLeaderboard,
  getStreakLeaderboard,
  getStepsLeaderboard,
  getSegmentLeaderboard,
  getLeagueLeaderboard,
  type LeaderboardScope,
  type LeaderboardCategory,
  type LeaderboardTimeWindow,
  type LeaderboardGenderFilter,
  type LeaderboardResult,
  type RunSegmentFilter,
} from '@/features/arena/services/ranking.service';

export type LeaderboardDataMode = 'credit' | 'streak' | 'steps' | 'segment';

export interface UseLeaderboardOptions {
  scope: LeaderboardScope;
  scopeId: string | null;
  category: LeaderboardCategory;
  timeWindow: LeaderboardTimeWindow;
  genderFilter?: LeaderboardGenderFilter;
  programId?: string | null;
  /** 'streak' → streaks collection; 'steps' → dailyActivity; 'segment' → feed_posts by runSegment; 'credit' (default) → feed_posts activityCredit */
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

      if (scope === 'league' && scopeId) {
        // Group leaderboard — scopeId is the community group ID
        data = await getLeagueLeaderboard({
          groupId: scopeId,
          category,
          timeWindow,
          genderFilter,
          currentUid: uid,
          currentName: profile?.core?.name,
        });
      } else if (dataMode === 'streak') {
        data = await getStreakLeaderboard({
          scope,
          scopeId,
          currentUid: uid,
          currentName: profile?.core?.name,
        });
      } else if (dataMode === 'steps') {
        data = await getStepsLeaderboard({
          scope,
          scopeId,
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
        const feedScope = extractFeedScope(profile);
        data = await getLeaderboard({
          scope,
          scopeId,
          category,
          timeWindow,
          ageGroup: feedScope.ageGroup ?? 'adult',
          genderFilter,
          programId,
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
