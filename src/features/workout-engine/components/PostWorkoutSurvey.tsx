"use client";

/**
 * PostWorkoutSurvey - "How was it?" feedback component
 * 
 * Features:
 * - Only triggers for the FIRST 3 SESSIONS of a user's journey
 * - 3 options: Too Easy, Just Right, Too Hard
 * - Too Easy: Awards +5% progress bonus
 * - Too Hard: Suggests -1 level for next session
 * - "Always skip this" option to permanently disable
 * - Integrates with progression system
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Minus, Sparkles, AlertTriangle, CheckCircle, X, EyeOff } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type WorkoutFeedback = 'too_easy' | 'just_right' | 'too_hard';

export interface PostWorkoutSurveyProps {
  /** Estimated duration of the completed workout */
  estimatedDuration: number;
  
  /** Number of sessions the user has completed (1-indexed) */
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

export interface FeedbackResult {
  feedback: WorkoutFeedback;
  progressBonus?: number;        // +5% for "too_easy"
  levelAdjustment?: number;      // -1 for "too_hard"
  message: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Only show survey for first 3 sessions of user's journey */
const MAX_SESSIONS_FOR_SURVEY = 3;

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
    label: 'בדיוק נכון',
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
 * Determine if survey should be shown
 * Only shows for first 3 sessions AND if user hasn't opted out
 */
export function shouldShowPostWorkoutSurvey(
  sessionCount: number,
  isOptedOut?: boolean
): boolean {
  // Check if user has opted out
  if (isOptedOut) return false;
  
  // Check localStorage for opt-out (client-side)
  if (typeof window !== 'undefined') {
    const optedOut = localStorage.getItem(SURVEY_OPT_OUT_KEY);
    if (optedOut === 'true') return false;
  }
  
  // Only show for first 3 sessions
  return sessionCount <= MAX_SESSIONS_FOR_SURVEY;
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
 * Process feedback and determine results
 */
export function processFeedback(feedback: WorkoutFeedback): FeedbackResult {
  switch (feedback) {
    case 'too_easy':
      return {
        feedback,
        progressBonus: 5, // +5% progress bonus
        message: '🎉 מדהים! קיבלת +5% בונוס התקדמות. נעלה רמה בפעם הבאה!',
      };
    
    case 'too_hard':
      return {
        feedback,
        levelAdjustment: -1, // Suggest -1 level
        message: '💪 הבנו! נוריד קצת את הקושי באימון הבא. הכי חשוב - עשית את זה!',
      };
    
    case 'just_right':
    default:
      return {
        feedback,
        message: '👍 מעולה! ממשיכים באותה רמה. עבודה טובה!',
      };
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PostWorkoutSurvey({
  estimatedDuration,
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
  
  // Don't show if opted out or past first 3 sessions
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
  
  // Calculate which session this is (for display)
  const sessionLabel = sessionCount === 1 ? 'ראשון' : sessionCount === 2 ? 'שני' : 'שלישי';
  
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
                אימון {sessionLabel} מתוך 3 - המשוב שלך עוזר לנו לכייל את הרמה!
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
              {/* Icon based on feedback */}
              <div className="mb-4">
                {result?.feedback === 'too_easy' && (
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-green-600" />
                  </div>
                )}
                {result?.feedback === 'just_right' && (
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-blue-600" />
                  </div>
                )}
                {result?.feedback === 'too_hard' && (
                  <div className="w-16 h-16 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-amber-600" />
                  </div>
                )}
              </div>
              
              {/* Message */}
              <p className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                {result?.message}
              </p>
              
              {/* Bonus/Adjustment badge */}
              {result?.progressBonus && (
                <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-bold">
                  <Sparkles className="w-4 h-4" />
                  +{result.progressBonus}% בונוס התקדמות
                </div>
              )}
              
              {result?.levelAdjustment && (
                <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-full text-sm font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  נוריד רמה באימון הבא
                </div>
              )}
              
              {/* Session progress indicator */}
              {sessionCount < MAX_SESSIONS_FOR_SURVEY && (
                <p className="text-sm text-gray-500 mt-4">
                  נשאר עוד {MAX_SESSIONS_FOR_SURVEY - sessionCount} אימונים עם משוב
                </p>
              )}
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
