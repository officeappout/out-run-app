'use client';

import React from 'react';
import { Dumbbell } from 'lucide-react';
import type { Exercise } from '@/features/parks';

/**
 * StationExerciseRow — one exercise row of a station's exercise list (thumbnail + name +
 * reps/duration text), extracted verbatim from StationCard so the guided welcome screen
 * (PR-B1) reuses the same rendering. `nameAdornment` / `trailing` are the per-caller slots
 * (StationCard: lock badge + replay button; welcome screen: the ⏱/🔁 type chip).
 */
export default function StationExerciseRow({
  ex,
  nameAdornment,
  trailing,
}: {
  ex: Exercise;
  nameAdornment?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  // Display: prefer range format, fall back to single value
  const displayText = ex.reps || ex.duration || '';
  const isGoal = displayText.includes('יעד');

  return (
    <div className={`flex items-center rounded-xl overflow-hidden shadow-sm p-2 gap-3 border ${
      isGoal
        ? 'bg-cyan-50/50 border-cyan-200'
        : 'bg-gray-50/50 border-gray-100'
    }`}>
        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 relative bg-gray-100">
            {ex.imageUrl ? (
              <img src={ex.imageUrl} alt={ex.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Dumbbell size={24} />
              </div>
            )}
        </div>
        <div className="flex-1 flex flex-col justify-center">
            <span className={`text-sm font-bold ${isGoal ? 'text-cyan-700' : 'text-gray-800'} flex items-center gap-1`}>
              {ex.name}
              {nameAdornment}
            </span>
            <span className={`text-xs mt-0.5 ${isGoal ? 'text-cyan-500 font-semibold' : 'text-gray-400'}`}>
              {displayText}
            </span>
        </div>
        {trailing}
    </div>
  );
}
