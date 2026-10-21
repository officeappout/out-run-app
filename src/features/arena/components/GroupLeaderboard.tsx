'use client';

/**
 * GroupLeaderboard — group-vs-group competition ranking.
 *
 * Renders a ranked list of community groups within a scoped leaderboard
 * (city or school). Each row shows the group's initials avatar, name,
 * active member count, and average score per active member.
 *
 * Data is fetched via getGroupCompetitionLeaderboard. The #1 row gets a
 * gold top-border accent; no podium (groups don't have profile photos).
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton, BoardPodium, type PodiumEntry } from './LeagueBoard';
import {
  getGroupCompetitionLeaderboard,
  type GroupCompetitionEntry,
  type GroupCompetitionResult,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow, LeaderboardGenderFilter } from '@/features/arena/services/ranking.service';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';


interface GroupLeaderboardProps {
  scope: 'city' | 'school' | 'global';
  /** null is valid for scope='global' (no city/school constraint). */
  scopeId: string | null;
  timeWindow?: LeaderboardTimeWindow;
  /** Filters the ranked groups' totals by gender. Omitted or 'all' → every
   * gender summed (unchanged default). */
  genderFilter?: LeaderboardGenderFilter;
}



export default function GroupLeaderboard({
  scope,
  scopeId,
  timeWindow = 'weekly',
  genderFilter = 'all',
}: GroupLeaderboardProps) {
  const t = useT(community);
  const [result, setResult] = useState<GroupCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetch = async () => {
    if (scope !== 'global' && !scopeId) return;
    setIsLoading(true);
    setFailed(false);
    try {
      const data = await getGroupCompetitionLeaderboard({ scope, scopeId, timeWindow, genderFilter });
      setResult(data);
    } catch (err) {
      console.error('[GroupLeaderboard]', err);
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [scope, scopeId, timeWindow, genderFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GroupLeaderboardView
      timeWindow={timeWindow}
      isLoading={isLoading}
      error={failed ? t('leagues.groupBoard.loadError') : null}
      entries={result?.entries ?? []}
      onRefresh={fetch}
    />
  );
}

// ── Presentational view — split out so the list renders with fixture data ──

export interface GroupLeaderboardViewProps {
  timeWindow: LeaderboardTimeWindow;
  isLoading: boolean;
  error: string | null;
  entries: GroupCompetitionEntry[];
  onRefresh: () => void;
}

export function GroupLeaderboardView({
  timeWindow,
  isLoading,
  error,
  entries,
  onRefresh: fetch,
}: GroupLeaderboardViewProps) {
  const t = useT(community);
  return (
    <BoardCard
      title={t('leagues.groupBoard.title')}
      subtitle={t('leagues.groupBoard.subtitle', { window: timeWindow })}
      actions={<BoardIconButton icon={RefreshCw} label={t('leagues.groupBoard.refresh')} onClick={fetch} spinning={isLoading} />}
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <BoardRowSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <BoardMessage
          icon={RefreshCw}
          title={error}
          action={
            <Button variant="primary" size="sm" onClick={fetch}>
              {t('leagues.groupBoard.retry')}
            </Button>
          }
        />
      ) : entries.length === 0 ? (
        <BoardMessage
          icon={Users}
          title={t('leagues.groupBoard.empty.title')}
          body={t('leagues.groupBoard.empty.body')}
        />
      ) : (
        <>
        {entries.length >= 3 && (
          <BoardPodium
            entries={
              entries.slice(0, 3).map((e) => ({
                key: e.groupId,
                name: e.groupName,
                value: e.avgScore.toLocaleString('he-IL'),
                sub: t('leagues.groupBoard.podiumSub', { count: String(e.activeMemberCount) }),
              })) as [PodiumEntry, PodiumEntry, PodiumEntry]
            }
          />
        )}
        <div className="grid grid-cols-1 gap-1 mt-1">
          {entries.slice(entries.length >= 3 ? 3 : 0).map((entry) => (
            <BoardRow
              key={entry.groupId}
              rank={entry.rank}
              name={entry.groupName}
              sub={t('leagues.groupBoard.active', { n: entry.activeMemberCount, count: String(entry.activeMemberCount) })}
              value={entry.avgScore.toLocaleString('he-IL')}
              unit={t('leagues.groupBoard.unit')}
            />
          ))}
        </div>
        </>
      )}
    </BoardCard>
  );
}
