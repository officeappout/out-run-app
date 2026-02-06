'use client';

import React from 'react';
import WorkoutCardWrapper from './WorkoutCardWrapper';

// Simple className utility function
const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface RunningSegmentCardProps {
  title: string; // e.g., "ריצה קלה", "ריצה מהירה"
  durationOrDistance?: string; // e.g., "5 דקות" or "1 ק״מ"
  pace?: string; // e.g., "5:30 /ק״מ"
  statusColor?: string; // Color for the intensity bar (e.g., '#00ADEF' for easy, '#FF8C00' for hard)
  className?: string;
  onClick?: () => void;
}

/**
 * RunningSegmentCard - Card for displaying running segments/intervals
 * Layout (RTL): Title (Right) | Duration/Distance (Center) | Pace (Left)
 * Includes optional status color bar for intensity indication
 */
export default function RunningSegmentCard({
  title,
  durationOrDistance,
  pace,
  statusColor,
  className,
  onClick,
}: RunningSegmentCardProps) {
  return (
    <WorkoutCardWrapper
      statusColor={statusColor}
      className={cn('p-4', className)}
      onClick={onClick}
    >
      <div className="flex items-center justify-between w-full gap-4">
        {/* Title (Right in RTL) */}
        <div className="flex-1 text-right min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h3>
        </div>

        {/* Duration/Distance (Center) */}
        {durationOrDistance && (
          <div className="flex-shrink-0 text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {durationOrDistance}
            </p>
          </div>
        )}

        {/* Pace Info (Left in RTL) */}
        {pace && (
          <div className="flex-shrink-0 text-left">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pace}
            </p>
          </div>
        )}
      </div>
    </WorkoutCardWrapper>
  );
}
