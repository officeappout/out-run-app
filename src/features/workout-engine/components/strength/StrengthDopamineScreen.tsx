"use client";

/**
 * StrengthDopamineScreen - Gamified Progress Celebration
 * 
 * Features:
 * - Sequential bonus cascade with Framer Motion
 * - Animated circular progress indicator
 * - Floating bonus labels with pop-up animations
 * - Haptic feedback on completion
 * - RTL Hebrew support
 * 
 * Animation Sequence:
 * 1. Initial: "מנתח ביצועים..." 
 * 2. Step 1 (1.5s): +9% Completion Bonus
 * 3. Step 2 (2.5s): +5% Performance Bonus
 * 4. Step 3 (3.5s): +3% Streak Bonus + Haptic
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Share2, ArrowRight, Sparkles, Flame, Target, CheckCircle2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface BonusStep {
  id: string;
  label: string;
  percentage: number;
  icon?: React.ReactNode;
  position: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right';
}

export interface VolumeBreakdownDisplay {
  setsPerformed: number;
  requiredSets: number;
  isFullVolume: boolean;
}

export interface StrengthDopamineScreenProps {
  /** Initial progress percentage before bonuses (0-100) */
  initialProgress: number;
  
  /** Current user level */
  currentLevel: number;
  
  /** Program name to display */
  programName: string;
  
  /** Custom bonuses to apply (optional, uses defaults if not provided) */
  bonuses?: BonusStep[];
  
  /** Volume breakdown for display (optional) */
  volumeBreakdown?: VolumeBreakdownDisplay;
  
  /** Celebration message (optional) */
  celebrationMessage?: string;
  
  /** Callback when user clicks share */
  onShare?: () => void;
  
  /** Callback when user clicks back to dashboard */
  onBack?: () => void;
  
  /** Whether to trigger haptic feedback */
  enableHaptics?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BONUSES: BonusStep[] = [
  {
    id: 'completion',
    label: '9% על השלמת אימון',
    percentage: 9,
    icon: <Target className="w-3 h-3" />,
    position: 'top-right',
  },
  {
    id: 'performance',
    label: '5% על ביצוע מעל המצופה',
    percentage: 5,
    icon: <Sparkles className="w-3 h-3" />,
    position: 'top-left',
  },
  {
    id: 'streak',
    label: '3% על התמדה',
    percentage: 3,
    icon: <Flame className="w-3 h-3" />,
    position: 'bottom-left',
  },
];

const ANIMATION_DELAYS = {
  initial: 0,
  step1: 1500,
  step2: 2500,
  step3: 3500,
};

const STATUS_MESSAGES = {
  analyzing: 'מנתח ביצועים...',
  step1: 'סחטיין על הביצוע!',
  step2: 'ממשיכים להתקדם!',
  complete: 'האימון הסתיים!',
};

// SVG circle constants
const CIRCLE_RADIUS = 70;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Trigger haptic feedback (mobile devices)
 */
function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'medium'): void {
  if (typeof window === 'undefined') return;
  
  // Try Vibration API
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20, 10, 20],
      heavy: [30, 20, 30, 20, 50],
    };
    navigator.vibrate(patterns[type]);
  }
}

/**
 * Calculate stroke-dashoffset for circular progress
 */
