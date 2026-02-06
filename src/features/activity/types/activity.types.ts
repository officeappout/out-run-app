/**
 * Activity Types
 * 
 * Core type definitions for the Activity tracking system.
 * Used for concentric rings progress, smart dots, and priority calculations.
 */

// ============================================================================
// ACTIVITY CATEGORIES
// ============================================================================

/**
 * Main activity categories for the concentric rings
 * Each category has a designated color in the UI
 */
export type ActivityCategory = 'strength' | 'cardio' | 'maintenance';

/**
 * Activity type for calendar dots (legacy support + new system)
 */
export type ActivityType = 
  | 'super'      // Full workout completed (Blue Flame)
  | 'micro'      // Hit adaptive goal (Orange Flame)
  | 'survival'   // Hit baseline only (Checkmark)
  | 'rest'       // Scheduled rest day
  | 'none';      // No activity

/**
 * Priority levels (1 = highest, 5 = lowest)
 */
export type ActivityPriority = 1 | 2 | 3 | 4 | 5;

// ============================================================================
// COLOR SYSTEM
// ============================================================================

/**
 * Ring colors for each activity category
 * Used in ConcentricRingsProgress component
 */
export const ACTIVITY_COLORS: Record<ActivityCategory, {
  primary: string;
  secondary: string;
  gradient: string;
  tailwind: string;
  hex: string;
}> = {
  strength: {
    primary: 'cyan',
    secondary: 'blue',
    gradient: 'from-cyan-400 to-blue-500',
    tailwind: 'text-cyan-500',
    hex: '#06B6D4', // Tailwind cyan-500
  },
  cardio: {
    primary: 'lime',
    secondary: 'green',
    gradient: 'from-lime-400 to-green-500',
    tailwind: 'text-lime-500',
    hex: '#84CC16', // Tailwind lime-500
  },
  maintenance: {
    primary: 'purple',
    secondary: 'violet',
    gradient: 'from-purple-400 to-violet-500',
    tailwind: 'text-purple-500',
    hex: '#A855F7', // Tailwind purple-500
  },
};

/**
 * Ring labels in Hebrew
 */
export const ACTIVITY_LABELS: Record<ActivityCategory, {
  he: string;
  en: string;
  icon: string;
}> = {
  strength: {
    he: 'כוח',
    en: 'Strength',
    icon: 'fitness_center',
  },
  cardio: {
    he: 'קרדיו',
    en: 'Cardio',
    icon: 'directions_run',
  },
  maintenance: {
    he: 'תחזוקה',
    en: 'Maintenance',
    icon: 'self_improvement',
  },
};

// ============================================================================
// ACTIVITY METRICS
// ============================================================================

/**
 * Daily activity metrics for a single category
 */
export interface CategoryMetrics {
  /** Minutes spent in this category today */
  minutes: number;
  /** Daily goal in minutes */
  goalMinutes: number;
  /** Weekly accumulated minutes */
  weeklyMinutes: number;
  /** Weekly goal in minutes */
  weeklyGoalMinutes: number;
  /** Completion percentage (0-100) */
  percentage: number;
  /** Whether daily goal is met */
  isGoalMet: boolean;
}

/**
 * Full daily activity record
 */
export interface DailyActivity {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** User ID */
  userId: string;
  
  /** Activity metrics by category */
  categories: Record<ActivityCategory, CategoryMetrics>;
  
  /** Total steps taken today */
  steps: number;
  /** Steps goal */
  stepsGoal: number;
  /** Whether steps goal is met */
  stepsGoalMet: boolean;
  
  /** Total floors climbed */
  floors: number;
  /** Floors goal */
  floorsGoal: number;
  /** Whether floors goal is met */
  floorsGoalMet: boolean;
  
  /** Total calories burned */
  calories: number;
  
  /** Activity type for the day (for calendar dot) */
  activityType: ActivityType;
  
  /** Current streak (consecutive days with > 10 mins activity) */
  streak: number;
  
  /** Dominant activity color based on highest percentage */
  dominantCategory: ActivityCategory | null;
  
  /** Timestamp of last update */
  updatedAt: Date;
}

/**
 * Weekly activity summary
 */
export interface WeeklyActivitySummary {
  /** Week start date (Sunday) */
  weekStart: string;
  /** Week end date (Saturday) */
  weekEnd: string;
  
