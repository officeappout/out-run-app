'use client';

/**
 * SetPillsGrid — Row of set pills for an exercise block.
 *
 * States:
 *  completed → cyan gradient, white text, checkmark
 *  active    → gradient border, cyan text
 *  upcoming  → muted outline, gray text
 *
 * Guide-pulse: when `pulseSetIndex` matches a pill, it receives an
 * orange shake + glow animation to draw the user's attention.
 */

import React from 'react';
import { Check } from 'lucide-react';

export interface SetPillData {
  setIndex: number;
  status: 'completed' | 'active' | 'upcoming';
  targetReps: number;
  loggedReps: number | null;
  loggedRepsRight?: number | null;
  loggedRepsLeft?: number | null;
  isTimeBased: boolean;
}

interface SetPillsGridProps {
  pills: SetPillData[];
  onPillTap: (setIndex: number) => void;
  pulseSetIndex?: number | null;
  onPulseComplete?: () => void;
}

function fmtReps(n: number) {
  return n === 1 ? 'חזרה אחת' : `${n} חזרות`;
}

function fmtSecs(n: number) {
  return n === 1 ? 'שנייה אחת' : `${n} שניות`;
}

const GUIDE_PULSE_KEYFRAMES = `
@keyframes guidePulse {
  0%, 100% {
    transform: scale(1) translateX(0);
    box-shadow: 0 0 0 0 rgba(255, 138, 0, 0);
  }
  12% {
    transform: scale(1.12) translateX(-3px);
    box-shadow: 0 0 0 4px rgba(255, 138, 0, 0.6);
  }
  28% {
    transform: scale(1.12) translateX(3px);
    box-shadow: 0 0 0 6px rgba(255, 138, 0, 0.4);
  }
  44% {
    transform: scale(1.08) translateX(-2px);
    box-shadow: 0 0 0 8px rgba(255, 138, 0, 0.15);
  }
  62% {
    transform: scale(1.04) translateX(1px);
    box-shadow: 0 0 0 4px rgba(255, 138, 0, 0.05);
  }
  80% {
    transform: scale(1.01) translateX(-0.5px);
  }
}`;

export default function SetPillsGrid({
  pills,
  onPillTap,
  pulseSetIndex,
  onPulseComplete,
}: SetPillsGridProps) {
  const hasPulse = pulseSetIndex != null;

  return (
    <div className="flex flex-wrap gap-2 items-end">
      {hasPulse && <style>{GUIDE_PULSE_KEYFRAMES}</style>}

      {pills.map((pill) => {
        const isCompleted = pill.status === 'completed';
        const isActive = pill.status === 'active';
        const isPulsing = hasPulse && pill.setIndex === pulseSetIndex;

        const hasUnilateralData =
          isCompleted &&
          pill.loggedRepsRight != null &&
          pill.loggedRepsLeft != null;

        const displayVal = isCompleted && pill.loggedReps !== null
          ? pill.loggedReps
          : pill.targetReps;
        const repsLabel = hasUnilateralData
          ? pill.isTimeBased
            ? `${pill.loggedRepsRight}"י׳ | ${pill.loggedRepsLeft}"ש׳`
            : `${pill.loggedRepsRight}י׳ | ${pill.loggedRepsLeft}ש׳`
          : pill.isTimeBased ? fmtSecs(displayVal) : fmtReps(displayVal);

        const pillStyle: React.CSSProperties = {
          fontFamily: 'var(--font-simpler)',
          ...(isCompleted && {
            background: 'linear-gradient(to left, #00BAF7, #0CF2E3)',
          }),
          ...(isActive && !isPulsing && {
            background: 'linear-gradient(white, white) padding-box, linear-gradient(to left, #00BAF7, #0CF2E3) border-box',
            border: '2px solid transparent',
          }),
          ...(isPulsing && {
            background: 'linear-gradient(white, white) padding-box, linear-gradient(#FF8A00, #FF8A00) border-box',
            border: '2px solid transparent',
            animation: 'guidePulse 0.9s ease-in-out',
          }),
        };

        return (
          <button
            key={pill.setIndex}
            onClick={() => onPillTap(pill.setIndex)}
            onAnimationEnd={() => isPulsing && onPulseComplete?.()}
            className={[
              'relative inline-flex items-center gap-1.5 rounded-xl font-bold transition-all duration-300 whitespace-nowrap',
              isActive
                ? 'px-5 py-3 text-sm shadow-sm shadow-cyan-500/10'
                : isCompleted
                  ? hasUnilateralData
                    ? 'px-2.5 py-2 text-[10px] text-slate-900 shadow-sm shadow-cyan-500/20'
                    : 'px-3.5 py-2 text-xs text-slate-900 shadow-sm shadow-cyan-500/20'
                  : 'px-3.5 py-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-default',
              isPulsing ? 'text-[#FF8A00]' : isActive ? 'text-[#00BAF7]' : '',
            ].join(' ')}
            style={pillStyle}
          >
            {isCompleted && <Check size={12} strokeWidth={3} />}
            {isActive ? repsLabel : isCompleted ? repsLabel : `סט ${pill.setIndex + 1}`}
          </button>
        );
      })}
    </div>
  );
}
