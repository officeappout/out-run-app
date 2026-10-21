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
import { ChevronDown, RefreshCw, SlidersHorizontal, Trophy } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { BoardCard, BoardIconButton, BoardMessage, BoardRow, BoardRowSkeleton, BoardPodium, BoardToggle, type PodiumEntry } from './LeagueBoard';
import { formatKm, perMember, rankByKm, rankByMeasure, type GroupMeasure } from './league-board-logic';
import {
  getScopeCompetitionLeaderboard,
  type ScopeCompetitionEntry,
  type ScopeCompetitionResult,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow, LeaderboardCategory, LeaderboardGenderFilter } from '@/features/arena/services/ranking.service';
import { CATEGORY_UNIT_LABEL_KEYS } from './scope-category-unit-label';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import type { CommunityKey } from './league-t';

/** Home v2 (18.10.2026): what the board ranks by — points (official) or km (for fun). */
export type ScopeBoardMetric = 'points' | 'km';
const METRIC_CHIPS: { id: ScopeBoardMetric; labelKey: CommunityKey }[] = [
  { id: 'points', labelKey: 'leagues.scopes.metric.points' },
  { id: 'km', labelKey: 'leagues.scopes.metric.km' },
];


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




export default function ScopeCompetitionLeaderboard({
  granularity,
  timeWindow = 'weekly',
  cityAuthorityId = null,
  category = 'overall',
  genderFilter = 'all',
  onCategoryChange,
}: ScopeCompetitionLeaderboardProps) {
  const t = useT(community);
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const [result, setResult] = useState<ScopeCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Home v2: rank by km (inside "סינון"). Without the flag always points.
  const [metric, setMetric] = useState<ScopeBoardMetric>('points');
  const km = v2 && metric === 'km';

  const fetch = async () => {
    setIsLoading(true);
    setFailed(false);
    try {
      const data = await getScopeCompetitionLeaderboard({
        granularity,
        timeWindow,
        cityAuthorityId,
        category,
        genderFilter,
        ...(km ? { measure: 'distance' as const } : {}),
      });
      setResult(data);
    } catch (err) {
      console.error('[ScopeCompetitionLeaderboard]', err);
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [granularity, timeWindow, cityAuthorityId, category, genderFilter, km]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScopeCompetitionLeaderboardView
      granularity={granularity}
      timeWindow={timeWindow}
      category={category}
      isLoading={isLoading}
      error={failed ? t('leagues.scopes.loadError') : null}
      entries={result?.entries ?? []}
      onRefresh={fetch}
      onCategoryChange={onCategoryChange}
      {...(v2 ? { metric, onMetricChange: setMetric } : {})}
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
  /**
   * Home v2 only: km next to the points on every row, and a "סינון" panel
   * that switches the board to rank by km. Omitted → today's board exactly.
   */
  metric?: ScopeBoardMetric;
  onMetricChange?: (m: ScopeBoardMetric) => void;
}

const CATEGORY_CHIPS: { id: LeaderboardCategory; labelKey: CommunityKey }[] = [
  { id: 'overall', labelKey: 'leagues.scopes.category.overall' },
  { id: 'strength', labelKey: 'leagues.scopes.category.strength' },
  { id: 'cardio', labelKey: 'leagues.scopes.category.cardio' },
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
  metric,
  onMetricChange,
}: ScopeCompetitionLeaderboardViewProps) {
  const t = useT(community);
  const v2 = !!onMetricChange;
  const km = v2 && metric === 'km';
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Average per active member (the fair, official order — a small active
  // neighborhood can win) or the total (David, 17.10.2026). Both come from
  // the same entries: average = totalScore / activeMemberCount.
  const [measure, setMeasure] = useState<GroupMeasure>('avg');
  const ranked = km ? rankByKm(entries, measure) : rankByMeasure(entries, measure);
  const unit = t(CATEGORY_UNIT_LABEL_KEYS[category]);
  const shown = (e: ScopeCompetitionEntry) =>
    km
      ? formatKm(measure === 'avg' ? e.kmPerMember : e.totalKm)
      : (measure === 'avg' ? perMember(e) : e.totalScore).toLocaleString('he-IL');
  const rowUnit = km
    ? measure === 'avg' ? t('leagues.scopes.unit.kmPerMember') : t('leagues.scopes.unit.km')
    : measure === 'avg' ? t('leagues.scopes.unit.perMember', { unit }) : unit;
  const rowSub = (e: ScopeCompetitionEntry) =>
    [
      t('leagues.scopes.active', { n: e.activeMemberCount, count: String(e.activeMemberCount) }),
      // v2: km next to the points (the km board shows them as the value).
      v2 && !km && (e.totalKm ?? 0) > 0 ? t('leagues.scopes.km', { km: formatKm(e.totalKm) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const top3 = ranked.slice(0, 3);
  const podium: [PodiumEntry, PodiumEntry, PodiumEntry] | null =
    top3.length === 3
      ? (top3.map((e) => ({
          key: e.scopeId,
          name: e.scopeName,
          value: shown(e),
          // the full unit lives on the rows + the note; the pedestal keeps just the number
          sub:
            v2 && !km && (e.totalKm ?? 0) > 0
              ? t('leagues.scopes.podium.subKm', { count: String(e.activeMemberCount), km: formatKm(e.totalKm) })
              : t('leagues.scopes.podium.sub', { count: String(e.activeMemberCount) }),
        })) as [PodiumEntry, PodiumEntry, PodiumEntry])
      : null;

  return (
    <BoardCard
      title={t('leagues.scopes.title', { granularity })}
      subtitle={t('leagues.scopes.subtitle', { granularity, window: timeWindow })}
      actions={<BoardIconButton icon={RefreshCw} label={t('leagues.scopes.refresh')} onClick={fetch} spinning={isLoading} />}
    >
      {v2 && (
        <div className="mb-2.5">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`flex h-9 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-extrabold transition-colors ${
              km ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
            }`}
          >
            <SlidersHorizontal size={14} strokeWidth={2.6} className="shrink-0" aria-hidden />
            <span className="truncate">{km ? t('leagues.scopes.filtersKm') : t('leagues.scopes.filters')}</span>
            <ChevronDown size={14} strokeWidth={2.6} className={`shrink-0 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {filtersOpen && (
            <div className="mt-2 rounded-[18px] bg-v2-surface p-2.5 ring-1 ring-inset ring-v2-hairline">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 no-scrollbar" role="radiogroup" aria-label={t('leagues.scopes.metricLabel')}>
                {METRIC_CHIPS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={(metric ?? 'points') === c.id}
                    onClick={() => onMetricChange?.(c.id)}
                    className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-extrabold transition-colors ease-v2 ${
                      (metric ?? 'points') === c.id ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                    }`}
                  >
                    {t(c.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {onCategoryChange && !km && (
        <div className="-mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 no-scrollbar" role="radiogroup" aria-label={t('leagues.scopes.categoryLabel')}>
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
              {t(c.labelKey)}
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
              {t('leagues.scopes.retry')}
            </Button>
          }
        />
      ) : entries.length === 0 ? (
        km ? (
          <BoardMessage icon={Trophy} title={t('leagues.scopes.noKm.title')} body={t('leagues.scopes.noKm.body')} />
        ) : (
          <BoardMessage
            icon={Trophy}
            title={t('leagues.scopes.empty.title', { granularity })}
            body={t('leagues.scopes.empty.body', { granularity })}
          />
        )
      ) : (
        <>
        <div className="mb-2">
          <BoardToggle
            label={t('leagues.scopes.measureLabel')}
            value={measure}
            onChange={setMeasure}
            options={[
              { id: 'avg', label: t('leagues.scopes.measure.avg') },
              { id: 'total', label: t('leagues.scopes.measure.total') },
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
              sub={rowSub(entry)}
              value={shown(entry)}
              unit={rowUnit}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] font-bold leading-snug text-v2-muted">
          {km
            ? t('leagues.scopes.note.km')
            : measure === 'avg'
            ? t('leagues.scopes.note.avg')
            : t('leagues.scopes.note.total')}
        </p>
        </>
      )}
    </BoardCard>
  );
}
