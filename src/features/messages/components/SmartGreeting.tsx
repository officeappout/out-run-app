'use client';

/**
 * SmartGreeting Component
 * 
 * Displays context-aware greeting messages on the home screen.
 * Automatically updates when admin changes messages in the panel.
 * Integrates with the Activity system for real-time streak and user data.
 * 
 * @example
 * // Basic usage - auto-detects context and user data
 * <SmartGreeting />
 * 
 * @example
 * // With explicit context (overrides auto-detection)
 * <SmartGreeting 
 *   context={{ workoutCompleted: true, streak: 5 }}
 * />
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Trophy, Flame, Star, Heart, Zap, X } from 'lucide-react';
import { useSmartGreeting, type GreetingContext } from '../hooks/useSmartGreeting';
import { useDailyActivity } from '@/features/activity';
import { useUserStore } from '@/features/user';
import type { MessageType } from '../services/MessageService';
import { replaceMessageVariables } from '@/core/constants';

// ============================================================================
// TYPES
// ============================================================================

interface SmartGreetingProps {
  /** User's display name (optional - auto-fetched if not provided) */
  userName?: string;
  /** Optional explicit context (overrides URL detection) */
  context?: Partial<GreetingContext>;
  /** Custom className for the container */
  className?: string;
  /** Show loading skeleton */
  showSkeleton?: boolean;
  /** Variant style */
  variant?: 'default' | 'compact' | 'hero';
  /** Show decorative icon */
  showIcon?: boolean;
  /** User's current level (for {level} variable - auto-fetched if not provided) */
  level?: number;
  /** User's current program name (for {program} variable) */
  program?: string;
  /** Show close (X) button */
  showCloseButton?: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Daily quote from Admin */
  dailyQuote?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_ICONS: Record<MessageType, React.ReactNode> = {
  post_workout: <Trophy className="w-6 h-6 text-yellow-500" />,
  partial_workout: <Heart className="w-6 h-6 text-pink-500" />,
  re_engagement: <Sparkles className="w-6 h-6 text-blue-500" />,
  pr_record: <Trophy className="w-6 h-6 text-amber-500" />,
  streak_milestone: <Flame className="w-6 h-6 text-orange-500" />,
  level_up: <Star className="w-6 h-6 text-purple-500" />,
  first_workout: <Zap className="w-6 h-6 text-cyan-500" />,
  default: <Sparkles className="w-6 h-6 text-primary" />,
};

const TYPE_GRADIENTS: Record<MessageType, string> = {
  post_workout: 'from-green-500/10 to-emerald-500/5',
  partial_workout: 'from-amber-500/10 to-orange-500/5',
  re_engagement: 'from-blue-500/10 to-cyan-500/5',
  pr_record: 'from-yellow-500/10 to-amber-500/5',
  streak_milestone: 'from-orange-500/10 to-red-500/5',
  level_up: 'from-purple-500/10 to-pink-500/5',
  first_workout: 'from-cyan-500/10 to-blue-500/5',
  default: 'from-primary/10 to-cyan-500/5',
};

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

