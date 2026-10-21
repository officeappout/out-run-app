import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Footprints, Flame, Target, Check } from 'lucide-react';
import { SUCCESS_BASELINE } from '@/features/user/progression/services/smart-goals.service';
import { DAILY_STEP_GOAL } from '@/features/activity/config/health-goals.config';
import { IconTile, StatNumber } from '@/components/ui/v2';

interface StepsWidgetProps {
  steps: number;
  goal: number;
  calories?: number;
}

const RING_PATH = 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831';

/**
 * StepsWidget — design language v2: light Card, steps-green ring with the
 * success-baseline marker, StatNumber count. Three states keep their meaning:
 * goal reached (full steps green), baseline reached (amber), below baseline
 * (soft steps green).
 */
export const StepsWidget: React.FC<StepsWidgetProps> = ({
  steps = 0,
  goal = DAILY_STEP_GOAL,
}) => {
  const reduce = useReducedMotion();
  // Calculate ratio (0 to 1) for pathLength
  const ratio = Math.min(Math.max(steps / goal, 0), 1);
  const isGoalReached = steps >= goal;
  const isBaselineReached = steps >= SUCCESS_BASELINE.steps;

  // Baseline marker position
  const baselinePosition = (SUCCESS_BASELINE.steps / goal) * 100;

  const arcClass = isGoalReached
    ? 'text-activity-steps'
    : isBaselineReached
      ? 'text-v2-amber'
      : 'text-activity-steps/60';

  return (
    <div
      className="bg-white text-v2-ink rounded-v2-card shadow-v2-card p-4 flex flex-col justify-between h-36 relative overflow-hidden w-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="text-[14px] font-extrabold text-v2-ink">צעדים היום</span>
        <IconTile icon={Footprints} tone="steps" size="sm" className="[&>svg]:-scale-x-100" />
      </div>

      <div className="flex items-center justify-between mt-2">
        {/* Animated SVG ring */}
        <div className="relative w-16 h-16 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            {/* Background Track */}
            <path className="text-activity-steps/15" d={RING_PATH} fill="none" stroke="currentColor" strokeWidth="4" />

            {/* Baseline marker (thin amber arc up to SUCCESS_BASELINE) */}
            {baselinePosition < 100 && (
              <motion.path
                className="text-v2-amber/70"
                d={RING_PATH}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray={`${(baselinePosition / 100) * 100} 100`}
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: baselinePosition / 100 }}
                transition={{ duration: 1, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
              />
            )}

            {/* Progress fill */}
            <motion.path
              className={arcClass}
              d={RING_PATH}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: ratio }}
              transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isGoalReached ? (
              <Target className="w-5 h-5 text-activity-steps" strokeWidth={2.4} aria-label="היעד הושג" />
            ) : (
              <Flame className="w-5 h-5 text-v2-amber" strokeWidth={2.4} aria-hidden />
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col items-end min-w-0">
          <StatNumber value={steps} size="md" countUp className="items-end" />
          <span className="text-[12px] font-semibold text-v2-muted mt-1">
            מתוך {goal.toLocaleString()}
          </span>
          {!isGoalReached && isBaselineReached && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#b45309] font-extrabold mt-0.5">
              <Check className="w-3 h-3" strokeWidth={3} aria-hidden />
              בסיס הושג
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
