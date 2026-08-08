"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGoogle, signInWithApple, onAuthStateChange } from '@/lib/auth.service';
import { db, auth } from '@/lib/firebase';
import { getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { resolveJoinLanding } from '@/lib/resolveJoinLanding';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import BrandedSplashScreen from '@/components/BrandedSplashScreen';

// localStorage key written by `auth.service.ts` on every positive auth
// emission and cleared in `signOutUser`. Read here on first paint to
// decide whether to render the branded splash (returning user — Firebase
// is about to restore the session) or the landing UI immediately
// (brand-new visitor).
const SESSION_HINT_KEY = 'out:has-session';

/**
 * Max ms to wait for the post-auth profile getDoc() before giving up and
 * falling back to the guest landing UI. Without this, a Firestore request
 * that never definitively resolves or rejects (e.g. repeated App Check
 * attestation failures under real DeviceCheck/AppAttest) leaves the
 * branded splash screen mounted forever with no escape hatch.
 */
const PROFILE_LOOKUP_TIMEOUT_MS = 8_000;

/**
 * Auth gate states for the landing page.
 *
 *   restoring    → Firebase is restoring (or about to restore) the
 *                  session. Render the branded splash; the UI is
 *                  intentionally invisible to prevent the half-second
 *                  login flash that returning users used to see.
 *   authenticated → onAuthStateChange resolved a user. The redirect to
 *                  `/home` / `/onboarding-new` / `/gateway` is in
 *                  flight; keep the splash visible until Next.js
 *                  finishes the navigation.
 *   guest        → Confirmed unauthenticated. Render the landing/login
 *                  marketing UI.
 */
type AuthState = 'restoring' | 'authenticated' | 'guest';

// ════════════════════════════════════════════════════════════════════
// CAROUSEL IMAGES — Static assets served from public/images/landing/
//
// Drop replacement images into:
//   public/images/landing/bg-1.jpg
//   public/images/landing/bg-2.jpg
//   public/images/landing/bg-3.jpg
//
// The filenames are the contract — the carousel reads exactly these
// three paths. Swap the files to swap the visuals; no code change needed.
// ════════════════════════════════════════════════════════════════════

const CAROUSEL_IMAGES = [
  '/images/landing/bg-1.jpg',
  '/images/landing/bg-2.jpg',
  '/images/landing/bg-3.jpg',
];

// Each tagline is paired 1-to-1 with the image at the same index so the
// text transitions in perfect sync with the background crossfade.
const TAGLINES = [
  'עכשיו אפשר להתאמן בכל מקום, מתי שנוח לכם',
  'מסלולי הליכה בפארק ותוכניות אימונים',
  'מתאים אימונים לכל אחת ואחד',
];

const CYCLE_MS = 4000; // 4 seconds per image

// ════════════════════════════════════════════════════════════════════
// BACKGROUND CAROUSEL — Crossfade animation (index lifted to parent)
//
// The `index` prop is owned by LandingPage so that the same counter
// drives both the background crossfade AND the tagline swap, keeping
// them perfectly in sync without a second timer.
//
// Mounted guard: the carousel touches browser-only APIs and Framer
// Motion inline styles that can differ between the SSR pass and client
// hydration. We suppress the subtree on the server and render a neutral
// white placeholder instead, so React sees an identical DOM on both
// sides and never raises a hydration warning.
// ════════════════════════════════════════════════════════════════════

function BackgroundCarousel({ index }: { index: number }) {
  const [mounted, setMounted] = useState(false);

  // Mark as mounted after hydration so SSR and client first-paint match.
  useEffect(() => {
    setMounted(true);
  }, []);

  // SSR / pre-mount: render a plain white placeholder that the server
  // HTML and the client's first paint both agree on.
  if (!mounted) {
    return (
      <div className="absolute inset-0 z-0 bg-white">
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent z-10" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0">
      {CAROUSEL_IMAGES.map((src, i) => (
        <motion.div
          key={src}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${src}')` }}
          initial={false}
          animate={{ opacity: i === index ? 1 : 0 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        />
      ))}
      {/* Clean white fade-out gradient overlay matching the onboarding flow */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent z-10" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// LOGIN DRAWER (Bottom Sheet)
// ════════════════════════════════════════════════════════════════════

function LoginDrawer({
  open,
  onClose,
  onGoogleLogin,
  onAppleLogin,
  loadingProvider,
}: {
  open: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
  onAppleLogin: () => void;
  /** Which provider is currently authenticating, or null if idle. */
  loadingProvider: 'google' | 'apple' | null;
}) {
  const loading = loadingProvider !== null;
  // Hide Apple button on Android — ASAuthorizationController is iOS-only.
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    setIsAndroid(cap?.getPlatform?.() === 'android');
  }, []);
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors"
            >
              <X size={16} />
            </button>

            <div className="px-6 pt-4 pb-6 flex flex-col items-center gap-5">
              <div className="text-center">
                <h3
                  className="text-xl font-bold text-slate-900 mb-1"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  התחברות
                </h3>
                <p
                  className="text-sm text-slate-500"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  היכנס עם החשבון שלך כדי להמשיך
                </p>
              </div>

              {/* Google Login */}
              <button
                onClick={onGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold py-4 rounded-2xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {loadingProvider === 'google' ? (
                  <svg className="animate-spin w-5 h-5 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 48 48" className="flex-shrink-0">
                    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.9 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.2-2.7-.4-3.9z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.5 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.9 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.4-5l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.3 0-9.8-3.5-11.4-8.3l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.8 39.2 44 34 44 24c0-1.3-.2-2.7-.4-3.9z"/>
                  </svg>
                )}
                {loadingProvider === 'google' ? 'מתחבר...' : 'המשך עם Google'}
              </button>

              {/* Apple Login — native ASAuthorizationController sheet (iOS only) */}
              {!isAndroid && (
                <button
                  onClick={onAppleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-black hover:bg-gray-900 text-white font-bold py-4 rounded-2xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {loadingProvider === 'apple' ? (
                    <svg className="animate-spin w-5 h-5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                  )}
                  {loadingProvider === 'apple' ? 'מתחבר...' : 'המשך עם Apple'}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN LANDING PAGE
// ════════════════════════════════════════════════════════════════════

export default function LandingPage() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Unified carousel index — drives both background AND tagline ──
  // Owned here so a single timer keeps both in perfect sync.
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselMounted, setCarouselMounted] = useState(false);
  useEffect(() => {
    setCarouselMounted(true);
  }, []);
  useEffect(() => {
    if (!carouselMounted) return;
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [carouselMounted]);

  // ── Auth gate ──
  // IMPORTANT: Always initialise as 'restoring' so the server-rendered
  // HTML and the first client render are IDENTICAL (both show the branded
  // splash). Reading localStorage here instead would cause a hydration
  // mismatch: SSR has no window → 'restoring', but new/logged-out clients
  // would evaluate to 'guest' → React sees two different component trees.
  // The localStorage hint is read in a useEffect below (runs only on the
  // client, after hydration is committed), which is the correct place for
  // any code that touches browser-only APIs.
  const [authState, setAuthState] = useState<AuthState>('restoring');

  // ── Session hint check — client-only, post-hydration ──
  // Two-tier fallback to avoid the cold-start race condition on iOS where
  // WKWebView can evict localStorage between hard close and re-launch:
  //   1. Fast path: localStorage.getItem(SESSION_HINT_KEY)
  //   2. Native fallback: @capacitor/preferences (NSUserDefaults /
  //      SharedPreferences) which the OS does NOT evict.
  // If either source has the hint we stay in 'restoring' so the splash
  // remains visible and the Firebase onAuthStateChange listener below
  // handles the redirect once auth finishes restoring. Only when BOTH
  // sources are empty do we paint the landing UI immediately.
  useEffect(() => {
    let cancelled = false;

    async function checkSessionHint() {
      try {
        if (window.localStorage.getItem(SESSION_HINT_KEY) === '1') return;
      } catch {
        // Private-mode / quota error — fall through to native check.
      }

      // Native fallback: check @capacitor/preferences before declaring guest.
      const cap = (window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }).Capacitor;
      if (cap?.isNativePlatform?.()) {
        try {
          const [{ Preferences }, { SESSION_HINT_NATIVE_KEY }] = await Promise.all([
            import('@capacitor/preferences'),
            import('@/lib/auth.service'),
          ]);
          const { value } = await Preferences.get({ key: SESSION_HINT_NATIVE_KEY });
          if (cancelled) return;
          if (value === '1') {
            // Restore the fast-path mirror so subsequent reads are sync.
            try { window.localStorage.setItem(SESSION_HINT_KEY, '1'); } catch { /* quota */ }
            return; // stay 'restoring' — Firebase will redirect
          }
        } catch {
          // Plugin / I/O failure — fall through and treat as guest.
        }
      }

      if (!cancelled) setAuthState('guest');
    }

    void checkSessionHint();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-redirect for already logged-in users ──
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (!user) {
        // Confirmed unauthenticated — paint the landing UI. Note that
        // we DO NOT clear SESSION_HINT_KEY here; only signOutUser does.
        // A transient null emit during a token refresh shouldn't kick
        // the user back to a landing flash on the next reload.
        setAuthState('guest');
        return;
      }

      // User is present — keep the splash visible during the redirect
      // roundtrip so the carousel/login UI never paints. The router
      // navigation below will swap the page out before this resolves.
      setAuthState('authenticated');

      try {
        const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('PROFILE_LOOKUP_TIMEOUT')),
            PROFILE_LOOKUP_TIMEOUT_MS,
          ),
        );
        const userDocSnap = await Promise.race([
          getDoc(firestoreDoc(db, 'users', user.uid)),
          timeoutPromise,
        ]);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const status = userData?.onboardingStatus;
          const step = userData?.onboardingStep;
          const path = userData?.onboardingPath;

          if (status === 'IN_PROGRESS' && step === 'IDENTITY') {
            router.push('/onboarding-new/profile');
          } else if (status === 'IN_PROGRESS' && step === 'ASSESSMENT') {
            // Route to visual assessment (replaces legacy dynamic questionnaire)
            router.push('/onboarding-new/assessment-visual');
          } else if (status === 'IN_PROGRESS' && step === 'VISUAL_ASSESSMENT_COMPLETE') {
            // Assessment done — skip to health declaration
            router.push('/onboarding-new/health');
          } else if (status === 'IN_PROGRESS' && step === 'HEALTH') {
            router.push('/onboarding-new/health');
          } else if (status === 'PENDING_LIFESTYLE') {
            router.push('/home');
          } else if (status === 'COMPLETED' || userData?.onboardingComplete) {
            router.push('/home');
          } else if (path === 'MAP_ONLY' || status === 'MAP_ONLY') {
            router.push('/explorer');
          } else {
            // Default: user exists but no clear status — let them choose a track
            router.push('/gateway');
          }
        } else {
          // Auth user exists but no Firestore profile yet.
          //
          // Recovery (Fix 3b): an anonymous MAP_ONLY explorer whose doc write
          // was lost on a hard-close still carries the durable onboarding_path
          // marker (written by the gateway explore path). Re-create a minimal
          // MAP_ONLY doc for the SAME anon uid and send them to /explorer (where
          // their saved location is restored) — instead of /gateway, which would
          // mint a brand-new anon uid via resolveUser()->signInGuest() and
          // re-ask everything ("app forgot me"). The re-created doc also lets
          // syncLocationToFirestore's updateDoc succeed and makes subsequent
          // reopens take the normal doc-exists MAP_ONLY path above.
          //
          // Genuinely new users (non-anonymous first sign-in, or no marker) fall
          // through to /gateway, which scaffolds the full profile. Without a
          // redirect here the splash would hang forever.
          const durablePath = await getOnboardingPrefAsync('onboarding_path');
          if (user.isAnonymous && durablePath === 'MAP_ONLY') {
            const { setDoc, doc: fsDoc, serverTimestamp } = await import('firebase/firestore');
            await setDoc(
              fsDoc(db, 'users', user.uid),
              {
                id: user.uid,
                onboardingPath: 'MAP_ONLY',
                onboardingStatus: 'MAP_ONLY',
                core: { name: '' },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ).catch((e) => console.error('[Landing] MAP_ONLY doc recovery failed:', e));
            router.push('/explorer');
          } else {
            router.push('/gateway');
          }
        }
      } catch (e) {
        if ((e as Error)?.message === 'PROFILE_LOOKUP_TIMEOUT') {
          // The Firestore read never resolved or rejected on its own within
          // PROFILE_LOOKUP_TIMEOUT_MS. This almost always means App Check
          // attestation is failing/retrying underneath (see firebase.ts's
          // own 10s timeout + circuit breaker on getToken()) and the
          // request never got a definitive server response. The screen
          // unstuck itself, but the underlying attestation problem still
          // needs fixing — profile/steps data will not actually save until
          // App Check tokens are issued successfully.
          console.warn(
            '[Landing] TIMEOUT: profile getDoc() did not resolve within ' +
            `${PROFILE_LOOKUP_TIMEOUT_MS}ms — likely App Check attestation ` +
            'still failing underneath. Falling back to guest UI.',
          );
        } else {
          console.error('[Landing] Error checking auth status:', e);
        }
        // Fall back to landing UI so the user can retry. Better to
        // show them a recoverable login screen than to leave them
        // stranded on the splash.
        setAuthState('guest');
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ── Primary: "הרשמה מהירה" → Gateway (handles signInGuest before Profile) ──
  const handleQuickSignup = useCallback(() => {
    router.push('/gateway');
  }, [router]);

  // ── Secondary: "התחברות" → Open login drawer ──
  const handleLoginOpen = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  // ── Shared post-auth redirect ──
  // Rule: if a Firestore profile already exists for this uid the user has
  // been through onboarding before — send them straight to /home.
  // If no doc exists they are brand-new — send to /gateway to start onboarding.
  // Exception: if a pending_invite_code exists in localStorage (set by /join/[inviteCode]),
  // confirm the join inline and land on the group drawer — regardless of existing/new user.
  const redirectAfterAuth = useCallback(async (uid: string) => {
    const pendingInvite = typeof window !== 'undefined'
      ? localStorage.getItem('pending_invite_code')
      : null;

    if (pendingInvite) {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const res = await fetch('/api/join/confirm', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body:    JSON.stringify({ inviteCode: pendingInvite }),
          });
          if (res.ok) {
            const { groupId } = await res.json() as { groupId: string };
            localStorage.removeItem('pending_invite_code');
            router.push(resolveJoinLanding(groupId));
            return;
          }
        }
      } catch {
        // fall through to default navigation
      }
      // Confirm failed — send back to join page so the user can retry
      localStorage.removeItem('pending_invite_code');
      router.push(`/join/${encodeURIComponent(pendingInvite)}`);
      return;
    }

    const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
    const userDocSnap = await getDoc(firestoreDoc(db, 'users', uid));
    if (userDocSnap.exists()) {
      router.push('/home');
    } else {
      router.push('/gateway');
    }
  }, [router]);

  // ── Google Login inside drawer ──
  const handleGoogleLogin = useCallback(async () => {
    setLoadingProvider('google');
    try {
      const { user } = await signInWithGoogle();
      if (!user) { setLoadingProvider(null); return; }
      await redirectAfterAuth(user.uid);
    } catch (error) {
      console.error('[Landing] Google login error:', error);
    }
    setLoadingProvider(null);
    setDrawerOpen(false);
  }, [router, redirectAfterAuth]);

  // ── Apple Login inside drawer ──
  const handleAppleLogin = useCallback(async () => {
    setLoadingProvider('apple');
    try {
      const { user, error } = await signInWithApple();
      // User dismissed the native sheet — silent no-op
      if (error === 'apple_canceled') { setLoadingProvider(null); return; }
      if (!user) { setLoadingProvider(null); return; }
      await redirectAfterAuth(user.uid);
    } catch (err) {
      console.error('[Landing] Apple login error:', err);
    }
    setLoadingProvider(null);
    setDrawerOpen(false);
  }, [router, redirectAfterAuth]);

  return (
    <>
      {/* Splash overlay — fades out over 300 ms once auth resolves to 'guest'.
          Rendered above the marketing UI (z-[100]) so the carousel can
          preload in the background without the user seeing a flash. */}
      <AnimatePresence>
        {authState !== 'guest' && (
          <motion.div
            key="branded-splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          >
            <BrandedSplashScreen />
          </motion.div>
        )}
      </AnimatePresence>
    
    <div className="min-h-[100dvh] bg-white relative overflow-hidden flex flex-col">
      {/* ── Animated Background Carousel ── */}
      <BackgroundCarousel index={carouselIndex} />

      {/* ── Content fills screen, pushes bottom section down ── */}
      <div className="relative z-20 flex-1 flex flex-col justify-end">

        {/* ── Bottom UI Section — Light white gradient ── */}
        <div
          className="px-6 pt-32 pb-8"
          style={{
            paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
            background: 'linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.98) 60%, rgba(255,255,255,0) 100%)',
          }}
        >
          <div className="max-w-md mx-auto flex flex-col items-center gap-5">

            {/* Logo — official SVG brand asset, native colors (light background) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/logo/Kind=logotype.svg"
                alt="OUT"
                className="h-10 object-contain"
              />
            </motion.div>

            {/* Tagline — synced to carousel index, crossfades on each cycle */}
            <AnimatePresence mode="wait">
              <motion.p
                key={carouselIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                className="text-slate-900 text-lg font-black text-center drop-shadow-sm"
                style={{ fontFamily: 'var(--font-simpler)' }}
                dir="rtl"
              >
                {TAGLINES[carouselIndex]}
              </motion.p>
            </AnimatePresence>

            {/* Primary Button: הרשמה מהירה */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleQuickSignup}
              className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/20 transition-all active:scale-[0.98] text-base"
              style={{ fontFamily: 'var(--font-simpler)' }}
              dir="rtl"
            >
              הרשמה מהירה
            </motion.button>

            {/* Secondary Button: התחברות */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              onClick={handleLoginOpen}
              className="text-slate-500 hover:text-slate-900 text-sm font-bold py-2 transition-colors underline underline-offset-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
              dir="rtl"
            >
              התחברות
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── Login Drawer ── */}
      <LoginDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onGoogleLogin={handleGoogleLogin}
        onAppleLogin={handleAppleLogin}
        loadingProvider={loadingProvider}
      />
    </div>
    </>
  );
}
