'use client';

/**
 * WorkoutBlockCard — Single exercise block in the workout playlist.
 *
 * Layout (RTL):
 *  ┌─────────────────────────────────────────────┐
 *  │  תרגיל בודד              3x סבבים  ⓘ  ˅  │  ← header
 *  │ ┌──────────────────────────────────────────┐│
 *  │ │  Exercise Name          ┌───────┐       ││  ← exercise row
 *  │ │  10-15 חזרות            │ IMAGE │       ││
 *  │ │                         └───────┘       ││
 *  │ │  [סט 1] [סט 2] [15 חזרות]              ││  ← set pills
 *  │ └──────────────────────────────────────────┘│
 *  │  מנוחה  00:30                    ✓  ↻     │  ← rest row (active only)
 *  └─────────────────────────────────────────────┘
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronUp, Info, Timer, Dumbbell, RotateCcw } from 'lucide-react';
import SetPillsGrid, { SetPillData } from './SetPillsGrid';

export type BlockStatus = 'completed' | 'active' | 'upcoming';

export interface WorkoutBlockCardProps {
  exerciseId: string;
  exerciseName: string;
  imageUrl?: string | null;
  sets: number;
  repsText: string;
  exerciseType: 'reps' | 'time';
  targetReps: number;
  status: BlockStatus;
  currentSetIndex: number;
  loggedReps: (number | null)[];
  restTimeLeft?: number;
  isResting?: boolean;
  formatTime?: (s: number) => string;
  restDuration?: number;
  onPillTap: (setIndex: number) => void;
}

export default function WorkoutBlockCard({
  exerciseName,
  imageUrl,
  sets,
  repsText,
  exerciseType,
  targetReps,
  status,
  currentSetIndex,
  loggedReps,
  restTimeLeft,
  isResting,
  formatTime,
  restDuration,
  onPillTap,
}: WorkoutBlockCardProps) {
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isUpcoming = status === 'upcoming';
  const [expanded, setExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const pills: SetPillData[] = useMemo(() => {
    return Array.from({ length: sets }, (_, i): SetPillData => {
      let pillStatus: 'completed' | 'active' | 'upcoming';
      if (isCompleted) {
        pillStatus = 'completed';
      } else if (isActive) {
        pillStatus = i < currentSetIndex ? 'completed' : i === currentSetIndex ? 'active' : 'upcoming';
      } else {
        pillStatus = 'upcoming';
      }
      return {
        setIndex: i,
        status: pillStatus,
        targetReps,
        loggedReps: loggedReps[i] ?? null,
        isTimeBased: exerciseType === 'time',
      };
    });
  }, [sets, isCompleted, isActive, currentSetIndex, targetReps, loggedReps, exerciseType]);

  const roundLabel = sets > 1 ? `${sets}x סבבים` : `סבב 1`;

  return (
    <div
      className={[
        'relative rounded-2xl border transition-all duration-200 overflow-hidden',
        isActive
          ? 'border-[#00B4FF] bg-white dark:bg-slate-900 shadow-md shadow-cyan-500/10'
          : isCompleted
            ? 'border-[#00B4FF]/40 bg-white dark:bg-slate-900'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 opacity-75',
      ].join(' ')}
    >
      {/* ── Completed checkmark badge (top-right) ───────────────────────── */}
      {isCompleted && (
        <div className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-[#00B4FF] flex items-center justify-center shadow-sm">
          <Check size={14} className="text-white" strokeWidth={3} />
        </div>
      )}

      {/* ── Header — exercise type label + rounds ───────────────────────── */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-4 pt-3 pb-2"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: expanded ? 0 : 180 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronUp size={16} className="text-slate-400" />
          </motion.div>
          <span
            className="text-xs text-slate-500 dark:text-slate-400 font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {roundLabel}
          </span>
          <Info size={14} className="text-slate-300" />
        </div>

        <span
          className="text-sm font-bold text-slate-900 dark:text-white"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          תרגיל בודד
        </span>
      </button>

      {/* ── Expandable body ─────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* ── Exercise row — name/reps + image ────────────────────────── */}
            <div
              className={[
                'mx-3 rounded-xl p-3 mb-2',
                isActive
                  ? 'bg-cyan-50 dark:bg-cyan-950/30'
                  : 'bg-slate-50 dark:bg-slate-800/40',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                {/* Text content */}
                <div className="flex-1 min-w-0 pt-1">
                  <p
                    className={[
                      'text-base font-bold mb-1',
                      isCompleted
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-slate-900 dark:text-white',
                    ].join(' ')}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {exerciseName}
                  </p>
                  <p
                    className="text-sm text-slate-500 dark:text-slate-400 mb-3"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {repsText}
                  </p>

                  {/* Set pills inside the tinted area */}
                  <SetPillsGrid pills={pills} onPillTap={onPillTap} />
                </div>

                {/* Image thumbnail */}
                <div className="w-20 h-20 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Dumbbell size={22} className="text-slate-400" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Rest row (active + resting only) ────────────────────────── */}
            {isActive && (
              <div className="flex items-center justify-between px-4 pb-3">
                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  {isResting && (
                    <div className="w-9 h-9 rounded-lg bg-[#F97316] flex items-center justify-center">
                      <Check size={16} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <RotateCcw size={14} className="text-slate-400" />
                  </div>
                </div>

                {/* Rest timer label */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {isResting && restTimeLeft !== undefined && formatTime
                      ? formatTime(restTimeLeft)
                      : restDuration
                        ? formatTime?.(restDuration) ?? `${restDuration}s`
                        : '00:30'}
                  </span>
                  <span
                    className="text-sm text-slate-500 dark:text-slate-400"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    מנוחה
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
