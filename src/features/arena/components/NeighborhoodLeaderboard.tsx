'use client';

import React, { useState, useCallback } from 'react';
import { Trophy, Share2, RefreshCw, Lock, Medal, Flame } from 'lucide-react';
import { useLeaderboard } from '@/features/arena/hooks/useLeaderboard';
import { useUserStore } from '@/features/user';
import type {
  LeaderboardScope,
  LeaderboardCategory,
  LeaderboardTimeWindow,
} from '@/features/arena/services/ranking.service';

const CATEGORIES: { value: LeaderboardCategory; label: string; icon: string }[] = [
  { value: 'overall', label: 'כללי', icon: '🏆' },
  { value: 'cardio', label: 'ריצה', icon: '🏃' },
  { value: 'strength', label: 'כוח', icon: '💪' },
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

const PODIUM_STYLES = [
  { ring: 'ring-amber-400', bg: 'bg-gradient-to-br from-amber-400 to-yellow-500', text: 'text-amber-600', shadow: 'shadow-amber-400/30', size: 'w-14 h-14', medal: '🥇' },
  { ring: 'ring-gray-300', bg: 'bg-gradient-to-br from-gray-300 to-slate-400', text: 'text-gray-500', shadow: 'shadow-gray-300/30', size: 'w-11 h-11', medal: '🥈' },
  { ring: 'ring-amber-600', bg: 'bg-gradient-to-br from-amber-600 to-orange-700', text: 'text-amber-700', shadow: 'shadow-amber-600/20', size: 'w-11 h-11', medal: '🥉' },
];

interface NeighborhoodLeaderboardProps {
  scope: LeaderboardScope;
  scopeId: string | null;
  scopeLabel?: string;
  isLeagueActive?: boolean;
  isGlobal?: boolean;
  ageGroup?: 'minor' | 'adult';
}

export default function NeighborhoodLeaderboard({
  scope,
  scopeId,
  scopeLabel,
  isLeagueActive = true,
  isGlobal = false,
}: NeighborhoodLeaderboardProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('overall');
  const [timeWindow, setTimeWindow] = useState<LeaderboardTimeWindow>('weekly');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');

  const getSocialUnlocked = useUserStore((s) => s.getSocialUnlocked);
  const socialUnlocked = getSocialUnlocked();
  const shouldBlur = !isLeagueActive || !socialUnlocked;

  const { entries, myEntry, isLoading, refresh } = useLeaderboard({
    scope, scopeId, category, timeWindow,
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

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <section dir="rtl">
      {/* League card container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-black/5 dark:shadow-black/20 overflow-hidden">

        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white">
                  {isGlobal ? 'דירוג ארצי' : 'ליגת העיר'}
                </h4>
                <p className="text-[10px] text-gray-400 font-medium">
                  {scopeLabel ? `${scopeLabel}` : 'טבלת דירוג'}
                </p>
              </div>
            </div>
            <button
              onClick={refresh}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="רענון"
            >
              <RefreshCw className={`w-4 h-4 text-gray-300 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Time window toggle */}
          <div className="flex bg-white/10 rounded-xl p-1 gap-1 mb-3">
            {TIME_WINDOWS.map((tw) => (
              <button
                key={tw.value}
                onClick={() => setTimeWindow(tw.value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeWindow === tw.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tw.label}
              </button>
            ))}
          </div>

          {/* Category pills */}
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  category === cat.value
                    ? 'bg-amber-400 text-gray-900 shadow-md shadow-amber-400/30'
                    : 'bg-white/10 text-gray-400 hover:bg-white/15 hover:text-gray-200'
                }`}
              >
                <span className="text-sm">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>

          {/* Age filters — only on Global tab */}
          {isGlobal && (
            <div className="flex gap-2 mt-3">
              {AGE_FILTERS.map((af) => (
                <button
                  key={af.value}
                  onClick={() => setAgeFilter(af.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    ageFilter === af.value
                      ? 'bg-cyan-400 text-gray-900 shadow-sm'
                      : 'bg-white/10 text-gray-400 hover:bg-white/15'
                  }`}
                >
                  {af.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Podium — top 3 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-14">
            <div className="flex items-center gap-2 text-sm text-gray-400 animate-pulse">
              <Flame className="w-4 h-4" />
              טוען דירוג...
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Medal className="w-6 h-6 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="text-sm font-black text-gray-900 dark:text-gray-100">עוד אין נתונים</p>
            <p className="text-xs text-gray-400 mt-1">התחילו להתאמן כדי להופיע בטבלה!</p>
          </div>
        ) : (
          <>
            {/* Podium row */}
            {top3.length > 0 && (
              <div className="flex items-end justify-center gap-3 px-5 pt-6 pb-4">
                {/* 2nd place — left */}
                {top3[1] && (
                  <div className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`${PODIUM_STYLES[1].size} rounded-full ${PODIUM_STYLES[1].bg} flex items-center justify-center text-white text-sm font-black ring-2 ${PODIUM_STYLES[1].ring} shadow-lg ${PODIUM_STYLES[1].shadow}`}>
                      {top3[1].name.charAt(0)}
                    </div>
                    <span className="text-xs">{PODIUM_STYLES[1].medal}</span>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate max-w-[80px] text-center">{top3[1].name}</span>
                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">{top3[1].totalCredit.toLocaleString('he-IL')}</span>
                  </div>
                )}
                {/* 1st place — center (elevated) */}
                {top3[0] && (
                  <div className="flex flex-col items-center gap-1.5 flex-1 -mt-4">
                    <div className={`${PODIUM_STYLES[0].size} rounded-full ${PODIUM_STYLES[0].bg} flex items-center justify-center text-white text-lg font-black ring-3 ${PODIUM_STYLES[0].ring} shadow-xl ${PODIUM_STYLES[0].shadow}`}>
                      {top3[0].name.charAt(0)}
                    </div>
                    <span className="text-lg">{PODIUM_STYLES[0].medal}</span>
                    <span className="text-xs font-black text-gray-900 dark:text-gray-100 truncate max-w-[90px] text-center">{top3[0].name}</span>
                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 tabular-nums">{top3[0].totalCredit.toLocaleString('he-IL')}</span>
                  </div>
                )}
                {/* 3rd place — right */}
                {top3[2] && (
                  <div className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`${PODIUM_STYLES[2].size} rounded-full ${PODIUM_STYLES[2].bg} flex items-center justify-center text-white text-sm font-black ring-2 ${PODIUM_STYLES[2].ring} shadow-lg ${PODIUM_STYLES[2].shadow}`}>
                      {top3[2].name.charAt(0)}
                    </div>
                    <span className="text-xs">{PODIUM_STYLES[2].medal}</span>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate max-w-[80px] text-center">{top3[2].name}</span>
                    <span className="text-[10px] font-bold text-gray-400 tabular-nums">{top3[2].totalCredit.toLocaleString('he-IL')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Remaining rows (4+) */}
            {rest.length > 0 && (
              <div className="relative">
                <div className="border-t border-gray-100 dark:border-gray-800">
                  {rest.map((entry, idx) => {
                    const isBlurredRow = shouldBlur;
                    return (
                      <div
                        key={entry.uid}
                        className={`flex items-center gap-3 px-5 py-3 ${
                          idx !== rest.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/60' : ''
                        } ${entry.isCurrentUser ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''} ${
                          isBlurredRow ? 'blur-[6px] select-none pointer-events-none' : ''
                        }`}
                      >
                        <span className="w-7 text-center text-sm font-black text-gray-400 dark:text-gray-500 tabular-nums">
                          {entry.rank}
                        </span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                          entry.isCurrentUser
                            ? 'bg-cyan-100 dark:bg-cyan-800 text-cyan-700 dark:text-cyan-300 ring-2 ring-cyan-400/30'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}>
                          {entry.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate block">
                            {entry.name}
                            {entry.isCurrentUser && (
                              <span className="text-[10px] font-medium text-cyan-500 mr-1">(את/ה)</span>
                            )}
                          </span>
                          <span className="text-[10px] text-gray-400">{entry.workoutCount} אימונים</span>
                        </div>
                        <span className="text-xs font-black text-gray-600 dark:text-gray-300 tabular-nums">
                          {entry.totalCredit.toLocaleString('he-IL')}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {shouldBlur && (
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-slate-900 dark:via-slate-900/95 flex flex-col items-center justify-center px-5 text-center">
                    <Lock className="w-5 h-5 text-amber-500 mb-2" />
                    <p className="text-sm font-black text-gray-900 dark:text-gray-100">הטבלה נעולה</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
                      {!socialUnlocked
                        ? 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה'
                        : 'לחץ על העירייה כדי לפתוח את הליגה הרשמית'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Personal rank footer */}
      {myEntry && !isLoading && (
        <div className="mt-3 bg-gradient-to-l from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/15 rounded-2xl shadow-md shadow-cyan-500/5 px-5 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shadow-cyan-500/25">
            <span className="text-white text-sm font-black tabular-nums">#{myEntry.rank}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-gray-900 dark:text-gray-100">{myEntry.name}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              {myEntry.totalCredit.toLocaleString('he-IL')} קרדיט
            </p>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-black shadow-md active:scale-95 transition-transform"
          >
            <Share2 className="w-3.5 h-3.5" />
            שתף
          </button>
        </div>
      )}
    </section>
  );
}
