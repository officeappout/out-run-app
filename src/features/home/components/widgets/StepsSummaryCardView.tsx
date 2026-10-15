'use client';

/**
 * StepsSummaryCardView — presentational body of StepsSummaryCard.
 *
 * Hook-free: StepsSummaryCard (the container) owns the live daily-activity
 * read, the goal celebration and the health-permission flow, and passes the
 * already-derived display values in. Split out so the design-v2 preview route
 * can render the card from fixtures.
 */

import React from 'react';
import { Footprints, ChevronLeft } from 'lucide-react';
import CircularProgress from '@/components/CircularProgress';

export interface StepsSummaryCardViewProps {
  variant: 'default' | 'compact';
  className?: string;
  /** Formatted step count, or '—' while loading / stale. */
  displaySteps: string;
  goal: number;
  /** 0–100. */
  percentage: number;
  /** Shown instead of the goal line when health isn't connected. */
  connectPromptLabel: string | null;
  ariaLabel: string;
  onOpen: () => void;
}

export default function StepsSummaryCardView({
  variant,
  className = '',
  displaySteps,
  goal,
  percentage,
  connectPromptLabel,
  ariaLabel,
  onOpen: handleOpen,
}: StepsSummaryCardViewProps) {
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleOpen}
        aria-label={ariaLabel}
        dir="rtl"
        className={[
          'w-full h-full text-center',
          'bg-white dark:bg-[#1E1E1E]',
          'flex flex-col items-center justify-center gap-2',
          'active:scale-[0.99] transition-transform',
          className,
        ].join(' ')}
        style={{
          borderRadius: 12,
          padding: 16,
          border: '0.5px solid #E0E9FF',
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
        }}
      >
        <CircularProgress percentage={percentage} size={100} strokeWidth={7} colorClass="text-[#00C07A]">
          <div className="flex flex-col items-center leading-none">
            <span
              className="text-[20px] font-black text-gray-900 dark:text-white tabular-nums"
              dir="ltr"
            >
              {displaySteps}
            </span>
            <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 mt-0.5">
              {connectPromptLabel ?? `מתוך ${goal.toLocaleString('he-IL')}`}
            </span>
          </div>
        </CircularProgress>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      aria-label={ariaLabel}
      dir="rtl"
      className={[
        'w-full text-start',
        'bg-white dark:bg-[#1E1E1E]',
        'rounded-2xl shadow-card border border-gray-100 dark:border-gray-800',
        'px-4 py-3.5',
        'flex items-center gap-4',
        'active:scale-[0.99] transition-transform',
        'hover:shadow-floating',
        className,
      ].join(' ')}
    >
      <div className="shrink-0">
        <CircularProgress
          percentage={percentage}
          size={56}
          strokeWidth={5}
          colorClass="text-[#00C07A]"
        >
          <Footprints
            className="w-5 h-5 text-[#00C07A] -scale-x-100"
            aria-hidden="true"
          />
        </CircularProgress>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
          {connectPromptLabel ?? 'צעדים היום'}
        </p>
        <p
          className="text-[22px] font-black text-gray-900 dark:text-white leading-none tabular-nums"
          dir="ltr"
        >
          {displaySteps}
        </p>
        <p
          className="mt-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 leading-none"
          dir="ltr"
        >
          / {goal.toLocaleString('he-IL')} steps
        </p>
      </div>

      <ChevronLeft
        className="w-5 h-5 text-gray-300 dark:text-gray-600 shrink-0"
        aria-hidden="true"
      />
    </button>
  );
}
