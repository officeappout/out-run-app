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
import { RefreshCw } from 'lucide-react';
import {
  getScopeCompetitionLeaderboard,
  type ScopeCompetitionEntry,
  type ScopeCompetitionResult,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow, LeaderboardCategory } from '@/features/arena/services/ranking.service';
import { CATEGORY_UNIT_LABEL } from './scope-category-unit-label';

// Brand palette (screens mockup, 16.08.2026).
const ACCENT = '#10B981';
const GOLD = '#f4b400';

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

function initialsOf(name: string): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function ScopeRowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3"
      style={{ border: '0.5px solid #E5E7EB' }}
    >
      <div className="w-7 h-7 rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
      <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3 rounded bg-gray-200 animate-pulse" style={{ width: '55%' }} />
        <div className="h-2 rounded bg-gray-100 animate-pulse" style={{ width: '30%' }} />
      </div>
      <div className="h-4 w-10 rounded bg-gray-200 animate-pulse" />
    </div>
  );
}

export default function ScopeCompetitionLeaderboard({
  granularity,
  timeWindow = 'weekly',
  cityAuthorityId = null,
  category = 'overall',
}: ScopeCompetitionLeaderboardProps) {
  const [result, setResult] = useState<ScopeCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getScopeCompetitionLeaderboard({ granularity, timeWindow, cityAuthorityId, category });
      setResult(data);
    } catch (err) {
      console.error('[ScopeCompetitionLeaderboard]', err);
      setError('שגיאה בטעינת הדירוג');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [granularity, timeWindow, cityAuthorityId, category]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="space-y-2" dir="rtl">
        <div className="flex items-center justify-between px-1 pb-1">
          <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <ScopeRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-10 gap-2 text-center" dir="rtl">
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={fetch}
          className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700"
        >
          <RefreshCw className="w-3 h-3" />
          נסה שוב
        </button>
      </div>
    );
  }

  const entries = result?.entries ?? [];

  if (entries.length === 0) {
    const copy = EMPTY_STATE_COPY[granularity];
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-white"
        dir="rtl"
        style={{ border: '0.5px solid #E5E7EB' }}
      >
        <span className="text-3xl mb-3">🏆</span>
        <p className="text-sm font-bold text-gray-900">{copy.title}</p>
        <p className="text-xs text-gray-500 mt-1 max-w-[240px]">{copy.subtitle}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      {/* Header row */}
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-bold text-gray-500">
          {GRANULARITY_LABEL[granularity]} • {timeWindow === 'daily' ? 'יומי' : timeWindow === 'weekly' ? 'שבועי' : 'חודשי'}
        </span>
        <button
          onClick={fetch}
          className="p-1 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
          aria-label="רענן"
        >
          <RefreshCw className="w-3 h-3 text-gray-400" />
        </button>
      </div>

      {/* Podium — top 3 scopes as a visual highlight (mockup). The full
          ranked list below still includes ranks 1-3 again (matches the
          mockup exactly: the podium previews the standings, the list is
          the complete standings, not "rest after the podium" like the
          Individuals tab's podium+rows split). */}
      <ScopePodium entries={entries.slice(0, 3)} />

      {entries.map((entry) => (
        <ScopeRow key={entry.scopeId} entry={entry} category={category} />
      ))}
    </div>
  );
}

const PODIUM_CONFIG: Record<1 | 2 | 3, { avatar: number; pedestal: number; medal: string }> = {
  1: { avatar: 74, pedestal: 94, medal: '🥇' },
  2: { avatar: 60, pedestal: 68, medal: '🥈' },
  3: { avatar: 56, pedestal: 50, medal: '🥉' },
};

function ScopePodium({ entries }: { entries: ScopeCompetitionEntry[] }) {
  if (entries.length === 0) return null;
  const byRank = (rank: 1 | 2 | 3) => entries.find((e) => e.rank === rank) ?? null;
  return (
    <div className="flex items-end justify-center gap-2.5 py-2" dir="rtl">
      <ScopePodiumColumn entry={byRank(2)} rank={2} />
      <ScopePodiumColumn entry={byRank(1)} rank={1} />
      <ScopePodiumColumn entry={byRank(3)} rank={3} />
    </div>
  );
}

