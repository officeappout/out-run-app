/**
 * Reminder opt-in — side effects for ReminderOptInStep (shared by the run,
 * strength and add-track flows; enable_home_v2 only).
 *
 * Reuses the app's existing pieces only:
 *  - the OS prompt: the same platform matrix as LifestyleWizard's
 *    notifications step (native → initPushNotifications, web →
 *    Notification.requestPermission + requestWebPush);
 *  - the switches: settings.pushEnabled + settings.notificationPrefs.training_reminder
 *    (notification-prefs.service — dotted writes, other channels untouched);
 *  - the "X minutes before" slots: lifestyle.reminders.schedule
 *    (reminder-schedule.service).
 * Never throws: a push failure must not block the flow.
 */
import {
  initPushNotifications,
  isIOSDevice,
  isNativePlatform,
  isStandalonePWA,
  requestWebPush,
} from '@/lib/native/push';
import { setChannelEnabled, setPushEnabled } from '@/features/notifications/services/notification-prefs.service';
import { addReminderSlots } from '@/features/notifications/services/reminder-schedule.service';
import type { ReminderSlot } from '@/features/user/core/types/user.types';
import type { PushPermissionState } from '../utils/reminderOptIn';
import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';
import {
  PUSH_SOFTASK_DEFERRED_KEY,
  parsePrefTimestamp,
  pushReAskShownKey,
  type PushReAskMoment,
} from '../utils/pushReAsk';

/** Current OS permission, without prompting. */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (typeof window === 'undefined') return 'unsupported';
  try {
    if (isNativePlatform()) {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const s = await FirebaseMessaging.checkPermissions();
      return s.receive === 'granted' ? 'granted' : s.receive === 'denied' ? 'denied' : 'prompt';
    }
    if (!('Notification' in window)) return 'unsupported';
    const p = Notification.permission;
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/**
 * Shows the OS prompt (must run straight from the tap — the web prompt is
 * the first await). Returns whether notifications are now allowed.
 * iOS Safari outside an installed PWA cannot prompt at all → false.
 */
export async function requestReminderPermission(uid: string): Promise<boolean> {
  try {
    if (isNativePlatform()) return await initPushNotifications(uid);
    if (isIOSDevice() && !isStandalonePWA()) return false;
    const permission: NotificationPermission =
      'Notification' in window ? await Notification.requestPermission() : 'denied';
    if (permission === 'granted') await requestWebPush(uid, permission);
    return permission === 'granted';
  } catch (err) {
    console.warn('[reminder-opt-in] permission request failed (non-fatal):', err);
    return false;
  }
}

/** "כן, תזכיר לי": push on, training reminders on, one slot per workout. */
export async function saveReminderOptIn(uid: string, slots: ReminderSlot[]): Promise<void> {
  if (!uid) return;
  try {
    await setPushEnabled(uid, true);
    await setChannelEnabled(uid, 'training_reminder', true);
    if (slots.length > 0) await addReminderSlots(uid, slots);
  } catch (err) {
    console.warn('[reminder-opt-in] save failed (non-fatal):', err);
  }
}

/**
 * "לא עכשיו" without the flag (LifestyleWizard's "דלג בשלב זה"): mute ONLY
 * training reminders. The master switch and every other channel stay as they
 * are, so re-engagement / achievement pushes still reach the user.
 */
export async function saveReminderSkip(uid: string): Promise<void> {
  if (!uid) return;
  try {
    await setChannelEnabled(uid, 'training_reminder', false);
  } catch (err) {
    console.warn('[reminder-opt-in] skip save failed (non-fatal):', err);
  }
}

// ── v2 soft-ask deferral / re-ask (device prefs; see utils/pushReAsk) ──────

/** v2 "לא עכשיו": no OS prompt, no Firestore write — remember the deferral on this device. */
export function recordReminderDeferral(now: number = Date.now()): void {
  setOnboardingPref(PUSH_SOFTASK_DEFERRED_KEY, String(now));
}

export async function readReAskShownAt(moment: PushReAskMoment): Promise<number | null> {
  return parsePrefTimestamp(await getOnboardingPrefAsync(pushReAskShownKey(moment)));
}

export function markReAskShown(moment: PushReAskMoment, now: number = Date.now()): void {
  setOnboardingPref(pushReAskShownKey(moment), String(now));
}

/**
 * Re-ask "כן, תזכירו לי" (settings / after a workout): the OS prompt FIRST
 * (web user-gesture rule), then push + training reminders on — only when the
 * OS actually allowed it. No lead-time slots here (no plan in context).
 */
export async function enableRemindersFromReAsk(uid: string): Promise<boolean> {
  if (!uid) return false;
  const granted = await requestReminderPermission(uid);
  if (granted) await saveReminderOptIn(uid, []);
  return granted;
}
