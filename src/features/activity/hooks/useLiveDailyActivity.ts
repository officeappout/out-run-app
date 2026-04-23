/**
 * useLiveDailyActivity — sensor-aware overlay on top of useDailyActivity.
 *
 * Native Phase, Apr 2026.
 *
 * Returns the same shape as `useDailyActivity` but with a tiny in-memory
 * overlay applied so that HealthKit / Health Connect samples pushed by
 * the HealthBridge native plugin are reflected on the rings INSTANTLY,
 * without waiting for the Cloud Function round-trip.
 *
 * Data flow
 * ─────────
 *   Sensor sample arrives
 *     ↓
 *   pushSample() fan-out  →  this overlay bumps locally  →  ring re-renders
 *                       \
 *                        →  HealthBridge enqueues to IndexedDB outbox
 *                        →  OutboxFlusher posts to ingestHealthSamples
 *                        →  Server updates dailyActivity
 *                        →  Firestore onSnapshot updates Zustand store
 *                        →  Overlay self-clears (see RECONCILE_INTERVAL_MS)
 *
 * The overlay is approximate — for ~30s the rings may show overlay + Zustand
 * slightly double-counted while the server confirms. We accept this so the
 * UI feels instant. For v1 this is the right trade-off; if the slight wobble
 * becomes visible we can add a high-water-mark cursor on the dailyActivity
 * doc instead.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDailyActivity, type DailyActivityResult } from './useDailyActivity';
import { onLiveSample, type LiveSampleEvent } from '@/lib/healthBridge/eventEmitter';
import {
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  DEFAULT_DAILY_GOALS,
  type ActivityCategory,
  type RingData,
} from '../types/activity.types';

/** How often the in-memory overlay self-clears once the server should
 *  have caught up. 30s comfortably exceeds typical foreground sync time. */
const RECONCILE_INTERVAL_MS = 30_000;

interface LiveOverlay {
  passiveSteps: number;
  passiveCalories: number;
  passiveActiveMinutes: number;
  /** Wall-clock millis of last sample push (for reconcile timer). */
  lastPushAt: number | null;
}

const EMPTY_OVERLAY: LiveOverlay = {
  passiveSteps: 0,
  passiveCalories: 0,
  passiveActiveMinutes: 0,
  lastPushAt: null,
};

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface LiveDailyActivityResult extends DailyActivityResult {
  /** True when at least one sensor sample landed since the last reconcile. */
  hasLiveOverlay: boolean;
  /** Passive XP awarded today (read from Zustand, falls back to 0). */
  passiveXpAwardedToday: number;
}

export function useLiveDailyActivity(): LiveDailyActivityResult {
  const base = useDailyActivity();
  const [overlay, setOverlay] = useState<LiveOverlay>(EMPTY_OVERLAY);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to live sensor pushes from the HealthBridge plugin.
  useEffect(() => {
    const today = todayKey();
    const off = onLiveSample((evt: LiveSampleEvent) => {
      if (evt.date !== today) return; // ignore back-fills for previous days here
      setOverlay((prev) => {
        const next: LiveOverlay = { ...prev, lastPushAt: Date.now() };
        switch (evt.type) {
          case 'steps':
            next.passiveSteps = prev.passiveSteps + Math.max(0, Math.floor(evt.value));
            break;
          case 'activeEnergy':
            next.passiveCalories = prev.passiveCalories + Math.max(0, Math.round(evt.value));
            break;
          case 'exerciseTime':
            next.passiveActiveMinutes =
              prev.passiveActiveMinutes + Math.max(0, Math.floor(evt.value));
            break;
        }
        return next;
      });

      // Reset the reconcile timer — clear overlay once the server should
      // have caught up, so we don't double-count after Firestore syncs.
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        setOverlay(EMPTY_OVERLAY);
      }, RECONCILE_INTERVAL_MS);
    });
    return () => {
      off();
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
    };
  }, []);

  // Apply overlay to ring data. Passive activeMinutes feed the cardio
  // bucket — same convention the server uses (categories.cardio.minutes
  // bumped by ingestHealthSamples). This keeps client + server math aligned.
  const ringData = useMemo<RingData[]>(() => {
    if (overlay.passiveActiveMinutes === 0) return base.ringData;
    return base.ringData.map((r) => {
      if (r.id !== ('cardio' as ActivityCategory)) return r;
      const value = r.value + overlay.passiveActiveMinutes;
      const max = r.max || DEFAULT_DAILY_GOALS.cardio;
      const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
      return { ...r, value, percentage };
    });
  }, [base.ringData, overlay.passiveActiveMinutes]);

  // Hydrate a ring data shape if the base is empty (first paint while
  // Zustand hydrates) so the widget never flashes blank with overlay data.
  const safeRingData = useMemo<RingData[]>(() => {
    if (ringData.length > 0) return ringData;
    if (overlay.passiveActiveMinutes === 0) return ringData;
    const cardio = ACTIVITY_COLORS.cardio.hex;
    return [
      {
        id: 'cardio',
        label: ACTIVITY_LABELS.cardio.he,
        value: overlay.passiveActiveMinutes,
        max: DEFAULT_DAILY_GOALS.cardio,
        percentage: Math.min(
          100,
          (overlay.passiveActiveMinutes / DEFAULT_DAILY_GOALS.cardio) * 100,
        ),
        color: cardio,
        colorClass: ACTIVITY_COLORS.cardio.tailwind,
        order: 0,
        icon: ACTIVITY_LABELS.cardio.icon,
      },
    ];
  }, [ringData, overlay.passiveActiveMinutes]);

  const totalMinutesToday = useMemo(
    () => base.totalMinutesToday + overlay.passiveActiveMinutes,
    [base.totalMinutesToday, overlay.passiveActiveMinutes],
  );

  const stepsToday = useMemo(
    () => base.stepsToday + overlay.passiveSteps,
    [base.stepsToday, overlay.passiveSteps],
  );

  const caloriesToday = useMemo(
    () => base.caloriesToday + overlay.passiveCalories,
    [base.caloriesToday, overlay.passiveCalories],
  );

  // Pull passive XP from the today doc if present (server-managed field).
  const passiveXpAwardedToday = useMemo(() => {
    const raw = (base.todayActivity as unknown as Record<string, unknown> | null)
      ?.passiveXpAwardedToday;
    const n = typeof raw === 'number' ? raw : 0;
    return Number.isFinite(n) ? n : 0;
  }, [base.todayActivity]);

  return {
    ...base,
    ringData: safeRingData,
    totalMinutesToday,
    stepsToday,
    caloriesToday,
    hasLiveOverlay: overlay.lastPushAt !== null,
    passiveXpAwardedToday,
  };
}

export default useLiveDailyActivity;
