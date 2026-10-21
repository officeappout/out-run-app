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
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

type ProfileT = (key: NamespaceKey<typeof profileNs>, values?: MessageValues) => string;

function getActivityMeta(workout: WorkoutHistoryEntry, t: ProfileT): {
  Icon: React.ElementType;
  label: string;
  tileGradient: string;
} {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  // The label is one select over the same type ids (running / anything else → "other").
  const label = t('profile.grid.type', { type });
  switch (type) {
    case 'strength':
      return { Icon: Dumbbell, label, tileGradient: 'from-purple-500 to-purple-400' };
    case 'walking':
      return { Icon: PersonStanding, label, tileGradient: 'from-emerald-500 to-emerald-400' };
    case 'cycling':
      return { Icon: Bike, label, tileGradient: 'from-amber-500 to-amber-400' };
    case 'recovery':
      return { Icon: Moon, label, tileGradient: 'from-slate-500 to-slate-400' };
    // G7.3: hybrid used to fall through to the default "ריצה" tile.
    case 'hybrid':
      return { Icon: Activity, label, tileGradient: 'from-orange-500 to-amber-400' };
    case 'running':
    default:
      return { Icon: Activity, label, tileGradient: 'from-[#00ADEF] to-[#5BC2F2]' };
  }
}

/** One-line tile stat — distance for cardio types, duration (minutes) for
 * strength/hybrid/recovery, matching each type's existing history card. */
function tileStat(workout: WorkoutHistoryEntry, t: ProfileT): string {
  const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
  if (type === 'strength' || type === 'hybrid' || type === 'recovery') {
    const mins = Math.round((workout.duration ?? 0) / 60);
    return t('profile.grid.minutes', { minutes: String(mins) });
  }
  const km = workout.distance ?? 0;
  return t('profile.grid.km', { km: km.toFixed(1) });
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

function dayCaption(workout: WorkoutHistoryEntry, t: ProfileT): string {
  const raw = (workout as { date?: unknown }).date;
  const d = raw instanceof Date ? raw : typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return t('profile.grid.today');
  if (days === 1) return t('profile.grid.yesterday');
  if (days < 7) return ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][d.getDay()]; // i18n-allow-hebrew: wave 3 (fmt) — weekday names
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
  const t = useT(profileNs);
  // Keep every workout in the grid, even one missing `id` (defensive only —
  // every real Firestore-returned entry has one in practice, per the type's
  // own comment) — matches the pre-extraction behavior exactly: an id-less
  // tile still renders, just disabled/dimmed (ActivityTileGrid's own
  // disabled styling), instead of silently disappearing.
  const tiles: ActivityTile[] = workouts.map((workout, idx) => {
    const { Icon, label, tileGradient } = getActivityMeta(workout, t);
    const workoutId = workout.id;
    const type = (workout.workoutType ?? workout.activityType ?? 'running').toLowerCase();
    const tone = V2_TONE[type] ?? V2_TONE.running;
    const [value, unit] = tileStat(workout, t).split(' ');
    const when = dayCaption(workout, t);
    return {
      v2: { ...tone, value, unit: unit ?? '', caption: when ? t('profile.grid.caption', { label, when }) : label },
      id: workoutId ?? `idx-${idx}`,
      Icon,
      label,
      stat: tileStat(workout, t),
      tileGradient,
      onClick: workoutId ? () => onOpen(workoutId) : undefined,
    };
  });

  return (
    <ActivityTileGrid
      tiles={tiles}
      isLoading={isLoading}
      v2={v2}
      emptyMessage={<>{t('profile.grid.empty.line1')}<br />{t('profile.grid.empty.line2')}</>}
    />
  );
}
