/**
 * The aerobic summary's workout when finishWorkout saved nothing (pilot AK5): a walk / run under
 * 60 s and 100 m is discarded (isDiscardableRun), so savedWorkoutSnapshot stays null. The summary
 * used to spread that null into an empty workout typed 'running' — a free walk read "ריצה", the
 * rings showed "--". This builds the view from the live session instead. Pure.
 */
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

export type SummaryAerobic = 'walking' | 'running';

/** The snapshot's activity when it has one, else the live session's, else a run. */
export function summaryActivity(snapActivity: unknown, liveActivity: unknown): SummaryAerobic {
  if (snapActivity === 'walking' || snapActivity === 'running') return snapActivity;
  if (snapActivity == null && (liveActivity === 'walking' || liveActivity === 'running')) return liveActivity;
  return 'running';
}

/** The saved snapshot as-is, or the live session's totals when nothing was saved. */
export function summaryWorkout(
  snap: WorkoutHistoryEntry | null | undefined,
  live: { activity: SummaryAerobic; durationSec: number; distanceKm: number; routeCoords: unknown },
): WorkoutHistoryEntry & { date: Date } {
  if (snap) return { ...snap, date: snap.date ?? new Date() };
  return {
    activityType: live.activity,
    workoutType: live.activity,
    duration: Number.isFinite(live.durationSec) ? live.durationSec : 0,
    distance: Number.isFinite(live.distanceKm) ? live.distanceKm : 0,
    calories: 0,
    pace: 0,
    routePath: Array.isArray(live.routeCoords) ? live.routeCoords : [],
    date: new Date(),
  } as unknown as WorkoutHistoryEntry & { date: Date };
}