function ScopePodiumColumn({ entry, rank }: { entry: ScopeCompetitionEntry | null; rank: 1 | 2 | 3 }) {
  const cfg = PODIUM_CONFIG[rank];
  const elevated = rank === 1;

  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-end gap-1 w-1/3">
        <div
          className="rounded-full border-2 border-dashed border-gray-300 bg-gray-50/70"
          style={{ width: cfg.avatar, height: cfg.avatar }}
        />
        <div
          className="w-full rounded-t-xl border-2 border-dashed border-gray-200 bg-gray-50/50 mt-1"
          style={{ height: cfg.pedestal }}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-end gap-1 w-1/3 ${elevated ? '-mt-2' : ''}`}>
      <span className={elevated ? 'text-xl leading-none' : 'text-base leading-none'}>{cfg.medal}</span>
      <div
        className="rounded-full flex items-center justify-center text-white font-black"
        style={{
          width: cfg.avatar,
          height: cfg.avatar,
          background: ACCENT,
          fontSize: elevated ? 26 : 20,
          border: elevated ? `3px solid ${GOLD}` : undefined,
          boxShadow: '0 4px 12px rgba(15,23,42,0.18)',
        }}
      >
        {initialsOf(entry.scopeName)}
      </div>
      <span className="text-xs font-black text-gray-900 truncate max-w-[84px] text-center mt-0.5">
        {entry.scopeName}
      </span>
      <span className="text-[11px] font-black tabular-nums leading-none" style={{ color: ACCENT }}>
        {entry.totalScore.toLocaleString('he-IL')}
      </span>
      <div
        className="w-full rounded-t-xl relative overflow-hidden mt-1 shadow-[0_4px_10px_rgba(20,124,92,0.25)]"
        style={{ height: cfg.pedestal, background: 'linear-gradient(180deg, #38b487 0%, #2f9e78 100%)' }}
      >
        <div className="absolute top-0 inset-x-0 h-1.5 bg-white/30" />
        <span className="absolute inset-0 flex items-center justify-center text-white font-black text-lg opacity-90 tabular-nums">
          {rank}
        </span>
      </div>
    </div>
  );
}

function ScopeRow({ entry, category }: { entry: ScopeCompetitionEntry; category: LeaderboardCategory }) {
  const isFirst = entry.rank === 1;

  return (
    <div
      className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3"
      style={{
        border: isFirst ? `1.5px solid ${GOLD}` : '0.5px solid #E5E7EB',
        boxShadow: isFirst ? `0 0 0 2px rgba(245,158,11,0.15)` : undefined,
      }}
    >
      {/* Rank badge */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black tabular-nums"
        style={{
          backgroundColor: isFirst ? GOLD : '#F3F4F6',
          color: isFirst ? '#fff' : '#6B7280',
        }}
      >
        {isFirst ? '🥇' : `#${entry.rank}`}
      </div>

      {/* Scope initials avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black text-white"
        style={{ backgroundColor: ACCENT }}
        aria-hidden
      >
        {initialsOf(entry.scopeName)}
      </div>

      {/* Name + member count */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900 truncate">{entry.scopeName}</p>
        <p className="text-[11px] text-gray-500 font-medium">
          {entry.activeMemberCount} פעיל{entry.activeMemberCount !== 1 ? 'ים' : ''}
        </p>
      </div>

      {/* Total score. Label is metric-qualified, never a bare "נקודות" —
          getScopeCompetitionLeaderboard sums activityCredit filtered by
          `category` (pre-launch backend task), so a selected metric shows
          its own honest label ("נק' כוח" / "נק' ריצה") instead of the
          generic 'overall' fallback ("נק' פעילות"), same "נק' X" convention
          as the Individuals podium (Stage A). */}
      <div className="text-left flex-shrink-0">
        <p
          className="text-sm font-black tabular-nums"
          style={{ color: ACCENT }}
        >
          {entry.totalScore.toLocaleString('he-IL')}
        </p>
        <p className="text-[10px] text-gray-400 text-left">{CATEGORY_UNIT_LABEL[category]}</p>
      </div>
    </div>
  );
}
