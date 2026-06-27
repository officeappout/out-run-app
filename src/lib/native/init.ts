/**
 * Native bootstrap (Native Phase, Apr 2026).
 *
 * Wires Capacitor lifecycle events into the rest of the app:
 *
 *   • App.appStateChange (active=true)  → OutboxFlusher.flushNow('app-active')
 *                                       → HealthBridge.syncSinceLastFlush()
 *   • App.resume                         → same as appStateChange.active
 *   • App.backButton (Android)           → routed to history.back() so the
 *                                          web router handles it.
 *   • App.appUrlOpen                     → parses universal links / custom-
 *                                          scheme URIs on cold start + warm
 *                                          resume and persists referral /
 *                                          invite payloads to localStorage so
 *                                          the existing web-flow (gateway,
 *                                          community) picks them up normally.
 *                                          This is the deferred-deep-link
 *                                          path that survives an App-Store
 *                                          redirect: on first install the OS
 *                                          re-opens the app with the original
 *                                          URL once the user finishes
 *                                          installing.
 *
 * SSR-safe — no-op when `window` is undefined or when not running inside
 * the Capacitor native shell. Importing this module from server components
 * has no side effects.
 *
 * The implementation deliberately uses dynamic `import()` so the
 * Capacitor packages are only loaded inside the native WebView; the
 * pure-web Vercel build will tree-shake them out (they sit behind
 * `isNativePlatform()` which is false on the web).
 */

import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';
import { BackStack } from './backStack';
import { initPushNotifications, unregisterPushNotifications } from './push';

