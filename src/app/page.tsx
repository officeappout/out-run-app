"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithGooglePopup, onAuthStateChange } from '@/lib/auth.service';
import { db } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════
// CAROUSEL IMAGES — High-quality outdoor fitness / park scenes
// ════════════════════════════════════════════════════════════════════

const CAROUSEL_IMAGES = [
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=1400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1400&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?q=80&w=1400&auto=format&fit=crop',
];

const CYCLE_MS = 4000; // 4 seconds per image

// ════════════════════════════════════════════════════════════════════
// BACKGROUND CAROUSEL — Crossfade animation
// ════════════════════════════════════════════════════════════════════

function BackgroundCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, []);

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
      {/* Dark overlay for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
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
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onGoogleLogin: () => void;
  loading: boolean;
}) {
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
                <svg width="20" height="20" viewBox="0 0 48 48" className="flex-shrink-0">
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.9 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.2-2.7-.4-3.9z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.5 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.9 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.4-5l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.3 0-9.8-3.5-11.4-8.3l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.8 39.2 44 34 44 24c0-1.3-.2-2.7-.4-3.9z"/>
                </svg>
                המשך עם Google
              </button>

              {/* Apple Login (placeholder) */}
              <button
                disabled={true}
                className="w-full flex items-center justify-center gap-3 bg-black text-white font-bold py-4 rounded-2xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                המשך עם Apple
                <span className="text-[10px] font-normal opacity-60 mr-1">(בקרוב)</span>
              </button>

              {loading && (
                <p
                  className="text-[#5BC2F2] animate-pulse text-sm"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  מתחבר...
                </p>
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
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Auto-redirect for already logged-in users ──
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user) {
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
          }
        } catch (e) {
          console.error('[Landing] Error checking auth status:', e);
        }
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

  // ── Google Login inside drawer ──
  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    try {
      const { user } = await signInWithGooglePopup();
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if user exists in Firestore
      const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
      const userDocSnap = await getDoc(firestoreDoc(db, 'users', user.uid));

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const status = userData?.onboardingStatus;

        if (status === 'COMPLETED' || userData?.onboardingComplete) {
          router.push('/home');
        } else {
          router.push('/gateway');
        }
      } else {
        // New Google user — preserve their identity, send to gateway
        router.push('/gateway');
      }
    } catch (error) {
      console.error('[Landing] Google login error:', error);
    }
    setLoading(false);
    setDrawerOpen(false);
  }, [router]);

  return (
    <div className="min-h-[100dvh] relative overflow-hidden flex flex-col">
      {/* ── Animated Background Carousel ── */}
      <BackgroundCarousel />

      {/* ── Content fills screen, pushes bottom section down ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-end">

        {/* ── Bottom UI Section — Glassmorphism ── */}
        <div
          className="px-6 pt-10 pb-8"
          style={{
            paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
          }}
        >
          <div className="max-w-md mx-auto flex flex-col items-center gap-5">

            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/logo/Kind=logotype.svg"
                alt="OUT"
                className="h-10 object-contain brightness-0 invert"
              />
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-white/70 text-sm font-medium text-center"
              style={{ fontFamily: 'var(--font-simpler)' }}
              dir="rtl"
            >
              אימון חכם בחוץ. מתקנים, מסלולים ותוכניות — הכל חינם.
            </motion.p>

            {/* Primary Button: הרשמה מהירה */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleQuickSignup}
              className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] text-base"
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
              className="text-white/80 hover:text-white text-sm font-medium py-2 transition-colors underline underline-offset-2"
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
        loading={loading}
      />
    </div>
  );
}
