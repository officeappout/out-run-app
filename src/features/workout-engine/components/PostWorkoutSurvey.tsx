"use client";

/**
 * PostWorkoutSurvey - "How was it?" feedback component
 *
 * Soft-adaptation Phase 0 (18.10.2026) — RECORD ONLY:
 * - Mounted on the strength summary behind POST_WORKOUT_SURVEY_V1
 *   (active/page.tsx), on the first 3 strength sessions and then about
 *   every 4th (adaptation/survey-cadence.ts).
 * - 3 options: קל מדי / בדיוק / קשה מדי. The answer is saved on the workout
 *   doc (workouts/{id}.feedback) and changes NOTHING — no level change, no
 *   progress bonus. (It used to promise "+5% progress" / "-1 level"; nothing
 *   ever applied those, and the component was never mounted.)
 * - "Always skip this" permanently disables it on this device.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Minus, CheckCircle, X, EyeOff } from 'lucide-react';
import { shouldPromptPostWorkoutSurvey } from '@/features/workout-engine/adaptation/survey-cadence';

// ============================================================================
// TYPES
// ============================================================================

export type WorkoutFeedback = 'too_easy' | 'just_right' | 'too_hard';

export interface PostWorkoutSurveyProps {
  /** Estimated duration of the completed workout (unused; kept for callers) */
  estimatedDuration?: number;
  
  /** 1-based strength-session number (drives the cadence gate) */
  sessionCount: number;
  
  /** Callback when user submits feedback */
  onSubmit: (feedback: WorkoutFeedback) => void;
  
  /** Callback to dismiss without feedback */
  onDismiss?: () => void;
  
  /** Callback when user chooses "Always skip" */
  onAlwaysSkip?: () => void;
  
  /** Whether user has opted out of surveys */
  isOptedOut?: boolean;
  
  /** Whether survey is visible */
  isVisible?: boolean;
}

/**
 * Phase 0: a thank-you line only. Deliberately has NO progress/level fields —
 * the survey must never change level or progress (tested in
 * adaptation/__tests__/post-workout-survey.test.ts).
 */
