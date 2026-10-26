/**
 * training-here.logic — PURE decisions of the shared "I'm training here" sheet
 * (enable_where_to_train_v1): the "later" time chips, the chosen start time, the reminder
 * time, and the planned_sessions write it maps to. No Firebase, no React.
 */
import type { CreatePlannedSessionInput } from '@/features/admin/services/planned-sessions.service';
import type { PrivacyMode } from '@/types/community.types';
import type { ActivityType } from '@/features/parks/core/types/route.types';

export type TrainingHereActivity = 'workout' | 'running' | 'walking';
export type TrainingHereWhen = 'now' | 'later';
export type TrainingHereVisibility = Extract<PrivacyMode, 'verified_global' | 'squad'>;

export interface TrainingHerePlace {
  kind: 'park' | 'route';
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  /** Metres from the user, when known (shown next to the name). */
  distanceM?: number | null;
}

/** How many "later" hour chips the sheet offers before "אחר". */
export const LATER_CHIP_COUNT = 3;
/** The reminder fires this long before the chosen time. */
export const REMINDER_LEAD_MIN = 15;

/** The next `count` full hours strictly after `now` (16:20 → 17:00, 18:00, 19:00; may cross midnight). */
export function laterTimeOptions(now: Date, count = LATER_CHIP_COUNT): Date[] {
  const first = new Date(now);
  first.setMinutes(0, 0, 0);
  first.setHours(first.getHours() + 1);
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * 3_600_000));
}

/** "HH:MM" → the next occurrence after `now` (today, or tomorrow when already past). Null when malformed. */
export function nextOccurrence(hhmm: string, now: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** The session's start: now, or the picked later time (falls back to now when none is picked). */
export function resolveStartTime(when: TrainingHereWhen, picked: Date | null, now: Date): Date {
  return when === 'later' && picked ? picked : now;
}

/** REMINDER_LEAD_MIN before the start, never in the past. */
export function reminderTimeFor(start: Date, now: Date, leadMin = REMINDER_LEAD_MIN): Date {
  return new Date(Math.max(start.getTime() - leadMin * 60_000, now.getTime()));
}

const ACTIVITY_TYPE: Record<TrainingHereActivity, ActivityType> = {
  workout: 'workout',
  running: 'running',
  walking: 'walking',
};

/** The planned_sessions doc this sheet writes — the same shape the park / route "אני מגיע" flows write. */
export function buildArrivalInput(args: {
  userId: string;
  displayName: string;
  photoURL: string | null;
  place: TrainingHerePlace;
  activity: TrainingHereActivity;
  startTime: Date;
  visibility: TrainingHereVisibility;
}): CreatePlannedSessionInput {
  const { place } = args;
  return {
    userId: args.userId,
    displayName: args.displayName,
    photoURL: args.photoURL,
    ...(place.kind === 'park'
      ? { parkId: place.id, parkName: place.name }
      : { routeId: place.id, routeName: place.name }),
    lat: place.lat,
    lng: place.lng,
    activityType: ACTIVITY_TYPE[args.activity],
    startTime: args.startTime,
    privacyMode: args.visibility,
  };
}
