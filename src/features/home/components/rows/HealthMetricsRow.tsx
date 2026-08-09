"use client";

/**
 * HealthMetricsRow — "מדדי בריאות" section (Health Track row).
 *
 * Layout (RTL):
 *   header = "מדדי בריאות"
 *   right  = WHO 150 minutes (compact tile, ring + value / 150 דק׳)
 *   left   = Steps today (compact tile, click → permission gate → /activity/steps)
 *
 * Visual size matches the "ExerciseRow" / strength tile design language
 * (small horizontal tile ~64px tall) so the row reads like the existing
 * compact cards in the app — not a hero card. Heights are matched via
 * `SideBySideRow`'s `items-stretch`.
 */

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Footprints } from 'lucide-react';
import { useWeeklyProgress } from '@/features/activity';
import { useLiveDailyActivity } from '@/features/activity/hooks/useLiveDailyActivity';
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import SideBySideRow from './SideBySideRow';
import SectionHeader from './SectionHeader';
import CompactMetricTile from '@/features/home/components/widgets/CompactMetricTile';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import { useHealthConnected } from '@/hooks/useHealthConnected';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';

const WHO_TARGET = 150;
const FALLBACK_STEPS_GOAL = DAILY_STEP_GOAL;

function WhoTile() {
  const { summary } = useWeeklyProgress();

  // 1:2 weighted ratio (vigorous/strength = 2 points/min, cardio + maintenance = 1).
  const categoryMinutes: Record<ActivityCategory, number> = {
    strength: summary?.categoryTotals?.strength ?? 0,
    cardio: summary?.categoryTotals?.cardio ?? 0,
    maintenance: summary?.categoryTotals?.maintenance ?? 0,
  };

  const weightedPoints = Math.round(
    categoryMinutes.strength * 2 + categoryMinutes.cardio + categoryMinutes.maintenance,
  );

  const percentage = Math.min(100, Math.round((weightedPoints / WHO_TARGET) * 100));

  return (
    <CompactMetricTile
      percentage={percentage}
      icon={<Heart size={16} className="fill-current" />}
      label="פעילות שבועית"
      value={String(weightedPoints)}
      unit={`/ ${WHO_TARGET} דק׳ WHO`}
      ariaLabel={`פעילות שבועית: ${weightedPoints} מתוך ${WHO_TARGET} דקות`}
    />
  );
}

function StepsTile() {
  const router = useRouter();
  const { stepsToday, todayActivity } = useLiveDailyActivity();
  const goal = todayActivity?.stepsGoal ?? FALLBACK_STEPS_GOAL;
  const percentage = goal > 0 ? Math.min(100, Math.round((stepsToday / goal) * 100)) : 0;

  // Gate: if Health Connect / HealthKit permission not yet granted, show the
  // disclosure modal first. onGranted → navigate to the detail page (or
  // navigates immediately when permissions are already in place / on web).
  const { triggerHealthPermission, disclosureProps, unavailableReason } = useHealthWithDisclosure({
    onGranted: () => router.push('/activity/steps'),
  });
  // Ground truth (native PREF_KEY_PERMISSIONS) — see useHealthConnected's
  // doc comment for why this replaced useSettingsStore.healthBridgeEnabled.
  const healthConnected = useHealthConnected();
  const healthPermissionAsked = useSettingsStore((s) => s.healthPermissionAsked);
  // Same not-asked / asked-denied distinction as StepsSummaryCard.
  const connectPromptLabel = healthConnected !== false
    ? null
    : healthPermissionAsked
      ? 'דחית קודם, רוצה לחבר?'
      : 'עוד לא חובר';

  const handlePress = useCallback(() => {
    triggerHealthPermission();
  }, [triggerHealthPermission]);

  const handleInstallHC = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata', '_system');
  }, []);

  return (
    <>
      <CompactMetricTile
        percentage={percentage}
        icon={<Footprints size={16} className="-scale-x-100" />}
        label={connectPromptLabel ?? 'צעדים היום'}
        value={stepsToday.toLocaleString('he-IL')}
        unit={connectPromptLabel ? '' : `/ ${goal.toLocaleString('he-IL')} צעדים`}
        onClick={handlePress}
        colorClass="text-[#00C07A]"
        ariaLabel={`צעדים: ${stepsToday.toLocaleString('he-IL')} מתוך ${goal.toLocaleString('he-IL')}`}
      />
      {unavailableReason === 'install-required' && (
        <button
          onClick={handleInstallHC}
          className="text-xs text-[#00C07A] text-center w-full mt-1 underline"
        >
          התקן Health Connect
        </button>
      )}
      {unavailableReason === 'unsupported' && (
        <p className="text-xs text-muted-foreground text-center mt-1">מכשיר לא נתמך</p>
      )}
      <HealthConnectDisclosureModal {...disclosureProps} />
    </>
  );
}

export function HealthMetricsRow() {
  return (
    <div className="space-y-2">
      <SectionHeader title="מדדי בריאות" />
      <SideBySideRow right={<WhoTile />} left={<StepsTile />} />
    </div>
  );
}

export default HealthMetricsRow;
