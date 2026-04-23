'use client';

import React from 'react';
import { Target, Package, Dumbbell } from 'lucide-react';
import WorkoutCardWrapper from './WorkoutCardWrapper';
import SwapIcon from '../SwapIcon';

// Simple className utility function
const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface StrengthExerciseCardProps {
  title: string;
  repsOrDuration?: string; // e.g., "15 חזרות" or "30 שניות"
  imageUrl?: string | null; // Can be null for missing media (pending filming)
  imageAlt?: string;
  onSwap?: () => void;
  className?: string;
  matchesGoal?: boolean; // Whether this exercise matches user's selected goal
  matchesUserEquipment?: boolean; // Whether this exercise was selected because of user-owned equipment
  /** If true, this exercise has an admin-defined targetGoal → Cyan/Blue card styling */
  isTargetGoal?: boolean;
  /** Range display: e.g., { min: 6, max: 12 } → "6-12 חזרות" */
  repsRange?: { min: number; max: number };
  /** Number of sets for display */
  sets?: number;
  /** Whether this is a timed exercise */
  isTimeBased?: boolean;
  /** Ramped target from progressive overload */
  rampedTarget?: number;
  /** Whether this card is inside a superset group (removes redundant left border) */
  isInSuperset?: boolean;
  /** Exercise symmetry — unilateral exercises show '(לכל צד)' suffix */
  symmetry?: 'bilateral' | 'unilateral';
  /** Whether this exercise was swapped by the user */
  isSwapped?: boolean;
}

/**
 * StrengthExerciseCard - Card for displaying strength exercises
 * Layout (RTL): Image (Right) | Text (Center) | Action (Left)
 */
export default function StrengthExerciseCard({
  title,
  repsOrDuration,
  imageUrl,
  imageAlt,
  onSwap,
  className,
  matchesGoal,
  matchesUserEquipment,
  isTargetGoal,
  repsRange,
  sets,
  isTimeBased,
  rampedTarget,
  isInSuperset,
  symmetry,
  isSwapped,
}: StrengthExerciseCardProps) {
  const perSide = symmetry === 'unilateral' ? ' (לכל צד)' : '';
  // Build range-based display string (no sets prefix -- sets shown in session structure)
  const rangeDisplay = (() => {
    if (repsRange && repsRange.min !== repsRange.max) {
      const unit = isTimeBased ? 'שניות' : 'חזרות';
      const targetSuffix = rampedTarget ? ` (יעד: ${rampedTarget})` : '';
      return `${repsRange.min}-${repsRange.max} ${unit}${perSide}${targetSuffix}`;
    }
    return null;
  })();
  return (
    <WorkoutCardWrapper className={cn(
      'py-[3px] px-3',
      isTargetGoal && 'ring-2 ring-cyan-400 bg-cyan-50/40 dark:bg-cyan-900/20',
      isInSuperset && 'shadow-none border-[#E0E9FF]/40 dark:border-slate-800/50',
      className,
    )}>
      {/* Layout: Swap (Left) | Text (Center) | Image (Right) - with flex-row-reverse this becomes Image | Text | Swap */}
      {/* Action Button (Left in RTL) */}
      {onSwap && <SwapIcon size={22} onClick={() => onSwap()} isSwapped={isSwapped} />}

      {/* Text Content (Center) */}
      <div className="flex-1 flex flex-col justify-center mx-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={cn(
            "text-sm font-bold truncate",
            isTargetGoal ? "text-cyan-700 dark:text-cyan-300" : "text-gray-900 dark:text-white"
          )}>
            {title}
          </h3>
          {isTargetGoal && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-cyan-100 text-cyan-700 text-[10px] font-bold rounded-full border border-cyan-200 flex-shrink-0" title="יעד רמה">
              <Target size={10} />
              יעד
            </span>
          )}
          {matchesGoal && !isTargetGoal && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200 flex-shrink-0" title="תואם למטרה שלך">
              <Target size={10} />
              מטרה
            </span>
          )}
          {matchesUserEquipment && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full border border-blue-200 flex-shrink-0" title="מתאים לציוד שלך">
              <Package size={10} />
              ציוד
            </span>
          )}
        </div>
        {(rangeDisplay || repsOrDuration) && (
          <p className={cn(
            "text-xs mt-0.5",
            isTargetGoal ? "text-cyan-600 dark:text-cyan-400 font-semibold" : "text-slate-800 dark:text-slate-300 font-normal"
          )}>
            {rangeDisplay || repsOrDuration}
          </p>
        )}
      </div>

      {/* Image (Right in RTL) — 64px to hit ~70px card height */}
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">
        {imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '' ? (
          <img
            src={imageUrl}
            alt={imageAlt || title}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to icon if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
            <Dumbbell size={26} />
          </div>
        )}
      </div>
    </WorkoutCardWrapper>
  );
}
