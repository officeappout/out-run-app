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

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Heart } from 'lucide-react';
import { useOnboardingV2 } from '../hooks/useOnboardingV2';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

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
import IdentityProfileScreen from './IdentityProfileScreen';
import { hasAcceptedHealthDeclaration } from '@/lib/health-declaration';

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

// v2: one brand tint for every requirement icon (no red/blue/amber rings).
const REQUIREMENT_ICONS_V2: Record<string, React.ReactNode> = {
  health: <Heart className="h-[22px] w-[22px]" strokeWidth={2.25} />,
  account: <Shield className="h-[22px] w-[22px]" strokeWidth={2.25} />,
  equipment: <RingsIcon className="h-[22px] w-[22px]" />,
};

// v2: gendered forms of the legacy masculine copy.
function requirementDescriptionV2(id: string, isFemale: boolean): string | undefined {
  if (id === 'account') return isFemale ? 'גבי את החשבון שלך כדי לא לאבד את ההתקדמות' : REQUIREMENT_DESCRIPTIONS.account;
  if (id === 'equipment') return isFemale ? 'ספרי לנו על הציוד שלך כדי שנתאים אימון מדויק' : REQUIREMENT_DESCRIPTIONS.equipment;
  return REQUIREMENT_DESCRIPTIONS[id];
}

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
  // enable_jit_identity_v1: the identity step (only ever present in
  // `requirements` with the flag on) was saved during this opening.
  const [identitySaved, setIdentitySaved] = useState(false);
  const v2 = useOnboardingV2();
  const isFemale = useUserStore((st) => st.profile?.core?.gender === 'female');

  useEffect(() => {
    if (!isOpen) setIdentitySaved(false);
  }, [isOpen]);

  if (!isOpen || requirements.length === 0) return null;

  const hasHardBlock = requirements.some((r) => r.isHardBlock);
  const firstHardBlock = requirements.find((r) => r.isHardBlock);
  const primaryReq = firstHardBlock || requirements[0];

  // ── Inline identity screen (enable_jit_identity_v1) ──
  // The existing /onboarding-new/profile screen, rendered here so the gate's
  // onComplete (the original workout start) is kept. Opens straight away — its
  // own Kelly line says what comes next; back closes the gate (onCancel).
  // After saving: the health declaration (signed with the saved name), or the
  // workout if the declaration is somehow already accepted.
  if (primaryReq.step === 'IDENTITY' && !identitySaved && !showInlineStep) {
    return (
      // Same layer as the inline health declaration below (z-[140]). The screen's
      // header pads the top inset itself; the bottom inset is padded here (the
      // route version gets it from <main>).
      <div
        className="fixed inset-0 z-[140] flex flex-col bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <IdentityProfileScreen
          context="workout"
          onWorkoutBack={onCancel}
          onWorkoutIdentitySaved={() => {
            setIdentitySaved(true);
            const live = useUserStore.getState().profile;
            const needsHealth = requirements.some((r) => r.id === 'health') && !hasAcceptedHealthDeclaration(live);
            if (needsHealth) setShowInlineStep(true);
            else onComplete?.();
          }}
        />
      </div>
    );
  }

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

  // ── v2 (enable_home_v2): bottom sheet, same handlers / dismiss rules ──
  // Fixed overlay covers <main>, so the sheet pads the bottom inset itself (once).
  if (v2) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[141] flex items-end justify-center"
          style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(9,30,50,0.42)' }}
          onClick={hasHardBlock ? undefined : onCancel}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="w-full max-w-md rounded-t-[28px] bg-white px-5 pt-2.5 text-right text-v2-ink shadow-v2-sheet"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
            dir="rtl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-v2-pill-border" aria-hidden />

            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
                {REQUIREMENT_ICONS_V2[primaryReq.id] || <Shield className="h-[22px] w-[22px]" strokeWidth={2.25} />}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="text-[22px] font-black leading-tight !tracking-[-0.02em]">
                  {hasHardBlock ? 'עוד צעד אחד קטן!' : 'רגע לפני שמתחילים...'}
                </h2>
                <p className="mt-1 text-[14.5px] font-medium leading-relaxed text-v2-ink-2">
                  {requirementDescriptionV2(primaryReq.id, isFemale) || 'צריך להשלים כמה דברים לפני האימון'}
                </p>
              </div>
            </div>

            {requirements.length > 1 && (
              <div className="mt-4 space-y-2">
                {requirements.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3 shadow-v2-ring"
                  >
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
                      {REQUIREMENT_ICONS_V2[req.id] || <Shield strokeWidth={2.25} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-v2-ink">
                      {req.label}
                    </span>
                    {req.isHardBlock && (
                      <span className="flex-shrink-0 whitespace-nowrap text-[12px] font-bold text-[#b4232a]">(חובה)</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleCompleteNow}
              className="mt-5 flex h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <span className="truncate">
                {hasHardBlock ? (isFemale ? 'השלימי עכשיו' : 'השלם עכשיו') : 'בואו נעדכן ציוד'}
              </span>
            </button>

            {!hasHardBlock && (
              <button
                type="button"
                onClick={onDismiss}
                className="mx-auto mt-1 flex h-11 items-center justify-center whitespace-nowrap px-4 text-[14.5px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
              >
                דלג בינתיים
              </button>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
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
            className="w-full h-14 rounded-full font-bold text-on-brand text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] border border-white/20 active:scale-[0.98] transition-transform"
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
