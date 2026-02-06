'use client';

import React from 'react';
import { RotateCcw, Target, Package } from 'lucide-react';
import { Dumbbell } from 'lucide-react';
import WorkoutCardWrapper from './WorkoutCardWrapper';

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
}: StrengthExerciseCardProps) {
  return (
    <WorkoutCardWrapper className={cn('p-3', className)}>
      {/* Layout: Swap (Left) | Text (Center) | Image (Right) - with flex-row-reverse this becomes Image | Text | Swap */}
      {/* Action Button (Left in RTL) */}
      {onSwap && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSwap();
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
          aria-label="החלף תרגיל"
        >
          <RotateCcw size={18} />
        </button>
      )}

      {/* Text Content (Center) */}
      <div className="flex-1 flex flex-col justify-center mx-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h3>
          {matchesGoal && (
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
        {repsOrDuration && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {repsOrDuration}
          </p>
        )}
      </div>

      {/* Image (Right in RTL) - handles null/undefined/empty string as missing media */}
      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">
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
            <Dumbbell size={32} />
          </div>
        )}
      </div>
    </WorkoutCardWrapper>
  );
}
