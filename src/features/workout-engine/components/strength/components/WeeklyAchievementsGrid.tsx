'use client';

import React from 'react';
import { Coins, Dumbbell, Flag, Timer, Medal } from 'lucide-react';

import { AchievementBadge } from './summary-atoms';

/**
 * WeeklyAchievementsGrid — the 4-up badges card + optional XP-status footer slot.
 *
 * Renders four circular progress badges sourced from the activity store:
 *   1. מטבעות (this-session coins / 500 goal)
 *   2. אימוני כוח (sessions / weekly goal)
 *   3. ימים פעילים (active days / 5)
 *   4. דקות שבועיות (minutes / 150)
 *
 * The `xpStatusSlot` lets the orchestrator inject `<XpStatusRow />` into the
 * same white card without leaking the visual frame back to the page — preserves
 * the original DOM (single bordered container with the XP row separated by
 * a top divider).
 */

export interface WeeklyAchievementsGridProps {
  /** Coins earned this session. */
  coins: number;
  /** Strength sessions logged this week (~`floor(minutes / 30)`). */
  weeklyStrengthSessions: number;
  /** Target strength sessions per week. */
  weeklyGoalSessions: number;
  /** Distinct active days this week. */
  daysWithActivity: number;
  /** Active minutes (all categories) this week. */
  weeklyMinutes: number;
  /** Optional footer node (typically `<XpStatusRow />`) rendered inside the card. */
  xpStatusSlot?: React.ReactNode;
}

export default function WeeklyAchievementsGrid({
  coins,
  weeklyStrengthSessions,
  weeklyGoalSessions,
  daysWithActivity,
  weeklyMinutes,
  xpStatusSlot,
}: WeeklyAchievementsGridProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-50 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <Medal className="w-5 h-5 text-slate-700 dark:text-slate-300" />
        <h3 className="text-slate-800 dark:text-white font-bold text-base">הישגים שבועיים</h3>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <AchievementBadge
          icon={<Coins className="w-5 h-5 text-primary" />}
          current={coins}
          total={500}
          label="מטבעות"
          progress={(coins / 500) * 360}
        />
        <AchievementBadge
          icon={<Dumbbell className="w-5 h-5 text-primary" />}
          current={weeklyStrengthSessions}
          total={weeklyGoalSessions}
          label="אימוני כוח"
          progress={(weeklyStrengthSessions / weeklyGoalSessions) * 360}
        />
        <AchievementBadge
          icon={<Flag className="w-5 h-5 text-primary" />}
          current={daysWithActivity}
          total={5}
          label="ימים פעילים"
          progress={(daysWithActivity / 5) * 360}
        />
        <AchievementBadge
          icon={<Timer className="w-5 h-5 text-primary" />}
          current={Math.round(weeklyMinutes)}
          total={150}
          label="דקות שבועיות"
          progress={(weeklyMinutes / 150) * 360}
        />
      </div>

      {xpStatusSlot}
    </div>
  );
}
