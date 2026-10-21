/**
 * Home v2 first-week card — the profile → card adapter (pure, tested).
 * The day plan and the copy live in the shared first-week core
 * (src/features/notifications/first-week/first-week.core.ts), the same file
 * the server's first-week pushes use.
 */
import { firstWeekCard, firstWeekDayIndex, type FirstWeekCard } from '@/features/notifications/first-week/first-week.core';

export type FirstWeekArtTrack = 'strength' | 'running';

interface ProfileLike {
  id?: string;
  createdAt?: unknown;
  core?: { name?: unknown } | null;
  progression?: { workoutCount?: unknown } | null;
  running?: { isUnlocked?: unknown; lastWorkoutDate?: unknown } | null;
  lifestyle?: { primaryTrack?: unknown } | null;
}

/** Firestore Timestamp / Date / millis / ISO → millis, or null. */
export function createdAtMillis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  if (v && typeof v === 'object') {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}

/** Any workout ever, from the profile alone (the flat counter + a logged run + today's done flag). */
export function profileHasWorkout(profile: ProfileLike | null | undefined, doneToday = false): boolean {
  if (doneToday) return true;
  const count = profile?.progression?.workoutCount;
  if (typeof count === 'number' && count > 0) return true;
  return !!profile?.running?.lastWorkoutDate;
}

export function firstWeekArtTrack(profile: ProfileLike | null | undefined): FirstWeekArtTrack {
  return profile?.lifestyle?.primaryTrack === 'run' || profile?.running?.isUnlocked === true ? 'running' : 'strength';
}

/** The card for this profile today, or null (not first week / already trained / unknown signup). */
export function firstWeekCardForProfile(
  profile: ProfileLike | null | undefined,
  nowMs: number,
  doneToday = false,
): FirstWeekCard | null {
  if (!profile) return null;
  const name = typeof profile.core?.name === 'string' ? profile.core.name.trim().split(/\s+/)[0] : '';
  return firstWeekCard({
    dayIndex: firstWeekDayIndex(createdAtMillis(profile.createdAt), nowMs),
    hasWorkout: profileHasWorkout(profile, doneToday),
    firstName: name,
  });
}

/** Per-viewer dismissal key (one card per day). */
export function firstWeekDismissKey(uid: string | undefined, day: number): string {
  return `out.firstWeekCard.dismissed.${uid ?? 'anon'}.${day}`;
}
