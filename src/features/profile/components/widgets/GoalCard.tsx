'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import MiniSparkline from './MiniSparkline';
import { getExerciseTrend } from '@/features/workout-engine/services/exercise-history.service';
import type { LevelGoal } from '@/types/workout';

interface GoalCardProps {
  goal: LevelGoal;
  userId: string;
  /** If true, no admin target was set — rendered in "history mode" without a target fraction */
  isFallback?: boolean;
  /** Navigate to ExerciseAnalyticsPage */
  onClick?: () => void;
}

/**
 * Square card (~w-40) showing one target exercise.
 * Tapping it navigates to the Exercise Analytics page.
 */
export default function GoalCard({ goal, userId, isFallback = false, onClick }: GoalCardProps) {
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
            התחל אימון
            <br />
            לראות גרף
          </span>
        </div>
      )}
    </button>
  );
}
