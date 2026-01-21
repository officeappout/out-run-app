"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInGuest, signInWithGoogle } from '@/lib/auth.service';
import { useUserStore } from '@/features/user/store/useUserStore';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { onAuthStateChange } from '@/lib/auth.service';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin } from 'lucide-react';

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
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center"
    >
      {/* Pulsing Icon */}
      <div className="relative mb-12">
        <div className="absolute inset-0 bg-[#00F0FF] rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="relative w-24 h-24 bg-[#111] rounded-full border border-[#00F0FF]/30 flex items-center justify-center shadow-[0_0_30px_rgba(0,240,255,0.15)]">
          <MapPin className="w-10 h-10 text-[#00F0FF] animate-bounce" />
        </div>
      </div>

      {/* Cycling Status Text */}
      <div className="h-8 relative w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={statusIndex}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[#00F0FF] font-mono text-sm absolute w-full"
            dir="rtl"
          >
            {LOADING_STATES[statusIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress Bar */}
      <div className="w-48 h-1 bg-gray-900 rounded-full mt-8 overflow-hidden">
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 3.5, ease: "linear" }}
          className="h-full bg-gradient-to-r from-[#00F0FF] to-[#0047FF]"
        />
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { initializeProfile } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [showGuestTransition, setShowGuestTransition] = useState(false);

  // Auto-redirect if already logged in
  React.useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user) {
        // Only redirect if NOT showing the transition
        if (!showGuestTransition) {
          // Smart Redirect Check
          try {
            const userDoc = await import('firebase/firestore').then(mod => mod.getDoc(mod.doc(db, 'users', user.uid)));
            if (userDoc.exists() && userDoc.data()?.onboardingComplete) {
              router.push('/home');
            } else {
              router.push('/onboarding');
            }
          } catch (e) {
            console.error("Error checking onboarding status:", e);
            router.push('/home'); // Fallback
          }
        }
      }
    });
    return () => unsubscribe();
  }, [router, showGuestTransition]);

  // Path A: Continue with Google
  const handleGoogleStart = async () => {
    setLoading(true);
    const { user, error } = await signInWithGoogle();
    if (user) {
      router.push('/home');
    }
    setLoading(false);
  };

  // Path B: Onboarding
  const handleOnboardingStart = () => {
    router.push('/onboarding');
  };

  // Path C: Try as Guest
  const handleGuestStart = async () => {
    // 1. Show high-end transition immediately
    setShowGuestTransition(true);

    // 2. Perform background login
    const { user, error } = await signInGuest();

    if (error) {
      console.error("Guest Login Failed:", error);
      alert(`Guest login failed: ${error}`);
      setShowGuestTransition(false); // Revert UI
      return;
    }

    if (user) {
      // Initialize local Guest Profile
      const guestProfile: any = {
        id: user.uid,
        core: {
          name: 'Guest Runner',
          initialFitnessTier: 1,
          trackingMode: 'wellness',
          mainGoal: 'healthy_lifestyle',
          gender: 'other',
          weight: 70,
        },
        progression: {
          globalLevel: 1,
          globalXP: 0,
          coins: 0,
          totalCaloriesBurned: 0,
          hasUnlockedAdvancedStats: false,
        },
        equipment: { home: {}, office: {}, studies: {}, outdoor: {} },
        lifestyle: { hasDog: false, commute: { method: 'walk', enableChallenges: false } },
        health: { injuries: [], connectedWatch: 'none' },
        running: {
          weeklyMileageGoal: 0,
          runFrequency: 1,
          activeProgram: null,
          paceProfile: { easyPace: 0, thresholdPace: 0, vo2MaxPace: 0, qualityWorkoutsHistory: [] }
        }
      };

      initializeProfile(guestProfile);

      // Async Sync - don't await blocking the UI timer
      setDoc(doc(db, 'users', user.uid), {
        ...guestProfile,
        isGuest: true,
        createdAt: serverTimestamp(),
      }).catch(e => console.error("Firestore sync error:", e));

      // 3. Wait for the transition "experience" (min 2.5s)
      setTimeout(() => {
        router.push('/map'); // Redirect to Map for guests as requested
      }, 2500);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <AnimatePresence>
        {showGuestTransition && <GuestTransitionOverlay />}
      </AnimatePresence>

      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1552674605-46d50400f0bc?q=80&w=2940&auto=format&fit=crop')] bg-cover bg-center" />
      <div className="absolute inset-0 z-1 bg-gradient-to-t from-black via-black/80 to-transparent" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] to-[#0047FF]">
            OUT
          </h1>
          <p className="text-gray-400 font-medium text-sm tracking-widest uppercase">
            Run Your World
          </p>
        </div>

        {/* Buttons */}
        <div className="w-full space-y-4 pt-10">
          <button
            onClick={handleGoogleStart}
            disabled={loading}
            className="w-full bg-white text-black py-4 rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
            Continue with Google
          </button>

          <button
            onClick={handleOnboardingStart}
            className="w-full bg-[#333] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-95 transition-all border border-[#444]"
          >
            Start Onboarding
          </button>

          <button
            onClick={handleGuestStart}
            className="w-full py-4 text-gray-500 font-medium text-sm hover:text-white transition-colors"
          >
            Try as Guest
          </button>
        </div>

        {loading && <p className="text-[#00F0FF] animate-pulse text-sm">Loading...</p>}
      </div>
    </div>
  );
}