  /** Total minutes per category for the week */
  categoryTotals: Record<ActivityCategory, number>;
  
  /** Weekly goals per category */
  categoryGoals: Record<ActivityCategory, number>;
  
  /** Completion percentages per category */
  categoryPercentages: Record<ActivityCategory, number>;
  
  /** Days with activity this week */
  activeDays: number;
  
  /** Current streak at end of week */
  streakAtWeekEnd: number;
  
  /** Dominant category for the week */
  dominantCategory: ActivityCategory;
  
  /** Total steps for the week */
  totalSteps: number;
  
  /** Total calories for the week */
  totalCalories: number;
}

// ============================================================================
// RING DATA STRUCTURE
// ============================================================================

/**
 * Data for a single ring in the concentric display
 */
export interface RingData {
  /** Ring identifier */
  id: ActivityCategory;
  /** Display label */
  label: string;
  /** Current value (minutes) */
  value: number;
  /** Maximum/goal value (minutes) */
  max: number;
  /** Completion percentage (0-100) */
  percentage: number;
  /** Ring color (hex) */
  color: string;
  /** Tailwind color class */
  colorClass: string;
  /** Ring order (0 = outermost) */
  order: number;
  /** Icon name */
  icon: string;
}

/**
 * Priority order configuration based on user's program
 */
export interface PriorityConfig {
  /** Program identifier */
  programId: string;
  /** Ring order from outermost (index 0) to innermost (index 2) */
  ringOrder: [ActivityCategory, ActivityCategory, ActivityCategory];
  /** Default daily goals in minutes */
  dailyGoals: Record<ActivityCategory, number>;
  /** Default weekly goals in minutes */
  weeklyGoals: Record<ActivityCategory, number>;
}

// ============================================================================
// CALENDAR DOT DATA
// ============================================================================

/**
 * Data for a single day's calendar dot
 */
export interface DayDotData {
  /** ISO date string */
  date: string;
  /** Day letter (Hebrew) */
  dayLetter: string;
  /** Activity type for display */
  activityType: ActivityType;
  /** Whether this is today */
  isToday: boolean;
  /** Whether this is a scheduled training day */
  isTrainingDay: boolean;
  /** Dominant color for the dot */
  dotColor: string;
  /** Minutes of activity */
  totalMinutes: number;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default daily goals in minutes
 */
export const DEFAULT_DAILY_GOALS: Record<ActivityCategory, number> = {
  strength: 30,
  cardio: 30,
  maintenance: 15,
};

/**
 * Default weekly goals in minutes
 */
export const DEFAULT_WEEKLY_GOALS: Record<ActivityCategory, number> = {
  strength: 150, // ~5 sessions of 30 mins
  cardio: 150,   // ~5 sessions of 30 mins
  maintenance: 60, // ~4 sessions of 15 mins
};

/**
 * Minimum activity duration to count towards streak (minutes)
 */
export const STREAK_MINIMUM_MINUTES = 10;

/**
 * Create empty category metrics
 */
export function createEmptyCategoryMetrics(
  goalMinutes: number = 30,
  weeklyGoalMinutes: number = 150
): CategoryMetrics {
  return {
    minutes: 0,
    goalMinutes,
    weeklyMinutes: 0,
    weeklyGoalMinutes,
    percentage: 0,
    isGoalMet: false,
  };
}

/**
 * Create empty daily activity
 */
export function createEmptyDailyActivity(
  userId: string,
  date: string = new Date().toISOString().split('T')[0]
): DailyActivity {
  return {
    date,
    userId,
    categories: {
      strength: createEmptyCategoryMetrics(DEFAULT_DAILY_GOALS.strength, DEFAULT_WEEKLY_GOALS.strength),
      cardio: createEmptyCategoryMetrics(DEFAULT_DAILY_GOALS.cardio, DEFAULT_WEEKLY_GOALS.cardio),
      maintenance: createEmptyCategoryMetrics(DEFAULT_DAILY_GOALS.maintenance, DEFAULT_WEEKLY_GOALS.maintenance),
    },
    steps: 0,
    stepsGoal: 8000,
    stepsGoalMet: false,
    floors: 0,
    floorsGoal: 10,
    floorsGoalMet: false,
    calories: 0,
    activityType: 'none',
    streak: 0,
    dominantCategory: null,
    updatedAt: new Date(),
  };
}
