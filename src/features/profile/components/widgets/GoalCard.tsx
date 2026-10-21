'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import MiniSparkline from './MiniSparkline';
import { getExerciseTrend } from '@/features/workout-engine/services/exercise-history.service';
import type { LevelGoal } from '@/types/workout';
import { useUiGender } from '@/hooks/useUiGender';
import { pickGendered } from '@/lib/i18n/gender-copy';

/** Empty graph hint, two lines (gender copy, decisions 1 + 21.10.2026). */
const GRAPH_HINT_LINE1 = { male: 'התחל אימון', female: 'התחילי אימון', other: 'אחרי האימון' };
const GRAPH_HINT_LINE2 = { male: 'לראות גרף', female: 'לראות גרף', other: 'יופיע כאן גרף' };

interface GoalCardProps {
  goal: LevelGoal;
  userId: string;
  /** If true, no admin target was set — rendered in "history mode" without a target fraction */
  isFallback?: boolean;
  /** Navigate to ExerciseAnalyticsPage */
  onClick?: () => void;
  /** Home v2 (enable_home_v2) look. */
  v2?: boolean;
}

/**
 * Square card (~w-40) showing one target exercise.
 * Tapping it navigates to the Exercise Analytics page.
 */
export default function GoalCard({ goal, userId, isFallback = false, onClick, v2 = false }: GoalCardProps) {
  const gender = useUiGender();
  const [maxRepsHistory, setMaxRepsHistory] = useState<number[]>([]);
  const [latestReps, setLatestReps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !goal.exerciseId) {
      setLoading(false);
      return;
    }
    getExerciseTrend(userId, goal.exerciseId, 8)
      .then((sessions) => {
        const reps = sessions.map((s) => s.maxReps ?? 0);
        setMaxRepsHistory(reps);
        setLatestReps(reps.length > 0 ? reps[reps.length - 1] : null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, goal.exerciseId]);

  const target = goal.targetValue;
  const fraction = !isFallback && latestReps != null ? Math.min(1, latestReps / target) : 0;
  const pct = Math.round(fraction * 100);

  if (v2) {
    const unitHe = goal.unit === 'seconds' ? 'שנ׳' : 'חזרות';
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-40 flex-shrink-0 flex-col gap-2 rounded-[20px] bg-white p-3.5 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <div className="flex items-start justify-between gap-1">
          <p className="flex-1 truncate text-right text-[14px] font-extrabold text-v2-ink" title={goal.exerciseName}>
            {goal.exerciseName}
          </p>
          {onClick && <ChevronLeft className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-v2-muted" aria-hidden />}
        </div>

        <div className="flex items-baseline justify-start gap-1 whitespace-nowrap">
          {loading ? (
            <span className="animate-pulse text-[26px] font-black leading-none text-v2-hairline">—</span>
          ) : (
            <>
              <span className="text-[12px] font-bold text-v2-muted">{unitHe}</span>
              <span dir="ltr" className="text-[26px] font-black leading-none text-v2-ink tabular-nums !tracking-[-0.02em]">
                {isFallback ? (latestReps ?? '—') : (latestReps ?? 0)}
                {!isFallback && <span className="text-[15px] font-extrabold text-v2-muted"> / {target}</span>}
              </span>
            </>
          )}
        </div>

        {!isFallback && (
          <div className="h-1.5 overflow-hidden rounded-full bg-v2-hairline">
            <div
              className="h-full rounded-full bg-v2-accent transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {loading ? (
          <div className="h-[60px] animate-pulse rounded-v2-tile bg-v2-surface" />
        ) : maxRepsHistory.length >= 2 ? (
          <MiniSparkline data={maxRepsHistory} color="#00baf7" />
        ) : (
          <div className="flex h-[60px] items-center justify-center">
            <span className="text-center text-[12px] font-bold leading-snug text-v2-muted">
              {pickGendered(gender, GRAPH_HINT_LINE1)}
              <br />
              {pickGendered(gender, GRAPH_HINT_LINE2)}
            </span>
          </div>
        )}

        {!isFallback && (
          <p className="text-center text-[11px] font-extrabold text-v2-deep">+150 XP בהשלמה</p>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-40 flex-shrink-0 bg-white rounded-2xl p-3 shadow-sm border border-gray-100
                 flex flex-col gap-2 text-start active:scale-95 transition-transform"
    >
      {/* Header: exercise name + chevron */}
      <div className="flex items-start justify-between gap-1">
        <p
          className="text-xs font-bold text-gray-800 leading-tight line-clamp-2 flex-1 text-right"
          title={goal.exerciseName}
        >
          {goal.exerciseName}
        </p>
        {onClick && (
          <ChevronLeft className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
        )}
      </div>

      {/* Reps fraction (hidden in fallback mode) */}
      {!isFallback && (
        <div className="flex items-baseline gap-1 justify-end" dir="ltr">
          {loading ? (
            <span className="text-lg font-black text-gray-300 animate-pulse">—</span>
          ) : (
            <>
              <span className="text-lg font-black text-gray-900 tabular-nums">
                {latestReps ?? 0}
              </span>
              <span className="text-[10px] font-bold text-gray-400">/ {target}</span>
            </>
          )}
        </div>
      )}

      {/* Fallback mode: show latest reps with no target */}
      {isFallback && (
        <div className="flex items-baseline gap-1 justify-end" dir="ltr">
          {loading ? (
            <span className="text-lg font-black text-gray-300 animate-pulse">—</span>
          ) : (
            <span className="text-lg font-black text-gray-900 tabular-nums">
              {latestReps ?? '—'}
              <span className="text-[10px] font-bold text-gray-400 ms-1">חזרות</span>
            </span>
          )}
        </div>
      )}

      {/* Progress bar (only for goal mode) */}
      {!isFallback && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-l from-[#00ADEF] to-[#5BC2F2] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Sparkline */}
      {loading ? (
        <div className="h-[60px] animate-pulse bg-gray-50 rounded-lg" />
      ) : maxRepsHistory.length >= 2 ? (
        <MiniSparkline data={maxRepsHistory} color="#00ADEF" />
      ) : (
        <div className="h-[60px] flex items-center justify-center">
          <span className="text-[10px] text-gray-400 text-center leading-snug">
            {pickGendered(gender, GRAPH_HINT_LINE1)}
            <br />
            {pickGendered(gender, GRAPH_HINT_LINE2)}
          </span>
        </div>
      )}

      {/* XP reward — only meaningful in goal mode (real target exists) */}
      {!isFallback && (
        <p className="text-[10px] font-bold text-amber-500 text-center mt-1">
          +150 XP בהשלמה
        </p>
      )}
    </button>
  );
}
