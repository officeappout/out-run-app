/**
 * Push Notifications — FCM client (Sprint 3, Phase 4.1).
 *
 * Responsibilities:
 *   1. Request notification permission (iOS prompts; Android 13+ prompts;
 *      older Android grants implicitly).
 *   2. Register the device with APNs/FCM and obtain a token.
 *   3. Persist that token to `users/{uid}.fcmTokens` (deduped, last-seen
 *      timestamp on a sibling map for housekeeping).
 *   4. Listen for token refresh events and replay step 3 with the new
 *      token; the Cloud Function `sendPushFromQueue` prunes invalid
 *      tokens server-side, so stale entries naturally drain.
 *   5. Forward incoming notifications to a console-debug log (foreground
 *      handling can be expanded later — for the MVP we rely on the OS
 *      tray banner + badge counters).
 *
 * The module is **native-only**. On the pure-web Vercel build it is a
 * no-op (gated by `isNativePlatform()`); web push via the JS Firebase
 * Messaging SDK is intentionally out of scope for Sprint 3.
 *
 * Idempotent — `initPushNotifications()` may be called multiple times
 * (e.g. on every auth state change). Listeners are installed exactly
 * once; subsequent calls only refresh the token / Firestore mapping.
 */

import {
  arrayUnion,
  arrayRemove,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

let listenersInstalled = false;
let lastRegisteredUid: string | null = null;
let lastRegisteredToken: string | null = null;

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Persist an FCM token to the caller's user doc. Uses `arrayUnion` so
 * repeated calls with the same token are no-ops; sibling map records
 * the last-seen timestamp for token-pruning analytics.
 *
 * Firestore rules: the owner is allowed to write `fcmTokens` because
 * none of the protected-field guards (admin/tenant/game-integrity) cover
 * this path. See `firestore.rules` → `users/{userId}` for the rule list.
 */
async function saveTokenToFirestore(uid: string, token: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  // We write the token into an array (`fcmTokens`) for the multicast
  // sender, plus a parallel map keyed by token so we can store the
  // platform + last-seen timestamp without polluting the main array.
  await updateDoc(userRef, {
    fcmTokens: arrayUnion(token),
    [`fcmTokenMeta.${token}`]: {
      platform: getPlatformLabel(),
      lastSeenAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove a token from `users/{uid}.fcmTokens`. Used on logout and as
 * a manual cleanup hook from the Cloud Function (which detects invalid
 * tokens during multicast and asks the client to forget them).
 */
export async function removeTokenFromFirestore(
  uid: string,
  token: string,
): Promise<void> {
  if (!uid || !token) return;
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      fcmTokens: arrayRemove(token),
      [`fcmTokenMeta.${token}`]: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[push] removeTokenFromFirestore failed', err);
  }
}

function getPlatformLabel(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const w = window as unknown as {
    Capacitor?: { getPlatform?: () => string };
  };
  const platform = w.Capacitor?.getPlatform?.();
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
}

/**
 * Initialise FCM for the given authenticated user. Safe to call on
 * every auth state change; listeners are installed exactly once.
 *
 * Returns `true` when a token was successfully registered, `false` if
 * permission was denied or the platform is unsupported (web shell).
 */
export async function initPushNotifications(uid: string): Promise<boolean> {
  if (!uid) return false;
  if (!isNativePlatform()) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[push] skipped — not running inside Capacitor shell');
    }
    return false;
  }

  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

    // 1. Check permission, request if not yet decided.
    const status = await FirebaseMessaging.checkPermissions();
    let granted = status.receive === 'granted';
    if (!granted && status.receive === 'prompt') {
      const requested = await FirebaseMessaging.requestPermissions();
      granted = requested.receive === 'granted';
    }
    if (!granted) {
      console.info('[push] permission denied by user; skipping registration');
      return false;
    }

    // 2. Install listeners exactly once (subsequent init() calls only
    //    refresh the token, not the listeners).
    if (!listenersInstalled) {
      listenersInstalled = true;

      await FirebaseMessaging.addListener('tokenReceived', async (event) => {
        const refreshedToken = event?.token;
        if (!refreshedToken) return;
        if (!lastRegisteredUid) return;
        try {
          // If FCM rotated the token, swap the old one out so the
          // sender does not waste delivery attempts on a dead handle.
          if (lastRegisteredToken && lastRegisteredToken !== refreshedToken) {
            await removeTokenFromFirestore(lastRegisteredUid, lastRegisteredToken);
          }
          await saveTokenToFirestore(lastRegisteredUid, refreshedToken);
          lastRegisteredToken = refreshedToken;
        } catch (err) {
          console.warn('[push] tokenReceived persist failed', err);
        }
      });

      await FirebaseMessaging.addListener('notificationReceived', (event) => {
        // Foreground delivery — the OS does NOT show the system tray
        // banner in this case. We just log for now; future work can
        // surface an in-app toast or update an unread-count badge.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[push] notificationReceived (foreground):', event);
        }
      });

      await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        // User tapped the OS notification. Routing happens via the
        // `data` payload (e.g. `data.deepLink` → `router.push(...)`),
        // wired up by the consuming feature. For Sprint 3 we just log.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[push] notificationActionPerformed:', event);
        }
      });
    }

    // 3. Get the current token and persist it.
    const { token } = await FirebaseMessaging.getToken();
    if (!token) {
      console.warn('[push] FirebaseMessaging.getToken returned empty');
      return false;
    }

    await saveTokenToFirestore(uid, token);
    lastRegisteredUid = uid;
    lastRegisteredToken = token;
    return true;
  } catch (err) {
    console.warn('[push] initPushNotifications failed:', err);
    return false;
  }
}

/**
 * Tear down the registration for a logging-out user. Removes the
 * current token from `users/{uid}.fcmTokens` so we never deliver a
 * stranger's account a notification destined for the prior owner.
 *
 * The native FCM session itself is NOT deleted — the next sign-in
 * will re-register the same handle. If you want the device to forget
 * the token entirely (e.g. account deletion), call
 * `FirebaseMessaging.deleteToken()` from the call site.
 */
export async function unregisterPushNotifications(uid: string): Promise<void> {
  if (!isNativePlatform()) return;
  const tokenToRemove = lastRegisteredToken;
  lastRegisteredUid = null;
  lastRegisteredToken = null;
  if (uid && tokenToRemove) {
    await removeTokenFromFirestore(uid, tokenToRemove);
  }
}
