'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import AccountSecureStep from '@/features/user/onboarding/components/steps/AccountSecureStep';

/**
 * EmailCaptureDrawer — bottom-sheet account-secure prompt.
 *
 * Two-screen state machine driven entirely from props (state owned by
 * `useEmailCapture`):
 *   • Intro screen — Shield icon + "Continue with Google" CTA
 *   • Inline AccountSecureStep — full OAuth/email flow
 *
 * Scrim click and skip buttons both fire `onDismiss`.  The inner card stops
 * propagation so taps inside don't dismiss.
 */

export interface EmailCaptureDrawerProps {
  isOpen: boolean;
  /** True once the user has tapped the primary CTA to begin the OAuth flow. */
  showInlineAccount: boolean;
  /** Advance from intro → inline AccountSecureStep. */
  onShowInlineAccount: () => void;
  /** Wired to `AccountSecureStep.onNext`. */
  onCapture: (secured: boolean, method?: string, email?: string) => Promise<void> | void;
  /** Wired to scrim, skip button, and AccountSecureStep.onSkip. */
  onDismiss: () => void;
}

export default function EmailCaptureDrawer({
  isOpen,
  showInlineAccount,
  onShowInlineAccount,
  onCapture,
  onDismiss,
}: EmailCaptureDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            dir="rtl"
          >
            {showInlineAccount ? (
              <div className="p-2">
                <AccountSecureStep onNext={onCapture} onSkip={onDismiss} />
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-slate-900">גבה את האימון שלך</h3>
                    <p className="text-sm text-slate-500">התחבר כדי לא לאבד את ההתקדמות</p>
                  </div>
                </div>

                {/* Google — white card button */}
                <button
                  onClick={onShowInlineAccount}
                  className="w-full flex items-center justify-center gap-3 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all mb-3"
                >
                  <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
                  המשך עם Google
                </button>

                {/* Apple — black card button, equivalent prominence */}
                <button
                  onClick={onShowInlineAccount}
                  className="w-full flex items-center justify-center gap-3 py-3.5 bg-black text-white font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all mb-4"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  המשך עם Apple
                </button>

                <button
                  onClick={onDismiss}
                  className="w-full py-2.5 text-sm text-slate-400 hover:text-slate-600 font-medium transition-colors"
                >
                  אולי מאוחר יותר
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
