'use client';

import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, ArrowRight, Footprints, ArrowDownToLine, MoveUp, BrainCircuit, Activity, Target } from 'lucide-react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { DictionaryKey, getTranslation } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface OnboardingLayoutProps {
  // Header type selection
  headerType?: 'stepper' | 'progress'; // 'stepper' for roadmap, 'progress' for questionnaire/wizard
  
  // Simple mode (for Setup Wizard)
  title?: string;
  subtitle?: string;
  
  // Dynamic mode (for Dynamic Questionnaire)
  currentStep?: number;
  totalSteps?: number;
  isPart1Complete?: boolean;
  initialProgress?: number; // Initial progress percentage offset (0-100) for Phase 2 continuation
  progressIcon?: string;
  progressIconSvg?: string;
  onContinue?: () => void;
  canContinue?: boolean;
  continueLabelKey?: DictionaryKey;
  continueLabel?: string;
  hideContinueButton?: boolean;
  
  // 3-Step Roadmap Progress (1=אבחון, 2=התאמה, 3=שריון)
  onboardingPhase?: 1 | 2 | 3;
  phaseProgress?: number; // 0-100 progress within current phase
  
  // Stepper mode props (for roadmap)
  activeStepNumber?: number; // Which step is active (1, 2, or 3)
  
  // Common props
  children: React.ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}

