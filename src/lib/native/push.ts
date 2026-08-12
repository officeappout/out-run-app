/**
 * Push Notifications — FCM client (Sprint 3, Phase 4.1 + patch fixes).
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
 *   5. Forward foreground incoming notifications to `usePushToastStore`
 *      so the `PushForegroundToast` overlay renders a visible banner
 *      (native OS suppresses system tray when the app is in the foreground).
 *   6. Track notification click-through events by writing to the user's
 *      `users/{uid}/notification_clicks` sub-collection for CTR analytics.
 *
 * The module is **native-only** on the full permission-request path. On the
 * pure-web Vercel build `isNativePlatform()` is false and the web path is
 * handled by `requestWebPush`. Both paths are no-ops during SSR.
 *
 * Idempotent — `initPushNotifications()` may be called multiple times
 * (e.g. on every auth state change). Listeners are installed exactly once;
 * subsequent calls only refresh the token / Firestore mapping.
 *
 * === Patch notes ============================================================
 * FIX 1 — silent option:
 *   `initPushNotifications` accepts `{ silent: true }` which skips the OS
 *   permission prompt and bails out when status is 'prompt'. The auth bridge
 *   in `init.ts` passes this flag so new users do not see a native OS dialog
 *   before reaching the LifestyleWizard notifications step. Returning users
 *   who already granted permission proceed normally since their status is
 *   already 'granted'.
 *
 * FIX 2 — `updateDoc` → `setDoc` fallback:
 *   `saveTokenToFirestore` now catches Firestore's `not-found` error and
 *   retries with `setDoc(merge:true)` so tokens are never silently lost
 *   during progressive onboarding when the user doc is not yet created.
 *
 * FIX 3 — foreground toast:
 *   `notificationReceived` now calls `usePushToastStore.getState().enqueue()`
 *   so `PushForegroundToast` can display a visible banner instead of the
 *   previous silent `console.debug`.
 *
 * FIX 4 — click-tracking:
 *   `notificationActionPerformed` writes a click event to
 *   `users/{uid}/notification_clicks` for CTR / open-rate reporting.
 *   Requires `notification_clicks` to be readable by admin queries in
 *   `firestore.rules` (add `allow read: if isAdmin();` on that sub-path).
 * ===========================================================================
 */

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { usePushToastStore } from '@/lib/native/usePushToastStore';

let listenersInstalled = false;
let lastRegisteredUid: string | null = null;
let lastRegisteredToken: string | null = null;

// ─── Platform helpers ─────────────────────────────────────────────────────────

/** Returns true when running inside the Capacitor native shell (iOS/Android app). */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/** Returns true when on an iOS/iPadOS device (regardless of PWA install status). */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

/**
 * Returns true when the app is running as an installed PWA (standalone display-mode).
 * On iOS this is the prerequisite for Web Push permission prompts to work.
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
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

// ─── Timeout helper ───────────────────────────────────────────────────────────

/**
 * Race a native plugin Promise against a deadline so a non-resolving
 * Capacitor call (e.g. `getToken()` stuck waiting for APNs registration)
 * cannot freeze the caller indefinitely.
 *
 * On iOS, `FirebaseMessaging.getToken()` awaits APNs token provisioning.
 * Under TestFlight or in conditions with poor connectivity / misconfigured
 * push certificates, APNs can take many minutes or never respond, leaving
 * the Promise pending forever. Without this guard the entire
 * `initPushNotifications()` chain hangs, blocking the LifestyleWizard CTA
 * and making the app appear frozen.
 */
