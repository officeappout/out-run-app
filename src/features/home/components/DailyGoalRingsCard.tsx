'use client';

/**
 * DailyGoalRingsCard — Stage G (18.08.2026, "completion-loop" plan).
 *
 * Two goal rings, side by side: aerobic (cardio) + strength, each showing
 * today's fraction of that axis's daily goal. Built on the existing S10
 * ring infrastructure — reuses ActivityDayRing (day-display.utils.tsx) as
 * its renderer and ActivityRingData as its data shape unchanged, exactly
 * like every other day-cell ring on this page — but fed from
 * useWeeklyStrengthGoal / useWeeklyMovementGoal (HOME_DAILY_GOAL_V1's
 * already-built, already-correct per-axis daily-goal hooks) instead of
 * buildActivityRingData's single blended-category percentage, since that
 * function has no per-axis output (confirmed before building this: it
 * collapses categories into one aggregate ring by design).
 *
 * Both hooks are unconditionally enabled here (enabled: true) — they have
 * zero other live call sites in the app today (HOME_DAILY_GOAL_V1 gates a
 * different, not-yet-shipped UI surface), so this card doesn't inherit or
 * depend on that flag's state.
 *
 * N=1 vs N=2 (mirrors the same principle used elsewhere in this plan for
 * multi-item strips): while a hook is still resolving (undefined), its ring
 * simply doesn't render — no horizontal-scroll chrome for a single ring, no
 * placeholder blank ring. Once both resolve, they sit side by side with a
 * horizontal-scroll wrapper (matches the plan's explicit ask), which only
 * engages if the viewport is too narrow to show both natively.
 */

import React, { useMemo } from 'react';
import { ActivityDayRing } from '@/features/home/utils/day-display.utils';
import { type ActivityRingData, ACTIVITY_RING_EMPTY_COLOR } from '@/features/home/utils/activity-ring.utils';
import { useWeeklyStrengthGoal } from '@/features/home/hooks/useWeeklyStrengthGoal';
import { useWeeklyMovementGoal } from '@/features/home/hooks/useWeeklyMovementGoal';
import { ACTIVITY_COLORS } from '@/features/activity/types/activity.types';
import { WIDGET_CARD_STYLE } from '@/features/home/components/widgets/StrengthVolumeWidget';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';

const RING_SIZE_PX = 64;

function buildGoalRing(pct: number | undefined, category: 'strength' | 'cardio'): ActivityRingData {
  const clamped = Math.max(0, Math.min(1, pct ?? 0));
  return {
    percentage: Math.round(clamped * 100),
    color: clamped > 0 ? ACTIVITY_COLORS[category].hex : ACTIVITY_RING_EMPTY_COLOR,
    active: clamped > 0,
    // Not meaningful here (the source hooks are pct-based, not minutes-based) —
    // ActivityDayRing's renderer only reads percentage/color/active; kept for
    // ActivityRingData type-shape compatibility, not consumed downstream.
    totalMinutes: 0,
    dominantCategory: category,
  };
}

function GoalRing({ ring, label }: { ring: ActivityRingData; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div className="relative flex items-center justify-center" style={{ width: RING_SIZE_PX, height: RING_SIZE_PX }}>
        <ActivityDayRing ring={ring} sizePx={RING_SIZE_PX} isToday />
        <span
          className="absolute inset-0 flex items-center justify-center text-[15px] font-bold"
          style={{ color: ring.active ? ring.color : '#9CA3AF' }}
        >
          {ring.percentage}%
        </span>
      </div>
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
    </div>
  );
}

export default function DailyGoalRingsCard() {
  const strengthStates = useWeeklyStrengthGoal(true);
  const movementStates = useWeeklyMovementGoal(true);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const todayStrengthPct = strengthStates?.find((s) => s.date === todayISO)?.pct;
  const todayMovementPct = movementStates?.find((s) => s.date === todayISO)?.pct;

  const strengthReady = todayStrengthPct !== undefined;
  const movementReady = todayMovementPct !== undefined;

  if (!strengthReady && !movementReady) return null;

  const bothReady = strengthReady && movementReady;

  return (
    <div className="bg-white dark:bg-slate-800 w-full" style={WIDGET_CARD_STYLE} dir="rtl">
      <div className={bothReady ? 'flex items-center justify-center gap-6 overflow-x-auto' : 'flex items-center justify-center'}>
        {movementReady && <GoalRing ring={buildGoalRing(todayMovementPct, 'cardio')} label="אירובי" />}
        {strengthReady && <GoalRing ring={buildGoalRing(todayStrengthPct, 'strength')} label="כוח" />}
      </div>
    </div>
  );
}
