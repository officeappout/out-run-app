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
// App Check imports — kept for when App Check is re-enabled.
// import {
//   initializeAppCheck,
//   ReCaptchaEnterpriseProvider,
//   CustomProvider,
//   AppCheck,
// } from "firebase/app-check";
type AppCheck = null;

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
// App Check — DISABLED for local development
//
// The CustomProvider circuit breaker returned empty tokens immediately on
// every failure, causing the Firebase SDK to treat them as expired and
// request a new token in a tight synchronous loop, flooding the JS thread
// and freezing all UI interaction including login button taps.
//
// App Check is fully disabled here. Re-enable by restoring the
// initializeAppCheck block below once the native attestation environment
// (DeviceCheck / reCAPTCHA Enterprise) is stable for production builds.
//
// When re-enabling:
//   • Native path  → CustomProvider that calls @capacitor-firebase/app-check
//   • Web path     → ReCaptchaEnterpriseProvider(NEXT_PUBLIC_RECAPTCHA_SITE_KEY)
//   • Local dev    → set NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN to a token
//                    registered in Firebase Console → App Check → Manage
//                    debug tokens, OR keep disabled and rely on Firestore
//                    rules that don't enforce App Check.
// ─────────────────────────────────────────────────────────────────────────
const appCheck: AppCheck = null;

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

// App Check initialization intentionally removed.
// Restore from git history when ready to re-enable.

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
