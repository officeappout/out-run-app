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
  | 'system';

export interface NotificationPreferences {
  pushEnabled: boolean;
  channels: Record<PushChannel, boolean>;
}

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  channels: {
    encouragement: true,
    health_milestone: true,
    training_reminder: true,
    system: true,
  },
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
    return {
      pushEnabled: settings.pushEnabled ?? true,
      channels: {
        encouragement: prefs.encouragement ?? true,
        health_milestone: prefs.health_milestone ?? true,
        training_reminder: prefs.training_reminder ?? true,
        system: prefs.system ?? true,
      },
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
 * Bulk-write the entire prefs object. Useful for the onboarding
 * "Notifications" step which lets the user accept/decline all
 * channels at once.
 */
export async function saveNotificationPrefs(
  uid: string,
  prefs: NotificationPreferences,
): Promise<void> {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    'settings.pushEnabled': prefs.pushEnabled,
    'settings.notificationPrefs': prefs.channels,
    updatedAt: serverTimestamp(),
  });
}

export const __DEFAULT_NOTIFICATION_PREFS = DEFAULT_PREFS;
