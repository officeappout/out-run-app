'use client';

/**
 * Start a place card through the paths that already exist:
 *   park_strength   → useMapStore.pendingParkWorkoutStart (+ its options) → /home composes
 *                     the park workout and opens the workout drawer (GlobalDetailOverlay's path).
 *   hybrid          → useMapStore.pendingHybridIntent → the map composes it and shows the
 *                     hybrid overview (the free-run drawer's composeAndShowOverview).
 *   planned_run     → on a route: today's run in the running player + pendingRouteStart
 *                     (startPlannedRunOnRoute's steps); from a park: the planned-run map link
 *                     with "הצע לי מסלול".
 *   route_activity  → the route as a run / walk (startRouteAs: activity + pendingRouteStart).
 */

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { plannedRunMapUrl } from '@/features/workout-engine/players/running/utils/run-overview/run-overview-url';
import type { TodayPlannedRun } from '@/features/workout-engine/players/running/components/overview-v2/useTodayPlannedRun';
import type { PlaceWorkoutStart } from '@/features/workout-engine/place-fit';
import { hybridIntentFor } from '../place-hybrid-intent';

export interface PlaceStartTargets {
  park?: Park | null;
  route?: Route | null;
  todayRun?: TodayPlannedRun | null;
  basePaceSecPerKm?: number | null;
  /** Close the sheet the card sits in. */
  onClose: () => void;
}

function goTo(router: ReturnType<typeof useRouter>, path: string) {
  if (typeof window !== 'undefined' && window.location.pathname !== path) router.push(path);
}

export function usePlaceWorkoutStart({ park, route, todayRun, basePaceSecPerKm, onClose }: PlaceStartTargets) {
  const router = useRouter();
  // The host's onClose may be a fresh arrow each render; keep the starter stable anyway.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  return useCallback((start: PlaceWorkoutStart) => {
    const onClose = () => closeRef.current();
    const store = useMapStore.getState();
    switch (start.kind) {
      case 'park_strength': {
        if (!park) return;
        store.setPendingParkWorkoutStart(park, { difficulty: start.difficulty, minutes: start.minutes });
        onClose();
        goTo(router, '/home');
        return;
      }
      case 'hybrid': {
        store.setPendingHybridIntent(hybridIntentFor(start, basePaceSecPerKm ?? null));
        onClose();
        goTo(router, '/map');
        return;
      }
      case 'planned_run': {
        if (start.routeId && route && todayRun && todayRun.workoutId === start.workoutId) {
          try {
            sessionStorage.setItem('planned_run_week', String(start.week));
            sessionStorage.setItem('planned_run_day', String(start.day));
          } catch {
            // Private mode — the run still starts; only the program position is lost.
          }
          const rp = useRunningPlayer.getState();
          rp.setActivityType('running');
          rp.setCurrentWorkout(todayRun.workout);
          store.setPendingRouteStart(route);
          onClose();
          goTo(router, '/map');
          return;
        }
        onClose();
        router.push(plannedRunMapUrl({ workoutId: start.workoutId, week: start.week, day: start.day, suggest: true }));
        return;
      }
      case 'route_activity': {
        if (!route) return;
        useRunningPlayer.getState().setActivityType(start.activity);
        store.setPendingRouteStart(route);
        onClose();
        goTo(router, '/map');
        return;
      }
    }
  }, [park, route, todayRun, basePaceSecPerKm, router]);
}
