'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, X } from 'lucide-react';
import { linkWithGoogleAccount } from '@/lib/auth.service';

interface AccountSecureStepProps {
  onNext: (secured: boolean, method?: string, email?: string) => void;
  onSkip: () => void;
}

export default function AccountSecureStep({ onNext, onSkip }: AccountSecureStepProps) {
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Get user name from sessionStorage
  const userName = typeof window !== 'undefined'
    ? sessionStorage.getItem('onboarding_personal_name') || 'OUTer'
    : 'OUTer';

  // Handle Google account linking
  const handleGoogleLink = async () => {
    setLoading('google');
    setError(null);

    try {
      const { user, error: linkError } = await linkWithGoogleAccount();

      if (linkError) {
        if (linkError === 'google_account_exists') {
          setError('חשבון Google זה כבר בשימוש. אנא השתמש בחשבון אחר.');
        } else if (linkError === 'popup_closed') {
          setError('החלון נסגר. אנא נסה שוב.');
        } else if (linkError === 'not_anonymous') {
          // Already authenticated - auto-proceed
          onNext(true, 'google');
          return;
        } else {
          setError('שגיאה בחיבור ל-Google. אנא נסה שוב.');
        }
        setLoading(null);
        return;
      }

      if (user) {
        onNext(true, 'google', user.email || undefined);
      }
    } catch {
      setError('שגיאה בלתי צפויה. אנא נסה שוב.');
      setLoading(null);
    }
  };

  // Handle Apple account linking (placeholder)
  const handleAppleLink = async () => {
    setLoading('apple');
    setError(null);

    // Apple sign-in not yet implemented
    setTimeout(() => {
      setError('התחברות עם Apple תהיה זמינה בקרוב');
      setLoading(null);
    }, 500);
  };

  // Handle skip (show warning modal)
  const handleSkipClick = () => {
    setShowWarningModal(true);
  };

  // Confirm skip without backup
  const handleConfirmSkip = () => {
    setShowWarningModal(false);
    onSkip();
  };

  const isLoading = loading !== null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-8" dir="rtl">
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 bg-[#00F0FF] rounded-full blur-2xl opacity-20 animate-pulse" />
        <div className="relative w-20 h-20 bg-gradient-to-br from-[#00F0FF] to-[#0047FF] rounded-full flex items-center justify-center shadow-lg">
          <Shield className="w-10 h-10 text-white" />
        </div>
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl font-bold text-slate-900 text-center mb-3"
      >
        {userName}, התוכנית שלך מוכנה!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-slate-500 text-center mb-8 max-w-md"
      >
        בוא נבטיח שהיא לא תלך לאיבוד.
      </motion.p>

      {/* Primary CTA: Google Sign-In */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        onClick={handleGoogleLink}
        disabled={isLoading}
        className="w-full max-w-md bg-white flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold shadow-md shadow-slate-300/50 transition-all active:scale-[0.98] hover:bg-slate-50 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
      >
        {loading === 'google' ? (
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        ) : (
          <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
        )}
        <span className="font-bold text-slate-700">
          {loading === 'google' ? 'מתחבר...' : 'המשך עם Google'}
        </span>
      </motion.button>

      {/* Secondary CTA: Apple Sign-In */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onClick={handleAppleLink}
        disabled={isLoading}
        className="w-full max-w-md bg-black flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold shadow-md shadow-slate-300/50 transition-all active:scale-[0.98] hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
      >
        {loading === 'apple' ? (
          <div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
        )}
        <span className="font-bold text-white">
          {loading === 'apple' ? 'מתחבר...' : 'המשך עם Apple'}
        </span>
      </motion.button>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-md bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4 flex items-start gap-2"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={handleSkipClick}
        disabled={isLoading}
        className="text-slate-400 hover:text-slate-500 transition-colors text-sm font-medium py-2 disabled:opacity-50"
      >
        המשך עם פרופיל מקומי (ללא גיבוי)
      </motion.button>

      {/* Warning Modal — Premium Dark Theme */}
      <AnimatePresence>
        {showWarningModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-6"
            onClick={() => setShowWarningModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 pb-8 sm:pb-6 w-full sm:max-w-md border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.6)]"
              dir="rtl"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowWarningModal(false)}
                className="absolute top-4 left-4 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Warning Icon */}
              <div className="flex items-center justify-center mb-5">
                <div className="w-14 h-14 bg-yellow-500/10 rounded-full flex items-center justify-center border border-yellow-500/20">
                  <AlertTriangle className="w-7 h-7 text-yellow-500" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-white text-center mb-4">
                המשך ללא גיבוי?
              </h2>

              {/* Warning Text */}
              <div className="space-y-3 text-gray-400 text-sm mb-6 leading-relaxed">
                <p>
                  <strong className="text-gray-300">הצהרת הבריאות החתומה שלך</strong> והיסטוריית האימונים שלך מאוחסנים כרגע רק במכשיר זה.
                </p>
                <p>
                  אם תמחק את האפליקציה, תחליף מכשיר, או תנקה נתונים — <strong className="text-gray-300">תאבד את כל ההתקדמות שלך</strong>.
                </p>
                <p className="text-[#00F0FF]/80">
                  תוכל לאבטח את החשבון שלך בכל עת מהדאשבורד הראשי.
                </p>
              </div>

              {/* Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowWarningModal(false)}
                  className="w-full bg-gradient-to-r from-[#00F0FF] to-[#0047FF] text-white py-3.5 rounded-xl font-bold hover:shadow-lg transition-all active:scale-[0.98]"
                >
                  חזור לאחור
                </button>
                <button
                  onClick={handleConfirmSkip}
                  className="w-full bg-white/5 hover:bg-white/10 text-gray-400 py-3.5 rounded-xl font-medium transition-all border border-white/10 active:scale-[0.98]"
                >
                  המשך בלי גיבוי
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
