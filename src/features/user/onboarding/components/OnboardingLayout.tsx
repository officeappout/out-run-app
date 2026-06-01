'use client';

import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Coins, ChevronRight, ChevronLeft, Check,
  Footprints, ArrowDownToLine, MoveUp, BrainCircuit, Activity, Target,
} from 'lucide-react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { DictionaryKey, getTranslation } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface OnboardingLayoutProps {
  /** 'stepper' = deprecated roadmap header; 'progress' = all current screens */
  headerType?: 'stepper' | 'progress';

  // Simple mode (title card, e.g. Setup Wizard intro screens)
  title?: string;
  subtitle?: string;

  // Dynamic mode (progress driven by step count)
  currentStep?: number;
  totalSteps?: number;
  isPart1Complete?: boolean;
  /** Initial progress offset (0-100) for Phase 2 wizard continuation */
  initialProgress?: number;
  progressIcon?: string;
  progressIconSvg?: string;

  // Unified continue footer
  onContinue?: () => void;
  canContinue?: boolean;
  continueLabelKey?: DictionaryKey;
  continueLabel?: string;
  /** Hide the continue footer entirely (step owns its own CTA) */
  hideContinueButton?: boolean;

  // Roadmap phase (stepper, deprecated)
  onboardingPhase?: 1 | 2 | 3;
  phaseProgress?: number;
  activeStepNumber?: number;

  // Instagram-style segmented story bar
  totalSegments?: number;
  currentSegment?: number;
  /** 0-100 fill within the active segment */
  segmentFillPercent?: number;
  /** Label line displayed above the bars */
  phaseLabel?: string;

  children: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  /** Force-hide back button (e.g. first step with no history) */
  hideBack?: boolean;
}

