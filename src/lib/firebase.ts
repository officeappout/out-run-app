// Firebase configuration and initialization
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAnalytics, Analytics } from "firebase/analytics";
import { getAuth, Auth } from "firebase/auth";
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

// Initialize services - all are SSR-safe
// Analytics only works in browser, so we guard it
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    // Analytics initialization can fail in some environments
    console.warn('Analytics initialization failed:', error);
  }
}

// Auth and Firestore are SSR-safe - Firebase SDK handles server-side initialization
// They can be initialized on server but will only work when called from client components
export const auth = getAuth(app);

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

// ─────────────────────────────────────────────────────────────────────────
// Firebase App Check (Ashkelon Req. 22.1)
//
// Every callable Cloud Function in this project sets `enforceAppCheck:
// true`. Without an attestation token from this client, all calls would
// be rejected with `failed-precondition`. We initialize App Check here,
// in the browser only, with reCAPTCHA Enterprise as the attestation
// provider.
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

  if (debugToken) {
    // The Firebase JS SDK reads this global before initializeAppCheck
    // and uses it instead of the provider — see Firebase App Check
    // docs ("Getting started with App Check in JavaScript").
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  if (isNative) {
    // ───────────────────────────────────────────────────────────────
    // NATIVE PATH — DeviceCheck (iOS) / Play Integrity (Android)
    //
    // The actual attestation happens in the @capacitor-firebase/app-check
    // plugin, which talks to the native Firebase iOS/Android SDKs and
    // produces a real App Check token. We expose that token to the web
    // SDK via a CustomProvider so callable Cloud Functions see a valid
    // X-Firebase-AppCheck header on every request — same as on the web
    // path, just attested by the OS instead of reCAPTCHA.
    // ───────────────────────────────────────────────────────────────
    try {
      const customProvider = new CustomProvider({
        getToken: async () => {
          const { FirebaseAppCheck } = await import('@capacitor-firebase/app-check');
          const { token } = await FirebaseAppCheck.getToken({ forceRefresh: false });
          // The web SDK needs an expiry timestamp. The capacitor-firebase
          // plugin returns an opaque token; we conservatively report a
          // 50-minute TTL (App Check tokens are 1h) so the SDK requests
          // a fresh one well before expiry.
          const expireTimeMillis = Date.now() + 50 * 60 * 1000;
          return { token, expireTimeMillis };
        },
      });
      appCheck = initializeAppCheck(app, {
        provider: customProvider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn(
        '[firebase] Native App Check initialization failed; falling back to debug-only mode:',
        err,
      );
    }
  } else {
    // ───────────────────────────────────────────────────────────────
    // WEB PATH — reCAPTCHA Enterprise (existing behaviour)
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
          "All callable Cloud Functions will reject this client.",
      );
    }
  }
}

export { app, analytics, appCheck };