const NATIVE_CALL_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[push] ${label} timed out after ${ms}ms — APNs/FCM unreachable?`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Firestore token helpers ──────────────────────────────────────────────────

/**
 * Persist an FCM token to the caller's user doc.
 *
 * FIX 2: The previous `updateDoc`-only implementation threw a Firestore
 * `not-found` error (caught silently) when called before the user document
 * was created during progressive onboarding, leaving `fcmTokens` permanently
 * empty for those users.
 *
 * The fix uses `updateDoc` as the fast path (document exists) and falls back
 * to `setDoc(merge:true)` when the document hasn't been created yet. The
 * `setDoc` path uses nested-object notation for `fcmTokenMeta` instead of
 * dotted-path notation because `setDoc` treats dotted string keys as literal
 * key names rather than field paths (unlike `updateDoc`).
 */
async function saveTokenToFirestore(uid: string, token: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const platform = getPlatformLabel();

  const updatePayload = {
    fcmTokens: arrayUnion(token),
    [`fcmTokenMeta.${token}`]: {
      platform,
      lastSeenAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  };

  try {
    // Fast path — document already exists (returning user, re-auth, token refresh).
    await updateDoc(userRef, updatePayload);
  } catch (err: any) {
    // Accept both 'not-found' and the namespaced variant 'firestore/not-found'
    const code: string = err?.code ?? '';
    if (code === 'not-found' || code === 'firestore/not-found') {
      // Slow path — document not yet created (new user mid-onboarding).
      // setDoc with merge:true safely creates the doc without overwriting
      // other fields written by concurrent onboarding steps. Nested object
      // form is required here; dotted key strings in setDoc are literal,
      // not field-path notation.
      await setDoc(
        userRef,
        {
          fcmTokens: arrayUnion(token),
          fcmTokenMeta: {
            [token]: { platform, lastSeenAt: serverTimestamp() },
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      // Log with full code before rethrowing so the error is visible in
      // Safari Web Inspector / Chrome DevTools (Xcode/logcat show it via
      // the outer catch in initPushNotifications, but Web Inspector may not).
      console.warn(
        `[push] saveTokenToFirestore failed (code=${code}, uid=${uid}):`,
        err,
      );
      throw err;
    }
  }
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

// ─── Core registration ────────────────────────────────────────────────────────

/**
 * Initialise FCM for the given authenticated user. Safe to call on
 * every auth state change; listeners are installed exactly once.
 *
 * @param uid     Firebase UID of the authenticated user.
 * @param options
 *   `silent` — when `true` the function will NOT prompt the OS permission
 *   dialog if the current status is `'prompt'`. It returns `false` instead
 *   and lets the caller (LifestyleWizard) own the canonical first-prompt UX.
 *   Pass `{ silent: true }` from automated call-sites (auth bridge) so new
 *   users don't see the system dialog before reaching the notifications step.
 *
 * Returns `true` when a token was successfully registered, `false` if
 * permission was denied/skipped or the platform is unsupported (web shell).
 */
export async function initPushNotifications(
  uid: string,
  options: { silent?: boolean } = {},
): Promise<boolean> {
  if (!uid) return false;
  if (!isNativePlatform()) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[push] skipped — not running inside Capacitor shell');
    }
    return false;
  }

  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

    // ── Step 1: Permission check ──────────────────────────────────────
    const status = await withTimeout(
      FirebaseMessaging.checkPermissions(),
      NATIVE_CALL_TIMEOUT_MS,
      'checkPermissions',
    );
    let granted = status.receive === 'granted';

    if (!granted && status.receive === 'prompt') {
      if (options.silent) {
        // FIX 1: Called from the auth bridge on cold-start / sign-in.
        // Do NOT show the OS dialog here — LifestyleWizard is the
        // canonical trigger for first-time permission requests.
        // Returning false is safe; the user will be prompted when they
        // reach the notifications wizard step during onboarding.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[push] silent mode — deferring OS prompt to LifestyleWizard');
        }
        return false;
      }
      // Non-silent call (from LifestyleWizard "accept" button) — show
      // the native OS permission dialog now.
      const requested = await withTimeout(
        FirebaseMessaging.requestPermissions(),
        NATIVE_CALL_TIMEOUT_MS,
        'requestPermissions',
      );
      granted = requested.receive === 'granted';
    }

    if (!granted) {
      console.info('[push] permission denied or dismissed; skipping registration');
      return false;
    }

    // ── Step 2: Install listeners exactly once ────────────────────────
    if (!listenersInstalled) {
      // IMPORTANT: listenersInstalled is set to true only AFTER all three
      // addListener calls complete successfully. The previous pattern set
      // it to true at the top of this block, which permanently skipped
      // retrying listener setup if any call failed (e.g. plugin not yet
      // ready on first cold-start) — leaving the app with no foreground
      // toast, no token-refresh handler, and no click-tracking.

      // Token rotation — FCM may issue a new token at any time. Swap out
      // the stale one so the sender doesn't waste quota on a dead handle.
      await FirebaseMessaging.addListener('tokenReceived', async (event) => {
        const refreshedToken = event?.token;
        if (!refreshedToken) return;
        if (!lastRegisteredUid) return;
        try {
          if (lastRegisteredToken && lastRegisteredToken !== refreshedToken) {
            await removeTokenFromFirestore(lastRegisteredUid, lastRegisteredToken);
          }
          await saveTokenToFirestore(lastRegisteredUid, refreshedToken);
          lastRegisteredToken = refreshedToken;
        } catch (err) {
          console.warn('[push] tokenReceived persist failed', err);
        }
      });

      // ── FIX 3: Foreground notification visibility ─────────────────
      // When the app is in the foreground the OS suppresses the system
      // tray banner and fires this event instead. Enqueue the payload
      // into usePushToastStore so PushForegroundToast renders a visible
      // in-app banner. In production builds we also suppress the log.
      await FirebaseMessaging.addListener('notificationReceived', (event) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[push] notificationReceived (foreground):', event);
        }

        const { title = '', body = '' } = event?.notification ?? {};
        const channel = (event?.notification as any)?.data?.channel as string | undefined;

        if (title || body) {
          usePushToastStore.getState().enqueue({
            id: `push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title,
            body,
            channel,
          });
        }
      });

      // ── FIX 4: Click-tracking / CTR analytics ────────────────────
      // Fires when the user taps the OS notification banner (background
      // or lock-screen delivery). We write a lightweight click record to
      // users/{uid}/notification_clicks so the admin dashboard can
      // calculate open-rates and per-channel CTR.
      //
      // NOTE: Firestore rules must allow the authenticated user to write
      // to their own `notification_clicks` sub-collection. Example rule:
      //   match /users/{uid}/notification_clicks/{docId} {
      //     allow create: if request.auth.uid == uid;
      //   }
      await FirebaseMessaging.addListener('notificationActionPerformed', async (event) => {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[push] notificationActionPerformed:', event);
        }

        try {
          // Resolve the acting user — prefer the live Auth singleton over
          // the module-level cache in case of a cold-start race condition.
          const { auth } = await import('@/lib/firebase');
          const uid = auth.currentUser?.uid ?? lastRegisteredUid;
          if (!uid) return;

          const data = (event?.notification as any)?.data ?? {};
          const messageId = data.messageId as string | undefined;

          // CTR write — only when the queue stamped a `messageId`.
          if (messageId) {
            // Non-blocking Firestore write — errors are caught below and
            // never propagate to the caller.
            await addDoc(collection(db, 'users', uid, 'notification_clicks'), {
              messageId,
              channel:     (data.channel     as string) || 'unknown',
              authorityId: (data.authorityId as string) || null,
              clickedAt:   serverTimestamp(),
            });
          }

          // ── Notification-engine measurement (Wave 1): push_opened ──
          // `messageId` doubles as the `pushId` push.service.ts's sendPush()
          // mints when opts.measurement is set (see push-events.service.ts) —
          // same field, same gate as the CTR write above, so this is a no-op
          // for every send that didn't opt into measurement.
          //
          // Deliberately NOT awaited (`void ... .catch(...)`) — an earlier
          // version awaited this write and delayed `window.location.href`
          // by one extra sequential Firestore round-trip, which combined
          // with the also-awaited landing_screen write below to roughly
          // triple the pre-navigation latency on a cold app launch and
          // produced a real "lands on home instead of the deep-link target"
          // regression (root-caused, reverted, see git history). Firing
          // without awaiting restores the original pre-Wave-1 timing on the
          // path to `window.location.href`.
          if (messageId) {
            void setDoc(doc(db, 'push_events', `${messageId}_${uid}_push_opened`), {
              pushId: messageId,
              uid,
              eventType: 'push_opened',
              channel: (data.channel as string) || 'unknown',
              openedAt: serverTimestamp(),
            }).catch((measurementErr) => {
              console.warn('[push] push_opened write failed:', measurementErr);
            });
          }

          // ── Social Engagement Engine: deep-link navigation ─────────
          // The Cloud Function (`functions/src/sendPushFromQueue.ts`)
          // spreads `data.deepLink` into the outgoing FCM payload when
          // the queued message has one. Parse it defensively and route
          // the web view to the resolved in-app path.
          //
          // Security: every link is normalised against the current
          // origin via `new URL(deepLink, window.location.origin)`, so a
          // malicious payload like `https://evil.example/...` cannot
          // navigate the user away from the app. Only the pathname-and-
          // search part of the resolved URL is honoured.
          try {
            const rawDeepLink = data.deepLink;
            if (typeof rawDeepLink === 'string' && rawDeepLink.length > 0) {
              if (typeof window !== 'undefined') {
                const target = new URL(rawDeepLink, window.location.origin);
                if (target.origin === window.location.origin) {
                  // landing_screen — same messageId-as-pushId gate as
                  // push_opened above, same NOT-awaited reasoning: fired
                  // immediately before navigation rather than blocking it.
                  if (messageId) {
                    void setDoc(doc(db, 'push_events', `${messageId}_${uid}_landing_screen`), {
                      pushId: messageId,
                      uid,
                      eventType: 'landing_screen',
                      channel: (data.channel as string) || 'unknown',
                      landingPath: target.pathname + target.search,
                      loggedAt: serverTimestamp(),
                    }).catch((measurementErr) => {
                      console.warn('[push] landing_screen write failed:', measurementErr);
                    });
                  }
                  window.location.href = target.href;
                } else if (process.env.NODE_ENV !== 'production') {
                  console.warn(
                    '[push] dropping cross-origin deepLink:',
                    rawDeepLink,
                  );
                }
              }
            }
          } catch (navErr) {
            console.warn('[push] deepLink navigation failed:', navErr);
          }
        } catch (err) {
          // Click-tracking / deep-link routing is best-effort — never
          // crash the app over it.
          console.warn('[push] click-tracking write failed:', err);
        }
      });

      // All three listeners registered successfully — mark as installed.
      // If any addListener above threw, we never reach this line and
      // listenersInstalled stays false, allowing a clean retry on the
      // next initPushNotifications() invocation.
      listenersInstalled = true;
    }

    // ── Step 3: Fetch current token and persist ───────────────────────
    // On iOS, Firebase SDK 9+ fails getToken() immediately when APNs token
    // is nil — it no longer waits. APNs token arrives async via
    // didRegisterForRemoteNotificationsWithDeviceToken (called at app launch).
    // Race window: fast login after cold start / first install / re-install.
    // Fix: retry with 2s backoff; APNS token typically arrives within 1-3s.
    const APNS_RETRY_DELAY_MS = 2_000;
    const APNS_MAX_RETRIES    = 3;
    let token: string | undefined;
    let lastGetTokenErr: unknown;
    for (let attempt = 0; attempt < APNS_MAX_RETRIES; attempt++) {
      try {
        const result = await withTimeout(
          FirebaseMessaging.getToken(),
          NATIVE_CALL_TIMEOUT_MS,
          'getToken',
        );
        token = result.token;
        break;
      } catch (err: unknown) {
        lastGetTokenErr = err;
        const msg = String((err as Error)?.message ?? '').toLowerCase();
        const isApnsRace =
          getPlatformLabel() === 'ios' &&
          attempt < APNS_MAX_RETRIES - 1 &&
          msg.includes('apns');
        if (!isApnsRace) throw err;
        console.debug(
          `[push] iOS APNS race — getToken attempt ${attempt + 1}/${APNS_MAX_RETRIES}, ` +
          `retrying in ${APNS_RETRY_DELAY_MS}ms`,
        );
        await new Promise<void>(r => setTimeout(r, APNS_RETRY_DELAY_MS));
      }
    }
    if (!token) {
      console.warn('[push] FirebaseMessaging.getToken returned empty');
      return false;
    }

    await saveTokenToFirestore(uid, token);
    lastRegisteredUid   = uid;
    lastRegisteredToken = token;
    console.info(`[push] registered uid=${uid} platform=${getPlatformLabel()}`);
    return true;
  } catch (err) {
    // console.error (not warn) so this is always visible in Xcode / logcat
    // during TestFlight / internal testing without requiring log-level filters.
    console.error('[push] initPushNotifications failed:', err);
    return false;
  }
}

