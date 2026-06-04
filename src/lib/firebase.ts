// Firebase configuration and initialization
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAnalytics, Analytics } from "firebase/analytics";
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  Auth,
} from "firebase/auth";
import { capacitorPreferencesPersistence } from './capacitorAuthPersistence';
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
  AppCheck,
} from "firebase/app-check";
import type {
  AppCheckFailureReason,
  AppCheckFailureEvent,
} from './native-auth-validation';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60",
  authDomain: "appout-1.firebaseapp.com",
  projectId: "appout-1",
  storageBucket: "appout-1.firebasestorage.app",
  messagingSenderId: "371293978848",
  appId: "1:371293978848:web:c5281b7834ecd5398b1085",
  measurementId: "G-DVL9P34LK4"
};

// Initialize Firebase (only if not already initialized)
// This is safe for SSR - Firebase SDK handles server-side initialization
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// ─────────────────────────────────────────────────────────────────────────
// Firebase App Check (Ashkelon Req. 22.1)
//
// MUST be initialized **before** getAuth / initializeFirestore / getStorage
// so the very first request each service makes carries an App Check token.
// Per Firebase docs: "After initializing your Firebase app, but before
// accessing any Firebase services, initialize App Check."
//
// Every callable Cloud Function in this project sets `enforceAppCheck:
// true`, and the `presence` collection's Firestore rules require an
// App Check token. Without one, every read/write returns
// permission-denied and partners / live map silently render empty.
//
// Environment variables (set in Vercel / firebase functions:config):
//   • NEXT_PUBLIC_RECAPTCHA_SITE_KEY      — reCAPTCHA Enterprise site key
//   • NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN   — (optional) local-dev debug token
//
// In development, if no site key is configured, App Check stays inert
// so the dev experience does not break. The Cloud Functions still
// enforce — for local dev you must register a debug token via the
// Firebase console (App Check → Apps → ⋯ → Manage debug tokens) and
// expose it via NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN. Production MUST
// have the site key set.
// ─────────────────────────────────────────────────────────────────────────
let appCheck: AppCheck | null = null;

/**
 * Detect whether we're running inside the Capacitor native shell.
 * We avoid a direct `import('@capacitor/core')` at module top so the
 * pure-web Vercel build does not pull Capacitor into the bundle.
 */
function detectNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

