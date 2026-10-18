/**
 * getDaysAway — ONE answer to "how many days since this user's last real workout".
 *
 * Before calm return (CALM_RETURN_V1) the app counted the gap three different ways:
 *   - progression.lastActiveDate ('YYYY-MM-DD', calculateDaysInactive → strength generator),
 *   - running.lastWorkoutDate (ISO, handleProgramAlignment → running popups),
 *   - users.lastActive (a serverTimestamp of the last APP OPEN — not a workout, so never
 *     used here).
 * A strength-only user could read as "away 30 days" to the running brain while training
 * every day. This module takes the LATEST of every real-workout date the profile carries
 * (lastActiveDate, running.lastWorkoutDate, each progression track's lastWorkoutDate) and
 * counts whole local days to `now`.
 *
 * Pure: no Firebase, no clock. `now` is always passed in (the edge reads the clock).
 * The schedule advisor (#440, src/features/schedule/advisor) counts its own gap from the
 * workouts collection; it can adopt latestWorkoutDate/daysBetweenLocalDays later.
 */

/** The profile fields this module reads — a UserFullProfile satisfies it. */
export interface DaysAwayProfile {
  progression?: {
    lastActiveDate?: unknown;
    tracks?: Record<string, { lastWorkoutDate?: unknown } | undefined> | null;
  } | null;
  running?: { lastWorkoutDate?: unknown } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Best-effort conversion of the date shapes Firestore/profile code hands us. */
export function toDateOrNull(value: unknown): Date | null {
  if (value == null || value === '') return null;
  let d: Date | null = null;
  if (value instanceof Date) d = new Date(value.getTime());
  else if (typeof value === 'string' || typeof value === 'number') {
    // 'YYYY-MM-DD' parses as UTC midnight; read it as a LOCAL calendar day instead.
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, day] = value.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(value);
    }
  } else if (typeof value === 'object') {
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === 'function') d = v.toDate();
    else if (typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
  }
  return d && !isNaN(d.getTime()) ? d : null;
}

/** 'YYYY-MM-DD' for the LOCAL calendar day of `d`. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole local days from `from` to `to` (both floored to local midnight). */
export function daysBetweenLocalDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  // Math.round absorbs the 23h/25h DST days.
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** The latest real-workout date on the profile, or null when there is none. */
export function latestWorkoutDate(profile: DaysAwayProfile | null | undefined): Date | null {
  if (!profile) return null;
  const candidates: unknown[] = [
    profile.progression?.lastActiveDate,
    profile.running?.lastWorkoutDate,
    ...Object.values(profile.progression?.tracks ?? {}).map((t) => t?.lastWorkoutDate),
  ];
  let latest: Date | null = null;
  for (const c of candidates) {
    const d = toDateOrNull(c);
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  return latest;
}

/**
 * Whole local days since the latest real workout, or null when the user never trained
 * (a new user is not "returning" — calm return leaves them alone). A date in the future
 * (clock skew) counts as today: 0.
 */
export function getDaysAway(profile: DaysAwayProfile | null | undefined, now: Date): number | null {
  const last = latestWorkoutDate(profile);
  if (!last) return null;
  return Math.max(0, daysBetweenLocalDays(last, now));
}