let installed = false;
let pushAuthListenerAttached = false;

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Parse a native deep-link URL and persist its referral / invite payload into
 * localStorage so the existing web-flow (gateway, /join pages) picks it up
 * transparently.
 *
 * Handles both production universal links (https://outrun.app/...) and the
 * custom scheme (outrun://...) registered in the Capacitor config. The
 * function is pure and synchronous — it only writes localStorage, never
 * navigates, so it can safely fire before the React router is mounted.
 *
 * After persisting, it navigates the WebView to the equivalent web path
 * (stripping the origin/scheme) so the Next.js router handles any UI work.
 */
function handleNativeDeepLink(url: string): void {
  if (!url || typeof window === 'undefined') return;

  try {
    // Normalise both https:// and outrun:// → parse as https:// so URL API
    // works correctly on both platforms.
    const normalised = url.replace(/^outrun:\/\//, 'https://outrun.app/');
    const parsed = new URL(normalised);
    const { pathname, searchParams } = parsed;

    // ── /join/<inviteCode> — group invite deep link ──────────────────────
    // Path is /join/XXXX where XXXX is the alphanumeric invite code.
    const joinGroupMatch = pathname.match(/^\/join\/([^/]+)$/);
    if (joinGroupMatch) {
      const inviteCode = joinGroupMatch[1];
      // The /join/[inviteCode] page normally fetches the group by code and
      // writes these keys. We replicate that here for native cold starts.
      // The actual joinGroup() call happens at gateway after auth.
      localStorage.setItem('pending_invite_code', inviteCode);
      // Navigate to the web join page so it can fetch the group doc and
      // populate pending_group_id / group_inviter_uid, then route to gateway.
      window.location.href = `/join/${inviteCode}`;
      return;
    }

    // ── /join?ref=<uid> — friend referral link ───────────────────────────
    const refUid = searchParams.get('ref');
    if (pathname === '/join' && refUid) {
      localStorage.setItem('referrer_uid', refUid);
      window.location.href = `/join?ref=${encodeURIComponent(refUid)}`;
      return;
    }

    // ── /gateway?ref=<uid> — referral arriving on the gateway ───────────
    if (pathname === '/gateway' && refUid) {
      localStorage.setItem('referrer_uid', refUid);
      window.location.href = `/gateway?ref=${encodeURIComponent(refUid)}`;
      return;
    }

    // ── /session/<token> — group session invite deep link (Phase G) ────────
    const sessionTokenMatch = pathname.match(/^\/session\/([^/]+)$/);
    if (sessionTokenMatch) {
      const sessionToken = sessionTokenMatch[1];
      // Store so the gateway can consume it post-auth if the user isn't signed in.
      localStorage.setItem('pending_session_token', sessionToken);
      window.location.href = `/session/${sessionToken}`;
      return;
    }

    // ── /community?groupId=<id> — direct community group link ────────────
    const groupId = searchParams.get('groupId');
    if (pathname === '/community' && groupId) {
      window.location.href = `/community?groupId=${encodeURIComponent(groupId)}`;
      return;
    }

    // ── Institutional code — school / military / municipal onboarding ───────
    // Two URL forms are supported:
    //   /school/<CODE>          (path-based, e.g. from a QR code)
    //   /join?code=<CODE>       (query-param variant for universal links)
    // The code is stored in localStorage so it survives app-open auth flow,
    // and the user is routed through the identity gate (?context=express)
    // before the access code is validated.
    const schoolPathMatch = pathname.match(/^\/school\/([A-Za-z0-9_-]+)$/);
    const codeParam = searchParams.get('code');
    const institutionCode = schoolPathMatch?.[1] ?? (pathname === '/join' ? codeParam : null);
    if (institutionCode) {
      localStorage.setItem('pending_institution_code', institutionCode);
      window.location.href = '/onboarding-new/profile?context=express';
      return;
    }

    // ── Generic fallback — route to the path as-is ───────────────────────
    // Handles /league, /home, and any other in-app paths sent via push.
    const target = `${parsed.pathname}${parsed.search}`;
    if (target && target !== '/') {
      window.location.href = target;
    }
  } catch (err) {
    console.warn('[native] handleNativeDeepLink failed for url:', url, err);
  }
}

/**
 * Initialise the native shell. Idempotent — safe to call from multiple
 * client components (NativeBootstrap, etc.).
 */
export async function initNativeShell(): Promise<void> {
  if (installed) return;
  installed = true;

  if (typeof window === 'undefined') return;
  if (!isNative()) {
    // Pure web: nothing to do. OutboxFlusher.install() handles its own
    // window/online listeners and is invoked by the OfflineBanner mount.
    return;
  }

  try {
    const [{ App }] = await Promise.all([import('@capacitor/app')]);

    // 1. App lifecycle → flush + health re-sync on resume
    App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;

      // Recovery step: if localStorage lost the "out:has-session" hint
      // (WKWebView storage eviction) but @capacitor/preferences still has
      // it, copy it back so the landing page shows the splash on next
      // navigation instead of flashing the login/onboarding screens.
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { SESSION_HINT_NATIVE_KEY } = await import('@/lib/auth.service');
        const { value } = await Preferences.get({ key: SESSION_HINT_NATIVE_KEY });
        if (value === '1' && !window.localStorage.getItem('out:has-session')) {
          try { window.localStorage.setItem('out:has-session', '1'); } catch { /* quota */ }
        }
      } catch {
        // Non-fatal — hint recovery is best-effort.
      }

      try {
        OutboxFlusher.flushNow('app-active');
      } catch (err) {
        console.warn('[native] flushNow on appStateChange failed:', err);
      }
      try {
        // Pull anything HealthKit / Health Connect collected while we
        // were backgrounded. The HealthBridge module schedules its own
        // background workers too — this is just the foreground "catch-
        // up" path.
        const { healthBridgeSyncNow } = await import('@/lib/healthBridge/init');
        await healthBridgeSyncNow('app-active');
      } catch (err) {
        // Health bridge may not be initialised yet (first launch, no
        // permission) — that's fine.
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[native] healthBridgeSyncNow skipped:', err);
        }
      }
      // Resolve any pending requestPermissions() PluginCall that was parked
      // while the user was inside the Health Connect settings screen.
      // notifyAppResumed() is a no-op when no call is pending; it is safe to
      // fire on every resume.
      //
      // NOTE: We intentionally delegate to healthBridge/init.ts here instead
      // of importing 'health-bridge' directly. The shared loadPlugin()
      // singleton extracts the Capacitor proxy INSIDE a .then() callback,
      // avoiding the `.then()`-not-implemented crash that occurs when Android's
      // Capacitor proxy is resolved through a raw `await import('health-bridge')`.
      try {
        const { notifyAppResumed } = await import('@/lib/healthBridge/init');
        await notifyAppResumed();
      } catch {
        // Defensive — notifyAppResumed() already swallows its own errors.
      }
    });

    // 2. Android back-button handler.
    //
    //    Dispatch order:
    //      a. BackStack — in-memory step flows and overlays intercept first so
    //         hardware back rolls their internal state (e.g. assessment sliders)
    //         rather than ejecting the user to a previous route.
    //      b. Route-aware guards — evaluated only when nothing on the BackStack
    //         consumed the event:
    //           • /home or /gateway   → App.exitApp() instead of navigating
    //             into onboarding/login screens that were replaced off the stack.
    //           • /active or /workout-builder → dispatches 'nativeBackInWorkout'
    //             so the active-workout components open the ExitConfirmModal
    //             rather than silently discarding progress.
    //      c. Standard history back (canGoBack) or App.minimizeApp() fallback.
    App.addListener('backButton', ({ canGoBack }) => {
      if (BackStack.dispatch()) return;

      const path = window.location.pathname;

      // Terminal screens: exiting via history would land on onboarding/login.
      // Exit the app cleanly instead.
      if (path === '/home' || path === '/gateway') {
        App.exitApp();
        return;
      }

      // Active workout screens: do NOT pop the route — open the exit
      // confirmation modal so users can't accidentally lose progress.
      if (path.includes('/active') || path.includes('/workout-builder')) {
        window.dispatchEvent(new CustomEvent('nativeBackInWorkout'));
        return;
      }

      // Standard: follow browser history or minimise if at history root.
      if (canGoBack) {
        window.history.back();
      } else {
        App.minimizeApp().catch(() => {
          /* ignore — iOS does not implement minimise */
        });
      }
    });

    // 3. Deep-link handler — appUrlOpen fires when the OS opens the app via:
    //      • Universal Links (iOS associated domains, Android App Links)
    //      • Custom URL schemes (e.g. outrun://)
    //      • OneLink redirects after an App-Store install (deferred deep link)
    //
    //    Supported payload patterns (all standard web paths):
    //      /join/<inviteCode>         → group invite deep link
    //      /join?ref=<uid>            → friend referral link
    //      /gateway?ref=<uid>         → referral landing directly on gateway
    //      /community?groupId=<id>    → direct group page
    //
    //    This listener persists the payload into localStorage under the same
    //    keys that the web /join/[inviteCode] and /join pages write, so the
    //    existing gateway.tsx and community/page.tsx logic handles them without
    //    any changes. Navigation is then handed to the web router.
    //
    //    getLaunchUrl() is called once on cold start to catch the URL the app
    //    was INITIALLY opened with (appUrlOpen doesn't fire for the very first
    //    open, only for subsequent opens while running).
    App.addListener('appUrlOpen', ({ url }) => {
      handleNativeDeepLink(url);
    });

    // Cold-start: the app was launched via a deep link while completely closed.
    // getLaunchUrl() returns the URL or null when it was a regular icon tap.
    try {
      const { url: launchUrl } = await App.getLaunchUrl();
      if (launchUrl) {
        handleNativeDeepLink(launchUrl);
      }
    } catch {
      // getLaunchUrl() is not available on all Capacitor versions — ignore.
    }

    // 5. Initialise the HealthBridge plugin lazily. We don't request
    //    permissions automatically here — the user must opt-in from the
    //    profile settings screen — but we register the event listener
    //    so that if permissions were granted on a previous launch, live
    //    samples flow into the Activity Rings immediately.
    try {
      const { initHealthBridge } = await import('@/lib/healthBridge/init');
      await initHealthBridge();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[native] HealthBridge init skipped:', err);
      }
    }

    // 6. Push notifications (Sprint 3, Phase 4.1).
    //    Wait for an authenticated user before requesting the OS
    //    permission prompt — anonymous browsers should never see the
    //    iOS notification dialog. The auth listener fires once on
    //    boot for already-signed-in users.
    try {
      await attachPushAuthBridge();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[native] push auth bridge skipped:', err);
      }
    }
  } catch (err) {
    console.warn('[native] initNativeShell failed:', err);
  }
}

