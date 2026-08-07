'use client';

/**
 * JITSetupModal — Centered Just-In-Time setup prompt
 *
 * Design language matches the StopWorkoutModal:
 *   - Centered white card with blur backdrop
 *   - Icon circle header
 *   - High-contrast text
 *   - Brand Cyan primary button
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Heart } from 'lucide-react';

function RingsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M5 2L5 9" stroke="currentColor" strokeWidth="1.76471" strokeLinejoin="round" />
      <circle cx="5.20542" cy="12.2645" r="3.08824" stroke="currentColor" strokeWidth="1.76471" strokeLinejoin="round" />
      <path d="M15 2L15 9" stroke="currentColor" strokeWidth="1.76471" strokeLinejoin="round" />
      <circle cx="14.912" cy="12.2645" r="3.08824" stroke="currentColor" strokeWidth="1.76471" strokeLinejoin="round" />
    </svg>
  );
}
import type { MissingRequirement } from '../hooks/useRequiredSetup';
import HealthDeclarationStep from './HealthDeclarationStep';

interface JITSetupModalProps {
  isOpen: boolean;
  requirements: MissingRequirement[];
  onComplete: (() => void) | null;
  onDismiss: () => void;
  onCancel: () => void;
}

const REQUIREMENT_ICONS: Record<string, React.ReactNode> = {
  health: <Heart className="w-6 h-6 text-red-500" />,
  account: <Shield className="w-6 h-6 text-blue-500" />,
  equipment: <RingsIcon className="w-6 h-6 text-amber-500" />,
};

const REQUIREMENT_DESCRIPTIONS: Record<string, string> = {
  health: 'יש להשלים הצהרת בריאות לפני תחילת האימון הראשון',
  account: 'גבה את החשבון שלך כדי לא לאבד את ההתקדמות',
  equipment: 'ספר לנו על הציוד שלך כדי שנתאים אימון מדויק',
};

const REQUIREMENT_RING_COLORS: Record<string, string> = {
  health: 'border-red-400',
  account: 'border-blue-400',
  equipment: 'border-amber-400',
};

export function JITSetupModal({
  isOpen,
  requirements,
  onComplete,
  onDismiss,
  onCancel,
}: JITSetupModalProps) {
  const router = useRouter();
  const [showInlineStep, setShowInlineStep] = useState(false);

  if (!isOpen || requirements.length === 0) return null;

  const hasHardBlock = requirements.some((r) => r.isHardBlock);
  const firstHardBlock = requirements.find((r) => r.isHardBlock);
  const primaryReq = firstHardBlock || requirements[0];

  const handleCompleteNow = () => {
    if (primaryReq.step === 'HEALTH_DECLARATION') {
      setShowInlineStep(true);
      return;
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('jit_return_to', 'workout');
    }

    router.push(`/onboarding-new/setup?step=${primaryReq.step}&jit=true`);
  };

  // ── Inline Health Declaration (full-screen overlay) ──
  if (showInlineStep) {
    return (
      // z-[60] was a leaked-through-background bug (10.08.2026 diagnosis): that value
      // is already budgeted for WorkoutDrawer/NavigationHub/RoutePreviewCard
      // (.cursorrules), and sits BELOW search bars (z-[70]), the referral toast
      // (z-[95]), and every full-screen overlay incl. HybridSlotCarousel/
      // HybridOverviewScreen (z-[100]) — any of those still mounted painted on TOP
      // of this "full-screen" white div and stayed fully clickable. z-[140] clears
      // everything in the budget below z-[200] (post-workout summary, unrelated).
      // No visual separation at the top on iOS/Android (bug ג, 10.08.2026 diagnosis):
      // unlike this component's standalone route (/onboarding-new/health, wrapped in
      // OnboardingLayout, whose own header sets paddingTop: env(safe-area-inset-top)
      // — OnboardingLayout.tsx), this bare JIT-inline wrapper supplied none. Content
      // started flush against the physical screen edge, rendering under the status
      // bar/notch. HealthDeclarationStep itself only has an 8px `pt-2` above its
      // header — it relies on ITS PARENT for safe-area padding, same as it does there.
      <div className="fixed inset-0 z-[140] bg-white overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <HealthDeclarationStep
          title="הצהרת בריאות"
          description="חשוב לנו לשמור על הבריאות שלך. אנא אשר/י את ההצהרה הבאה כדי להמשיך."
          onContinue={(accepted: boolean) => {
            if (accepted) {
              setShowInlineStep(false);
              onComplete?.();
            }
          }}
        />
      </div>
    );
  }

  // ── Centered Modal (StopWorkoutModal design language) ──
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // z-[90] leak (10.08.2026 diagnosis, bug ב): lower than the referral toast
        // (z-[95]) and every full-screen overlay incl. HybridSlotCarousel/
        // HybridOverviewScreen (z-[100]) — same collision class as the inline
        // questionnaire's z-[60]→z-[140] fix above, just this component's OTHER
        // (confirmation-card) state. z-[141] clears everything below z-[200].
        className="fixed inset-0 z-[141] flex items-center justify-center p-6"
        style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={hasHardBlock ? undefined : onCancel}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon ring — mirrors StopWorkoutModal */}
          <div className={`w-14 h-14 mx-auto mb-5 rounded-full border-2 ${REQUIREMENT_RING_COLORS[primaryReq.id] || 'border-cyan-400'} flex items-center justify-center`}>
            {REQUIREMENT_ICONS[primaryReq.id] || <Shield className="w-6 h-6 text-cyan-400" />}
          </div>

          <h2
            className="text-xl font-black text-slate-900 dark:text-white mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {hasHardBlock ? 'עוד צעד אחד קטן!' : 'רגע לפני שמתחילים...'}
          </h2>
          <p
            className="text-sm text-slate-500 dark:text-slate-400 mb-3"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {REQUIREMENT_DESCRIPTIONS[primaryReq.id] || 'צריך להשלים כמה דברים לפני האימון'}
          </p>

          {/* Secondary requirements list (if >1) */}
          {requirements.length > 1 && (
            <div className="space-y-2 mb-5">
              {requirements.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-right"
                >
                  <div className="flex-shrink-0">
                    {REQUIREMENT_ICONS[req.id] || <Shield className="w-5 h-5 text-slate-400" />}
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {req.label}
                    {req.isHardBlock && (
                      <span className="mr-1.5 text-[11px] text-red-500 font-bold">(חובה)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Primary CTA — Brand Cyan gradient pill */}
          <button
            onClick={handleCompleteNow}
            className="w-full h-14 rounded-full font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] border border-white/20 active:scale-[0.98] transition-transform"
            style={{
              fontFamily: 'var(--font-simpler)',
              boxShadow: '0 4px 18px rgba(0, 185, 242, 0.38)',
            }}
          >
            {hasHardBlock ? 'השלם עכשיו' : 'בואו נעדכן ציוד'}
          </button>

          {/* Secondary dismiss — plain text link */}
          {!hasHardBlock && (
            <button
              onClick={onDismiss}
              className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              דלג בינתיים
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
