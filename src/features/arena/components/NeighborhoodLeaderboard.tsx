'use client';

import React, { useState, useCallback } from 'react';
import { Trophy, Share2, RefreshCw, Lock } from 'lucide-react';
import { useLeaderboard } from '@/features/arena/hooks/useLeaderboard';
import { useUserStore } from '@/features/user';
import type {
  LeaderboardScope,
  LeaderboardCategory,
  LeaderboardTimeWindow,
} from '@/features/arena/services/ranking.service';

const CATEGORIES: { value: LeaderboardCategory; label: string }[] = [
  { value: 'overall', label: 'כללי' },
  { value: 'cardio', label: 'ריצה' },
  { value: 'strength', label: 'כוח' },
];

const TIME_WINDOWS: { value: LeaderboardTimeWindow; label: string }[] = [
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
];

type AgeFilter = 'all' | 'minor' | 'adult';

const AGE_FILTERS: { value: AgeFilter; label: string }[] = [
  { value: 'all', label: 'כולם' },
  { value: 'minor', label: 'נוער' },
  { value: 'adult', label: 'מבוגרים' },
];

interface NeighborhoodLeaderboardProps {
  scope: LeaderboardScope;
  scopeId: string | null;
  scopeLabel?: string;
  /** When false, rows 4+ are blurred with a CTA overlay */
  isLeagueActive?: boolean;
  /** Global tab — shows age filters, no scope restriction */
  isGlobal?: boolean;
  /** Current user's age group — for default filter */
  ageGroup?: 'minor' | 'adult';
}

export default function NeighborhoodLeaderboard({
  scope,
  scopeId,
  scopeLabel,
  isLeagueActive = true,
  isGlobal = false,
  ageGroup,
}: NeighborhoodLeaderboardProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('overall');
  const [timeWindow, setTimeWindow] = useState<LeaderboardTimeWindow>('weekly');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');

  const getSocialUnlocked = useUserStore((s) => s.getSocialUnlocked);
  const socialUnlocked = getSocialUnlocked();

  const shouldBlur = !isLeagueActive || !socialUnlocked;

  const { entries, myEntry, isLoading, refresh } = useLeaderboard({
    scope,
    scopeId,
    category,
    timeWindow,
  });

  const handleShare = useCallback(() => {
    if (!myEntry) return;
    const scopeName = scopeLabel || 'הליגה';
    const windowHe = timeWindow === 'weekly' ? 'השבוע' : 'החודש';
    const text = `אני במקום #${myEntry.rank} ב${scopeName} ${windowHe} על Out! 🔥`;

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }, [myEntry, scopeLabel, timeWindow]);

  return (
    <section dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 px-1 mb-3">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {isGlobal ? 'דירוג ארצי' : 'טבלת דירוג'}
        </h4>
        <button
          onClick={refresh}
          className="mr-auto p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="רענון"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Age filters — only on Global tab */}
      {isGlobal && (
        <div className="flex gap-2 mb-3">
          {AGE_FILTERS.map((af) => (
            <button
              key={af.value}
              onClick={() => setAgeFilter(af.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                ageFilter === af.value
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {af.label}
            </button>
          ))}
        </div>
      )}

      {/* Time window toggle */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1 mb-3">
        {TIME_WINDOWS.map((tw) => (
          <button
            key={tw.value}
            onClick={() => setTimeWindow(tw.value)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              timeWindow === tw.value
                ? 'bg-white dark:bg-gray-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {tw.label}
          </button>
        ))}
      </div>

      {/* Category pills */}
      <div className="flex gap-2 mb-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              category === cat.value
                ? 'bg-cyan-500 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden relative">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-gray-500 animate-pulse">טוען דירוג...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <span className="text-2xl mb-2">🏋️</span>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              עוד אין נתונים
            </p>
            <p className="text-xs text-gray-500 mt-1">
              התחילו להתאמן כדי להופיע בטבלה!
            </p>
          </div>
        ) : (
          <>
            {entries.map((entry, idx) => {
              const isBlurredRow = shouldBlur && idx >= 3;

              return (
                <div
                  key={entry.uid}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    idx !== entries.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : ''
                  } ${entry.isCurrentUser ? 'bg-cyan-50/60 dark:bg-cyan-900/20' : ''} ${
                    isBlurredRow ? 'blur-[6px] select-none pointer-events-none' : ''
                  }`}
                >
                  {/* Rank */}
                  <span className={`w-6 text-center text-sm font-black tabular-nums ${
                    entry.rank === 1 ? 'text-amber-500' :
                    entry.rank === 2 ? 'text-gray-400' :
                    entry.rank === 3 ? 'text-amber-700' : 'text-gray-500'
                  }`}>
                    {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                  </span>

                  {/* Avatar initial */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                    entry.isCurrentUser
                      ? 'bg-cyan-100 dark:bg-cyan-800 text-cyan-700 dark:text-cyan-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {entry.name.charAt(0)}
                  </div>

                  {/* Name + workout count */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate block">
                      {entry.name}
                      {entry.isCurrentUser && (
                        <span className="text-[10px] font-medium text-cyan-500 mr-1">(את/ה)</span>
                      )}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {entry.workoutCount} אימונים
                    </span>
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-1 min-w-[52px] justify-end">
                    <span className="text-xs">⭐</span>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                      {entry.totalCredit.toLocaleString('he-IL')}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Blur overlay CTA — appears when rows 4+ are blurred */}
            {shouldBlur && entries.length > 3 && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-slate-900 dark:via-slate-900/95 px-5 py-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                    הטבלה נעולה
                  </p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed max-w-[260px] mx-auto">
                  {!socialUnlocked
                    ? 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה'
                    : 'לחץ על העירייה כדי לפתוח את הליגה הרשמית'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Personal rank footer */}
      {myEntry && !isLoading && (
        <div className="mt-3 bg-gradient-to-l from-cyan-50 to-blue-50 dark:from-cyan-900/30 dark:to-blue-900/20 rounded-2xl border border-cyan-200/50 dark:border-cyan-700/30 px-4 py-3 flex items-center gap-3">
          <span className="text-lg font-black text-cyan-600 dark:text-cyan-400 tabular-nums min-w-[28px] text-center">
            #{myEntry.rank}
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {myEntry.name}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {myEntry.totalCredit.toLocaleString('he-IL')} קרדיט פעילות
            </p>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-transform"
          >
            <Share2 className="w-3.5 h-3.5" />
            שתף דירוג
          </button>
        </div>
      )}
    </section>
  );
}
