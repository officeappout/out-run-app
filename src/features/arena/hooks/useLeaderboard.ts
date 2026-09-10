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
  getTenantLeaderboard,
  getDistanceLeaderboard,
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
  /** 'streak' → streaks collection; 'steps' → dailyActivity; 'segment' → feed_posts by runSegment; 'distance' → feed_posts summed distanceKm; 'credit' (default) → feed_posts activityCredit */
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
          // SPEC-04 Wave B — unlike the feed_posts-backed modes below
          // (getDistanceLeaderboard etc., which default to 'adult' here
          // with no matching rule-level age check on feed_posts to
          // conflict with), dailyActivityPublic's new rule independently
          // defaults an unresolved caller (e.g. a guest, no userAge/{uid}
          // doc) to 'minor' via getUserAgeGroup(). Defaulting to 'adult'
          // here would request a query shape the rule won't grant for
          // that caller, rejecting the whole leaderboard outright instead
          // of just filtering it — so this one MUST default to 'minor' to
          // stay consistent with the rule it's actually gated by.
          callerAgeGroup: extractFeedScope(profile).ageGroup ?? 'minor',
        });
      } else if (dataMode === 'distance') {
        const feedScope = extractFeedScope(profile);
        data = await getDistanceLeaderboard({
          scope,
          scopeId,
          timeWindow,
          ageGroup: feedScope.ageGroup ?? 'adult',
          genderFilter,
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
