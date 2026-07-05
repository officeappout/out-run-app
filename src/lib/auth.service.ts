// Firebase Authentication service
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInAnonymously,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  ActionCodeSettings,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * localStorage key holding a "previously authenticated" hint. Read by
 * the landing page (`src/app/page.tsx`) on first paint to decide
 * whether to show the branded splash (returning user — Firebase is
 * about to restore the session) or the marketing/login UI immediately
 * (brand-new visitor). Written here on every positive auth emission;
 * cleared explicitly in `signOutUser`. Never cleared during a
 * transient null emit (e.g. token refresh) so the splash stays sticky
 * across reloads.
 *
 * On native (iOS/Android) the hint is ALSO mirrored into
 * @capacitor/preferences (NSUserDefaults / SharedPreferences) so it
 * survives WKWebView storage eviction.  `initNativeShell` copies it
 * back into localStorage on every `appStateChange: active` so the
 * landing page always reads it from the fast synchronous localStorage.
 */
const SESSION_HINT_KEY = 'out:has-session';

/** Key used in @capacitor/preferences for the native mirror. */
const SESSION_HINT_NATIVE_KEY = 'out_has_session_native';

/** Detect Capacitor native platform without importing the full package at module scope. */
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Sync Firebase Auth provider data to the user's Firestore document after a
 * successful social sign-in (Apple / Google). Runs fire-and-forget so it
 * never blocks the return of the calling sign-in function.
 *
 * Writes:
 *   core.email          — real or relay email from the provider
 *   core.isAnonymous    — always false for social sign-ins
 *   accountStatus       — 'secured' (used by ProfileCompletionWidget)
 *   accountMethod       — 'apple' | 'google' | 'email'
 *
 * Uses merge:true so no existing field is overwritten unless explicitly set.
 * This ensures returning users whose email changed at the provider side always
 * have an up-to-date record in the admin panel.
 */
async function syncProviderDataToFirestore(user: User): Promise<void> {
  try {
    const providerId = user.providerData[0]?.providerId ?? null;
    const accountMethod =
      providerId === 'apple.com' ? 'apple'
      : providerId === 'google.com' ? 'google'
      : providerId === 'password' ? 'email'
      : 'social';

    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    await setDoc(
      doc(db, 'users', user.uid),
      {
        core: {
          ...(user.email ? { email: user.email } : {}),
          isAnonymous: false,
        },
        accountStatus: 'secured',
        accountMethod,
        lastSignInAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    // Non-critical — never throw. The user is authenticated regardless;
    // the admin panel will show stale data until the next sign-in attempt.
    console.warn('[Auth Service] syncProviderDataToFirestore failed (non-critical):', err);
  }
}

/**
 * Write the session hint to localStorage AND — on native — to
 * @capacitor/preferences so it survives WebView storage eviction.
 */
async function setSessionHint(): Promise<void> {
  try { window.localStorage.setItem(SESSION_HINT_KEY, '1'); } catch { /* quota / private mode */ }
  if (isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: SESSION_HINT_NATIVE_KEY, value: '1' });
    } catch { /* non-fatal */ }
  }
}

/**
 * Clear the session hint from localStorage AND — on native — from
 * @capacitor/preferences.  Called exclusively from `signOutUser`.
 */
async function clearSessionHint(): Promise<void> {
  try { window.localStorage.removeItem(SESSION_HINT_KEY); } catch { /* quota / private mode */ }
  if (isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: SESSION_HINT_NATIVE_KEY });
    } catch { /* non-fatal */ }
  }
}

export { SESSION_HINT_NATIVE_KEY };

/**
 * Sign up a new user
 * Creates user profile with isApproved: false (pending approval)
 */
