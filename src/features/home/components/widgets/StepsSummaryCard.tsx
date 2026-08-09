'use client';

/**
 * StepsSummaryCard — compact dashboard card for daily step tracking.
 *
 * Replaces the previous large/complex steps widget with a focused
 * "Apple Health-style" Summary Card. Visuals:
 *   • Circular ring  → reuses the shared CircularProgress component
 *                      (same one used in Strength Programs) for 1:1 design
 *                      consistency between strength % rings and steps % rings.
 *   • Bold step count + goal label below.
 *   • Whole card is a button → /activity/steps for the Detailed Analytics page.
 *
 * Data source: useLiveDailyActivity() so HealthKit / Health Connect samples
 * appear instantly via the in-memory overlay (Native Phase, Apr 2026).
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { Footprints, ChevronLeft } from 'lucide-react';
import CircularProgress from '@/components/CircularProgress';
import { useLiveDailyActivity } from '@/features/activity/hooks/useLiveDailyActivity';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';
import { DAILY_STEP_GOAL } from '@/config/health-goals';

const FALLBACK_STEPS_GOAL = DAILY_STEP_GOAL;

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface StepsSummaryCardProps {
  className?: string;
  /**
   * Layout variant.
   *  - "default" (full-width hero card with ring + count + chevron, original behaviour).
   *  - "compact" (half-width tile with ring centred above the step count).
   *    Used by the new dashboard `HealthMetricsRow` (PR 4) so the card sits
   *    next to the WHO 150 ring at matching height.
   */
  variant?: 'default' | 'compact';
}

export default function StepsSummaryCard({ className = '', variant = 'default' }: StepsSummaryCardProps) {
  const router = useRouter();
  const { stepsToday, todayActivity, isLoading } = useLiveDailyActivity();

  // Guard against flashing a stale number before real data lands.
  // `today` is Zustand-persisted (see useActivityStore's `persist` config),
  // so on mount it can briefly hold a rehydrated value from a PREVIOUS day
  // — onRehydrateStorage corrects it, but not before the very first paint.
  // Treat "loading" or "today doc is for a different day" the same way:
  // show a placeholder instead of a number that isn't actually today's.
  const isStale = !isLoading && todayActivity != null && todayActivity.date !== todayDateString();
  const showPlaceholder = isLoading || isStale;
  const displaySteps = showPlaceholder ? '—' : stepsToday.toLocaleString('he-IL');

  const goal = todayActivity?.stepsGoal ?? FALLBACK_STEPS_GOAL;
  const percentage =
    showPlaceholder || goal <= 0 ? 0 : Math.min(100, Math.round((stepsToday / goal) * 100));

  const { triggerHealthPermission, disclosureProps, unavailableReason } = useHealthWithDisclosure({
    onGranted: () => router.push('/activity/steps'),
  });
  const healthBridgeEnabled = useSettingsStore((s) => s.healthBridgeEnabled);
  const healthPermissionAsked = useSettingsStore((s) => s.healthPermissionAsked);
  // Fallback label when not yet connected — distinguishes "never asked /
  // deferred during onboarding" from "you declined the real OS dialog before".
  const connectPromptLabel = healthBridgeEnabled
    ? null
    : healthPermissionAsked
      ? 'דחית קודם, רוצה לחבר?'
      : 'עוד לא חובר';

  const handleOpen = triggerHealthPermission;

  const ariaLabel = `פתח ניתוח צעדים: ${displaySteps} מתוך ${goal.toLocaleString('he-IL')}`;

  if (variant === 'compact') {
    return (
      <>
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
        <HealthConnectDisclosureModal {...disclosureProps} />
      </>
    );
  }

  return (
    <>
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
      <HealthConnectDisclosureModal {...disclosureProps} />
    </>
  );
}
