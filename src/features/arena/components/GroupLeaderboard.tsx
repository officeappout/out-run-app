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
import { RefreshCw } from 'lucide-react';
import {
  getGroupCompetitionLeaderboard,
  type GroupCompetitionEntry,
  type GroupCompetitionResult,
} from '@/features/arena/services/ranking.service';
import type { LeaderboardTimeWindow } from '@/features/arena/services/ranking.service';

// Brand palette (screens mockup, 16.08.2026).
const ACCENT = '#10B981';
const GOLD = '#f4b400';

interface GroupLeaderboardProps {
  scope: 'city' | 'school' | 'global';
  /** null is valid for scope='global' (no city/school constraint). */
  scopeId: string | null;
  timeWindow?: LeaderboardTimeWindow;
}

function initialsOf(name: string): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function GroupRowSkeleton() {
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

export default function GroupLeaderboard({
  scope,
  scopeId,
  timeWindow = 'weekly',
}: GroupLeaderboardProps) {
  const [result, setResult] = useState<GroupCompetitionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (scope !== 'global' && !scopeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getGroupCompetitionLeaderboard({ scope, scopeId, timeWindow });
      setResult(data);
    } catch (err) {
      console.error('[GroupLeaderboard]', err);
      setError('שגיאה בטעינת הדירוג');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [scope, scopeId, timeWindow]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="space-y-2" dir="rtl">
        <div className="flex items-center justify-between px-1 pb-1">
          <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <GroupRowSkeleton key={i} />
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
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center rounded-2xl bg-white"
        dir="rtl"
        style={{ border: '0.5px solid #E5E7EB' }}
      >
        <span className="text-3xl mb-3">🏆</span>
        <p className="text-sm font-bold text-gray-900">אין עדיין קבוצות בתחרות</p>
        <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
          כשחברי קהילה יסיימו אימונים כחלק מקבוצה, היא תופיע כאן
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      {/* Header row */}
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-bold text-gray-500">קבוצות • {timeWindow === 'daily' ? 'יומי' : timeWindow === 'weekly' ? 'שבועי' : 'חודשי'}</span>
        <button
          onClick={fetch}
          className="p-1 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
          aria-label="רענן"
        >
          <RefreshCw className="w-3 h-3 text-gray-400" />
        </button>
      </div>

      {entries.map((entry) => (
        <GroupRow key={entry.groupId} entry={entry} />
      ))}
    </div>
  );
}

function GroupRow({ entry }: { entry: GroupCompetitionEntry }) {
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

      {/* Group initials avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black text-white"
        style={{ backgroundColor: ACCENT }}
        aria-hidden
      >
        {initialsOf(entry.groupName)}
      </div>

      {/* Name + member count */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-gray-900 truncate">{entry.groupName}</p>
        <p className="text-[11px] text-gray-500 font-medium">
          {entry.activeMemberCount} פעיל{entry.activeMemberCount !== 1 ? 'ים' : ''}
        </p>
      </div>

      {/* Avg score */}
      <div className="text-left flex-shrink-0">
        <p
          className="text-sm font-black tabular-nums"
          style={{ color: ACCENT }}
        >
          {entry.avgScore.toLocaleString('he-IL')}
        </p>
        <p className="text-[10px] text-gray-400 text-left">ממוצע</p>
      </div>
    </div>
  );
}
