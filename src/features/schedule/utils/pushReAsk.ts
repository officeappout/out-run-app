/**
 * Push soft-ask / re-ask rules (enable_home_v2). Pure.
 *
 * The v2 soft-ask ("שנזכיר לך לפני אימון?" — ReminderOptInStep) runs before
 * the OS prompt. "לא עכשיו" never prompts; it only records a device-local
 * deferral timestamp (PUSH_SOFTASK_DEFERRED_KEY, via lib/onboardingPrefs).
 * That pref is written ONLY by the v2 screens, and its presence switches the
 * native auth bridge (lib/native/init.ts) to silent mode — no cold OS dialog
 * on the next launch. Users who never saw the v2 soft-ask keep today's
 * behaviour.
 *
 * The EARLY ask ('signup_start') runs once per device right after the track
 * pick, before the identity step (EarlyPushSoftAskGate on
 * /onboarding-new/profile), so drop-offs still have a token for the
 * "continue?" push.
 *
 * Re-ask moments (each bounded, never nagging):
 *  - 'settings'      — an inline card in Settings › התראות while the OS
 *                      permission is still 'prompt', or it is granted but
 *                      push / training reminders are off. The user opened
 *                      this screen themselves, so no frequency cap.
 *  - 'first_workout' — once ever, after the first completed workout, only
 *                      while the OS permission is still 'prompt'.
 *  - 'streak_3'      — once ever, on the summary that brings the streak to
 *                      3+ days, only while the permission is still 'prompt'.
 * At most one post-workout sheet per summary (pickPostWorkoutReAsk).
 */
import type { PushPermissionState } from './reminderOptIn';

/** Device pref: epoch ms of the last v2 soft-ask "לא עכשיו". */
export const PUSH_SOFTASK_DEFERRED_KEY = 'push_softask_deferred_at';

export type PushReAskMoment = 'settings' | 'first_workout' | 'streak_3' | 'signup_start';

/** Device pref: epoch ms the re-ask for this moment was shown. */
export function pushReAskShownKey(moment: PushReAskMoment): string {
  return `push_reask_${moment}_at`;
}

/** A stored epoch-ms string → number (null when missing / garbage). */
export function parsePrefTimestamp(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface PushReAskInput {
  moment: PushReAskMoment;
  permission: PushPermissionState;
  /** settings.pushEnabled (undefined = the opt-out default, i.e. on). */
  pushEnabled?: unknown;
  /** settings.notificationPrefs.training_reminder (undefined = on). */
  trainingReminder?: unknown;
  /** When this moment's re-ask was already shown (epoch ms). */
  shownAt: number | null;
  /** progression.workoutCount — lifetime completed workouts (may lag by one). */
  workoutCount?: number;
  /** Current streak in days (streak_3). */
  streakDays?: number;
  /** iOS Safari outside an installed PWA — the OS cannot prompt at all (signup_start). */
  iosWebBlocked?: boolean;
}

/** The streak that earns the streak re-ask. */
export const STREAK_REASK_DAYS = 3;

/** Workouts done at most this many → still "after the first workout" (the counter may lag a sync). */
export const FIRST_WORKOUT_MAX_COUNT = 1;

export function shouldShowPushReAsk(input: PushReAskInput): boolean {
  const { moment, permission } = input;
  if (moment === 'settings') {
    if (permission === 'prompt') return true;
    return permission === 'granted' && (input.pushEnabled === false || input.trainingReminder === false);
  }
  // One-shot moments: only while the OS can still prompt, once per device.
  if (permission !== 'prompt') return false;
  if (input.shownAt != null) return false;
  if (moment === 'signup_start') return input.iosWebBlocked !== true;
  if (moment === 'streak_3') return (input.streakDays ?? 0) >= STREAK_REASK_DAYS;
  const count = typeof input.workoutCount === 'number' ? input.workoutCount : 0;
  return count <= FIRST_WORKOUT_MAX_COUNT;
}

/**
 * Which post-workout sheet (if any) this summary shows — never two at once;
 * the first-workout ask wins over the streak ask.
 */
export function pickPostWorkoutReAsk(input: {
  permission: PushPermissionState;
  firstWorkoutShownAt: number | null;
  streakShownAt: number | null;
  workoutCount?: number;
  streakDays?: number;
}): 'first_workout' | 'streak_3' | null {
  const { permission, workoutCount, streakDays } = input;
  if (shouldShowPushReAsk({ moment: 'first_workout', permission, shownAt: input.firstWorkoutShownAt, workoutCount })) {
    return 'first_workout';
  }
  if (shouldShowPushReAsk({ moment: 'streak_3', permission, shownAt: input.streakShownAt, streakDays })) {
    return 'streak_3';
  }
  return null;
}

/** The early ask, right after the track pick (owner copy, 21.10.2026). */
export const EARLY_SOFT_ASK_COPY = {
  title: 'שנזכיר לך?',
  body: 'נזכיר לך להמשיך מאיפה שעצרת ונשמור לך את הרצף. עד 2 ביום',
} as const;

/** The streak re-ask title (body/actions = PUSH_SOFT_ASK_COPY). */
export const STREAK_SOFT_ASK_TITLE = '3 ימים ברצף. שנזכיר לך?';

/** Copy shared by every soft-ask surface (owner-approved). */
export const PUSH_SOFT_ASK_COPY = {
  title: 'שנזכיר לך לפני אימון?',
  body: 'נזכיר לך רק לפני אימון ונשמור על הרצף',
  accept: 'כן, תזכירו לי',
  defer: 'לא עכשיו',
} as const;