if (typeof window !== "undefined") {
  const isNative = detectNativePlatform();
  const debugToken = process.env.NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN;

  // ── Local-dev hostname detection ───────────────────────────────────────
  // The `localhost` / `127.0.0.1` (and the IPv6 `[::1]`) hostnames are not
  // registered with reCAPTCHA Enterprise, so any handshake from them comes
  // back with `HTTP 403 — AppCheck: Fetch server returned an HTTP error
  // status` and the unhandled rejection cascades into a Firestore stream
  // crash (`INTERNAL ASSERTION FAILED: Unexpected state`). When that
  // happens, snapshot listeners die silently and `useUserStore` falls back
  // to the hard-coded Level 5 placeholder instead of reading the freshly
  // computed progression doc. We treat *any* local-dev origin as a
  // mandatory bypass, regardless of NODE_ENV (Next.js dev sometimes runs
  // built bundles that report `production`).
  const hostname = window.location?.hostname ?? '';
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost');
  const isLocalDev = isLocalHost || process.env.NODE_ENV === 'development';

  if (debugToken) {
    // The Firebase JS SDK reads this global before initializeAppCheck
    // and uses it instead of the provider — see Firebase App Check
    // docs ("Getting started with App Check in JavaScript"). MUST be
    // assigned before initializeAppCheck() runs.
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (isLocalDev) {
    // No explicit token supplied — set to `true` so Firebase auto-generates
    // a local debug token and prints it to the console. Copy that token into
    // the Firebase console (App Check → Apps → Manage debug tokens) once and
    // it will be accepted on localhost and the Android emulator without
    // triggering reCAPTCHA Enterprise 401 errors.
    (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  // ── Local-dev hard bypass ──────────────────────────────────────────────
  // On localhost/127.0.0.1 (and any other local-dev hostname above) with
  // NO explicit debug token registered, we skip `initializeAppCheck` ENTIRELY.
  // Calling it with a reCAPTCHA Enterprise provider against an unregistered
  // origin is what triggers the 403 cascade, even though the debug-token
  // flag is set — the provider still tries to mint a token before the SDK
  // checks the global flag, and the 403 from that pre-flight is what
  // poisons the Firestore stream.
  //
  // Devs who *want* a real App Check token during local dev just need to
  // export `NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN` (or run inside the native
  // shell, which uses the platform attestor path below). Everyone else
  // gets a stable, crash-free Firestore listener stack.
  if (isLocalDev && !debugToken && !isNative) {
    console.info(
      `[firebase] App Check bypass: hostname="${hostname}" treated as ` +
      'local development. initializeAppCheck() will NOT be invoked — ' +
      'this prevents reCAPTCHA Enterprise 403s from crashing the ' +
      'Firestore snapshot listener. Set NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN ' +
      'to a token registered in the Firebase console (App Check → Apps → ' +
      'Manage debug tokens) if you need a real App Check handshake.',
    );
  } else if (isNative) {
    // ───────────────────────────────────────────────────────────────
    // NATIVE PATH — DeviceCheck (iOS) / Play Integrity (Android)
    //
    // The actual attestation happens in the @capacitor-firebase/app-check
    // plugin, which talks to the native Firebase iOS/Android SDKs and
    // produces a real App Check token. We expose that token to the web
    // SDK via a CustomProvider so callable Cloud Functions see a valid
    // X-Firebase-AppCheck header on every request — same as on the web
    // path, just attested by the OS instead of reCAPTCHA.
    //
    // Hot-loop prevention (the previous circuit-breaker returned a 5-second
    // dummy token, which the Firebase SDK treated as "expiring soon" and
    // re-requested immediately in a tight loop, freezing the UI thread):
    //
    //   ✗ WRONG  → { token: '', expireTimeMillis: Date.now() + 5_000 }
    //     Firebase sees a near-expiry token and schedules an instant refresh.
    //
    //   ✓ CORRECT on failure:
    //     Throw an Error — Firebase App Check SDK applies its own exponential
    //     back-off when getToken() rejects, so no tight retry loop occurs.
    //     The caller (Firebase Auth, Firestore) treats a missing App Check
    //     token as a soft error and proceeds; App-Check-enforced Cloud
    //     Functions / Firestore rules may return permission-denied until
    //     attestation recovers, but the UI stays responsive.
    //
    // Guards inside getToken():
    //   1. Hard 10-second timeout — guarantees the call always resolves.
    //   2. Circuit breaker — after any failure, throws for the next 60 s
    //      so we don't hammer the rate-limited DeviceCheck/App Attest API.
    //   3. Inner try/catch — wraps the native call; on error throws so
    //      Firebase's own back-off logic takes over (no immediate retry).
    // ───────────────────────────────────────────────────────────────

    /** Maximum ms to wait for the native DeviceCheck / App Attest call. */
    const APP_CHECK_TOKEN_TIMEOUT_MS = 10_000;
    /**
     * How long (ms) to suppress further getToken() calls after a failure.
     * DeviceCheck imposes a per-device rate limit; retrying faster than
     * this window is what produces the "Too many attempts" HTTP 400.
     */
    const APP_CHECK_BACKOFF_MS = 60_000;

    /** Timestamp of the most recent getToken() failure, or null if healthy. */
    let appCheckFailedAt: number | null = null;

    /**
     * Classify a raw App Check error into a discrete AppCheckFailureReason.
     * Keeps the catch blocks free of ad-hoc string matching and makes the
     * reason available to future analytics sinks (Firebase Analytics,
     * Sentry, Datadog) without scraping console output.
     */
    function classifyAppCheckError(err: unknown): AppCheckFailureReason {
      const msg = ((err as Error)?.message ?? String(err)).toLowerCase();
      if (msg === 'app_check_token_timeout')          return 'TIMEOUT';
      if (msg.includes('too many attempts'))          return 'RATE_LIMITED';
      if (msg.includes('app not registered') ||
          msg.includes('not registered'))             return 'NOT_REGISTERED';
      if (msg.includes('devicecheck') ||
          msg.includes('app attest') ||
          msg.includes('dcerror'))                    return 'DEVICE_CHECK_ERROR';
      if (msg.includes('play integrity') ||
          msg.includes('playintegrity'))              return 'PLAY_INTEGRITY_ERROR';
      return 'UNKNOWN';
    }

    /**
     * Emit a structured App Check failure event to the console.
     *
     * Replace or augment this function to forward events to an analytics
     * sink (e.g. Firebase Analytics logEvent, Sentry.captureEvent) without
     * changing call sites.
     */
    function logAppCheckFailure(event: AppCheckFailureEvent): void {
      const prefix = `[firebase] App Check failure [${event.reason}] on ${event.platform}`;
      if (event.reason === 'BACKOFF') {
        console.warn(
          `${prefix} — circuit breaker active,` +
          ` back-off remaining: ${Math.round((event.backoffRemainingMs ?? 0) / 1_000)}s.`,
        );
      } else {
        console.warn(`${prefix}: ${event.message}`);
      }
      // Future hook: analytics.logEvent('app_check_failure', { reason: event.reason, platform: event.platform });
    }

    /** Detect iOS vs Android for structured event metadata. */
    function nativePlatformName(): AppCheckFailureEvent['platform'] {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
      if (/Android/i.test(ua))          return 'android';
      return 'unknown';
    }

    // ── Native App Check provider initialization ───────────────────────────
    // initialize() must be called once before the first getToken() so the
    // correct provider factory (debug or DeviceCheck/AppAttest) is registered
    // with the iOS SDK. We do this lazily inside getToken() on the first call
    // to avoid top-level await at module scope (which would make firebase.ts
    // an async ES module and break Next.js SSR hydration — React error #423).
    //
    // We store the Promise itself (not a boolean) so that concurrent getToken()
    // calls all await the same in-flight initialization rather than skipping it.
    // A boolean flag would be set true before await completes, causing a second
    // concurrent call to bypass initialize() and race straight to getToken().
    //
    // NEXT_PUBLIC_APP_CHECK_DEBUG=true → debug provider (development builds only).
    // Leave unset in production — DeviceCheck/AppAttest is used automatically.
    let nativeAppCheckInitPromise: Promise<void> | null = null;

    try {
      const customProvider = new CustomProvider({
        getToken: async () => {
          // ── One-time lazy initialize() ─────────────────────────────────
          // Called here (not at module scope) to keep firebase.ts synchronous
          // and prevent the Top-Level Await that caused React error #423.
          // Storing a Promise (not a boolean) guarantees concurrent calls all
          // wait for the same initialization to fully complete before proceeding.
          if (!nativeAppCheckInitPromise) {
            nativeAppCheckInitPromise = (async () => {
              try {
                const { FirebaseAppCheck: FAC } = await import('@capacitor-firebase/app-check');
                const isDebug = process.env.NEXT_PUBLIC_APP_CHECK_DEBUG === 'true';
                await FAC.initialize({ debug: isDebug, isTokenAutoRefreshEnabled: true });
                console.info(`[firebase] Native App Check initialized — provider: ${isDebug ? 'debug' : 'deviceCheck/appAttest'}`);
              } catch (initErr) {
                console.warn('[firebase] Native App Check initialize() failed (may already be initialized):', initErr);
              }
            })();
          }
          await nativeAppCheckInitPromise;

          // ── Circuit breaker ────────────────────────────────────────────
          // If the previous call failed recently, throw immediately so
          // Firebase's own exponential back-off takes over — do NOT return
          // a short-TTL dummy token, as that causes an instant re-request
          // loop that freezes the JS thread.
          if (appCheckFailedAt !== null && Date.now() - appCheckFailedAt < APP_CHECK_BACKOFF_MS) {
            const backoffRemainingMs =
              APP_CHECK_BACKOFF_MS - (Date.now() - appCheckFailedAt);
            logAppCheckFailure({
              reason: 'BACKOFF',
              message: 'circuit breaker active',
              platform: nativePlatformName(),
              backoffRemainingMs,
            });
            throw new Error(`App Check backoff — ${Math.round(backoffRemainingMs / 1_000)}s remaining.`);
          }

          try {
            const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');

            // ── Hard timeout ───────────────────────────────────────────
            // If the native bridge hangs (DeviceCheck unreachable, retry
            // loop inside the iOS SDK), this ensures the promise resolves
            // within 10 s instead of blocking forever.
            const tokenPromise = FirebaseAppCheck.getToken({ forceRefresh: false });
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('APP_CHECK_TOKEN_TIMEOUT')),
                APP_CHECK_TOKEN_TIMEOUT_MS,
              ),
            );

            const { token } = await Promise.race([tokenPromise, timeoutPromise]);

            // Success — clear any previous backoff marker.
            appCheckFailedAt = null;
            // The web SDK needs an expiry timestamp. The capacitor-firebase
            // plugin returns an opaque token; we conservatively report a
            // 50-minute TTL (App Check tokens are 1 h) so the SDK requests
            // a fresh one well before expiry.
            return { token, expireTimeMillis: Date.now() + 50 * 60 * 1_000 };

          } catch (err) {
            // Record failure time for the circuit breaker, then throw so
            // Firebase's own back-off logic handles the retry schedule —
            // this is critical to avoid a tight re-request loop.
            appCheckFailedAt = Date.now();
            const reason = classifyAppCheckError(err);
            const msg    = (err as Error)?.message ?? String(err);
            logAppCheckFailure({
              reason,
              message: reason === 'TIMEOUT' ? 'timed out after 10 s' : msg,
              platform: nativePlatformName(),
            });
            throw err;
          }
        },
      });
      appCheck = initializeAppCheck(app, {
        provider: customProvider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn(
        '[firebase] Native App Check initialization failed; falling back to no App Check:',
        err,
      );
    }
  } else {
    // ───────────────────────────────────────────────────────────────
    // WEB PATH — reCAPTCHA Enterprise
    // ───────────────────────────────────────────────────────────────
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (siteKey) {
      try {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (err) {
        console.warn("[firebase] App Check initialization failed:", err);
      }
    } else if (process.env.NODE_ENV === "production") {
      // Fail loud in production so a missing site key is caught in CI/CD.
      console.error(
        "[firebase] NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing in production. " +
          "All callable Cloud Functions will reject this client, AND any " +
          "Firestore collection with App Check enforcement (e.g. `presence`) " +
          "will return permission-denied for every read/write. " +
          "Add the key in Vercel → Project Settings → Environment Variables.",
      );
    } else if (!debugToken) {
      console.warn(
        "[firebase] App Check is INERT (no NEXT_PUBLIC_RECAPTCHA_SITE_KEY and " +
          "no NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN). If Firestore rules enforce " +
          "App Check on the `presence` collection, partner sync will return " +
          "permission-denied. Either set a site key or register a debug " +
          "token (Firebase Console → App Check → Apps → Manage debug tokens).",
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Firebase services — initialized AFTER App Check so every request
// they make carries a valid attestation token from the very first call.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Firebase Auth — platform-aware persistence
//
// The persistence strategy is chosen at initialisation time:
//
//   SSR (server)         → getAuth default — no persistence needed server-side
//   Native Capacitor     → @capacitor/preferences (NSUserDefaults / SharedPreferences)
//                          ↳ Falls back to IndexedDB → localStorage for resilience
//                          ↳ Survives iOS hard close, WKWebView eviction, OS restarts
//   Web browser          → IndexedDB → localStorage (Firebase default)
//
// Using initializeAuth() instead of getAuth() lets us inject the persistence
// chain before Firebase reads any stored token.  `_shouldAllowMigration: true`
// on the Capacitor adapter means existing IndexedDB sessions are silently
// migrated to native storage on the user's first launch after this update —
// no sign-out required.
// ─────────────────────────────────────────────────────────────────────────
function buildAuth(firebaseApp: FirebaseApp): Auth {
  if (typeof window === 'undefined') {
    // Server-side: Firebase handles this safely with no browser persistence.
    return getAuth(firebaseApp);
  }

  const isNative = detectNativePlatform();
  const persistence = isNative
    // Native: Preferences first (survives hard close), then IndexedDB/localStorage as fallbacks.
    ? [capacitorPreferencesPersistence, indexedDBLocalPersistence, browserLocalPersistence]
    // Web: standard Firebase defaults.
    : [indexedDBLocalPersistence, browserLocalPersistence];

  // Include browserPopupRedirectResolver on web so signInWithPopup works
  // without passing the resolver at every call site. On native we use the
  // Capacitor bridge instead of popups, so it is omitted there.
  const popupRedirectResolver = isNative ? undefined : browserPopupRedirectResolver;

  try {
    return initializeAuth(firebaseApp, { persistence, popupRedirectResolver });
  } catch {
    // Auth was already initialized (e.g. HMR in development) — reuse existing instance.
    return getAuth(firebaseApp);
  }
}

export const auth = buildAuth(app);

// Initialize Firestore with:
//   • experimentalAutoDetectLongPolling — works around BloomFilter errors
//     on flaky networks (existing behaviour, kept).
//   • persistentLocalCache + persistentMultipleTabManager — Native Phase
//     prerequisite. Enables full offline reads/writes with multi-tab
//     coordination so the app keeps rendering history, programs, and
//     dailyActivity when the user is in a gym/bunker. Writes that need
//     special handling (callables, App-Check-gated mutations) still flow
//     through our outbox in src/lib/outbox/.
let db: Firestore;
if (typeof window !== 'undefined') {
  try {
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    // Fallback to default initialization if persistent cache fails (e.g.
    // private browsing, IndexedDB blocked). The app still works, just
    // without offline reads.
    console.warn(
      '[firebase] Persistent cache unavailable, falling back to memory cache:',
      error,
    );
    try {
      db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
      });
    } catch (innerError) {
      console.warn('[firebase] initializeFirestore failed, using default:', innerError);
      db = getFirestore(app);
    }
  }
} else {
  // Server-side: use default initialization (SSR-safe)
  db = getFirestore(app);
}

export { db };

// Storage is SSR-safe - Firebase SDK handles server-side initialization
// It will only work when called from client components
export const storage = getStorage(app);

// Analytics only works in browser, so we guard it. Initialized last so
// it never blocks App Check or Firestore from coming online.
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    // Analytics initialization can fail in some environments
    console.warn('Analytics initialization failed:', error);
  }
}

export { app, analytics, appCheck };