export async function signUp(email: string, password: string, displayName?: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // Update display name if provided
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }

    // Create user profile in Firestore with pending approval
    if (userCredential.user) {
      try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        
        await setDoc(userDocRef, {
          id: userCredential.user.uid,
          core: {
            name: displayName || userCredential.user.displayName || email.split('@')[0],
            email: email,
            initialFitnessTier: 1,
            trackingMode: 'wellness',
            mainGoal: 'healthy_lifestyle',
            gender: 'other',
            weight: 70,
            isApproved: false, // Pending approval by Super Admin
            isSuperAdmin: false,
          },
          progression: {
            globalLevel: 1,
            globalXP: 0,
            coins: 0,
            totalCaloriesBurned: 0,
            hasUnlockedAdvancedStats: false,
          },
          equipment: {
            home: [],
            office: [],
            outdoor: [],
          },
          lifestyle: {
            hasDog: false,
            commute: { method: 'walk', enableChallenges: false },
          },
          health: { injuries: [], connectedWatch: 'none' },
          running: {
            isUnlocked: false,
            currentGoal: 'couch_to_5k',
            activeProgram: null,
            paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (firestoreError) {
        console.error('Error creating user profile:', firestoreError);
        // Don't fail sign up if Firestore write fails
      }
    }

    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Sign in existing user
 */
export async function signIn(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}



/**
 * Sign in with Google — native Android/iOS or web fallback.
 *
 * Native (iOS / Android Capacitor):
 *   1. `@capacitor-firebase/authentication` presents the native Google
 *      sign-in sheet (no external browser required).
 *   2. The plugin returns a Google OAuthCredential (idToken + accessToken).
 *   3. We replay that credential into the WEB firebase/auth instance via
 *      `signInWithCredential` so Firestore rules and web-SDK listeners
 *      see an authenticated user.
 *
 * A 30-second timeout guards against a hang if the native account-picker
 * sheet fails to appear (e.g. missing REVERSED_CLIENT_ID URL scheme,
 * Google Play Services crash on Android, or a misconfigured OAuth client).
 *
 * Web fallback (browser / dev server):
 *   Uses `signInWithPopup` with `GoogleAuthProvider`.
 *   Requires "Google" to be enabled in Firebase Console
 *   Authentication → Sign-in method.
 */

/** Maximum ms to wait for the native Google sign-in flow to resolve. */
const GOOGLE_SIGNIN_TIMEOUT_MS = 60_000;

function withGoogleTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('GOOGLE_SIGNIN_TIMEOUT')),
        GOOGLE_SIGNIN_TIMEOUT_MS,
      ),
    ),
  ]);
}

export async function signInWithGoogle(): Promise<{ user: User | null; error: string | null }> {
  try {
    if (isNativePlatform()) {
      // ── Native iOS / Android path ─────────────────────────────────────
      // Only the Capacitor plugin is lazy-loaded; Firebase SDK classes come
      // from the top-level static import so they share the same module
      // instance as `auth` and pass Firebase's internal instanceof checks.
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      const result = await withGoogleTimeout(FirebaseAuthentication.signInWithGoogle());

      if (!result.credential?.idToken) {
        return { user: null, error: 'לא התקבל פרטי זיהוי מ-Google Sign In.' };
      }

      const credential = GoogleAuthProvider.credential(
        result.credential.idToken,
        result.credential.accessToken ?? undefined,
      );

      const webResult = await signInWithCredential(auth, credential);
      syncProviderDataToFirestore(webResult.user);
      return { user: webResult.user, error: null };
    } else {
      // ── Web / browser fallback ────────────────────────────────────────
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      syncProviderDataToFirestore(result.user);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    const msg: string = error?.message ?? String(error);

    // Native / plugin timeout — surface a clear, actionable message
    if (msg === 'GOOGLE_SIGNIN_TIMEOUT') {
      console.error('[Auth Service] Google sign-in timed out (REVERSED_CLIENT_ID URL scheme missing, or account-picker failed to present)');
      return { user: null, error: 'google_timeout' };
    }

    // User dismissed the Google sheet — not an error worth surfacing
    if (
      error?.code === 'ERR_CANCELED' ||
      msg.includes('cancel') ||
      msg.includes('dismiss') ||
      msg.includes('sign_in_canceled')
    ) {
      return { user: null, error: 'google_canceled' };
    }

    console.error('[Auth Service] Google sign-in error:', error);
    return { user: null, error: msg };
  }
}

/**
 * Sign in with Apple — native iOS or web fallback.
 *
 * Native (iOS / iPadOS Capacitor):
 *   1. `@capacitor-firebase/authentication` presents the native
 *      ASAuthorizationController sheet.
 *   2. The plugin signs in to the native Firebase SDK and returns the
 *      Apple OAuthCredential (idToken + nonce).
 *   3. We immediately replay that credential into the WEB firebase/auth
 *      instance via `signInWithCredential` so Firestore security rules
 *      and all web-SDK listeners see an authenticated user.
 *
 * A 30-second timeout guards against a known iPad issue where
 * ASAuthorizationController can fail to present its sheet silently
 * (missing presentationAnchor), leaving the promise pending forever.
 *
 * Web fallback (browser / dev server):
 *   Uses `signInWithPopup` with `OAuthProvider('apple.com')`.
 *   Requires "Sign in with Apple" to be enabled in Firebase Console
 *   Authentication → Sign-in method, and the service-ID / redirect
 *   URL configured in the Apple Developer Portal.
 */

/** Maximum ms to wait for the native Apple sign-in sheet to resolve. */
const APPLE_SIGNIN_TIMEOUT_MS = 30_000;

function withAppleTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('APPLE_SIGNIN_TIMEOUT')),
        APPLE_SIGNIN_TIMEOUT_MS,
      ),
    ),
  ]);
}


