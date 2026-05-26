'use client';

import React from 'react';
import { Flame, Clock, Flag } from 'lucide-react';
import AnimatedFlame from '@/components/ui/AnimatedFlame';
import type { ActivityType } from '@/features/activity/types/activity.types';

import { StatBox } from './summary-atoms';

/**
 * SummaryStatsRow — three-up calories / duration / streak strip.
 *
 * Sits directly under the sticky summary header and is the first thing the
 * user sees after a workout.  The streak cell waits for Dopamine Chain
 * Step 2 to settle (`streakChainReady`) before swapping the static Flag
 * icon for the animated flame (Step 3 of the chain).
 *
 * Pure presentation — all metrics come from `useSummaryAnalytics`.
 */

export interface SummaryStatsRowProps {
  calories: number;
  formattedDuration: string;
  streak: number;
  streakFlameType: ActivityType;
  /** Gates the AnimatedFlame swap — true once the XP elastic pulse completes. */
  streakChainReady: boolean;
}

export default function SummaryStatsRow({
  calories,
  formattedDuration,
  streak,
  streakFlameType,
  streakChainReady,
}: SummaryStatsRowProps) {
  return (
    <div className="flex justify-between items-center text-center px-2">
      <StatBox
        label="קלוריות"
        value={calories}
        icon={<Flame className="w-4 h-4" />}
        iconColor="text-orange-500"
        showTrend={false}
      />
      <StatBox
        label="זמן"
        value={formattedDuration}
        icon={<Clock className="w-4 h-4" />}
        iconColor="text-slate-800 dark:text-white"
        hasBorder
      />
      <div className="flex flex-col">
        <span className="text-xs text-slate-500 font-medium">אימונים ברצף</span>
        <div className="flex items-center justify-center gap-1">
          <span className="text-lg font-bold text-slate-800 dark:text-white">{streak}</span>
          {streakChainReady ? (
            <AnimatedFlame activityType={streakFlameType} previousType="none" />
          ) : (
            <Flag className="w-4 h-4 text-slate-800 dark:text-white" />
          )}
        </div>
      </div>
    </div>
  );
}
