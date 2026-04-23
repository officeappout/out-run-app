"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signInGuest, onAuthStateChange } from '@/lib/auth.service';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Loader2, Dumbbell, Footprints } from 'lucide-react';
import { detectCityFromGPS, addAffiliation } from '@/features/user/identity/services/affiliation.service';
import { captureReferralParam, getStoredReferrer, clearStoredReferrer, processReferral, establishSocialConnection } from '@/features/safecity/services/referral.service';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

// ============================================================================
// LOADING OVERLAY — Clean, branded transition
// ============================================================================

const LOADING_STATES = [
  "מאתר מסלולים אופטימליים...",
  "מכייל GPS...",
  "מנתח נתוני שטח...",
  "מכין את הדאשבורד שלך...",
];

function GuestTransitionOverlay() {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % LOADING_STATES.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="relative mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/logo/Kind=logotype.svg"
          alt="OUT"
          className="h-14 object-contain animate-pulse"
        />
      </div>

      <div className="h-8 relative w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={statusIndex}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[#5BC2F2] text-sm font-medium absolute w-full"
            dir="rtl"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {LOADING_STATES[statusIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="w-48 h-1.5 bg-slate-200 rounded-full mt-8 overflow-hidden">
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 3.5, ease: "linear" }}
          className="h-full bg-gradient-to-r from-[#5BC2F2] to-[#0CF2E2] rounded-full"
        />
      </div>
    </motion.div>
  );
}

// ============================================================================
// GATEWAY PAGE — Premium, image-heavy selection cards
// ============================================================================

export default function GatewayPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showGuestTransition, setShowGuestTransition] = useState(false);
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
  const handleExploreMap = async () => {
    isBusyRef.current = true;
    setShowGuestTransition(true);

    try {
      const { user } = await signInGuest();
      if (!user) {
        isBusyRef.current = false;
        setShowGuestTransition(false);
        return;
      }
      try { sessionStorage.setItem('gateway_uid', user.uid); } catch {}

      // Fire-and-forget: write user doc & detect city in parallel, don't block redirect
      setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        onboardingPath: 'MAP_ONLY',
        onboardingStatus: 'MAP_ONLY',
        onboardingProgress: 0,
        core: {
          name: '',
          initialFitnessTier: 1,
          trackingMode: 'wellness',
          mainGoal: 'healthy_lifestyle',
          gender: 'other',
          weight: 0,
          accessLevel: 1,
          affiliations: [],
          unlockedProgramIds: [],
          isVerified: false,
        },
        progression: {
          globalLevel: 1,
          globalXP: 0,
          coins: 0,
          totalCaloriesBurned: 0,
          hasUnlockedAdvancedStats: false,
          domains: {},
          activePrograms: [],
          unlockedBonusExercises: [],
        },
        equipment: { home: [], office: [], outdoor: [] },
        lifestyle: { hasDog: false, commute: { method: 'walk', enableChallenges: false } },
        health: { injuries: [], connectedWatch: 'none' },
        running: {
          isUnlocked: false,
          currentGoal: 'couch_to_5k',
          activeProgram: null,
          paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch((e) => console.error('[Gateway] setDoc error (explore):', e));

      detectCityFromGPS().then(async (affiliation) => {
        if (affiliation) {
          await addAffiliation(affiliation);
        }
      }).catch(() => {});

      // Process referral + auto-connect if user came via an invite link
      const referrerUid = getStoredReferrer();
      if (referrerUid && referrerUid !== user.uid) {
        establishSocialConnection(referrerUid, user.uid).catch(() => {});
        processReferral(referrerUid, user.uid, '').catch(() => {});
        clearStoredReferrer();
      }

      // Auto-connect with group creator if user came via a group invite link
      const groupInviterUid = localStorage.getItem('group_inviter_uid');
      if (groupInviterUid && groupInviterUid !== user.uid) {
        establishSocialConnection(groupInviterUid, user.uid).catch(() => {});
        localStorage.removeItem('group_inviter_uid');
      }

      // If user came from a group invite deep link, redirect to that group
      const pendingGroupId = localStorage.getItem('pending_group_id');
      if (pendingGroupId) {
        localStorage.removeItem('pending_group_id');
        localStorage.removeItem('pending_invite_code');
        setTimeout(() => {
          router.push(`/feed?groupId=${pendingGroupId}`);
        }, 1200);
        return;
      }

      // Brief delay for the transition animation, then redirect
      setTimeout(() => {
        router.push('/explorer');
      }, 1200);
    } catch (error) {
      console.error('[Gateway] Explore map error:', error);
      isBusyRef.current = false;
      setShowGuestTransition(false);
    }
  };

  // ── Path B/C: GET PROGRAM — Auth only, Firestore scaffold is handled by Profile page ──
  const handleGetProgram = async (track: 'STRENGTH' | 'RUNNING') => {
    isBusyRef.current = true;
    setLoading(true);
    try {
      const { user } = await signInGuest();
      if (!user) {
        isBusyRef.current = false;
        setLoading(false);
        return;
      }
      try {
        sessionStorage.setItem('gateway_uid', user.uid);
        sessionStorage.setItem('gateway_track', track);
      } catch {}

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

      // If user came from a group invite deep link, redirect to that group
      const pendingGroupId = localStorage.getItem('pending_group_id');
      if (pendingGroupId) {
        localStorage.removeItem('pending_group_id');
        localStorage.removeItem('pending_invite_code');
        router.push(`/feed?groupId=${pendingGroupId}`);
        return;
      }

      router.push('/onboarding-new/profile');
    } catch (error) {
      console.error('[Gateway] Get program error:', error);
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
        {showGuestTransition && <GuestTransitionOverlay />}
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
            transition={{ duration: 0.5, delay: 0.1 }}
            whileTap={{ scale: isBusy ? 1 : 0.97 }}
            onClick={handleExploreMap}
            disabled={isBusy}
            className="w-full relative overflow-hidden rounded-[24px] shadow-lg h-52 text-right disabled:opacity-60 group"
          >
            {/* Background Image */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url('https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=1200&auto=format&fit=crop')`,
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
                  גלה את המפה
                </h2>
              </div>
              <p
                className="text-sm text-slate-500 font-normal"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                כניסה מהירה ללא הרשמה
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
                  backgroundImage: `url('https://images.unsplash.com/photo-1461897104016-0b3b00b1ea56?q=80&w=1200&auto=format&fit=crop')`,
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
            transition={{ duration: 0.5, delay: flags.enableRunningPrograms ? 0.3 : 0.2 }}
            whileTap={{ scale: isBusy ? 1 : 0.97 }}
            onClick={() => handleGetProgram('STRENGTH')}
            disabled={isBusy}
            className="w-full relative overflow-hidden rounded-[24px] shadow-lg h-44 text-right disabled:opacity-60 group"
          >
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{
                backgroundImage: `url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop')`,
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
                <Dumbbell size={18} className="text-[#5BC2F2]" />
                <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                  תוכנית כוח
                </h2>
              </div>
              <p className="text-sm text-slate-500 font-normal" style={{ fontFamily: 'var(--font-simpler)' }}>
                אימון מותאם אישית למטרות שלך
              </p>
            </div>
          </motion.button>

        </div>

      </div>
    </div>
  );
}
