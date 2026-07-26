"use client";

/**
 * PostWorkoutSummaryStrip — POST_WORKOUT_LANDING_V1 (Block A).
 *
 * Compact, NON-blocking post-workout recap that sits at the TOP of the home
 * screen (above the schedule), taking the "now" carousel slot after a workout
 * finishes. Models the "עוגן R — שני מצבים" mockup `.summary` block: indigo
 * gradient card + strength-goal ring + praise + a partial/full state line + a
 * stats row (duration · #exercises · ~kcal) + an X to dismiss (per-day).
 *
 * The ring reads the STABLE daily strength target (setsCompleted / targetSets),
 * NOT HOME_DAILY_GOAL_V1's shrinking ⅔ target — single source of truth.
 * The detailed summary stays a drill-in; this strip never expands in place.
 * Palette + dims are taken verbatim from the mockup (indigo #6366F1 / #4338CA,
 * gradient #EEF0FF→#F5F3FF, border #DDD9FB, radius 18, ring 46px).
 */

import React from 'react';
import { Clock, Dumbbell, Flame, X } from 'lucide-react';
import CircularProgress from '@/components/CircularProgress';

const WORKOUT_LABEL: Record<string, string> = {
  strength: 'אימון כוח',
  running: 'אימון אירובי',
  walking: 'אימון אירובי',
  cycling: 'אימון אירובי',
  hybrid: 'אימון משולב',
};

export interface PostWorkoutSummaryStripProps {
  /** Workout type → praise label ("סיימת אימון כוח"). */
  workoutType?: string;
  /** 0..1 — completedSets / STABLE daily target. Drives the ring + full/partial copy. */
  ringPct: number;
  durationMinutes: number;
  exerciseCount?: number;
  calories?: number;
  /** X dismiss — non-blocking, per-day (handled by the caller). */
  onDismiss: () => void;
}

export function PostWorkoutSummaryStrip({
  workoutType,
  ringPct,
  durationMinutes,
  exerciseCount,
  calories,
  onDismiss,
}: PostWorkoutSummaryStripProps) {
  const pct = Math.max(0, Math.min(1, ringPct));
  const full = pct >= 1;
  const label = WORKOUT_LABEL[workoutType ?? ''] ?? 'אימון';

  return (
    <div
      dir="rtl"
      className="relative flex items-center gap-3 rounded-[18px] px-4 py-3 border shadow-sm"
      style={{ background: 'linear-gradient(135deg, #EEF0FF, #F5F3FF)', borderColor: '#DDD9FB' }}
    >
      {/* Ring — stable-target %, indigo per the mockup */}
      <CircularProgress
        percentage={Math.round(pct * 100)}
        size={46}
        strokeWidth={5}
        colorClass="text-[#6366F1]"
        trackClass="text-[#E3E1F7]"
        className="flex-none"
      >
        <span className="text-[12px] font-extrabold text-[#4338CA] leading-none">
          {Math.round(pct * 100)}
          <span className="text-[8px] font-bold">%</span>
        </span>
      </CircularProgress>

      {/* Text block */}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-extrabold text-gray-900 truncate">
          {full ? 'כל הכבוד! סגרת את היעד 💪' : `כל הכבוד! סיימת ${label} 💪`}
        </div>
        <div className="text-[11.5px] text-gray-500">
          {full ? 'יעד היום נסגר — מצב התאוששות 🎉' : 'נשאר קצת לסגור'}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] font-bold text-[#4338CA]">
          {durationMinutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={13} />
              {durationMinutes} דק׳
            </span>
          )}
          {exerciseCount != null && exerciseCount > 0 && (
            <span className="flex items-center gap-1">
              <Dumbbell size={13} />
              {exerciseCount} תרגילים
            </span>
          )}
          {calories != null && calories > 0 && (
            <span className="flex items-center gap-1">
              <Flame size={13} />~{Math.round(calories)} קק"ל
            </span>
          )}
        </div>
      </div>

      {/* X dismiss — non-blocking (per-day key handled by the caller) */}
      <button
        onClick={onDismiss}
        aria-label="סגור"
        className="absolute top-2 left-2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-black/5 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default PostWorkoutSummaryStrip;
