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
import type { LeaderboardTimeWindow } from '@/features/arena/services/ranking.service';

const ACCENT = '#1D9E75';
const GOLD = '#F59E0B';

export type ScopeCompetitionGranularity = 'city' | 'neighborhood';

interface ScopeCompetitionLeaderboardProps {
  granularity: ScopeCompetitionGranularity;
  timeWindow?: LeaderboardTimeWindow;
  /** Required when granularity === 'neighborhood' — neighborhoods compete
   * only within this city. Ignored for granularity === 'city'. */
  cityAuthorityId?: string | null;
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
}: ScopeCompetitionLeaderboardProps) {
  const [result, setResult] = useState<ScopeCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getScopeCompetitionLeaderboard({ granularity, timeWindow, cityAuthorityId });
      setResult(data);
    } catch (err) {
      console.error('[ScopeCompetitionLeaderboard]', err);
      setError('שגיאה בטעינת הדירוג');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [granularity, timeWindow, cityAuthorityId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {GRANULARITY_LABEL[granularity]} • {timeWindow === 'weekly' ? 'שבועי' : 'חודשי'}
        </span>
        <button
          onClick={fetch}
          className="p-1 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
          aria-label="רענן"
        >
          <RefreshCw className="w-3 h-3 text-gray-400" />
        </button>
      </div>

      {entries.map((entry) => (
        <ScopeRow key={entry.scopeId} entry={entry} />
      ))}
    </div>
  );
}

function ScopeRow({ entry }: { entry: ScopeCompetitionEntry }) {
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

      {/* Total score — mechanical patch only (avgScore -> totalScore) to keep
          this compiling after Stage D's total-not-average engine change;
          dynamic metric label + full row redesign is Stage E. */}
      <div className="text-left flex-shrink-0">
        <p
          className="text-sm font-black tabular-nums"
          style={{ color: ACCENT }}
        >
          {entry.totalScore.toLocaleString('he-IL')}
        </p>
        <p className="text-[10px] text-gray-400 text-left">סה&quot;כ</p>
      </div>
    </div>
  );
}