function GreetingSkeleton({ variant }: { variant: 'default' | 'compact' | 'hero' }) {
  if (variant === 'compact') {
    return (
      <div className="animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
      </div>
    );
  }
  
  return (
    <div className="animate-pulse p-4 rounded-2xl bg-gray-100 dark:bg-gray-800">
      <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SmartGreeting({
  userName: propUserName,
  context: propContext,
  className = '',
  showSkeleton = true,
  variant = 'default',
  showIcon = true,
  level: propLevel,
  program,
  showCloseButton = false,
  onClose,
  dailyQuote,
}: SmartGreetingProps) {
  // Local state for dismissing the greeting
  const [isDismissed, setIsDismissed] = useState(false);
  
  // Fetch real user data from stores
  const { profile } = useUserStore();
  const { streak: activityStreak, isLoading: activityLoading } = useDailyActivity();
  
  // Merge prop context with auto-detected activity data
  const context = useMemo((): Partial<GreetingContext> => ({
    ...propContext,
    // Use activity streak if not explicitly provided
    streak: propContext?.streak ?? activityStreak,
    // Use profile persona if not explicitly provided (from personaId or first lifestyle tag)
    persona: propContext?.persona ?? profile?.personaId ?? profile?.lifestyle?.lifestyleTags?.[0],
  }), [propContext, activityStreak, profile?.personaId, profile?.lifestyle?.lifestyleTags]);
  
  const { message, type, isLoading: messageLoading } = useSmartGreeting(context);
  
  // Auto-detect userName from profile if not provided
  const userName = propUserName ?? profile?.core?.name ?? 'OUTer';
  
  // Auto-detect level from profile if not provided
  const level = propLevel ?? profile?.progression?.globalLevel ?? 1;
  
  const isLoading = messageLoading || activityLoading;
  
  // Handle close
  const handleClose = () => {
    setIsDismissed(true);
    onClose?.();
  };
  
  // If dismissed, don't render
  if (isDismissed) return null;
  
  // Build variable replacement context
  const variables = useMemo(() => ({
    name: userName,
    streak: context?.streak ?? activityStreak,
    level: level ?? context?.level,
    program: program ?? context?.program,
  }), [userName, context?.streak, context?.level, context?.program, level, program, activityStreak]);
  
  // Apply variable replacements
  const mainText = useMemo(() => 
    replaceMessageVariables(message.text, variables),
    [message.text, variables]
  );
  
  const subText = useMemo(() => 
    message.subText ? replaceMessageVariables(message.subText, variables) : undefined,
    [message.subText, variables]
  );
  
  // Loading state
  if (isLoading && showSkeleton) {
    return <GreetingSkeleton variant={variant} />;
  }
  
  // Compact variant
  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`text-right ${className}`}
        dir="rtl"
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {mainText}
        </h2>
        {subText && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {subText}
          </p>
        )}
      </motion.div>
    );
  }
  
  // Hero variant
  if (variant === 'hero') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br ${TYPE_GRADIENTS[type]} ${className}`}
        dir="rtl"
      >
        {/* Decorative background */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        
        <div className="relative flex items-start gap-4">
          {showIcon && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="w-14 h-14 rounded-2xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center"
            >
              {TYPE_ICONS[type]}
            </motion.div>
          )}
          
          <div className="flex-1">
            <motion.h1
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-2xl font-black text-gray-900 dark:text-white mb-1"
            >
              {mainText}
            </motion.h1>
            
            {subText && (
              <motion.p
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-gray-600 dark:text-gray-300"
              >
                {subText}
              </motion.p>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
  
  // Default greeting text with name variable
  const defaultGreetingText = `מה נשמע ${userName}? מוכן לעוד יום טוב?`;
  const displayMainText = mainText || defaultGreetingText;
  
  // Default variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, height: 0 }}
      className={`p-4 rounded-2xl bg-gradient-to-br ${TYPE_GRADIENTS[type]} border border-gray-100 dark:border-gray-800 ${className}`}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        {showIcon && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0"
          >
            {TYPE_ICONS[type]}
          </motion.div>
        )}
        
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.h2
              key={message.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-xl font-bold text-gray-900 dark:text-white"
            >
              {displayMainText}
            </motion.h2>
          </AnimatePresence>
          
          {subText && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm text-gray-500 dark:text-gray-400 mt-0.5"
            >
              {subText}
            </motion.p>
          )}
          
          {/* Daily Quote from Admin */}
          {dailyQuote && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic border-r-2 border-primary/30 pr-2"
            >
              "{dailyQuote}"
            </motion.p>
          )}
        </div>
        
        {/* Close Button */}
        {showCloseButton && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/80 dark:bg-gray-800/80 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// ADDITIONAL EXPORTS
// ============================================================================

/**
 * Simple text-only greeting (no card styling)
 * Auto-fetches user data from Activity store if not provided
 */
export function SmartGreetingText({
  userName: propUserName,
  context: propContext,
  className = '',
  level: propLevel,
  program,
}: {
  userName?: string;
  context?: Partial<GreetingContext>;
  className?: string;
  level?: number;
  program?: string;
}) {
  // Fetch real user data from stores
  const { profile } = useUserStore();
  const { streak: activityStreak, isLoading: activityLoading } = useDailyActivity();
  
  // Merge prop context with auto-detected activity data
  const context = useMemo((): Partial<GreetingContext> => ({
    ...propContext,
    streak: propContext?.streak ?? activityStreak,
    persona: propContext?.persona ?? profile?.personaId ?? profile?.lifestyle?.lifestyleTags?.[0],
  }), [propContext, activityStreak, profile?.personaId, profile?.lifestyle?.lifestyleTags]);
  
  const { message, isLoading: messageLoading } = useSmartGreeting(context);
  
  // Auto-detect values
  const userName = propUserName ?? profile?.core?.name ?? 'OUTer';
  const level = propLevel ?? profile?.progression?.globalLevel ?? 1;
  const isLoading = messageLoading || activityLoading;
  
  // Build variable replacement context
  const variables = useMemo(() => ({
    name: userName,
    streak: context?.streak ?? activityStreak,
    level: level ?? context?.level,
    program: program ?? context?.program,
  }), [userName, context?.streak, context?.level, context?.program, level, program, activityStreak]);
  
  // Apply variable replacements
  const mainText = useMemo(() => 
    replaceMessageVariables(message.text, variables),
    [message.text, variables]
  );
  
  const subText = useMemo(() => 
    message.subText ? replaceMessageVariables(message.subText, variables) : undefined,
    [message.subText, variables]
  );
  
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32" />
      </div>
    );
  }
  
  return (
    <div className={className} dir="rtl">
      <span className="font-bold text-gray-900 dark:text-white">
        {mainText}
      </span>
      {subText && (
        <span className="text-gray-500 dark:text-gray-400 mr-1">
          {' '}{subText}
        </span>
      )}
    </div>
  );
}

export default SmartGreeting;
