"use client";

/**
 * HealthMetricsRow — "מדדי בריאות" section (Health Track row).
 *
 * Layout (RTL):
 *   header = "מדדי בריאות"
 *   right  = WHO 150 minutes (compact tile, ring + value / 150 דק׳)
 *   left   = Steps today (compact tile, click → /activity/steps)
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
import SideBySideRow from './SideBySideRow';
import SectionHeader from './SectionHeader';
import CompactMetricTile from '@/features/home/components/widgets/CompactMetricTile';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';
import { requestHealthPermissions } from '@/lib/healthBridge/init';

const WHO_TARGET = 150;
const FALLBACK_STEPS_GOAL = 10_000;

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
  const healthBridgeEnabled = useSettingsStore((s) => s.healthBridgeEnabled);
  const patchSettings = useSettingsStore((s) => s.patch);
  const goal = todayActivity?.stepsGoal ?? FALLBACK_STEPS_GOAL;
  const percentage = goal > 0 ? Math.min(100, Math.round((stepsToday / goal) * 100)) : 0;

  const handlePress = useCallback(async () => {
    if (healthBridgeEnabled) {
      router.push('/activity/steps');
      return;
    }
    const isNative =
      typeof window !== 'undefined' &&
      Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isNative) {
      router.push('/activity/steps');
      return;
    }
    try {
      const { granted } = await requestHealthPermissions();
      if (granted) {
        patchSettings({ healthBridgeEnabled: true });
        router.push('/activity/steps');
      }
    } catch {
      // Plugin unavailable or dialog dismissed — no-op.
    }
  }, [healthBridgeEnabled, patchSettings, router]);

  return (
    <CompactMetricTile
      percentage={percentage}
      icon={<Footprints size={16} className="-scale-x-100" />}
      label="צעדים היום"
      value={stepsToday.toLocaleString('he-IL')}
      unit={`/ ${goal.toLocaleString('he-IL')} צעדים`}
      onClick={handlePress}
      ariaLabel={`צעדים: ${stepsToday.toLocaleString('he-IL')} מתוך ${goal.toLocaleString('he-IL')}`}
    />
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
