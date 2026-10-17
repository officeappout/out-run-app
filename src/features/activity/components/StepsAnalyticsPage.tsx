'use client';

/**
 * StepsAnalyticsPage — drill-down from the dashboard StepsSummaryCard.
 *
 * Container: owns routing, the native health-permission state, the
 * disclosure flow and `useStepsAnalytics`. Everything visual lives in
 * `StepsAnalyticsView` (presentational, renderable from fixtures).
 *
 * Permission gate: when running on a native device and health permissions have
 * not yet been granted, the chart is replaced by a Connect to Health screen
 * that drives the full disclosure → OS permission flow inline.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  useStepsAnalytics,
  type StepsTimeRange,
} from '../hooks/useStepsAnalytics';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { healthBridgeSyncNow } from '@/lib/healthBridge/init';
import StepsAnalyticsView from './StepsAnalyticsView';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';

const PREF_KEY_PERMISSIONS = 'outrun.healthBridge.permissionsGranted';

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export default function StepsAnalyticsPage() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<StepsTimeRange>('week');
  // Home v2 (enable_home_v2): the line chart from the design lab.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  // Optimistic default (true) — loading skeleton covers the async gap on native.
  const [hasPermissions, setHasPermissions] = useState(true);

  useEffect(() => {
    if (!isNativeApp()) return; // web: no native permissions needed, keep true
    (async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: PREF_KEY_PERMISSIONS });
        setHasPermissions(value === '1');
      } catch {
        // On error keep true — don't block the UI
      }
    })();
  }, []);

  const handlePermissionsGranted = useCallback(() => {
    setHasPermissions(true);
    void healthBridgeSyncNow('manual');
  }, []);

  const { openDisclosure, disclosureProps } = useHealthWithDisclosure({
    onGranted: handlePermissionsGranted,
  });

  const { snapshots, chartData, stats, loading, error } = useStepsAnalytics(timeRange);

  return (
    <StepsAnalyticsView
      lineChart={v2}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      snapshots={snapshots}
      chartData={chartData}
      stats={stats}
      loading={loading}
      error={error}
      hasPermissions={hasPermissions}
      onConnect={openDisclosure}
      onBack={() => router.back()}
      footer={<HealthConnectDisclosureModal {...disclosureProps} />}
    />
  );
}
