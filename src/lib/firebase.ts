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
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  } else if (isLocalDev) {
    // No explicit token supplied — set to `true` so Firebase auto-generates
    // a local debug token and prints it to the console. Copy that token into
    // the Firebase console (App Check → Apps → Manage debug tokens) once and
    // it will be accepted on localhost and the Android emulator without
    // triggering reCAPTCHA Enterprise 401 errors.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string })
      .FIREBASE_APPCHECK_DEBUG_TOKEN = true;
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
    // IMPORTANT: The try/catch around initializeAppCheck() below does NOT
    // protect against errors inside getToken() — those occur later, each
    // time Firebase needs to attach a token to a request. Without
    // protection inside getToken(), a failed/hanging DeviceCheck call
    // (e.g. HTTP 400 "Too many attempts", "App not registered",
    // TestFlight rate-limit) blocks signInWithCredential indefinitely,
    // freezing the entire sign-in flow.
    //
    // Fix: three-layer guard inside getToken():
    //   1. Hard 10-second timeout — guarantees the call always resolves.
    //   2. try/catch — swallows DeviceCheck API errors that escape the timeout.
    //   3. Circuit breaker — after any failure, returns a dummy token
    //      immediately for the next 60 s so we don't hammer the rate-
    //      limited DeviceCheck/App Attest API and compound the problem.
    //
    // On failure we return `{ token: '', expireTimeMillis: now + 5s }`.
    // Firebase Auth sign-in does not require App Check by default, so it
    // will proceed normally. App-Check-enforced Firestore rules and Cloud
    // Function calls may return permission-denied until attestation
    // recovers — a clean failure is far better than a frozen UI.
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

    try {
      const customProvider = new CustomProvider({
        getToken: async () => {
          // ── Circuit breaker ────────────────────────────────────────────
          // If the previous call failed recently, return a dummy token
          // immediately rather than hammering the DeviceCheck API again.
          if (appCheckFailedAt !== null && Date.now() - appCheckFailedAt < APP_CHECK_BACKOFF_MS) {
            const remainingSec = Math.ceil((APP_CHECK_BACKOFF_MS - (Date.now() - appCheckFailedAt)) / 1000);
            console.warn(
              `[firebase] App Check in backoff for ${remainingSec}s; ` +
              'returning empty token so sign-in can proceed.',
            );
            return { token: '', expireTimeMillis: Date.now() + 5_000 };
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
            // 50-minute TTL (App Check tokens are 1h) so the SDK requests
            // a fresh one well before expiry.
            const expireTimeMillis = Date.now() + 50 * 60 * 1000;
            return { token, expireTimeMillis };

          } catch (err) {
            // ── Graceful failure ───────────────────────────────────────
            // Record failure time for the circuit breaker, then return an
            // empty token with a 5-second expiry so the SDK schedules a
            // retry soon without blocking the current Firebase operation.
            appCheckFailedAt = Date.now();
            const msg = (err as Error)?.message ?? String(err);
            console.warn(
              '[firebase] Native App Check getToken() failed' +
              (msg === 'APP_CHECK_TOKEN_TIMEOUT' ? ' (timed out after 10 s)' : `: ${msg}`) +
              ` — will retry after ${APP_CHECK_BACKOFF_MS / 1000}s backoff.`,
            );
            return { token: '', expireTimeMillis: Date.now() + 5_000 };
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
      // Dev mode with neither a site key nor a debug token. App Check stays
      // inert here — fine if Firestore rules don't enforce App Check, but
      // if they do, every `presence` read will silently fail and the
      // partner overlay will appear empty with no obvious cause.
      // Surface that explicitly so the developer doesn't waste hours on
      // the same diagnosis we just did for partners.
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
