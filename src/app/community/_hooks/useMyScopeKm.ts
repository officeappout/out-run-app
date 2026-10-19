import { useEffect, useState } from 'react';
import {
  getMyLeagueContribution,
  type LeaderboardTimeWindow,
  type ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';

/**
 * Home v2: your own km for the bubbled scope this week / month — the
 * contribution card's "תרמת X ק״מ" line (your member row only, via
 * /api/leagues/my-contribution). Shown for fun; never part of the points.
 */
export function useMyScopeKm(
  enableHomeV2: boolean,
  activeScopeEntry: ScopeCompetitionEntry | null,
  neighborhoodAuthorityId: string | null | undefined,
  leaderboardTimeWindow: LeaderboardTimeWindow,
) {
  const [myScopeKm, setMyScopeKm] = useState<{ key: string; km: number } | null>(null);
  const myScopeKmGranularity: 'city' | 'neighborhood' =
    activeScopeEntry && activeScopeEntry.scopeId === neighborhoodAuthorityId ? 'neighborhood' : 'city';
  const myScopeKmKey = activeScopeEntry ? `${myScopeKmGranularity}:${activeScopeEntry.scopeId}:${leaderboardTimeWindow}` : '';
  useEffect(() => {
    if (!enableHomeV2 || !activeScopeEntry || leaderboardTimeWindow === 'daily') return;
    let alive = true;
    const key = myScopeKmKey;
    getMyLeagueContribution({ granularity: myScopeKmGranularity, scopeId: activeScopeEntry.scopeId, timeWindow: leaderboardTimeWindow }).then((r) => {
      if (alive && r) setMyScopeKm({ key, km: r.totalKm });
    });
    return () => {
      alive = false;
    };
  }, [enableHomeV2, myScopeKmKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { myScopeKm, myScopeKmGranularity, myScopeKmKey };
}