// ─── Logout / cleanup ─────────────────────────────────────────────────────────

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
  lastRegisteredUid   = null;
  lastRegisteredToken = null;
  if (uid && tokenToRemove) {
    await removeTokenFromFirestore(uid, tokenToRemove);
  }
}

// ─── Web Push registration ────────────────────────────────────────────────────

/**
 * Web Push registration — runs ONLY in the browser (non-Capacitor context).
 *
 * Call this **synchronously** from a user-gesture handler (click/tap) and
 * pass the result of `await Notification.requestPermission()` as the second
 * argument. Separating the permission request from the async token work
 * ensures it is the very first `await` in the click call-stack, satisfying
 * Chrome's user-activation requirement.
 *
 * Prerequisites:
 *   • `public/firebase-messaging-sw.js` is deployed alongside the app.
 *   • `NEXT_PUBLIC_FCM_VAPID_KEY` is set in the environment (Firebase Console →
 *     Project Settings → Cloud Messaging → Web Push certificates → Key pair).
 *
 * @param uid        Firebase UID of the authenticated user.
 * @param permission Result of `Notification.requestPermission()` — the caller
 *                   must obtain this BEFORE calling requestWebPush so the browser
 *                   sees a direct user-gesture for the permission dialog.
 * @returns `true` if a token was obtained and persisted; `false` otherwise.
 */
export async function requestWebPush(
  uid: string,
  permission: NotificationPermission,
): Promise<boolean> {
  if (!uid) return false;
  if (isNativePlatform()) return false; // native path handles registration

  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.info('[push/web] Web Push API not available in this browser');
    return false;
  }
  if (permission !== 'granted') {
    console.info('[push/web] Permission not granted:', permission);
    return false;
  }

  const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
  if (!vapidKey) {
    console.warn(
      '[push/web] NEXT_PUBLIC_FCM_VAPID_KEY is not set. ' +
      'Add it in Vercel env vars (Firebase Console → Project Settings → ' +
      'Cloud Messaging → Web Push certificates → Key pair).',
    );
    return false;
  }

  try {
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    const { getMessaging, getToken: getFCMToken } = await import('firebase/messaging');
    const { app } = await import('@/lib/firebase');
    const messaging = getMessaging(app);

    const token = await getFCMToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.warn('[push/web] FCM getToken returned empty');
      return false;
    }

    await saveTokenToFirestore(uid, token);
    lastRegisteredUid   = uid;
    lastRegisteredToken = token;
    console.info('[push/web] Token registered successfully');
    return true;
  } catch (err) {
    console.warn('[push/web] requestWebPush failed:', err);
    return false;
  }
}
