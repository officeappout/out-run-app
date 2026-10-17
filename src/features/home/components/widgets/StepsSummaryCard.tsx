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

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import StepsSummaryCardView from './StepsSummaryCardView';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { useLiveDailyActivity } from '@/features/activity/hooks/useLiveDailyActivity';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import { useHealthConnected } from '@/hooks/useHealthConnected';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import { hapticMedium } from '@/lib/haptics';
import { playSuccessChime } from '@/lib/sound';

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
  const homeV2 = useHomeV2();
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

  // Celebrate reaching the daily step goal — fires on mount if already at
  // goal, or the instant a live update crosses into it. Does not re-fire on
  // subsequent re-renders while it stays at 100 within the same mount; the
  // guard re-arms when percentage drops back under 100, which happens
  // naturally on day rollover via the isStale check above (percentage is
  // forced to 0 until fresh data lands for the new day).
  const hasCelebratedThisMountRef = useRef(false);
  useEffect(() => {
    if (percentage >= 100) {
      if (!hasCelebratedThisMountRef.current) {
        hasCelebratedThisMountRef.current = true;
        hapticMedium();
        playSuccessChime();
      }
    } else {
      hasCelebratedThisMountRef.current = false;
    }
  }, [percentage]);

  const { triggerHealthPermission, disclosureProps } = useHealthWithDisclosure({
    onGranted: () => router.push('/activity/steps'),
  });
  // Ground truth (native PREF_KEY_PERMISSIONS), not useSettingsStore
  // .healthBridgeEnabled — see useHealthConnected's doc comment. `null`
  // (still loading) is treated as connected-until-proven-otherwise so the
  // CTA never flashes on top of a working, already-granted state.
  const healthConnected = useHealthConnected();
  const healthPermissionAsked = useSettingsStore((s) => s.healthPermissionAsked);
  // Fallback label when not yet connected — distinguishes "never asked /
  // deferred during onboarding" from "you declined the real OS dialog before".
  const connectPromptLabel = healthConnected !== false
    ? null
    : healthPermissionAsked
      ? 'דחית קודם, רוצה לחבר?'
      : 'עוד לא חובר';

  const handleOpen = triggerHealthPermission;

  const ariaLabel = `פתח ניתוח צעדים: ${displaySteps} מתוך ${goal.toLocaleString('he-IL')}`;

  return (
    <>
      <StepsSummaryCardView
        thickRing={homeV2}
        variant={variant}
        className={className}
        displaySteps={displaySteps}
        steps={showPlaceholder ? null : stepsToday}
        goal={goal}
        percentage={percentage}
        connectPromptLabel={connectPromptLabel}
        ariaLabel={ariaLabel}
        onOpen={handleOpen}
      />
      <HealthConnectDisclosureModal {...disclosureProps} />
    </>
  );
}