/**
 * Bridge Firebase Auth → push registration. We can't import
 * `firebase/auth` at the top of the file because that would defeat
 * the dynamic-loading optimisation for the pure-web build. The
 * subscription is installed exactly once per native shell session.
 */
async function attachPushAuthBridge(): Promise<void> {
  if (pushAuthListenerAttached) return;
  pushAuthListenerAttached = true;

  let lastUid: string | null = null;
  const { onAuthStateChanged } = await import('firebase/auth');
  const { auth } = await import('@/lib/firebase');

  onAuthStateChanged(auth, (user) => {
    if (user) {
      // First sign-in OR auth state hand-off (e.g. after re-auth):
      // ensure we have a fresh token for THIS uid.
      lastUid = user.uid;

      // Fire-and-forget — push registration MUST NOT block or await here.
      // A hanging checkPermissions() / getToken() call (e.g. APNs not yet
      // provisioned on TestFlight, no network, misconfigured certificate)
      // would otherwise keep this async callback pending indefinitely,
      // which can appear to freeze the Sync button and other UI actions
      // that depend on the Capacitor native bridge being responsive.
      // withTimeout() in push.ts bounds the maximum hang to 15 s, but
      // making this fire-and-forget ensures profile loading, Firestore
      // listeners, and the rest of the native shell proceed immediately.
      void initPushNotifications(user.uid, { silent: true }).catch((err) => {
        console.error('[native] initPushNotifications (silent) unhandled:', err);
      });

      // Health: sync on every login if already granted; request on first login
      // after onboarding is done (so the LifestyleWizard priming fires first for
      // new users). If the user previously denied, PREF_KEY_ASKED is set but
      // PREF_KEY_PERMISSIONS is not — we skip silently instead of nagging.
      void (async () => {
        try {
          const { PREF_KEY_PERMISSIONS, PREF_KEY_ASKED, requestHealthPermissions, healthBridgeSyncNow } =
            await import('@/lib/healthBridge/init');
          const { Preferences } = await import('@capacitor/preferences');
          const [{ value: prevGranted }, { value: prevAsked }] = await Promise.all([
            Preferences.get({ key: PREF_KEY_PERMISSIONS }),
            Preferences.get({ key: PREF_KEY_ASKED }),
          ]);
          if (prevGranted === '1') {
            void healthBridgeSyncNow('login');
          } else if (!prevAsked) {
            // Only auto-request once onboarding is complete for this user
            // (gateway_uid matches) so the OS sheet is never shown cold.
            const { getOnboardingPrefAsync } = await import('@/lib/onboardingPrefs');
            const gatewayUid = await getOnboardingPrefAsync('gateway_uid');
            if (gatewayUid === user.uid) {
              void requestHealthPermissions();
            }
          }
          // prevAsked && !prevGranted → user denied → no-op.
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[native] health sign-in hook failed:', err);
          }
        }
      })();
    } else if (lastUid) {
      // Sign-out: drop the previous owner's token from THEIR doc so a
      // queued notification can't reach the next user of this device.
      const previousUid = lastUid;
      lastUid = null;
      void unregisterPushNotifications(previousUid).catch((err) => {
        console.warn('[native] unregisterPushNotifications failed:', err);
      });
    }
  });
}