export async function signInWithApple(): Promise<{ user: User | null; error: string | null }> {
  // Apple Sign-In is not supported on Android — the ASAuthorizationController
  // sheet only exists on iOS/macOS. Return early before touching the plugin.
  if (typeof window !== 'undefined') {
    const cap = window as unknown as { Capacitor?: { getPlatform?: () => string } };
    if (cap.Capacitor?.getPlatform?.() === 'android') {
      return { user: null, error: 'Apple Sign-In is not available on Android' };
    }
  }
  try {
    if (isNativePlatform()) {
      // ── Native iOS / iPadOS path ─────────────────────────────────────
      // Only the Capacitor plugin is lazy-loaded; Firebase SDK classes come
      // from the top-level static import so they share the same module
      // instance as `auth` and pass Firebase's internal instanceof checks.
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      // skipNativeAuth: true — the plugin generates the nonce internally (Swift side)
      // and passes sha256(nonce) to Apple. We must NOT let the plugin also call the
      // native Firebase iOS SDK (skipNativeAuth: false would do that), because doing
      // so consumes the nonce once at the native level. When the JS SDK then calls
      // signInWithCredential with the same nonce, Firebase backend rejects it as
      // "already used" → auth/missing-or-invalid-nonce. With skipNativeAuth: true
      // only the JS SDK path verifies the nonce, keeping it single-use as required.
      const result = await withAppleTimeout(
        FirebaseAuthentication.signInWithApple({ skipNativeAuth: true }),
      );

      if (!result.credential?.idToken) {
        return { user: null, error: 'לא התקבל פרטי זיהוי מ-Apple Sign In.' };
      }
      if (!result.credential.nonce) {
        return { user: null, error: 'Apple Sign In לא החזיר nonce. נסה שוב.' };
      }

      // ── DEBUG: diagnose raw-vs-hash nonce mismatch ────────────────────
      // Remove once Apple Sign-In is confirmed working.
      try {
        const pluginNonce = result.credential.nonce;
        // Decode Apple idToken JWT payload (base64url, may lack padding)
        const rawB64 = result.credential.idToken.split('.')[1] ?? '';
        const pad = (4 - (rawB64.length % 4)) % 4;
        const payloadJson = atob(rawB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
        const payload = JSON.parse(payloadJson) as Record<string, unknown>;
        const tokenNonce = payload['nonce'] as string | undefined;
        // SHA-256 of what the plugin returned — if rawNonce, this should equal tokenNonce
        const enc = new TextEncoder();
        const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(pluginNonce));
        const sha256OfPlugin = Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        console.group('[AppleAuth DEBUG]');
        console.log('credential.nonce (from plugin):', pluginNonce);
        console.log('idToken payload.nonce         :', tokenNonce ?? '⚠️ MISSING in token');
        console.log('sha256(credential.nonce)      :', sha256OfPlugin);
        console.log('');
        console.log('Verdict:',
          !tokenNonce
            ? '⚠️ idToken has NO nonce claim — Apple may not have embedded one'
            : pluginNonce === tokenNonce
              ? '🔴 BUG: plugin returned HASH — Firebase will double-hash → mismatch'
              : sha256OfPlugin === tokenNonce
                ? '✅ plugin returned RAW nonce — nonce flow is correct; error is elsewhere'
                : '🔴 UNKNOWN mismatch — neither raw nor hash matches token');
        console.groupEnd();
      } catch (dbgErr) {
        console.warn('[AppleAuth DEBUG] failed:', dbgErr);
      }
      // ── END DEBUG ─────────────────────────────────────────────────────

      // result.credential.nonce is the raw nonce the plugin generated and used when
      // building the Apple request (plugin hashed it before sending to Apple, and Apple
      // embedded the hash in the idToken). Firebase verifies by rehashing rawNonce.
      const appleProvider = new OAuthProvider('apple.com');
      const credential = appleProvider.credential({
        idToken: result.credential.idToken,
        rawNonce: result.credential.nonce,
      });

      const webResult = await signInWithCredential(auth, credential);
      syncProviderDataToFirestore(webResult.user);
      return { user: webResult.user, error: null };
    } else {
      // ── Web / browser fallback ───────────────────────────────────────
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      const result = await signInWithPopup(auth, provider);
      syncProviderDataToFirestore(result.user);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    const msg: string = error?.message ?? String(error);

    // iPad / plugin timeout — surface a clear, actionable message
    if (msg === 'APPLE_SIGNIN_TIMEOUT') {
      console.error('[Auth Service] Apple sign-in timed out (iPad presentationAnchor issue?)');
      return { user: null, error: 'apple_timeout' };
    }

    // User dismissed the Apple sheet — not an error worth surfacing
    if (
      error?.code === 'ERR_CANCELED' ||
      msg.includes('cancel') ||
      msg.includes('dismiss') ||
      msg.includes('com.apple.AuthenticationServices.AuthorizationError error 1001')
    ) {
      return { user: null, error: 'apple_canceled' };
    }

    console.error('[Auth Service] Apple sign-in error:', error);
    return { user: null, error: msg };
  }
}

/**
 * Sign in as Guest (Anonymous)
 */
export async function signInGuest() {
  try {
    const result = await signInAnonymously(auth);
    return { user: result.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Link current anonymous account with Google — native iOS/Android or web fallback.
 * Used by AuthModal when upgrading a guest session to a Google-backed account.
 */
export async function linkGoogleAccount() {
  try {
    if (!auth.currentUser) throw new Error('No user is currently signed in');

    if (isNativePlatform()) {
      // ── Native iOS / Android path ─────────────────────────────────────
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      const result = await withGoogleTimeout(FirebaseAuthentication.signInWithGoogle());

      if (!result.credential?.idToken) {
        return { user: null, error: 'לא התקבל פרטי זיהוי מ-Google Sign In.' };
      }

      const credential = GoogleAuthProvider.credential(
        result.credential.idToken,
        result.credential.accessToken ?? undefined,
      );

      const linkResult = await linkWithCredential(auth.currentUser, credential);
      return { user: linkResult.user, error: null };
    } else {
      // ── Web / browser fallback ────────────────────────────────────────
      const provider = new GoogleAuthProvider();
      const result = await linkWithPopup(auth.currentUser, provider);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    console.error("Link Error:", error);
    const msg: string = error?.message ?? String(error);

    if (msg === 'GOOGLE_SIGNIN_TIMEOUT') {
      return { user: null, error: 'google_timeout' };
    }
    if (
      error?.code === 'ERR_CANCELED' ||
      msg.includes('cancel') ||
      msg.includes('dismiss') ||
      msg.includes('sign_in_canceled')
    ) {
      return { user: null, error: 'google_canceled' };
    }

    return { user: null, error: msg };
  }
}

/**
 * Link anonymous account with Google — native iOS/Android or web fallback.
 *
 * Native (Capacitor): presents the native Google sign-in sheet via
 * `@capacitor-firebase/authentication`, then replays the credential into
 * the WEB firebase/auth instance with `linkWithCredential`.
 *
 * Web fallback: uses `linkWithPopup`. signInWithPopup / linkWithPopup are
 * blocked by iOS WKWebView when loading remote content, so the native
 * path is essential for TestFlight / App Store builds.
 */
export async function linkWithGoogleAccount() {
  try {
    if (!auth.currentUser) throw new Error('No user signed in');
    if (!auth.currentUser.isAnonymous) {
      return { user: null, error: 'not_anonymous' };
    }

    if (isNativePlatform()) {
      // ── Native iOS / Android path ─────────────────────────────────────
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      const result = await withGoogleTimeout(FirebaseAuthentication.signInWithGoogle());

      if (!result.credential?.idToken) {
        return { user: null, error: 'לא התקבל פרטי זיהוי מ-Google Sign In.' };
      }

      const credential = GoogleAuthProvider.credential(
        result.credential.idToken,
        result.credential.accessToken ?? undefined,
      );

      const linkResult = await linkWithCredential(auth.currentUser, credential);
      return { user: linkResult.user, error: null };
    } else {
      // ── Web / browser fallback ────────────────────────────────────────
      const provider = new GoogleAuthProvider();
      const result = await linkWithPopup(auth.currentUser, provider);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    console.error('[Auth Service] Google link error:', error);
    const msg: string = error?.message ?? String(error);

    if (msg === 'GOOGLE_SIGNIN_TIMEOUT') {
      console.error('[Auth Service] Google link timed out (REVERSED_CLIENT_ID URL scheme missing?)');
      return { user: null, error: 'google_timeout' };
    }
    if (
      error?.code === 'ERR_CANCELED' ||
      msg.includes('cancel') ||
      msg.includes('dismiss') ||
      msg.includes('sign_in_canceled')
    ) {
      return { user: null, error: 'google_canceled' };
    }
    if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/email-already-in-use') {
      return { user: null, error: 'google_account_exists' };
    }
    if (error.code === 'auth/popup-closed-by-user') {
      return { user: null, error: 'popup_closed' };
    }

    return { user: null, error: msg };
  }
}

/**
 * Link anonymous account with Apple — native iOS or web fallback.
 *
 * Native path: presents the ASAuthorizationController sheet via
 * `@capacitor-firebase/authentication`, then replays the credential
 * into the WEB firebase/auth instance with `linkWithCredential`.
 *
 * Web fallback: uses `linkWithPopup` with `OAuthProvider('apple.com')`.
 */
export async function linkWithAppleAccount(): Promise<{ user: User | null; error: string | null }> {
  // Apple Sign-In is not supported on Android.
  if (typeof window !== 'undefined') {
    const cap = window as unknown as { Capacitor?: { getPlatform?: () => string } };
    if (cap.Capacitor?.getPlatform?.() === 'android') {
      return { user: null, error: 'Apple Sign-In is not available on Android' };
    }
  }
  try {
    if (!auth.currentUser) throw new Error('No user signed in');
    if (!auth.currentUser.isAnonymous) {
      return { user: null, error: 'not_anonymous' };
    }

    if (isNativePlatform()) {
      // Only the Capacitor plugin is lazy-loaded; Firebase SDK classes come
      // from the top-level static import so they share the same module
      // instance as `auth` and pass Firebase's internal instanceof checks.
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      // skipNativeAuth: true — same reason as signInWithApple: prevents native iOS SDK
      // from consuming the nonce before the JS SDK linkWithCredential call.
      const result = await withAppleTimeout(
        FirebaseAuthentication.signInWithApple({ skipNativeAuth: true }),
      );

      if (!result.credential?.idToken) {
        return { user: null, error: 'לא התקבל פרטי זיהוי מ-Apple Sign In.' };
      }
      if (!result.credential.nonce) {
        return { user: null, error: 'Apple Sign In לא החזיר nonce. נסה שוב.' };
      }

      const appleProvider = new OAuthProvider('apple.com');
      const credential = appleProvider.credential({
        idToken: result.credential.idToken,
        rawNonce: result.credential.nonce,
      });

      const linkResult = await linkWithCredential(auth.currentUser, credential);
      return { user: linkResult.user, error: null };
    } else {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      const result = await linkWithPopup(auth.currentUser, provider);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    console.error('[Auth Service] Apple link error:', error);
    const msg: string = error?.message ?? String(error);

    if (msg === 'APPLE_SIGNIN_TIMEOUT') {
      return { user: null, error: 'apple_timeout' };
    }
    if (
      error?.code === 'ERR_CANCELED' ||
      msg.includes('cancel') ||
      msg.includes('dismiss') ||
      msg.includes('com.apple.AuthenticationServices.AuthorizationError error 1001')
    ) {
      return { user: null, error: 'apple_canceled' };
    }
    if (error.code === 'auth/credential-already-in-use') {
      return { user: null, error: 'apple_account_exists' };
    }
    return { user: null, error: msg };
  }
}

/**
 * Link anonymous account with email/password
 * Used in AccountSecureStep for manual email backup
 */
export async function linkEmailPassword(email: string, password: string) {
  try {
    if (!auth.currentUser) throw new Error('No user signed in');
    if (!auth.currentUser.isAnonymous) {
      return { user: null, error: 'not_anonymous' };
    }

    const credential = EmailAuthProvider.credential(email, password);
    const result = await linkWithCredential(auth.currentUser, credential);
    return { user: result.user, error: null };
  } catch (error: any) {
    console.error('[Auth Service] Email link error:', error);
    
    // Handle "credential-already-in-use" error
    if (error.code === 'auth/credential-already-in-use') {
      return { user: null, error: 'email_exists' };
    }
    if (error.code === 'auth/invalid-email') {
      return { user: null, error: 'invalid_email' };
    }
    if (error.code === 'auth/weak-password') {
      return { user: null, error: 'weak_password' };
    }
    
    return { user: null, error: error.message };
  }
}

/**
 * Sign in to an EXISTING Google account — used when linkWithGoogleAccount
 * returns 'google_account_exists'. Does NOT link; signs in directly.
 * Native path: same Capacitor plugin. Web path: signInWithPopup.
 */
export async function signInWithGoogleDirect(): Promise<{ user: User | null; error: string | null }> {
  try {
    if (isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await withGoogleTimeout(FirebaseAuthentication.signInWithGoogle());
      if (!result.credential?.idToken) {
        return { user: null, error: 'No credentials from Google Sign In.' };
      }
      const credential = GoogleAuthProvider.credential(
        result.credential.idToken,
        result.credential.accessToken ?? undefined,
      );
      const signInResult = await signInWithCredential(auth, credential);
      return { user: signInResult.user, error: null };
    } else {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    const msg: string = error?.message ?? String(error);
    if (msg === 'GOOGLE_SIGNIN_TIMEOUT') return { user: null, error: 'google_timeout' };
    if (error?.code === 'ERR_CANCELED' || msg.includes('cancel') || msg.includes('dismiss') || msg.includes('sign_in_canceled')) {
      return { user: null, error: 'google_canceled' };
    }
    if (error.code === 'auth/popup-closed-by-user') return { user: null, error: 'popup_closed' };
    return { user: null, error: msg };
  }
}

/**
 * Sign in to an EXISTING Apple account — used when linkWithAppleAccount
 * returns 'apple_account_exists'. Does NOT link; signs in directly.
 */
export async function signInWithAppleDirect(): Promise<{ user: User | null; error: string | null }> {
  if (typeof window !== 'undefined') {
    const cap = window as unknown as { Capacitor?: { getPlatform?: () => string } };
    if (cap.Capacitor?.getPlatform?.() === 'android') {
      return { user: null, error: 'Apple Sign-In is not available on Android' };
    }
  }
  try {
    if (isNativePlatform()) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await withAppleTimeout(
        FirebaseAuthentication.signInWithApple({ skipNativeAuth: true }),
      );
      if (!result.credential?.idToken) {
        return { user: null, error: 'No credentials from Apple Sign In.' };
      }
      if (!result.credential.nonce) {
        return { user: null, error: 'Apple Sign In did not return nonce.' };
      }
      const appleProvider = new OAuthProvider('apple.com');
      const credential = appleProvider.credential({
        idToken: result.credential.idToken,
        rawNonce: result.credential.nonce,
      });
      const signInResult = await signInWithCredential(auth, credential);
      return { user: signInResult.user, error: null };
    } else {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await signInWithPopup(auth, provider);
      return { user: result.user, error: null };
    }
  } catch (error: any) {
    const msg: string = error?.message ?? String(error);
    if (msg === 'APPLE_SIGNIN_TIMEOUT') return { user: null, error: 'apple_timeout' };
    if (error?.code === 'ERR_CANCELED' || msg.includes('cancel') || msg.includes('dismiss') ||
      msg.includes('com.apple.AuthenticationServices.AuthorizationError error 1001')) {
      return { user: null, error: 'apple_canceled' };
    }
    return { user: null, error: msg };
  }
}

/**
 * Link anonymous account with phone (future implementation)
 * Placeholder for Phase 3
 */
export async function linkPhoneNumber(phoneNumber: string) {
  // TODO: Implement phone auth with Firebase Phone Authentication
  // This requires setting up Firebase Phone Auth provider and SMS verification
  console.warn('[Auth Service] Phone linking not yet implemented');
  return { user: null, error: 'not_implemented' };
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    // Best-effort clear of the server-side admin session cookie BEFORE
    // signing out the Firebase client. If this fails (e.g. offline) we
    // still proceed — the cookie has a 1-hour TTL and the middleware
    // will reject it on next /admin/* access anyway.
    if (typeof window !== 'undefined') {
      // Clear the splash-screen hint here (and ONLY here) — see the
      // SESSION_HINT_KEY comment at the top of this file. Doing it
      // before signOut() ensures a same-tick reload after logout
      // shows the landing page immediately, never the splash.
      await clearSessionHint();
      try {
        await fetch('/api/auth/session', {
          method: 'DELETE',
          credentials: 'same-origin',
        });
      } catch {
        /* non-fatal */
      }
    }
    await signOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Subscribe to auth state changes
 */
/**
 * Auth state change listener with retry logic for network errors
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  const wrappedCallback = async (user: User | null) => {
    // Persist a "had a session" hint on every positive auth emission so
    // the next cold-open of `/` knows to render the branded splash
    // (instead of flashing the landing page) while Firebase restores.
    // Only WRITE here — the hint is cleared exclusively in
    // signOutUser(). This avoids wiping the hint during a transient
    // null emit such as a token refresh, which would otherwise re-open
    // the flicker we're trying to kill.
    if (typeof window !== 'undefined' && user) {
      void setSessionHint();
    }

    try {
      await callback(user);
      retryCount = 0; // Reset on success
    } catch (error: any) {
      // Check for network/Firestore errors
      const isNetworkError = 
        error?.code === 'ERR_QUIC_PROTOCOL_ERROR' ||
        error?.code === 'unavailable' ||
        error?.message?.includes('network') ||
        error?.message?.includes('quic') ||
        error?.message?.includes('Failed to fetch');

      if (isNetworkError && retryCount < maxRetries) {
        retryCount++;
        console.warn(`[Auth Service] Network error detected, retrying (${retryCount}/${maxRetries})...`, error);
        
        setTimeout(() => {
          wrappedCallback(user);
        }, retryDelay * retryCount); // Exponential backoff
      } else {
        console.error('[Auth Service] Error in auth state callback:', error);
        // Still call callback with user to prevent UI blocking
        callback(user);
      }
    }
  };

  return onAuthStateChanged(auth, wrappedCallback);
}

/**
 * Send passwordless sign-in link via email (Magic Link)
 */
export async function sendMagicLink(email: string, continueUrl?: string): Promise<{ error: string | null }> {
  try {
    const actionCodeSettings: ActionCodeSettings = {
      url: continueUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/auth/callback`,
      handleCodeInApp: true,
    };

    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    
    // Store email in localStorage for later use
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('emailForSignIn', email);
    }
    
    return { error: null };
  } catch (error: any) {
    console.error('Error sending magic link:', error);
    return { error: error.message };
  }
}

/**
 * Check if the current URL is a magic link callback
 */
export function isMagicLinkCallback(): boolean {
  if (typeof window === 'undefined') return false;
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * Sign in with magic link from email
 */
export async function signInWithMagicLink(email: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    
    if (!isSignInWithEmailLink(auth, url)) {
      return { user: null, error: 'Invalid magic link' };
    }

    // Get the email from localStorage if not provided
    let emailToUse = email;
    if (!emailToUse && typeof window !== 'undefined') {
      emailToUse = window.localStorage.getItem('emailForSignIn') || '';
    }

    if (!emailToUse) {
      return { user: null, error: 'Email is required' };
    }

    const userCredential = await signInWithEmailLink(auth, emailToUse, url);
    
    // Clear email from localStorage
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('emailForSignIn');
    }

    return { user: userCredential.user, error: null };
  } catch (error: any) {
    console.error('Error signing in with magic link:', error);
    return { user: null, error: error.message };
  }
}
