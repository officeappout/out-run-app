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
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-slate-900">גבה את האימון שלך</h3>
                    <p className="text-sm text-slate-500">הוסף אימייל כדי לא לאבד את ההתקדמות</p>
                  </div>
                </div>
                <button
                  onClick={onShowInlineAccount}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-all"
                >
                  התחבר עם Google
                </button>
                <button
                  onClick={onDismiss}
                  className="w-full mt-2 py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium"
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
