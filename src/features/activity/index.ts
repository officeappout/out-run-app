/**
 * Activity Feature Module
 * 
 * Tracks and displays user activity across categories:
 * - STRENGTH (Cyan) - Calisthenics, weight training
 * - CARDIO (Lime) - Running, walking, cycling
 * - MAINTENANCE (Purple) - Flexibility, mobility, recovery
 * 
 * Key Features:
 * - Adaptive ring priority based on user's primary program
 * - Streak tracking (consecutive days with >10 mins activity)
 * - Dynamic "path" color based on dominant activity
 * - Integration with ConcentricRingsProgress component
 * 
 * Usage:
 * ```tsx
 * import { useDailyActivity, useActivityRings } from '@/features/activity';
 * 
 * // Full activity data
 * const { ringData, progressMessage, streak, logWorkout } = useDailyActivity();
 * 
 * // Just rings for display
 * const { rings, isLoading } = useActivityRings();
 * 
 * // Log a workout
 * logWorkout('strength', 45, 300); // 45 mins, 300 calories
 * ```
 */

// Types
export {
  // Core types
  type ActivityCategory,
  type ActivityType,
  type ActivityPriority,
  
  // Data structures
  type CategoryMetrics,
  type DailyActivity,
  type WeeklyActivitySummary,
  type RingData,
  type DayDotData,
  type PriorityConfig,
  
  // Constants
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  DEFAULT_DAILY_GOALS,
  DEFAULT_WEEKLY_GOALS,
  STREAK_MINIMUM_MINUTES,
  
  // Factory functions
  createEmptyDailyActivity,
  createEmptyCategoryMetrics,
} from './types/activity.types';

// Store
export {
  useActivityStore,
  useTodayActivity,
  useRingData,
  useDominantColor,
  useWeeklySummary,
  useProgressMessage,
  useStreak,
} from './store/useActivityStore';

// Services
export {
  activityPriorityService,
  getPriorityOrder,
  getPriorityConfig,
  buildRingData,
  getDominantActivityColor,
  PROGRAM_ALIASES,
  PRIORITY_CONFIGS,
} from './services/ActivityPriorityService';

// Hooks
export {
  useDailyActivity,
  useActivityRings,
  useCategoryActivity,
  useWeeklyProgress,
  type DailyActivityResult,
} from './hooks/useDailyActivity';