function calculateDashOffset(percentage: number): number {
  return CIRCLE_CIRCUMFERENCE - (percentage / 100) * CIRCLE_CIRCUMFERENCE;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Animated Circular Progress Indicator
 */
function CircularProgress({ 
  percentage, 
  animate = true 
}: { 
  percentage: number; 
  animate?: boolean;
}) {
  const dashOffset = calculateDashOffset(percentage);
  
  return (
    <div className="progress-circle relative w-[180px] h-[180px]">
      <svg width="180" height="180" className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx="90"
          cy="90"
          r={CIRCLE_RADIUS}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        {/* Progress circle */}
        <motion.circle
          cx="90"
          cy="90"
          r={CIRCLE_RADIUS}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={CIRCLE_CIRCUMFERENCE}
          initial={{ strokeDashoffset: CIRCLE_CIRCUMFERENCE }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ 
            duration: animate ? 1 : 0, 
            ease: "easeOut" 
          }}
        />
      </svg>
      
      {/* Center percentage display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          key={percentage}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-extrabold text-slate-800 dark:text-white"
        >
          {percentage}%
        </motion.span>
      </div>
    </div>
  );
}

/**
 * Floating Bonus Label
 */
function BonusLabel({ 
  bonus, 
  isVisible,
  delay = 0,
}: { 
  bonus: BonusStep; 
  isVisible: boolean;
  delay?: number;
}) {
  const positionClasses: Record<typeof bonus.position, string> = {
    'top-right': 'top-0 -right-2',
    'top-left': 'top-2 -left-2',
    'bottom-left': 'bottom-6 -left-4',
    'bottom-right': 'bottom-6 -right-4',
  };
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ scale: 0, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 15,
            delay: delay / 1000,
          }}
          className={`
            absolute ${positionClasses[bonus.position]}
            bg-sky-100 dark:bg-sky-900/30 
            px-3 py-1.5 rounded-full 
            border border-sky-200 dark:border-sky-800 
            shadow-sm flex items-center gap-1.5
            z-10
          `}
        >
          {bonus.icon && (
            <span className="text-sky-600 dark:text-sky-300">
              {bonus.icon}
            </span>
          )}
          <span className="text-sky-600 dark:text-sky-300 text-xs font-bold leading-none whitespace-nowrap">
            {bonus.label}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Volume Breakdown Display Component
 */
function VolumeBreakdownBadge({
  volumeBreakdown,
}: {
  volumeBreakdown: VolumeBreakdownDisplay;
}) {
  const { setsPerformed, requiredSets, isFullVolume } = volumeBreakdown;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={`
        w-full rounded-2xl p-4 mb-4 border
        ${isFullVolume 
          ? 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800' 
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isFullVolume ? (
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <Target className="w-5 h-5 text-slate-500" />
            </div>
          )}
          <div>
            <p className={`text-sm font-bold ${isFullVolume ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>
              ביצעת {setsPerformed} מתוך {requiredSets} סטים נדרשים לרמה זו
            </p>
            {isFullVolume && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                🏆 Full Volume - קיבלת 100% מהרווח!
              </p>
            )}
          </div>
        </div>
        
        {isFullVolume && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.5 }}
            className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full"
          >
            Full Volume
          </motion.div>
        )}
      </div>
      
      {/* Progress bar for volume */}
      <div className="mt-3 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (setsPerformed / requiredSets) * 100)}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className={`h-full rounded-full ${isFullVolume ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
      </div>
    </motion.div>
  );
}

/**
 * Level Progress Bar
 */