export default function OnboardingLayout({
  headerType = 'progress',
  title,
  subtitle,
  currentStep,
  totalSteps,
  isPart1Complete = false,
  initialProgress = 0,
  progressIcon,
  progressIconSvg,
  onboardingPhase = 1,
  phaseProgress = 0,
  onContinue,
  canContinue = true,
  continueLabelKey,
  continueLabel: overrideContinueLabel,
  hideContinueButton = false,
  activeStepNumber = 1,
  totalSegments,
  currentSegment,
  segmentFillPercent,
  phaseLabel,
  children,
  onBack,
  showBack = false,
  hideBack = false,
}: OnboardingLayoutProps) {
  const router = useRouter();
  const coins = useOnboardingStore((state) => state.coins);
  const [coinBounce, setCoinBounce] = React.useState(false);

  const isDynamicMode = currentStep !== undefined && totalSteps !== undefined;

  const savedLanguage = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || null) as 'he' | 'en' | 'ru' | null
    : null;
  const storeLanguage = useAppStore().language;
  const currentLanguage = savedLanguage || storeLanguage || 'he';
  const direction = currentLanguage === 'he' || currentLanguage === 'ru' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (coins > 0) {
      setCoinBounce(true);
      const timer = setTimeout(() => setCoinBounce(false), 600);
      return () => clearTimeout(timer);
    }
  }, [coins]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getProgressIcon = () => {
    if (progressIconSvg) {
      return (
        <div
          className="w-5 h-5"
          dangerouslySetInnerHTML={{ __html: progressIconSvg }}
          style={{ color: '#5BC2F2' }}
        />
      );
    }
    const iconMap: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
      running: Footprints,
      squat: ArrowDownToLine,
      pullup: MoveUp,
      brain: BrainCircuit,
      target: Target,
      activity: Activity,
    };
    const IconComponent = progressIcon ? iconMap[progressIcon] || Footprints : Footprints;
    return <IconComponent size={20} strokeWidth={1.5} className="text-[#5BC2F2]" />;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const progressPercentage = useMemo(() => {
    if (initialProgress > 0 && currentStep !== undefined && totalSteps !== undefined && totalSteps > 0) {
      const remainingRange = 100 - initialProgress;
      const phaseStepProgress = ((currentStep - 1) / totalSteps) * 100;
      const mappedProgress = initialProgress + (phaseStepProgress / 100) * remainingRange;
      return Math.min(Math.max(mappedProgress, initialProgress), 100);
    }
    if (currentStep !== undefined && totalSteps !== undefined && totalSteps > 0) {
      if (isPart1Complete) return 100;
      if (currentStep <= 2) return (currentStep / totalSteps) * 100;
      let phaseStepProgress = 0;
      if (currentStep === 0) phaseStepProgress = 0;
      else if (currentStep === 1) phaseStepProgress = 20;
      else if (currentStep === 2) phaseStepProgress = 45;
      else if (currentStep === 3) phaseStepProgress = 70;
      else if (currentStep >= 4) {
        const remainingSteps = Math.max(1, totalSteps - 3);
        const completedSteps = Math.min(currentStep - 3, remainingSteps);
        const stepProgress = (completedSteps / remainingSteps) * 30;
        phaseStepProgress = Math.min(70 + stepProgress, 95);
      }
      return phaseStepProgress;
    }
    return 0;
  }, [currentStep, totalSteps, isPart1Complete, initialProgress]);

  const majorRoadmapStep = useOnboardingStore((state) => state.majorRoadmapStep);
  const unifiedProgress = useMemo(() => {
    const phaseWeight = 100 / 3;
    const completedPhases = majorRoadmapStep;
    const withinPhase = Math.min(100, Math.max(0, phaseProgress));
    return Math.min(100, completedPhases * phaseWeight + (withinPhase / 100) * phaseWeight);
  }, [majorRoadmapStep, phaseProgress]);

  const useSegmentedStoryBar = totalSegments !== undefined && currentSegment !== undefined;

  // Back button is always shown in segmented mode (falls back to router.back).
  // Other modes require explicit showBack=true or an onBack handler.
  const showsBack = !hideBack && (showBack || !!onBack || useSegmentedStoryBar);
  const handleBackClick = onBack ?? (() => router.back());

  // ── Progress track(s) — no outer padding, callers own the container ──────
  const renderBarsOnly = () => {
    if (headerType !== 'progress') return null;

    if (useSegmentedStoryBar) {
      return (
        <div className="flex gap-1 items-center w-full">
          {Array.from({ length: totalSegments! }, (_, i) => {
            const segIndex = i + 1;
            const isCompleted = segIndex < currentSegment!;
            const isActive = segIndex === currentSegment;
            const fillPct =
              isActive && segmentFillPercent !== undefined
                ? Math.min(100, Math.max(0, segmentFillPercent))
                : isActive ? 100 : 0;
            const barColor = isCompleted ? '#10b981' : '#5BC2F2';
            return (
              <div key={i} className="flex-1 relative">
                {/* Track — overflow-hidden clips the fill bar, not the checkmark */}
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: barColor }}
                    initial={false}
                    animate={{ width: isCompleted ? '100%' : `${fillPct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
                {/* Checkmark bubble — absolutely positioned above the track, outside overflow-hidden */}
                {isCompleted && (
                  <motion.div
                    className="absolute left-1/2 -top-[7px]"
                    style={{ marginLeft: '-10px' }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                  >
                    <div className="w-5 h-5 rounded-full bg-[#10b981] flex items-center justify-center shadow-sm">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#5BC2F2] transition-all duration-500 ease-out"
          style={{ width: `${Math.max(unifiedProgress, 3)}%` }}
        />
      </div>
    );
  };

  // ── Unified top navigation header ────────────────────────────────────────
  //
  // RULE 1 — all three render paths use h-full overflow-hidden on the root so
  //           the wrapper inherits the body height (which Capacitor keyboard.resize:'body'
  //           shrinks when the native keyboard opens). This header is flex-shrink-0
  //           in the column (not fixed-positioned).
  //
  // RULE 2 — Single row: [back-btn (w-9)] [bars+phaseLabel (flex-1)] [coins (w-9)]
  //           Both end slots are fixed-width so the bars stay visually centered
  //           regardless of whether either side widget is visible.
  //           safe-area-inset-top sits on the header itself so content never clips
  //           into the notch / Dynamic Island.
  const renderUnifiedHeader = (animated = false) => {
    const headerBody = (
      <div className="flex items-center gap-2 px-3 pt-2 pb-4">
        {/* Leading slot — back button (right side in RTL) */}
        {showsBack ? (
          <motion.button
            onClick={handleBackClick}
            whileTap={{ scale: 0.88 }}
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-slate-100/80 active:bg-slate-200 transition-colors touch-manipulation"
            aria-label={direction === 'rtl' ? 'חזרה' : 'Back'}
          >
            <ChevronRight size={20} className="text-slate-600" />
          </motion.button>
        ) : (
          // Spacer preserves bar alignment when no back button is present
          <div className="flex-shrink-0 w-9" aria-hidden />
        )}

        {/* Center — progress bars stretch to fill all remaining space.
            flex-col + justify-center ensures children always stretch to full width.
            Phase label text removed — visual bars alone provide orientation. */}
        <div className="flex-1 min-w-0 min-h-[36px] flex flex-col justify-center">
          {renderBarsOnly()}
        </div>

        {/* Trailing slot — coin counter when enabled; NO spacer otherwise so
            bars extend all the way to the opposite edge for a full-width feel. */}
        {IS_COIN_SYSTEM_ENABLED && (
          <motion.div
            animate={coinBounce ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex-shrink-0 w-9 flex items-center justify-end gap-0.5"
          >
            <Coins size={14} className="text-yellow-500" />
            <span className="text-yellow-500 font-bold text-[12px] tabular-nums">{coins}</span>
          </motion.div>
        )}
      </div>
    );

    const sharedClass = 'flex-shrink-0 z-50 bg-white/85 backdrop-blur-xl';
    const sharedStyle = { paddingTop: 'env(safe-area-inset-top, 0px)' };

    if (animated) {
      return (
        <motion.header
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className={sharedClass}
          style={sharedStyle}
        >
          {headerBody}
        </motion.header>
      );
    }
    return (
      <header className={sharedClass} style={sharedStyle}>
        {headerBody}
      </header>
    );
  };

  // ── Unified "Continue / המשך" floating footer ────────────────────────────
  //
  // RULE 3 — Renders as flex-shrink-0 at the bottom of the flex column so it
  //           always floats above content. Includes safe-area-inset-bottom so
  //           the button never hides behind the iOS home indicator.
  //           Only mounts when onContinue is provided and hideContinueButton is false.
  const renderContinueFooter = () => {
    if (hideContinueButton || !onContinue) return null;

    let label: string;
    if (overrideContinueLabel) {
      label = overrideContinueLabel;
    } else if (continueLabelKey) {
      try {
        label = getTranslation(continueLabelKey, currentLanguage);
      } catch {
        label = currentLanguage === 'he' ? 'המשך' : currentLanguage === 'ru' ? 'Далее' : 'Continue';
      }
    } else {
      label = currentLanguage === 'he' ? 'המשך' : currentLanguage === 'ru' ? 'Далее' : 'Continue';
    }

    return (
      <div
        className="flex-shrink-0 px-5 pt-2 bg-white/90 backdrop-blur-sm"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
      >
        <motion.button
          onClick={onContinue}
          disabled={!canContinue}
          whileTap={{ scale: canContinue ? 0.97 : 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`w-full py-[15px] rounded-full font-black text-[17px] flex items-center justify-center gap-2 transition-all duration-200 ${
            canContinue
              ? 'text-white active:scale-95'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
          style={canContinue ? {
            background: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
            boxShadow: '0 8px 24px rgba(0,186,247,0.35)',
            fontFamily: 'var(--font-simpler)',
          } : { fontFamily: 'var(--font-simpler)' }}
          aria-disabled={!canContinue}
        >
          <span>{label}</span>
          <ChevronLeft size={20} />
        </motion.button>
      </div>
    );
  };

  // ── Stepper header (deprecated — no active render path routes here) ───────
  const renderStepperHeader = () => {
    const steps = [
      { label: currentLanguage === 'he' ? 'מוכן' : currentLanguage === 'ru' ? 'Готово' : 'Ready', stepNumber: 3 },
      { label: currentLanguage === 'he' ? 'התאמה' : currentLanguage === 'ru' ? 'Адаптация' : 'Matching', stepNumber: 2 },
      { label: currentLanguage === 'he' ? 'אבחון' : currentLanguage === 'ru' ? 'Оценка' : 'Assessment', stepNumber: 1 },
    ];
    return (
      <div className="w-full px-5 py-3 z-10 bg-white">
        <div className={`flex gap-1.5 mb-2 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {steps.map((item, index) => {
            const isActive = item.stepNumber === activeStepNumber;
            const iconColor = isActive ? '#5BC2F2' : '#CBD5E1';
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300"
                  style={{ backgroundColor: iconColor + '20' }}
                >
                  {isActive ? (
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: iconColor }} />
                  ) : (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: iconColor }} />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium mt-1 font-simpler transition-colors duration-300"
                  style={{ color: isActive ? '#5BC2F2' : '#CBD5E1' }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className={`flex gap-1.5 relative ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {steps.map((segment, index) => {
            const isActive = segment.stepNumber === activeStepNumber;
            if (isActive) {
              return (
                <div key={index} className="flex-1 relative" dir={direction}>
                  <div className={`h-1.5 rounded-full bg-[#5BC2F2]/20 relative ${direction === 'rtl' ? 'rtl' : ''}`}>
                    <motion.div
                      className={`h-full rounded-full ${direction === 'rtl' ? 'ml-auto' : ''}`}
                      style={{ width: '20%', backgroundColor: '#5BC2F2' }}
                      initial={{ width: 0 }}
                      animate={{ width: '20%' }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.5 }}
                    />
                  </div>
                </div>
              );
            }
            return <div key={index} className="h-1.5 flex-1 rounded-full bg-[#CBD5E1]/30" />;
          })}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER PATHS
  //
  // Every path enforces RULE 1: h-full + overflow-hidden on the root so the
  // wrapper inherits the body height. When Capacitor keyboard.resize:'body'
  // shrinks the body on keyboard open, this flex column shrinks with it,
  // pushing the pinned footer CTA into the visible frame automatically.
  // Only designated overflow-y-auto regions scroll internally.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── SIMPLE MODE: title/subtitle card (Setup Wizard intro screens) ─────────
  if (headerType === 'progress' && !isDynamicMode && (title || subtitle)) {
    return (
      <div
        dir={direction}
        className="h-full bg-gradient-to-b from-[#D8F3FF] via-[#F8FDFF] to-white flex flex-col overflow-hidden"
      >
        {renderUnifiedHeader(true)}

        <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-4 md:p-6">
            {title && (
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl md:text-3xl font-black font-simpler text-slate-900 text-start mb-2"
              >
                {title}
              </motion.h1>
            )}
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base md:text-lg text-slate-600 text-start mb-6 font-simpler font-medium"
              >
                {subtitle}
              </motion.p>
            )}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              {children}
            </motion.div>
          </div>
        </main>

        {renderContinueFooter()}
      </div>
    );
  }

  // ── SEGMENTED STORY-BAR MODE: running schedule / plan-length / health ─────
  // The header is in-flow (flex-shrink-0) — replaces the old fixed+paddingTop hack.
  // The content wrapper is overflow-y-auto so that StickyActionButton (sticky bottom-0)
  // inside child steps has a proper scroll container to stick within.
  // The h-full overflow-hidden root inherits body height (shrinks with keyboard).
  if (useSegmentedStoryBar && !isDynamicMode) {
    return (
      <div
        dir={direction}
        className="h-full flex flex-col overflow-hidden"
      >
        {renderUnifiedHeader(false)}

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {children}
        </div>

        {renderContinueFooter()}
      </div>
    );
  }

  // ── DYNAMIC / PROGRESS MODE: Dynamic Questionnaire, OnboardingWizard steps ─
  return (
      <div
      dir={direction}
      className="h-full bg-gradient-to-b from-[#D8F3FF] via-[#F8FDFF] to-white flex flex-col overflow-hidden"
    >
      {renderUnifiedHeader(true)}

      <main
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 max-w-md mx-auto w-full"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {children}
      </main>

      {renderContinueFooter()}
    </div>
  );
}
