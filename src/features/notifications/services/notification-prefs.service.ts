/**
 * Notification Preferences Service (Sprint 3, Phase 4.4).
 *
 * Wraps reads/writes to `users/{uid}.settings.notificationPrefs` and
 * the master `users/{uid}.settings.pushEnabled` switch. Co-located with
 * the rest of the notifications feature so a future settings UI can
 * import a single module.
 *
 * Defaults — every channel is OPT-OUT (treated as enabled when the
 * field is missing) so existing users continue to receive engagement
 * pushes after the schema rollout. The Cloud Function applies the
 * same default; see `functions/src/sendPushFromQueue.ts`.
 */

import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';

export type PushChannel =
  | 'encouragement'
  | 'health_milestone'
  | 'training_reminder'
  | 'system'
  | 'chat'
  | 'social'
  | 'progression'
  | 'community'
  | 'retention'
  /** Motzei-Shabbat "שבוע טוב" nudge — only ever sent to Shabbat observers (functions/src/weekStartScheduler.ts). */
  | 'week_start';

/** Maps to functions/src/services/push.service.ts's per-user daily engagement cap (min=1, balanced=3, high=6). */
export type NotificationFrequency = 'min' | 'balanced' | 'high';

export interface NotificationPreferences {
  pushEnabled: boolean;
  channels: Record<PushChannel, boolean>;
  /** Optional on input (e.g. saveNotificationPrefs's bulk onboarding write
   *  never sets this — frequency is independent of the channel toggles).
   *  getNotificationPrefs always resolves a concrete value on read. */
  notificationFrequency?: NotificationFrequency;
  /** "שמירת שבת" — mirrors `settings.shabbatObserver` (default false). When true the
   *  server sends no pushes from Friday/erev-chag afternoon until motzei Shabbat/chag
   *  (functions/src/services/shabbat.service.ts). Optional on input, like frequency. */
  shabbatObserver?: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  channels: {
    encouragement: true,
    health_milestone: true,
    training_reminder: true,
    system: true,
    chat: true,
    social: true,
    progression: true,
    community: true,
    retention: true,
    week_start: true,
  },
  notificationFrequency: 'balanced',
  shabbatObserver: false,
};

/**
 * Read the current notification prefs for a user. Returns the defaults
 * if the user doc has no `settings.notificationPrefs` block yet (i.e.
 * legacy users who pre-date this schema).
 */
export async function getNotificationPrefs(
  uid: string,
): Promise<NotificationPreferences> {
  if (!uid) return DEFAULT_PREFS;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return DEFAULT_PREFS;
    const settings = (snap.data() as any)?.settings ?? {};
    const prefs = settings.notificationPrefs ?? {};
    const freq = settings.notificationFrequency;
    return {
      pushEnabled: settings.pushEnabled ?? true,
      channels: {
        encouragement: prefs.encouragement ?? true,
        health_milestone: prefs.health_milestone ?? true,
        training_reminder: prefs.training_reminder ?? true,
        system: prefs.system ?? true,
        chat: prefs.chat ?? true,
        social: prefs.social ?? true,
        progression: prefs.progression ?? true,
        community: prefs.community ?? true,
        retention: prefs.retention ?? true,
        week_start: prefs.week_start ?? true,
      },
      notificationFrequency: freq === 'min' || freq === 'balanced' || freq === 'high' ? freq : 'balanced',
      shabbatObserver: settings.shabbatObserver === true,
    };
  } catch (err) {
    console.warn('[notification-prefs] read failed:', err);
    return DEFAULT_PREFS;
  }
}

/**
 * Toggle the master push switch. When `false`, no push of any kind
 * will reach this user — the Cloud Function short-circuits before
 * even reading the per-channel block.
 */
export async function setPushEnabled(uid: string, enabled: boolean): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    'settings.pushEnabled': enabled,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Toggle a single channel. Other channels are left untouched, so this
 * is safe to call from per-row UI controls.
 */
export async function setChannelEnabled(
  uid: string,
  channel: PushChannel,
  enabled: boolean,
): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    [`settings.notificationPrefs.${channel}`]: enabled,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Set the overall notification frequency level (min/balanced/high). Drives
 * the daily engagement cap in push.service.ts's resolveDailyCap() — does
 * not affect per-channel toggles or the master switch, which is why this
 * is a dotted-path write like setChannelEnabled, not a merge into the
 * whole channels block.
 */
export async function setNotificationFrequency(
  uid: string,
  frequency: NotificationFrequency,
): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    'settings.notificationFrequency': frequency,
    updatedAt: serverTimestamp(),
  });
}

/**
 * "שמירת שבת" — `settings.shabbatObserver`. Dotted-path write, independent of
 * the channel toggles and the master switch. Read server-side by push.service.ts
 * (and the legacy push paths) to hold pushes during Shabbat/yom tov for this
 * user only, and by weekStartScheduler for the motzei-Shabbat nudge.
 */
export async function setShabbatObserver(uid: string, observer: boolean): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    'settings.shabbatObserver': observer,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Bulk-write the entire prefs object. Useful for the onboarding
 * "Notifications" step which lets the user accept/decline all
 * channels at once.
 */
export async function saveNotificationPrefs(
  uid: string,
  // Partial channel map: a missing channel reads as enabled (opt-out model)
  // both here (getNotificationPrefs) and server-side.
  prefs: Omit<NotificationPreferences, 'channels'> & { channels: Partial<Record<PushChannel, boolean>> },
): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    'settings.pushEnabled': prefs.pushEnabled,
    'settings.notificationPrefs': prefs.channels,
    updatedAt: serverTimestamp(),
  });
}

export const __DEFAULT_NOTIFICATION_PREFS = DEFAULT_PREFS;
