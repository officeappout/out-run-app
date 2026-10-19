/**
 * useHybridSituation — gathers the HybridSituation snapshot for the situation-aware hybrid
 * cards (enable_hybrid_cards_v2). Returns null while `enabled` is false (flag off → no reads
 * at all) or until the parks catalog has loaded.
 *
 * Reads only (no writes): the cached parks catalog, the cached published routes, today's
 * userSchedule doc, and the in-memory activity / weekly-volume stores. Weather comes from the
 * existing useWeather cache when the weather flags allow it for this user.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Park } from '@/features/parks/core/types/park.types';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { useWeeklyVolumeStore, getCurrentWeekStart } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { buildStepContext } from '@/features/workout-engine/core/context/build-step-context';
import { useHealthConnected } from '@/hooks/useHealthConnected';
import { useWeather } from '@/features/weather/hooks/useWeather';
import { nearestEquippedPark } from '../park-out-and-back';
import { findRoutesWithStops, type RouteLike } from './routes-with-stops';
import { todayScheduledKind } from './today-schedule-kind';
import { focusFromMap } from './map-focus';
import { strengthSetsDoneToday, trainingDaysOf } from '../../budget-light/snapshot';
import type { HybridSituation, NearbyPark, SmartProfileLite, TodayScheduledKind } from './situation.types';

type LatLng = { lat: number; lng: number };

export interface UseHybridSituationArgs {
  enabled: boolean;
  userLocation: LatLng | null;
  aerobicKind: 'walking' | 'running';
  profile: SmartProfileLite | null | undefined;
  hasStrengthProgram: boolean;
  weatherOn: boolean;
  flags: HybridSituation['flags'];
  /** Budget light mode (enable_budget_light_mode); false → the situation is exactly as before. */
  budgetLight?: boolean;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useHybridSituation(a: UseHybridSituationArgs): HybridSituation | null {
  const [parks, setParks] = useState<Park[] | null>(null);
  const [routes, setRoutes] = useState<RouteLike[]>([]);
  const [todayScheduled, setTodayScheduled] = useState<TodayScheduledKind>('unknown');

  const today = useActivityStore((s) => s.today);
  const healthConnected = useHealthConnected();
  const strength = useWeeklyVolumeStore((s) => s.strength);
  const weekStart = useWeeklyVolumeStore((s) => s.weekStartDate);
  const sessionLogs = useWeeklyVolumeStore((s) => s.sessionLogs);
  const selectedPark = useMapStore((s) => s.selectedPark);
  const viewportBounds = useMapStore((s) => s.viewportBounds);
  const weather = useWeather(a.enabled && a.weatherOn);

  // Parks + published routes (both cached; stale-while-revalidate catalogs).
  useEffect(() => {
    if (!a.enabled) return;
    let cancelled = false;
    Promise.all([
      import('@/features/parks/core/services/parks.service'),
      import('@/features/parks/core/services/inventory.service'),
    ]).then(async ([{ fetchRealParks }, { getCachedOfficialRoutes }]) => {
      const [p, r] = await Promise.all([
        fetchRealParks().catch(() => [] as Park[]),
        getCachedOfficialRoutes().catch(() => [] as RouteLike[]),
      ]);
      if (cancelled) return;
      setParks(p);
      setRoutes(r as RouteLike[]);
    }).catch(() => { if (!cancelled) setParks([]); });
    return () => { cancelled = true; };
  }, [a.enabled]);

  // Today's schedule (one read of userSchedule/{uid}_{today}).
  const uid: string | undefined = a.profile?.id;
  useEffect(() => {
    if (!a.enabled || !uid) return;
    let cancelled = false;
    import('@/features/user/scheduling/services/userSchedule.service')
      .then(({ getScheduleEntries }) => getScheduleEntries(uid, localDateKey(new Date())))
      .then((entries) => { if (!cancelled) setTodayScheduled(todayScheduledKind(entries)); })
      .catch(() => { if (!cancelled) setTodayScheduled('unknown'); });
    return () => { cancelled = true; };
  }, [a.enabled, uid]);

  // ~110m location bucket so GPS jitter doesn't rescan every tick.
  const locKey = a.userLocation ? `${a.userLocation.lat.toFixed(3)},${a.userLocation.lng.toFixed(3)}` : '';
  const focus = useMemo(
    () => focusFromMap(selectedPark, viewportBounds, a.userLocation),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPark, viewportBounds, locKey],
  );
  const focusKey = focus ? `${focus.lat.toFixed(3)},${focus.lng.toFixed(3)}` : '';

  const geo = useMemo(() => {
    if (!a.enabled || !parks || !a.userLocation) return null;
    const user = a.userLocation;
    const near = nearestEquippedPark(user, parks);
    const nearestPark: NearbyPark | null = near?.location
      ? { id: near.id, name: near.name, distanceM: Math.round(haversineMeters(user.lat, user.lng, near.location.lat, near.location.lng)) }
      : null;
    return { nearestPark, routesWithStops: findRoutesWithStops({ routes, parks, user, focus }) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.enabled, parks, routes, locKey, focusKey]);

  const hasGps = !!a.userLocation;
  return useMemo<HybridSituation | null>(() => {
    if (!a.enabled || !parks) return null;
    const step = buildStepContext(today, healthConnected);
    const steps = healthConnected === false || !(step.stepGoal > 0)
      ? null
      : { stepsRemaining: step.stepsRemaining, stepGoal: step.stepGoal };
    // A budget from a past week (store not reset yet this week) is unknown, not real.
    const strengthSnap = strength && weekStart === getCurrentWeekStart()
      ? {
          weeklyBudget: strength.weeklyBudget, totalSetsCompleted: strength.totalSetsCompleted,
          // Budget light mode only: today's sets + week days for the daily budget.
          ...(a.budgetLight
            ? { setsDoneToday: strengthSetsDoneToday(sessionLogs, new Date()), trainingDaysPerWeek: trainingDaysOf(a.profile) }
            : {}),
        }
      : null;
    const g = a.profile?.core?.gender;
    return {
      hasGps,
      aerobicKind: a.aerobicKind,
      gender: g === 'female' ? 'female' : g === 'male' ? 'male' : undefined,
      nearestEquippedPark: geo?.nearestPark ?? null,
      routesWithStops: geo?.routesWithStops ?? [],
      steps,
      strength: strengthSnap,
      todayScheduled,
      hasStrengthProgram: a.hasStrengthProgram,
      hour: new Date().getHours(),
      weatherFlag: weather?.classification.flag ?? null,
      basePaceSecPerKm: a.profile?.running?.paceProfile?.basePace ?? undefined,
      flags: a.flags,
      ...(a.budgetLight ? { budgetLight: true } : {}),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.enabled, parks, geo, today, healthConnected, strength, weekStart, todayScheduled,
    a.hasStrengthProgram, a.aerobicKind, a.profile?.core?.gender, weather,
    a.flags.walkStrength, a.flags.fullPark, a.flags.routeStops, hasGps, a.budgetLight, sessionLogs]);
}
