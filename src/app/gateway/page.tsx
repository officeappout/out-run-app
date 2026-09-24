"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChange } from '@/lib/auth.service';
import { db } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Loader2, Footprints } from 'lucide-react';
import { captureReferralParam, getStoredReferrer, clearStoredReferrer, processReferral, establishSocialConnection } from '@/features/safecity/services/referral.service';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { reportSignupFailure, extractErrorCode } from '@/lib/reportSignupFailure';
import { useToast } from '@/components/ui/Toast';
import {
  runExploreMapFlow,
  resolveUser,
  consumePendingGroupInvite,
  consumePendingSessionInvite,
} from '@/features/user/onboarding/services/run-explore-map-flow';

// ============================================================================
// LOADING OVERLAY — Clean, branded transition
// ============================================================================

const LOADING_STATES = [
  "מאתר מסלולים אופטימליים...",
  "מכייל GPS...",
  "מנתח נתוני שטח...",
  "מכין את הדאשבורד שלך...",
];

interface GuestTransitionOverlayProps {
  status: 'loading' | 'error';
  onRetry: () => void;
  onExit: () => void;
}

/**
 * P0-1 (24.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.18/§13.22):
 * this overlay covers the ENTIRE screen (z-50, no gap) while the guest
 * sign-in this page triggers runs — it used to have no error state at all,
 * so a stuck sign-in left the user staring at a progress bar that had
 * already claimed 100% with no way out. Two behavioral changes:
 *   - The bar below is now indeterminate (a looping segment), not a fixed
 *     3.5s 0%→100% animation that reached "done" regardless of whether
 *     anything had actually finished — there is no real progress signal to
 *     drive a determinate bar honestly (GPS/profile-write/invite-consume
 *     don't have a meaningful "% complete"), so this doesn't claim one.
 *   - `status === 'error'` swaps the whole overlay for a dead-end-proof
 *     failure screen: an explicit message, "try again", and an exit that
 *     always gets the user back to a real, interactive screen.
 */
