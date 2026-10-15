'use client';

/**
 * ScopeCompetitionLeaderboard — scope-vs-scope competition ranking.
 *
 * Renders a ranked list of SCOPES (cities, or neighborhoods) competing
 * against each other as entities — as opposed to GroupLeaderboard, which
 * ranks community groups WITHIN one already-selected scope, or
 * NeighborhoodLeaderboard, which ranks individuals within one scope.
 * This is the one net-new screen for inter-scope competition (city-vs-city,
 * neighborhood-vs-neighborhood) — everything else it depends on
 * (getScopeCompetitionLeaderboard, the neighborhoodId stamping) already
 * existed before this component.
 *
 * Data is fetched via getScopeCompetitionLeaderboard. The #1 row gets a
 * gold top-border accent, matching GroupLeaderboard's visual language.
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton } from './LeagueBoard';
import {
  getScopeCompetitionLeaderboard,
  type ScopeCompetitionEntry,
  type ScopeCompetitionResult,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow, LeaderboardCategory, LeaderboardGenderFilter } from '@/features/arena/services/ranking.service';
import { CATEGORY_UNIT_LABEL } from './scope-category-unit-label';


export type ScopeCompetitionGranularity = 'city' | 'neighborhood';

interface ScopeCompetitionLeaderboardProps {
  granularity: ScopeCompetitionGranularity;
  timeWindow?: LeaderboardTimeWindow;
  /** Required when granularity === 'neighborhood' — neighborhoods compete
   * only within this city. Ignored for granularity === 'city'. */
  cityAuthorityId?: string | null;
  /** Filters the competing scopes' totals by activity category. Omitted or
   * 'overall' → every category summed (unchanged default). */
  category?: LeaderboardCategory;
  /** Filters the competing scopes' totals by gender. Omitted or 'all' →
   * every gender summed (unchanged default). */
  genderFilter?: LeaderboardGenderFilter;
}

const GRANULARITY_LABEL: Record<ScopeCompetitionGranularity, string> = {
  city: 'ערים',
  neighborhood: 'שכונות',
};

const EMPTY_STATE_COPY: Record<ScopeCompetitionGranularity, { title: string; subtitle: string }> = {
  city: {
    title: 'אין עדיין תחרות בין ערים',
    subtitle: 'כשמשתמשים בערים שונות יסיימו אימונים, הן יופיעו כאן בדירוג',
  },
  neighborhood: {
    title: 'אין עדיין תחרות בין שכונות',
    subtitle: 'הדירוג הזה יתמלא ככל שיותר משתמשים יבחרו שכונה בפרופיל שלהם',
  },
};



export default function ScopeCompetitionLeaderboard({
  granularity,
  timeWindow = 'weekly',
  cityAuthorityId = null,
  category = 'overall',
  genderFilter = 'all',
}: ScopeCompetitionLeaderboardProps) {
  const [result, setResult] = useState<ScopeCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getScopeCompetitionLeaderboard({ granularity, timeWindow, cityAuthorityId, category, genderFilter });
      setResult(data);
    } catch (err) {
      console.error('[ScopeCompetitionLeaderboard]', err);
      setError('שגיאה בטעינת הדירוג');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [granularity, timeWindow, cityAuthorityId, category, genderFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScopeCompetitionLeaderboardView
      granularity={granularity}
      timeWindow={timeWindow}
      category={category}
      isLoading={isLoading}
      error={error}
      entries={result?.entries ?? []}
      onRefresh={fetch}
    />
  );
}

// ── Presentational view — split out so the list renders with fixture data ──

export interface ScopeCompetitionLeaderboardViewProps {
  granularity: ScopeCompetitionGranularity;
  timeWindow: LeaderboardTimeWindow;
  category: LeaderboardCategory;
  isLoading: boolean;
  error: string | null;
  entries: ScopeCompetitionEntry[];
  onRefresh: () => void;
}

export function ScopeCompetitionLeaderboardView({
  granularity,
  timeWindow,
  category,
  isLoading,
  error,
  entries,
  onRefresh: fetch,
}: ScopeCompetitionLeaderboardViewProps) {
  const windowLabel = timeWindow === 'daily' ? 'יומי' : timeWindow === 'weekly' ? 'שבועי' : 'חודשי';

  // Design v2: one dark board (site league board) — the old separate podium
  // previewed ranks 1-3 that the list below already repeated; the #1 row now
  // carries the crown + gradient instead.
  return (
    <BoardCard
      title={`דירוג ה${GRANULARITY_LABEL[granularity]}`}
      subtitle={`${GRANULARITY_LABEL[granularity]} • ${windowLabel}`}
      actions={<BoardIconButton icon={RefreshCw} label="רענן" onClick={fetch} spinning={isLoading} />}
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
              נסה שוב
            </Button>
          }
        />
      ) : entries.length === 0 ? (
        <BoardMessage
          icon={Trophy}
          title={EMPTY_STATE_COPY[granularity].title}
          body={EMPTY_STATE_COPY[granularity].subtitle}
        />
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {entries.map((entry) => (
            // Total score label is metric-qualified, never a bare "נקודות" —
            // getScopeCompetitionLeaderboard sums activityCredit filtered by
            // `category`, so a selected metric shows its own honest label.
            <BoardRow
              key={entry.scopeId}
              rank={entry.rank}
              name={entry.scopeName}
              sub={`${entry.activeMemberCount} פעיל${entry.activeMemberCount !== 1 ? 'ים' : ''}`}
              value={entry.totalScore.toLocaleString('he-IL')}
              unit={CATEGORY_UNIT_LABEL[category]}
            />
          ))}
        </div>
      )}
    </BoardCard>
  );
}
