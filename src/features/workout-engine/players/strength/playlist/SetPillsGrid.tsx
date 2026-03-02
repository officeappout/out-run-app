'use client';

/**
 * SetPillsGrid — Row of set pills for an exercise block.
 *
 * States:
 *  completed → cyan bg, white text, checkmark
 *  active    → pulsing cyan ring, bold text
 *  upcoming  → muted outline, gray text
 */

import React from 'react';
import { Check } from 'lucide-react';

export interface SetPillData {
  setIndex: number;
  status: 'completed' | 'active' | 'upcoming';
  targetReps: number;
  loggedReps: number | null;
  isTimeBased: boolean;
}

interface SetPillsGridProps {
  pills: SetPillData[];
  onPillTap: (setIndex: number) => void;
}

export default function SetPillsGrid({ pills, onPillTap }: SetPillsGridProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => {
        const isCompleted = pill.status === 'completed';
        const isActive = pill.status === 'active';
        const isUpcoming = pill.status === 'upcoming';

        const repsLabel = isCompleted && pill.loggedReps !== null
          ? (pill.isTimeBased ? `${pill.loggedReps}s` : `${pill.loggedReps} חזרות`)
          : (pill.isTimeBased ? `${pill.targetReps}s` : `${pill.targetReps} חזרות`);

        return (
          <button
            key={pill.setIndex}
            onClick={() => onPillTap(pill.setIndex)}
            disabled={isUpcoming}
            className={[
              'relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all',
              isCompleted
                ? 'bg-[#00B4FF] text-white shadow-sm shadow-cyan-500/20'
                : isActive
                  ? 'bg-white text-[#00B4FF] shadow-sm ring-2 ring-[#00B4FF] ring-offset-1'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-default',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {isCompleted && <Check size={12} strokeWidth={3} />}
            {isActive ? repsLabel : isCompleted ? repsLabel : `סט ${pill.setIndex + 1}`}

            {/* Pulse ring for active pill */}
            {isActive && (
              <span className="absolute inset-0 rounded-xl ring-2 ring-[#00B4FF] animate-ping opacity-30 pointer-events-none" />
            )}
          </button>
        );
      })}
    </div>
  );
}
