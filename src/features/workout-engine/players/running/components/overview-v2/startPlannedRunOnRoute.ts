/**
 * Start a planned run on a chosen route from outside the planned-run map
 * layer (board M-6j → "התחל אימון במסלול" in Discover). The same steps the
 * planned-run launch takes — program position for the save path
 * (PlannedPreviewLayer's sessionStorage keys), the workout in the running
 * player, a running session — then the existing route-run start
 * (startActiveWorkoutForRoute keeps the planned workout → plan mode, guided route).
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import type RunWorkout from '../../types/run-workout.type';

export interface StartPlannedRunOnRouteArgs {
  route: Route;
  workout: RunWorkout;
  week: number;
  day: number;
  setFocusedRoute: (route: Route | null) => void;
  startActiveWorkoutForRoute: (route: Route | null) => void;
}

export function startPlannedRunOnRoute({ route, workout, week, day, setFocusedRoute, startActiveWorkoutForRoute }: StartPlannedRunOnRouteArgs): void {
  try {
    sessionStorage.setItem('planned_run_week', String(week));
    sessionStorage.setItem('planned_run_day', String(day));
  } catch {
    // Private mode — the run still starts; only the program position is lost.
  }
  const rp = useRunningPlayer.getState();
  rp.setActivityType('running');
  rp.setCurrentWorkout(workout);
  setFocusedRoute(route);
  startActiveWorkoutForRoute(route);
}