export interface FeedbackResult {
  feedback: WorkoutFeedback;
  message: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================


/** Local storage key for opt-out preference */
const SURVEY_OPT_OUT_KEY = 'outrun_survey_opted_out';

const FEEDBACK_OPTIONS: {
  id: WorkoutFeedback;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  hoverColor: string;
}[] = [
  {
    id: 'too_easy',
    label: 'קל מדי',
    icon: <ThumbsUp className="w-6 h-6" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    hoverColor: 'hover:bg-green-100',
  },
  {
    id: 'just_right',
    label: 'בדיוק',
    icon: <Minus className="w-6 h-6" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    hoverColor: 'hover:bg-blue-100',
  },
  {
    id: 'too_hard',
    label: 'קשה מדי',
    icon: <ThumbsDown className="w-6 h-6" />,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    hoverColor: 'hover:bg-red-100',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine if survey should be shown: the cadence gate (first 3 strength
 * sessions, then about every 4th) AND the user hasn't opted out.
 */
export function shouldShowPostWorkoutSurvey(
  sessionCount: number,
  isOptedOut?: boolean
): boolean {
  if (isOptedOut) return false;
  if (isSurveyOptedOut()) return false;
  return shouldPromptPostWorkoutSurvey(sessionCount);
}

/**
 * Check if user has opted out via localStorage
 */
export function isSurveyOptedOut(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SURVEY_OPT_OUT_KEY) === 'true';
}

/**
 * Set survey opt-out preference
 */
export function setSurveyOptOut(optOut: boolean): void {
  if (typeof window === 'undefined') return;
  if (optOut) {
    localStorage.setItem(SURVEY_OPT_OUT_KEY, 'true');
  } else {
    localStorage.removeItem(SURVEY_OPT_OUT_KEY);
  }
}

/**
 * Process feedback → the thank-you line. Record-only: no progress bonus, no
 * level adjustment, for any rating.
 */
export function processFeedback(feedback: WorkoutFeedback): FeedbackResult {
  switch (feedback) {
    case 'too_easy':
      return { feedback, message: 'תודה! נשתמש בזה כדי להתאים את האימונים הבאים.' };
    case 'too_hard':
      return { feedback, message: 'תודה על הכנות! נשתמש בזה כדי להתאים את האימונים הבאים.' };
    case 'just_right':
    default:
      return { feedback, message: 'מעולה, תודה!' };
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PostWorkoutSurvey({
  sessionCount,
  onSubmit,
  onDismiss,
  onAlwaysSkip,
  isOptedOut = false,
  isVisible = true,
}: PostWorkoutSurveyProps) {
  const [selectedFeedback, setSelectedFeedback] = useState<WorkoutFeedback | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [localOptedOut, setLocalOptedOut] = useState(isOptedOut);
  
  // Check localStorage on mount
  useEffect(() => {
    setLocalOptedOut(isOptedOut || isSurveyOptedOut());
  }, [isOptedOut]);
  
  // Don't show if opted out or not on a cadence session
  if (!shouldShowPostWorkoutSurvey(sessionCount, localOptedOut)) {
    return null;
  }
  
  const handleSelect = (feedback: WorkoutFeedback) => {
    setSelectedFeedback(feedback);
  };
  
  const handleSubmit = () => {
    if (!selectedFeedback) return;
    
    const feedbackResult = processFeedback(selectedFeedback);
    setResult(feedbackResult);
    setIsSubmitted(true);
    onSubmit(selectedFeedback);
  };
  
  const handleAlwaysSkip = () => {
    setSurveyOptOut(true);
    setLocalOptedOut(true);
    onAlwaysSkip?.();
    onDismiss?.();
  };
  
  if (!isVisible) return null;
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-cyan-500 to-blue-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">איך היה האימון? 🎯</h3>
              <p className="text-cyan-100 text-sm mt-1">
                לא חובה — זה עוזר לנו להתאים את האימונים
              </p>
            </div>
            {onDismiss && (
              <button 
                onClick={onDismiss}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="סגור"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {!isSubmitted ? (
            <>
              {/* Feedback Options */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {FEEDBACK_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleSelect(option.id)}
                    className={`
                      flex flex-col items-center justify-center p-4 rounded-xl
                      border-2 transition-all duration-200
                      ${selectedFeedback === option.id
                        ? `${option.bgColor} border-current ${option.color} scale-105 shadow-lg`
                        : `border-gray-200 dark:border-gray-700 ${option.hoverColor}`
                      }
                    `}
                  >
                    <div className={`mb-2 ${selectedFeedback === option.id ? option.color : 'text-gray-400'}`}>
                      {option.icon}
                    </div>
                    <span className={`text-sm font-semibold ${selectedFeedback === option.id ? option.color : 'text-gray-600 dark:text-gray-300'}`}>
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
              
              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!selectedFeedback}
                className={`
                  w-full py-3 px-6 rounded-xl font-bold text-white
                  transition-all duration-200
                  ${selectedFeedback
                    ? 'bg-gradient-to-l from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-lg'
                    : 'bg-gray-300 cursor-not-allowed'
                  }
                `}
              >
                שלח משוב
              </button>
              
              {/* Action links */}
              <div className="flex items-center justify-center gap-4 mt-4">
                {onDismiss && (
                  <button
                    onClick={onDismiss}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    דלג הפעם
                  </button>
                )}
                
                {/* Always Skip Option */}
                <button
                  onClick={handleAlwaysSkip}
                  className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 flex items-center gap-1"
                >
                  <EyeOff className="w-3 h-3" />
                  תמיד דלג
                </button>
              </div>
            </>
          ) : (
            /* Result Display */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="mb-4">
                <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              {/* Message — record-only: no bonus / level badges (Phase 0) */}
              <p className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                {result?.message}
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// COMPACT VERSION (for inline use)
// ============================================================================

export function PostWorkoutSurveyCompact({
  sessionCount,
  onSubmit,
  onAlwaysSkip,
}: {
  sessionCount: number;
  onSubmit: (feedback: WorkoutFeedback) => void;
  onAlwaysSkip?: () => void;
}) {
  // Check if should show
  if (!shouldShowPostWorkoutSurvey(sessionCount)) {
    return null;
  }
  
  const handleAlwaysSkip = () => {
    setSurveyOptOut(true);
    onAlwaysSkip?.();
  };
  
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl p-3" dir="rtl">
      <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">איך היה?</span>
      <div className="flex gap-2">
        {FEEDBACK_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => onSubmit(option.id)}
            className={`p-2 rounded-lg ${option.bgColor} ${option.color} ${option.hoverColor} transition-colors`}
            title={option.label}
          >
            {option.icon}
          </button>
        ))}
      </div>
      <button
        onClick={handleAlwaysSkip}
        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
        title="תמיד דלג"
      >
        <EyeOff className="w-4 h-4" />
      </button>
    </div>
  );
}
