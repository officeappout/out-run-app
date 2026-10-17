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
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton, BoardPodium, BoardToggle, type PodiumEntry } from './LeagueBoard';
import { perMember, rankByMeasure, type GroupMeasure } from './league-board-logic';
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
  /** Activity chips on the board (17.10.2026). Omit to hide them. */
  onCategoryChange?: (c: LeaderboardCategory) => void;
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
  onCategoryChange,
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
      onCategoryChange={onCategoryChange}
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
  onCategoryChange?: (c: LeaderboardCategory) => void;
}

const CATEGORY_CHIPS: { id: LeaderboardCategory; label: string }[] = [
  { id: 'overall', label: 'כל הפעילות' },
  { id: 'strength', label: 'כוח' },
  { id: 'cardio', label: 'אירובי' },
];

export function ScopeCompetitionLeaderboardView({
  granularity,
  timeWindow,
  category,
  isLoading,
  error,
  entries,
  onRefresh: fetch,
  onCategoryChange,
}: ScopeCompetitionLeaderboardViewProps) {
  const windowLabel = timeWindow === 'daily' ? 'יומי' : timeWindow === 'weekly' ? 'שבועי' : 'חודשי';

  // Average per active member (the fair, official order — a small active
  // neighborhood can win) or the total (David, 17.10.2026). Both come from
  // the same entries: average = totalScore / activeMemberCount.
  const [measure, setMeasure] = useState<GroupMeasure>('avg');
  const ranked = rankByMeasure(entries, measure);
  const unit = CATEGORY_UNIT_LABEL[category];
  const shown = (e: ScopeCompetitionEntry) =>
    (measure === 'avg' ? perMember(e) : e.totalScore).toLocaleString('he-IL');
  const top3 = ranked.slice(0, 3);
  const podium: [PodiumEntry, PodiumEntry, PodiumEntry] | null =
    top3.length === 3
      ? (top3.map((e) => ({
          key: e.scopeId,
          name: e.scopeName,
          value: shown(e),
          // the full unit lives on the rows + the note; the pedestal keeps just the number
          sub: `${e.activeMemberCount} פעילים`,
        })) as [PodiumEntry, PodiumEntry, PodiumEntry])
      : null;

  return (
    <BoardCard
      title={`דירוג ה${GRANULARITY_LABEL[granularity]}`}
      subtitle={`${GRANULARITY_LABEL[granularity]} • ${windowLabel}`}
      actions={<BoardIconButton icon={RefreshCw} label="רענן" onClick={fetch} spinning={isLoading} />}
    >
      {onCategoryChange && (
        <div className="-mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 no-scrollbar" role="radiogroup" aria-label="סוג פעילות">
          {CATEGORY_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              onClick={() => onCategoryChange(c.id)}
              className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors ease-v2 ${
                category === c.id ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
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
        <>
        <div className="mb-2">
          <BoardToggle
            label="שיטת דירוג"
            value={measure}
            onChange={setMeasure}
            options={[
              { id: 'avg', label: 'ממוצע למשתתף' },
              { id: 'total', label: 'סה״כ' },
            ]}
          />
        </div>
        {podium && <BoardPodium entries={podium} />}
        <div className="grid grid-cols-1 gap-1 mt-1">
          {ranked.slice(podium ? 3 : 0).map((entry) => (
            // Total score label is metric-qualified, never a bare "נקודות" —
            // getScopeCompetitionLeaderboard sums activityCredit filtered by
            // `category`, so a selected metric shows its own honest label.
            <BoardRow
              key={entry.scopeId}
              rank={entry.rank}
              name={entry.scopeName}
              sub={`${entry.activeMemberCount} פעיל${entry.activeMemberCount !== 1 ? 'ים' : ''}`}
              value={shown(entry)}
              unit={measure === 'avg' ? `${unit} למשתתף` : unit}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] font-bold leading-snug text-v2-muted">
          {measure === 'avg'
            ? 'בממוצע למשתתף פעיל גודל השכונה לא קובע — גם קבוצה קטנה יכולה לנצח.'
            : 'בסה״כ הגדולים מובילים. הדירוג הרשמי הוא לפי ממוצע למשתתף.'}
        </p>
        </>
      )}
    </BoardCard>
  );
}
