'use client';

/**
 * StepsSummaryCardView — presentational body of StepsSummaryCard.
 *
 * Hook-free: StepsSummaryCard (the container) owns the live daily-activity
 * read, the goal celebration and the health-permission flow, and passes the
 * already-derived display values in. Split out so the design-v2 preview route
 * can render the card from fixtures.
 *
 * Design language v2: light Card surface (24px radius, v2 lift), steps-green
 * progress ring, StatNumber for the count.
 */

import React from 'react';
import { Footprints, ChevronLeft } from 'lucide-react';
import CircularProgress from '@/components/CircularProgress';
import { IconTile, StatNumber } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

export interface StepsSummaryCardViewProps {
  variant: 'default' | 'compact';
  className?: string;
  /** Formatted step count, or '—' while loading / stale. */
  displaySteps: string;
  /** Raw step count, or null while loading / stale (renders '—'). */
  steps: number | null;
  goal: number;
  /** 0–100. */
  percentage: number;
  /** Shown instead of the goal line when health isn't connected. */
  connectPromptLabel: string | null;
  ariaLabel: string;
  onOpen: () => void;
  /** Home v2: the thicker, larger ring from the design lab. */
  thickRing?: boolean;
}

const CARD = 'bg-white text-v2-ink rounded-v2-card shadow-v2-card active:scale-[0.97] transition-transform duration-150 ease-v2';

function Count({ steps, displaySteps, size }: { steps: number | null; displaySteps: string; size: 'sm' | 'md' }) {
  if (steps == null) {
    return (
      <span className={`font-black text-v2-ink leading-none ${size === 'sm' ? 'text-[20px]' : 'text-[28px]'}`}>
        {displaySteps}
      </span>
    );
  }
  return <StatNumber value={steps} size={size} countUp align="center" />;
}

export default function StepsSummaryCardView({
  variant,
  className = '',
  displaySteps,
  steps,
  goal,
  percentage,
  connectPromptLabel,
  ariaLabel,
  onOpen: handleOpen,
  thickRing = false,
}: StepsSummaryCardViewProps) {
  const t = useT(home);
  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleOpen}
        aria-label={ariaLabel}
        dir="rtl"
        className={[
          'w-full h-full text-center p-4',
          CARD,
          'flex flex-col items-center justify-center gap-2',
          className,
        ].join(' ')}
      >
        <CircularProgress
          percentage={percentage}
          size={thickRing ? 116 : 100}
          strokeWidth={thickRing ? 14 : 8}
          colorClass="text-activity-steps"
          trackClass="text-activity-steps/15"
        >
          <div className="flex flex-col items-center leading-none" dir="ltr">
            <Count steps={steps} displaySteps={displaySteps} size="sm" />
            <span className="text-[10px] font-semibold text-v2-muted mt-1" dir="rtl">
              {connectPromptLabel ?? t('steps.ofGoal', { goal: goal.toLocaleString('he-IL') })}
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
        'w-full text-start px-4 py-4',
        CARD,
        'flex items-center gap-4',
        className,
      ].join(' ')}
    >
      <div className="shrink-0">
        <CircularProgress
          percentage={percentage}
          size={thickRing ? 64 : 60}
          strokeWidth={thickRing ? 9 : 6}
          colorClass="text-activity-steps"
          trackClass="text-activity-steps/15"
        >
          <IconTile icon={Footprints} tone="steps" size="sm" className="[&>svg]:-scale-x-100" />
        </CircularProgress>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-extrabold text-[#00865a] leading-none mb-1.5">
          {connectPromptLabel ?? t('steps.today')}
        </p>
        <div className="flex items-baseline gap-1.5" dir="ltr">
          <Count steps={steps} displaySteps={displaySteps} size="md" />
          <span className="text-[12px] font-semibold text-v2-muted leading-none">
            / {goal.toLocaleString('he-IL')} steps
          </span>
        </div>
      </div>

      <span className="w-9 h-9 rounded-full bg-v2-surface flex items-center justify-center shrink-0">
        <ChevronLeft className="w-5 h-5 text-v2-muted" strokeWidth={2.4} aria-hidden="true" />
      </span>
    </button>
  );
}