export default function OnboardingLayout({
  headerType = 'progress', // Default to progress mode
  title,
  subtitle,
  currentStep,
  totalSteps,
  isPart1Complete = false,
  initialProgress = 0, // Default to 0% (no offset)
  progressIcon,
  progressIconSvg,
  onboardingPhase = 1, // Default to phase 1
  phaseProgress = 0, // Progress within current phase
  onContinue,
  canContinue = true,
  continueLabelKey,
  continueLabel: overrideContinueLabel,
  hideContinueButton = false,
  activeStepNumber = 1, // For stepper mode
  children,
  onBack,
  showBack = false,
}: OnboardingLayoutProps) {
  const coins = useOnboardingStore((state) => state.coins);
  const [coinBounce, setCoinBounce] = React.useState(false);
  
  // Determine if we're in dynamic mode (has progress bar props)
  const isDynamicMode = currentStep !== undefined && totalSteps !== undefined;
  
  // Get language for translations
  const savedLanguage = typeof window !== 'undefined' 
    ? (sessionStorage.getItem('onboarding_language') || null) as 'he' | 'en' | 'ru' | null
    : null;
  const storeLanguage = useAppStore().language;
  const currentLanguage = savedLanguage || storeLanguage || 'he';
  
  const direction = currentLanguage === 'he' || currentLanguage === 'ru' ? 'rtl' : 'ltr';

  // Trigger bounce animation when coins change
  useEffect(() => {
    if (coins > 0) {
      setCoinBounce(true);
      const timer = setTimeout(() => setCoinBounce(false), 600);
      return () => clearTimeout(timer);
    }
  }, [coins]);

  // Get progress icon component
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
    
    const iconMap: Record<string, React.ComponentType<any>> = {
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

  // Calculate progress percentage for segmented bar
  const progressPercentage = useMemo(() => {
    // If we have initialProgress (Phase 2 wizard continuation), use linear progression
    if (initialProgress > 0 && currentStep !== undefined && totalSteps !== undefined && totalSteps > 0) {
      // Phase 2: Linear progression from initialProgress (50%) to 100%
      const remainingRange = 100 - initialProgress;
      // currentStep is 1-indexed, so we map it to 0-100% of the remaining range
      const phaseProgress = ((currentStep - 1) / totalSteps) * 100;
      const mappedProgress = initialProgress + (phaseProgress / 100) * remainingRange;
      return Math.min(Math.max(mappedProgress, initialProgress), 100);
    }
    
    // If we have currentStep and totalSteps, calculate progress linearly
    if (currentStep !== undefined && totalSteps !== undefined && totalSteps > 0) {
      // Linear progression: (currentStep / totalSteps) * 100
      // But use progressive calculation for questionnaire (Phase 1)
      if (isPart1Complete) {
        return 100;
      }
      
      // For early steps (roadmap/intro), use simple linear progression
      if (currentStep <= 2) {
        return (currentStep / totalSteps) * 100;
      }
      
      // Phase 1 (Questionnaire): Use progressive calculation that fills faster initially
      let phaseProgress = 0;
      if (currentStep === 0) phaseProgress = 0;
      else if (currentStep === 1) phaseProgress = 20;
      else if (currentStep === 2) phaseProgress = 45;
      else if (currentStep === 3) phaseProgress = 70;
      else if (currentStep >= 4) {
        // Asymptotic approach to 100%
        const remainingSteps = Math.max(1, totalSteps - 3);
        const completedSteps = Math.min(currentStep - 3, remainingSteps);
        const remainingProgress = 30; // 70% to 100%
        const stepProgress = (completedSteps / remainingSteps) * remainingProgress;
        phaseProgress = Math.min(70 + stepProgress, 95);
      }
      
      return phaseProgress;
    }
    
    // Default: return 0 if no step info
    return 0;
  }, [currentStep, totalSteps, isPart1Complete, initialProgress]);

  // Get majorRoadmapStep from store for progress sync
  const majorRoadmapStep = useOnboardingStore((state) => state.majorRoadmapStep);
  
  // Render 3-segment progress bar matching the roadmap steps
  const renderSegmentedProgressBar = () => {
    if (headerType !== 'progress') return null;
    
    // Fixed 3 segments matching the roadmap:
    // 1. אבחון ודירוג יכולות (Personal + Fitness Quiz)
    // 2. התאמה לסגנון החיים (Persona, Stats, Location, Equipment, Schedule)
    // 3. שריון התוכנית ויציאה לדרך (Summary & Account)
    const numSegments = 3;
    
    // Calculate fill percentage for each segment based on majorRoadmapStep
    const getSegmentFill = (segmentIndex: number): number => {
      // segmentIndex is 0, 1, or 2 (left to right in LTR, right to left in RTL)
      const phase = segmentIndex + 1; // 1, 2, or 3
      
      // Use majorRoadmapStep (0=אבחון, 1=התאמה, 2=שריון) to determine completion
      // majorRoadmapStep 0 = phase 1 active
      // majorRoadmapStep 1 = phase 1 complete, phase 2 active
      // majorRoadmapStep 2 = phases 1&2 complete, phase 3 active
      const currentPhase = majorRoadmapStep + 1; // Convert 0-indexed to 1-indexed
      
      if (phase < currentPhase) {
        return 100; // Completed phases are fully filled
      } else if (phase === currentPhase) {
        // For the active phase, use phaseProgress from props
        // Phase 2 has 5 steps: Persona, PersonalStats, Location, Equipment, Schedule
        // Calculate relative progress within the phase
        if (phaseProgress > 0) {
          return phaseProgress;
        }
        // Default to small partial fill to show we're in this phase
        return onboardingPhase === phase ? 5 : 0;
      } else {
        return 0; // Future phases are empty
      }
    };
    
    return (
      <div className="w-full px-4 pt-3 pb-2">
        <div className={`flex gap-1.5 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {Array.from({ length: numSegments }).map((_, index) => {
            // In RTL, segment 0 is rightmost (phase 1), in LTR, segment 0 is leftmost (phase 1)
            const segmentPhaseIndex = direction === 'rtl' ? numSegments - 1 - index : index;
            const fillPercent = getSegmentFill(segmentPhaseIndex);
            const isComplete = fillPercent === 100;
            const isActive = fillPercent > 0 && fillPercent < 100;
            
            return (
              <div
                key={index}
                className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    isComplete ? 'bg-[#10B981]' : isActive ? 'bg-[#5BC2F2]' : 'bg-transparent'
                }`}
                style={{
                    width: `${fillPercent}%`,
                }}
              />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render stepper header (for roadmap page)
  const renderStepperHeader = () => {
    const steps = [
      { label: currentLanguage === 'he' ? 'מוכן' : currentLanguage === 'ru' ? 'Готово' : 'Ready', stepNumber: 3 },
      { label: currentLanguage === 'he' ? 'התאמה' : currentLanguage === 'ru' ? 'Адаптация' : 'Matching', stepNumber: 2 },
      { label: currentLanguage === 'he' ? 'אבחון' : currentLanguage === 'ru' ? 'Оценка' : 'Assessment', stepNumber: 1 },
    ];

    return (
      <div className="w-full px-5 py-3 z-10 bg-white">
        {/* Icons Row */}
        <div className={`flex gap-1.5 mb-2 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {steps.map((item, index) => {
            const isActive = item.stepNumber === activeStepNumber;
            const iconColor = isActive ? '#5BC2F2' : '#CBD5E1';
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div className="w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300" style={{ backgroundColor: iconColor + '20' }}>
                  {isActive ? (
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: iconColor }} />
                  ) : (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: iconColor }} />
                  )}
                </div>
                <span className="text-[10px] font-medium mt-1 font-simpler transition-colors duration-300" style={{ color: isActive ? '#5BC2F2' : '#CBD5E1' }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress Bars Row */}
        <div className={`flex gap-1.5 relative ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {steps.map((segment, index) => {
            const isActive = segment.stepNumber === activeStepNumber;
            
            if (isActive) {
              const fillPercentage = 20; // Start at 20% to show immediate progress
              return (
                <div key={index} className="flex-1 relative" dir={direction}>
                  <div className={`h-1.5 rounded-full bg-[#5BC2F2]/20 relative ${direction === 'rtl' ? 'rtl' : ''}`}>
                    <motion.div
                      className={`h-full rounded-full ${direction === 'rtl' ? 'ml-auto' : ''}`}
                      style={{
                        width: `${fillPercentage}%`,
                        backgroundColor: '#5BC2F2',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${fillPercentage}%` }}
                      transition={{ 
                        type: 'spring',
                        stiffness: 300,
                        damping: 30,
                        duration: 0.5,
                      }}
                    />
                  </div>
                </div>
              );
            } else {
              return (
                <div
                  key={index}
                  className="h-1.5 flex-1 rounded-full bg-[#CBD5E1]/30"
                />
              );
            }
          })}
        </div>
      </div>
    );
  };

  // Simple mode (Setup Wizard) - with segmented progress bar
  if (headerType === 'progress' && !isDynamicMode && (title || subtitle)) {
    return (
      <div dir={direction} className="min-h-[100dvh] bg-gradient-to-b from-[#D8F3FF] via-[#F8FDFF] to-white flex flex-col" style={{ minHeight: '100dvh' }}>
        {/* Sticky Header with Segmented Progress Bar - Fully Transparent Glass */}
        <motion.header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="sticky top-0 z-50 bg-transparent backdrop-blur-2xl"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Segmented Progress Bar */}
          {renderSegmentedProgressBar()}
          
          {/* Coin Counter and Back Button Row - Coins ALWAYS on LEFT */}
          <div className="max-w-md mx-auto px-4 pb-3 flex items-center justify-between">
            {/* Coin Counter - ALWAYS LEFT (yellow) - COIN_SYSTEM_PAUSED: Hidden when disabled */}
            {IS_COIN_SYSTEM_ENABLED ? (
            <motion.div
              animate={coinBounce ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex items-center gap-2"
            >
              <Coins size={20} className="text-yellow-500" />
              <span className="text-yellow-500 font-bold font-simpler text-lg">{coins}</span>
            </motion.div>
            ) : (
              <div /> // Empty placeholder to maintain layout
            )}

            {/* Back Button - ALWAYS RIGHT */}
            {showBack && onBack && (
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 text-slate-600 font-medium hover:text-slate-900 transition-colors min-h-[44px] min-w-[44px] justify-center"
              >
                <ArrowRight size={18} className={direction === 'rtl' ? 'rotate-180' : ''} />
                <span className="font-simpler text-sm">{direction === 'rtl' ? 'חזור' : 'Back'}</span>
              </motion.button>
            )}
          </div>
        </motion.header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-4 md:py-8 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-4 md:p-6 lg:p-8">
            {/* Title */}
            {title && (
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl md:text-3xl font-black font-simpler text-slate-900 text-right mb-2"
              >
                {title}
              </motion.h1>
            )}

            {/* Subtitle */}
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base md:text-lg text-slate-600 text-right mb-6 font-simpler font-medium"
              >
                {subtitle}
              </motion.p>
            )}

            {/* Children Content */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    );
  }

  // Remove stepper mode - all screens now use progress mode
  // Stepper mode is deprecated and converted to progress mode

  // Progress mode (Dynamic Questionnaire/Wizard) - New layout with segmented progress bar
  return (
    <div dir={direction} className="min-h-[100dvh] bg-gradient-to-b from-[#D8F3FF] via-[#F8FDFF] to-white flex flex-col" style={{ minHeight: '100dvh' }}>
      {/* Sticky Header with Segmented Progress Bar - Fully Transparent Glass */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="sticky top-0 z-50 bg-transparent backdrop-blur-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Segmented Progress Bar */}
        {renderSegmentedProgressBar()}
        
        {/* Coin Counter and Back Button Row - Coins ALWAYS on LEFT */}
        <div className="w-full px-4 pb-3 flex items-center justify-between">
          {/* Coin Counter - ALWAYS LEFT (yellow) - COIN_SYSTEM_PAUSED: Hidden when disabled */}
          {IS_COIN_SYSTEM_ENABLED ? (
          <motion.div
            animate={coinBounce ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex items-center gap-2"
          >
            <Coins size={20} className="text-yellow-500" />
            <span className="text-yellow-500 font-bold font-simpler text-lg">{coins}</span>
          </motion.div>
          ) : (
            <div /> // Empty placeholder to maintain layout
          )}

          {/* Back Button - ALWAYS RIGHT */}
          {showBack && onBack && (
            <motion.button
              onClick={onBack}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-slate-600 font-medium hover:text-slate-900 transition-colors min-h-[44px] min-w-[44px] justify-center"
            >
              <ArrowRight size={18} className={direction === 'rtl' ? 'rotate-180' : ''} />
              <span className="font-simpler text-sm">{direction === 'rtl' ? 'חזור' : 'Back'}</span>
            </motion.button>
          )}
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 py-4 md:py-6 relative z-10 max-w-md mx-auto w-full overflow-y-auto min-h-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {children}
      </main>
    </div>
  );
}
