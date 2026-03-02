'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { extractFeedScope } from '@/features/social/services/feed-scope.utils';
import {
  getLeaderboard,
  type LeaderboardScope,
  type LeaderboardCategory,
  type LeaderboardTimeWindow,
  type LeaderboardResult,
} from '@/features/arena/services/ranking.service';

export interface UseLeaderboardOptions {
  scope: LeaderboardScope;
  scopeId: string | null;
  category: LeaderboardCategory;
  timeWindow: LeaderboardTimeWindow;
}

export function useLeaderboard(options: UseLeaderboardOptions) {
  const { scope, scopeId, category, timeWindow } = options;
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
    if (!scopeId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const uid = auth.currentUser?.uid ?? '';
      const feedScope = extractFeedScope(profile);

      const data = await getLeaderboard({
        scope,
        scopeId,
        category,
        timeWindow,
        ageGroup: feedScope.ageGroup ?? 'minor',
        currentUid: uid,
        currentName: profile?.core?.name,
      });

      setResult(data);
    } catch (err) {
      console.error('[useLeaderboard]', err);
      setError('Failed to load leaderboard');
    } finally {
      setIsLoading(false);
    }
  }, [scope, scopeId, category, timeWindow, profile]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return { ...result, isLoading, error, refresh: fetchLeaderboard };
}
