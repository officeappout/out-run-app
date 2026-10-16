import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

/**
 * aerobic-history-adapter — maps a saved walk/run doc (WorkoutHistoryEntry, as
 * getWorkoutById returns it) into the `workout` / `activityType` props
 * AerobicSummaryShell expects, so /workouts/[id]/history renders the SAME
 * summary view as a just-finished run (sibling of strength-history-adapter /
 * hybrid-history-adapter).
 *
 * Pure (no I/O, no hooks). Keeps the exact values the retired FreeRunSummary
 * read-only mode showed for the same doc:
 * - routePath: stored docs are `[{lat, lng}]` (storage.service converts on
 *   write, Firestore can't hold nested arrays); older docs may be `[[a, b]]`.
 *   Normalised to the `[lng, lat]` tuples RunMapBlock draws — FreeRunSummary's
 *   exact parse, NaN points dropped.
 * - pace: average pace = (duration / 60) / distance when both are positive,
 *   else the stored `pace` — FreeRunSummary's `avgPace` formula.
 * Every other field passes through untouched.
 */

export type AerobicHistoryWorkout = WorkoutHistoryEntry & { date: Date };

export function historyRoutePathToCoords(routePath: unknown): [number, number][] {
  if (!Array.isArray(routePath) || routePath.length === 0) return [];
  const out: [number, number][] = [];
  for (const coord of routePath as unknown[]) {
    let pt: [number, number] | null = null;
    if (coord && typeof coord === 'object' && !Array.isArray(coord) && 'lat' in coord && 'lng' in coord) {
      const c = coord as { lat: unknown; lng: unknown };
      pt = [Number(c.lng), Number(c.lat)]; // Mapbox expects [lng, lat]
    } else if (Array.isArray(coord) && coord.length >= 2) {
      pt = [Number(coord[0]), Number(coord[1])];
    }
    if (pt && !Number.isNaN(pt[0]) && !Number.isNaN(pt[1])) out.push(pt);
  }
  return out;
}

export function historyAveragePace(workout: Pick<WorkoutHistoryEntry, 'distance' | 'duration' | 'pace'>): number {
  const distance = workout.distance ?? 0;
  const duration = workout.duration ?? 0;
  if (distance > 0 && duration > 0) return duration / 60 / distance;
  return workout.pace || 0;
}

/** 'walking' when the doc says so (workoutType first, legacy activityType fallback), else 'running'. */
export function aerobicHistoryActivityType(
  workout: Pick<WorkoutHistoryEntry, 'workoutType' | 'activityType'>,
): 'walking' | 'running' {
  const t = workout.workoutType ?? workout.activityType;
  return t === 'walking' ? 'walking' : 'running';
}

export function workoutHistoryEntryToAerobicWorkout(workout: WorkoutHistoryEntry): AerobicHistoryWorkout {
  return {
    ...workout,
    date: workout.date instanceof Date ? workout.date : new Date(workout.date as unknown as string),
    routePath: historyRoutePathToCoords(workout.routePath),
    pace: historyAveragePace(workout),
  };
}
