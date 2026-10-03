'use client';

/**
 * WorkoutGrid — self-profile adapter over ActivityTileGrid ("public
 * profile" slice 1 extraction; was an inline function at the bottom of
 * DashboardTab.tsx, moved here verbatim so it can be a standalone shared
 * module instead of trapped in one file). Maps the PRIVATE
 * WorkoutHistoryEntry[] (useWorkoutHistory — owner-only Firestore access,
 * never available for another user) into the generic tile shape. Same
 * exact props/behavior as before this move; DashboardTab's own call site
 * is unchanged other than the import.
 */

import { Activity, Bike, Dumbbell, PersonStanding, Moon } from 'lucide-react';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import ActivityTileGrid, { type ActivityTile } from './ActivityTileGrid';

function getActivityMeta(workout: WorkoutHistoryEntry): {
  Icon: React.ElementType;
  label: string;
  tileGradient: string;
} {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  switch (type) {
    case 'strength':
      return { Icon: Dumbbell, label: 'אימון כוח', tileGradient: 'from-purple-500 to-purple-400' };
    case 'walking':
      return { Icon: PersonStanding, label: 'הליכה', tileGradient: 'from-emerald-500 to-emerald-400' };
    case 'cycling':
      return { Icon: Bike, label: 'רכיבה', tileGradient: 'from-amber-500 to-amber-400' };
    case 'recovery':
      return { Icon: Moon, label: 'אימון התאוששות', tileGradient: 'from-slate-500 to-slate-400' };
    case 'running':
    default:
      return { Icon: Activity, label: 'ריצה', tileGradient: 'from-[#00ADEF] to-[#5BC2F2]' };
  }
}

/** One-line tile stat — distance for cardio types, duration (minutes) for
 * strength/hybrid/recovery, matching each type's existing history card. */
function tileStat(workout: WorkoutHistoryEntry): string {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  if (type === 'strength' || type === 'hybrid' || type === 'recovery') {
    const mins = Math.round((workout.duration ?? 0) / 60);
    return `${mins} דק'`;
  }
  const km = workout.distance ?? 0;
  return `${km.toFixed(1)} ק״מ`;
}

export default function WorkoutGrid({
  workouts,
  isLoading,
  onOpen,
}: {
  workouts: WorkoutHistoryEntry[];
  isLoading: boolean;
  onOpen: (workoutId: string) => void;
}) {
  // Keep every workout in the grid, even one missing `id` (defensive only —
  // every real Firestore-returned entry has one in practice, per the type's
  // own comment) — matches the pre-extraction behavior exactly: an id-less
  // tile still renders, just disabled/dimmed (ActivityTileGrid's own
  // disabled styling), instead of silently disappearing.
  const tiles: ActivityTile[] = workouts.map((workout, idx) => {
    const { Icon, label, tileGradient } = getActivityMeta(workout);
    const workoutId = workout.id;
    return {
      id: workoutId ?? `idx-${idx}`,
      Icon,
      label,
      stat: tileStat(workout),
      tileGradient,
      onClick: workoutId ? () => onOpen(workoutId) : undefined,
    };
  });

  return (
    <ActivityTileGrid
      tiles={tiles}
      isLoading={isLoading}
      emptyMessage={<>עוד אין אימונים.<br />תתחיל לזוז!</>}
    />
  );
}