function LevelProgressBar({ 
  level, 
  percentage 
}: { 
  level: number; 
  percentage: number;
}) {
  return (
    <div className="flex flex-row-reverse items-center justify-between gap-4 w-full">
      {/* Level badge */}
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-slate-800 dark:text-white" />
        <span className="text-lg font-bold text-slate-800 dark:text-white">
          רמה {level}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="flex-1 h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative">
        <motion.div 
          className="absolute right-0 top-0 h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      
      {/* Percentage */}
      <motion.div 
        key={percentage}
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        className="text-lg font-black text-primary"
      >
        {percentage}%
      </motion.div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StrengthDopamineScreen({
  initialProgress,
  currentLevel,
  programName,
  bonuses = DEFAULT_BONUSES,
  volumeBreakdown,
  celebrationMessage = 'כל הכבוד, איזה אנרגיה! קיבלתם אחוזים שמקדמים אתכם בדרך לרמה הבאה. המשיכו כך – וכשתגיעו ל-100%, תעלו רמה!',
  onShare,
  onBack,
  enableHaptics = true,
}: StrengthDopamineScreenProps) {
  // Current displayed percentage (animated)
  const [displayPercent, setDisplayPercent] = useState(initialProgress);
  
  // Current status message
  const [statusMessage, setStatusMessage] = useState(STATUS_MESSAGES.analyzing);
  
  // Which bonus steps are visible
  const [visibleBonuses, setVisibleBonuses] = useState<string[]>([]);
  
  // Is the sequence complete?
  const [isComplete, setIsComplete] = useState(false);
  
  // Calculate total bonus percentage
  const totalBonus = bonuses.reduce((sum, b) => sum + b.percentage, 0);
  const finalPercentage = Math.min(100, initialProgress + totalBonus);
  
  // Trigger haptic feedback
  const haptic = useCallback((type: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (enableHaptics) {
      triggerHaptic(type);
    }
  }, [enableHaptics]);
  
  // Sequential animation effect
  useEffect(() => {
    let runningPercent = initialProgress;
    
    // Step 1: Completion Bonus (after 1.5s)
    const timer1 = setTimeout(() => {
      const bonus = bonuses[0];
      if (bonus) {
        runningPercent = Math.min(100, runningPercent + bonus.percentage);
        setDisplayPercent(runningPercent);
        setVisibleBonuses(prev => [...prev, bonus.id]);
        setStatusMessage(STATUS_MESSAGES.step1);
        haptic('light');
      }
    }, ANIMATION_DELAYS.step1);
    
    // Step 2: Performance Bonus (after 2.5s)
    const timer2 = setTimeout(() => {
      const bonus = bonuses[1];
      if (bonus) {
        runningPercent = Math.min(100, runningPercent + bonus.percentage);
        setDisplayPercent(runningPercent);
        setVisibleBonuses(prev => [...prev, bonus.id]);
        setStatusMessage(STATUS_MESSAGES.step2);
        haptic('light');
      }
    }, ANIMATION_DELAYS.step2);
    
    // Step 3: Streak Bonus (after 3.5s)
    const timer3 = setTimeout(() => {
      const bonus = bonuses[2];
      if (bonus) {
        runningPercent = Math.min(100, runningPercent + bonus.percentage);
        setDisplayPercent(runningPercent);
        setVisibleBonuses(prev => [...prev, bonus.id]);
        setStatusMessage(STATUS_MESSAGES.complete);
        setIsComplete(true);
        haptic('heavy'); // Stronger haptic on completion
      }
    }, ANIMATION_DELAYS.step3);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [initialProgress, bonuses, haptic]);
  
  return (
    <div 
      className="fixed inset-0 z-[100] w-full h-full bg-white dark:bg-card-dark flex flex-col overflow-hidden"
      dir="rtl"
    >
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center">
          
          {/* Circular Progress with Bonus Labels */}
          <div className="relative mt-4 mb-12 flex justify-center items-center w-full">
            <CircularProgress percentage={displayPercent} />
            
            {/* Bonus Labels */}
            {bonuses.map((bonus) => (
              <BonusLabel
                key={bonus.id}
                bonus={bonus}
                isVisible={visibleBonuses.includes(bonus.id)}
              />
            ))}
          </div>
          
          {/* Status Message */}
          <motion.h1 
            key={statusMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-black text-slate-900 dark:text-white mb-8 text-center"
          >
            {statusMessage}
          </motion.h1>
          
          {/* Volume Breakdown Badge */}
          {volumeBreakdown && (
            <VolumeBreakdownBadge volumeBreakdown={volumeBreakdown} />
          )}

          {/* Info Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isComplete ? 1 : 0.5, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm"
          >
            <h2 className="text-xl font-bold text-slate-800 dark:text-white text-center mb-4">
              {programName}
            </h2>
            
            <p className="text-slate-600 dark:text-slate-400 text-center text-lg leading-relaxed mb-8">
              {celebrationMessage}
            </p>
            
            {/* Divider */}
            <div className="h-px bg-slate-200 dark:bg-slate-700 w-full mb-6" />
            
            {/* Level Progress Bar */}
            <LevelProgressBar 
              level={currentLevel} 
              percentage={displayPercent} 
            />
          </motion.div>
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Action Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isComplete ? 1 : 0.3, y: 0 }}
            transition={{ delay: 1 }}
            className="w-full mt-8 flex flex-col gap-3"
          >
            <button 
              onClick={onShare}
              disabled={!isComplete}
              className="w-full bg-primary py-4 rounded-2xl text-white font-bold text-lg shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Share2 className="w-5 h-5" />
              שיתוף התקדמות
            </button>
            
            <button 
              onClick={onBack}
              disabled={!isComplete}
              className="w-full bg-transparent py-4 rounded-2xl text-slate-500 dark:text-slate-400 font-bold text-lg active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-5 h-5" />
              חזרה ללוח בקרה
            </button>
          </motion.div>
        </div>
        
        {/* Safe Area Bottom Padding */}
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { 
  DEFAULT_BONUSES,
  ANIMATION_DELAYS,
  STATUS_MESSAGES,
  triggerHaptic,
};
