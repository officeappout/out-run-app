'use client';

/**
 * WorkoutStoryBars
 * Story-style progress bars for workout exercises
 * Current exercise bar is larger (flex: 3), others are smaller (flex: 1)
 */

import React from 'react';

interface ProgressBar {
  isActive: boolean;
  isCurrent: boolean;
}

interface WorkoutStoryBarsProps {
  progressBars: ProgressBar[];
  accentColor?: string;
}

export default function WorkoutStoryBars({
  progressBars,
  accentColor = '#00AEEF', // Cyan default
}: WorkoutStoryBarsProps) {
  return (
    <div className="flex gap-1.5">
      {progressBars.map((bar, index) => {
        const isActive = bar.isActive;
        const isCurrent = bar.isCurrent;

        return (
          <div
            key={index}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              flex: isCurrent ? 3 : 1,
              backgroundColor: isActive ? accentColor : 'rgba(255, 255, 255, 0.3)',
              boxShadow: isActive ? `0 0 8px ${accentColor}80` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