function GuestTransitionOverlay({ status, onRetry, onExit }: GuestTransitionOverlayProps) {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    if (status !== 'loading') return;
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % LOADING_STATES.length);
    }, 800);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center"
      dir="rtl"
    >
      <div className="relative mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/logo/Kind=logotype.svg"
          alt="OUT"
          className={`h-14 object-contain ${status === 'loading' ? 'animate-pulse' : ''}`}
        />
      </div>

      {status === 'loading' ? (
        <>
          <div className="h-8 relative w-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p
                key={statusIndex}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-[#5BC2F2] text-sm font-medium absolute w-full"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {LOADING_STATES[statusIndex]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Indeterminate — a looping segment, not a fake 0%→100% claim. */}
          <div className="w-48 h-1.5 bg-slate-200 rounded-full mt-8 overflow-hidden">
            <motion.div
              className="h-full w-1/3 bg-gradient-to-r from-[#5BC2F2] to-[#0CF2E2] rounded-full"
              animate={{ x: ['-120%', '340%'] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </>
      ) : (
        <>
          <p
            className="text-slate-700 text-base font-bold mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            החיבור לא הצליח
          </p>
          <p className="text-slate-400 text-sm font-medium mb-8 max-w-xs">
            משהו השתבש בהתחברות. בדקו את החיבור לאינטרנט ונסו שוב, או חזרו למסך הראשי.
          </p>
          <div className="w-full max-w-xs flex flex-col gap-3">
            <button
              onClick={onRetry}
              className="w-full py-3.5 rounded-2xl bg-[#5BC2F2] text-white font-bold text-sm"
            >
              נסה שוב
            </button>
            <button
              onClick={onExit}
              className="w-full py-3.5 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm"
            >
              חזרה למסך הראשי
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ============================================================================
// GATEWAY PAGE — Premium, image-heavy selection cards
// ============================================================================

export default function GatewayPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showGuestTransition, setShowGuestTransition] = useState(false);
  const [guestTransitionStatus, setGuestTransitionStatus] = useState<'loading' | 'error'>('loading');
  const { flags } = useFeatureFlags();

  // Derived: is anything in progress?
  const isBusy = loading || showGuestTransition;

  // Ref mirrors isBusy so the auth listener always reads the latest value
  // without needing to re-subscribe on every state change.
  const isBusyRef = useRef(false);
  useEffect(() => { isBusyRef.current = isBusy; }, [isBusy]);

  // ── Capture referral param from URL (e.g. /gateway?ref=xyz) ──
  useEffect(() => { captureReferralParam(); }, []);

  // ── Prefetch target pages so navigation is instant ──
  useEffect(() => {
    router.prefetch('/onboarding-new/profile');
    router.prefetch('/explorer');
  }, [router]);

  // ── Auto-redirect for already logged-in users ──
  // Uses isBusyRef to skip the Firestore read when handleGetProgram /
  // handleExploreMap is already mid-flight, eliminating a wasted getDoc.
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user && !isBusyRef.current) {
        try {
          const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
          const userDocSnap = await getDoc(firestoreDoc(db, 'users', user.uid));

          // If a pending invite code is waiting, always go through express
          // identity gate first — the join page stores this key when the user
          // clicks "הצטרף" without a complete profile.
          if (typeof window !== 'undefined' && localStorage.getItem('pending_invite_code')) {
            router.push('/onboarding-new/profile?context=express');
            return;
          }

          // If a pending session invite is waiting (stored by /session/[token] on
          // page load), consume it before routing. Without this, users whose doc
          // already exists (MAP_ONLY → /explorer, COMPLETED → /home) get routed
          // away and consumeSessionInvitation() is never called — user_memberships
          // is never written and presence reads stay PERMISSION-DENIED forever.
          if (typeof window !== 'undefined' && localStorage.getItem('pending_session_token')) {
            const sessionRedirect = await consumePendingSessionInvite(
              user.uid,
              user.displayName ?? 'משתמש',
              user.photoURL ?? null,
            );
            if (sessionRedirect) {
              router.push(sessionRedirect);
              return;
            }
          }

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const status = userData?.onboardingStatus;
            const step = userData?.onboardingStep;
            const path = userData?.onboardingPath;

            if (status === 'IN_PROGRESS' && step === 'IDENTITY') {
              router.push('/onboarding-new/profile');
            } else if (status === 'IN_PROGRESS' && step === 'ASSESSMENT') {
              router.push('/onboarding-new/assessment-visual');
            } else if (status === 'IN_PROGRESS' && step === 'VISUAL_ASSESSMENT_COMPLETE') {
              router.push('/onboarding-new/health');
            } else if (status === 'IN_PROGRESS' && step === 'HEALTH') {
              router.push('/onboarding-new/health');
            } else if (status === 'PENDING_LIFESTYLE') {
              router.push('/home');
            } else if (status === 'COMPLETED' || userData?.onboardingComplete) {
              router.push('/home');
            } else if (path === 'MAP_ONLY') {
              router.push('/explorer');
            }
            // No default redirect — user stays on gateway to choose a track
          }
        } catch (e) {
          console.error('[Gateway] Error checking onboarding status:', e);
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ── Path A: EXPLORE MAP — Quick start with GPS city detection ──
  // Delegates to the shared runExploreMapFlow (run-explore-map-flow.ts) —
  // the same flow the landing page's "הרשמה מהירה" quick-register button
  // calls directly. This wrapper only owns this page's own loading UI; the
  // flow's logic (wipe guard, prefs, GPS, referral/invite handling,
  // navigation) lives in exactly one place.
  const handleExploreMap = async () => {
    isBusyRef.current = true;
    setGuestTransitionStatus('loading');
    setShowGuestTransition(true);
    try {
      const proceeded = await runExploreMapFlow(router);
      if (!proceeded) {
        // resolveUser() already logged AUTH_ANONYMOUS (run-explore-map-
        // flow.ts) — this is purely the visible side: swap the overlay to
        // its error state instead of silently hiding it (P0-1, 24.09.2026).
        isBusyRef.current = false;
        setGuestTransitionStatus('error');
      }
    } catch (error) {
      console.error('[Gateway] Explore map error:', error);
      reportSignupFailure('GATEWAY_EXPLORE', extractErrorCode(error));
      isBusyRef.current = false;
      setGuestTransitionStatus('error');
    }
  };

  // Guaranteed way out of the full-screen guest-transition overlay — no
  // dead-end screen. Always lands on the real landing page, not just a
  // silent close, so a user who arrived on /gateway from anywhere still
  // ends up somewhere interactive.
  const handleExitGuestTransition = () => {
    setShowGuestTransition(false);
    setGuestTransitionStatus('loading');
    router.push('/');
  };

  // ── Path B/C: GET PROGRAM — Auth only, Firestore scaffold is handled by Profile page ──
  const handleGetProgram = async (track: 'STRENGTH' | 'RUNNING') => {
    isBusyRef.current = true;
    setLoading(true);
    try {
      const { user } = await resolveUser();
      if (!user) {
        // resolveUser() already logged AUTH_ANONYMOUS — this button has no
        // full-screen overlay to fall back into, so surface it as a toast
        // instead (P0-1, 24.09.2026). The button is already interactive
        // again below, which doubles as "try again."
        showToast('error', 'החיבור לא הצליח. נסו שוב.');
        isBusyRef.current = false;
        setLoading(false);
        return;
      }
      // Persist via onboardingPrefs (localStorage + native @capacitor/preferences)
      // so a hard close mid-onboarding preserves both the uid and the chosen
      // STRENGTH/RUNNING track for the profile page to pick up.
      setOnboardingPref('gateway_uid', user.uid);
      setOnboardingPref('gateway_track', track);

      const referrerUid = getStoredReferrer();
      if (referrerUid && referrerUid !== user.uid) {
        establishSocialConnection(referrerUid, user.uid).catch(() => {});
        processReferral(referrerUid, user.uid, '').catch(() => {});
        clearStoredReferrer();
      }

      const groupInviterUid = localStorage.getItem('group_inviter_uid');
      if (groupInviterUid && groupInviterUid !== user.uid) {
        establishSocialConnection(groupInviterUid, user.uid).catch(() => {});
        localStorage.removeItem('group_inviter_uid');
      }

      // If user came from a join link (/join/[code]), route to express identity
      // gate first so identity is collected before membership is written.
      // The join page sets pending_invite_code; /api/join/confirm handles the
      // actual membership write after profile is complete.
      if (localStorage.getItem('pending_invite_code')) {
        router.push('/onboarding-new/profile?context=express');
        return;
      }

      // If user came from a group invite deep link (non-join-page paths),
      // auto-join then redirect. This path is kept for backwards compat with
      // community page group-invite flows that don't go through /join/[code].
      const groupRedirect = await consumePendingGroupInvite(
        user.uid,
        user.displayName ?? 'משתמש',
      );
      if (groupRedirect) {
        router.push(groupRedirect);
        return;
      }

      // If user came from a session invite deep link, consume token then redirect to map
      const sessionRedirect = await consumePendingSessionInvite(
        user.uid,
        user.displayName ?? 'משתמש',
        user.photoURL,
      );
      if (sessionRedirect) {
        router.push(sessionRedirect);
        return;
      }

      router.push('/onboarding-new/profile');
    } catch (error) {
      console.error('[Gateway] Get program error:', error);
      reportSignupFailure('GATEWAY_GET_PROGRAM', extractErrorCode(error));
      showToast('error', 'החיבור לא הצליח. נסו שוב.');
      isBusyRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC] flex flex-col items-center justify-center px-5 py-12 relative overflow-hidden"
      style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom))' }}
      dir="rtl"
    >
      <AnimatePresence>
        {showGuestTransition && (
          <GuestTransitionOverlay
            status={guestTransitionStatus}
            onRetry={handleExploreMap}
            onExit={handleExitGuestTransition}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center gap-8">

        {/* ── Header: Branded OUT Logo ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo/Kind=logotype.svg"
            alt="OUT"
            className="h-12 object-contain"
          />
          <p
            className="text-slate-400 text-sm font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            מה מתאים לך?
          </p>
        </motion.div>

        {/* ── Selection Cards ── */}
        <div className="w-full flex flex-col gap-5">

          {/* Card A: Discover the Map */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              default: { duration: 0.5, delay: 0.1 },
              scale: { type: 'spring', stiffness: 400, damping: 17 },
            }}
            whileTap={{ scale: isBusy ? 1 : 0.97 }}
            onClick={handleExploreMap}
            disabled={isBusy}
            className="w-full relative overflow-hidden rounded-[24px] shadow-lg h-52 text-right disabled:opacity-60 group"
          >
            {/* Background Image */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url('/images/gateway/card-map.png')`,
              }}
            />

            {/* White gradient overlay — bottom to top */}
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />

            {/* Loading spinner overlay */}
            {showGuestTransition && (
              <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center">
                <Loader2 size={28} className="text-[#5BC2F2] animate-spin" />
              </div>
            )}

            {/* Content: Stacked at bottom-right */}
            <div className="absolute bottom-0 right-0 left-0 p-5 flex flex-col items-start">
              <div className="flex items-center gap-2 mb-1.5">
                <MapPin size={18} className="text-[#5BC2F2]" />
                <h2
                  className="text-xl font-bold text-slate-900"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  גלו את המפה
                </h2>
              </div>
              <p
                className="text-sm text-slate-900 font-medium"
                style={{ fontFamily: 'var(--font-simpler)' }}
                dir="rtl"
              >
                כניסה מהירה ללא הרשמה למציאת מסלולי ריצה, גינות כושר קרובות ומתאמנים סביבכם בלייב.
              </p>
            </div>
          </motion.button>

          {/* Card B: Running Plans — shown only when the flag is on */}
          {flags.enableRunningPrograms && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              whileTap={{ scale: isBusy ? 1 : 0.97 }}
              onClick={() => handleGetProgram('RUNNING')}
              disabled={isBusy}
              className="w-full relative overflow-hidden rounded-[24px] shadow-lg h-44 text-right disabled:opacity-60 group"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{
                  backgroundImage: `url('/images/gateway/card-running.png')`,
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
              {loading && (
                <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center">
                  <Loader2 size={28} className="text-orange-500 animate-spin" />
                </div>
              )}
              <div className="absolute bottom-0 right-0 left-0 p-5 flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1.5">
                  <Footprints size={18} className="text-orange-500" />
                  <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                    תוכנית ריצה
                  </h2>
                </div>
                <p className="text-sm text-slate-500 font-normal" style={{ fontFamily: 'var(--font-simpler)' }}>
                  מ-0 ל-5K או שיפור זמנים
                </p>
              </div>
            </motion.button>
          )}

          {/* Card C: Strength Plans */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              default: { duration: 0.5, delay: flags.enableRunningPrograms ? 0.3 : 0.2 },
              scale: { type: 'spring', stiffness: 400, damping: 17 },
            }}
            whileTap={{ scale: isBusy ? 1 : 0.97 }}
            onClick={() => handleGetProgram('STRENGTH')}
            disabled={isBusy}
            className="w-full relative overflow-hidden rounded-[24px] shadow-lg h-48 text-right disabled:opacity-60 group"
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url('/images/gateway/card-strength.png')`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
            {loading && (
              <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center">
                <Loader2 size={28} className="text-[#5BC2F2] animate-spin" />
              </div>
            )}
            <div className="absolute bottom-0 right-0 left-0 p-5 flex flex-col items-start">
              <div className="flex items-center gap-2 mb-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/programs/muscle.svg"
                  alt=""
                  aria-hidden="true"
                  className="w-[18px] h-[18px] object-contain"
                />
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                  תוכנית כוח
                </h2>
              </div>
              <p className="text-sm text-slate-900 font-medium" style={{ fontFamily: 'var(--font-simpler)' }} dir="rtl">
                אימון מותאם אישית למטרות שלך
              </p>
            </div>
          </motion.button>

        </div>

      </div>
    </div>
  );
}
