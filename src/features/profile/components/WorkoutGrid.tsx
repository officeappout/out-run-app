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
    // G7.3: hybrid used to fall through to the default "ריצה" tile.
    case 'hybrid':
      return { Icon: Activity, label: 'אימון משולב', tileGradient: 'from-orange-500 to-amber-400' };
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

/** v2 tile data — same activity colours as the home flames. */
const V2_TONE: Record<string, { rgb: string; iconSrc: string }> = {
  strength: { rgb: '0,186,247', iconSrc: '/icons/programs/muscle.svg' },
  hybrid: { rgb: '0,186,247', iconSrc: '/icons/programs/muscle.svg' },
  running: { rgb: '132,204,22', iconSrc: '/icons/programs/Run.svg' },
  cycling: { rgb: '132,204,22', iconSrc: '/icons/programs/Run.svg' },
  walking: { rgb: '245,158,11', iconSrc: '/icons/programs/walking.svg' },
  recovery: { rgb: '139,92,246', iconSrc: '/icons/programs/walking.svg' },
};

function dayCaption(workout: WorkoutHistoryEntry): string {
  const raw = (workout as { date?: unknown }).date;
  const d = raw instanceof Date ? raw : typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7) return ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][d.getDay()];
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export default function WorkoutGrid({
  workouts,
  isLoading,
  onOpen,
  v2 = false,
}: {
  workouts: WorkoutHistoryEntry[];
  isLoading: boolean;
  onOpen: (workoutId: string) => void;
  /** Home v2 look (enable_home_v2). */
  v2?: boolean;
}) {
  // Keep every workout in the grid, even one missing `id` (defensive only —
  // every real Firestore-returned entry has one in practice, per the type's
  // own comment) — matches the pre-extraction behavior exactly: an id-less
  // tile still renders, just disabled/dimmed (ActivityTileGrid's own
  // disabled styling), instead of silently disappearing.
  const tiles: ActivityTile[] = workouts.map((workout, idx) => {
    const { Icon, label, tileGradient } = getActivityMeta(workout);
    const workoutId = workout.id;
    const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
    const tone = V2_TONE[type] ?? V2_TONE.running;
    const [value, unit] = tileStat(workout).split(' ');
    const when = dayCaption(workout);
    return {
      v2: { ...tone, value, unit: unit ?? '', caption: when ? `${label} · ${when}` : label },
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
      v2={v2}
      emptyMessage={<>עוד אין אימונים.<br />תתחיל לזוז!</>}
    />
  );
}
