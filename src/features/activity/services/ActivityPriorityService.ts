/**
 * Activity Priority Service
 * 
 * Determines the order and priority of activity rings based on the user's
 * primary program/goal. This service dictates:
 * - Order of concentric rings (outermost = primary focus)
 * - Default daily/weekly goals
 * - Ring colors and emphasis
 * 
 * Priority Philosophy:
 * - The outermost ring represents the user's primary focus
 * - Inner rings support the primary goal
 * - All activities contribute to overall health
 */

import {
  ActivityCategory,
  PriorityConfig,
  RingData,
  DailyActivity,
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  DEFAULT_DAILY_GOALS,
  DEFAULT_WEEKLY_GOALS,
} from '../types/activity.types';

// ============================================================================
// PROGRAM MAPPINGS
// ============================================================================

/**
 * Known program identifiers and their aliases
 */
export const PROGRAM_ALIASES: Record<string, string[]> = {
  // Strength-focused programs
  strength: ['strength', 'calisthenics', 'upper_body', 'lower_body', 'full_body', 'push', 'pull', 'planche', 'front_lever', 'muscle_up', 'handstand'],
  
  // Cardio-focused programs
  cardio: ['running', 'cardio', 'walking', 'cycling', 'swimming', 'hiit'],
  
  // Balanced/lifestyle programs
  lifestyle: ['healthy_lifestyle', 'wellness', 'general', 'maintenance', 'flexibility', 'mobility', 'recovery'],
};

/**
 * Priority configurations for each program type
 */
export const PRIORITY_CONFIGS: Record<string, PriorityConfig> = {
  // Strength-focused: Strength → Cardio → Maintenance
  strength: {
    programId: 'strength',
    ringOrder: ['strength', 'cardio', 'maintenance'],
    dailyGoals: {
      strength: 45,  // Higher goal for primary focus
      cardio: 20,    // Supportive cardio
      maintenance: 15,
    },
    weeklyGoals: {
      strength: 200, // ~4-5 sessions
      cardio: 90,    // ~3 sessions
      maintenance: 60,
    },
  },
  
  // Cardio-focused: Cardio → Strength → Maintenance
  cardio: {
    programId: 'cardio',
    ringOrder: ['cardio', 'strength', 'maintenance'],
    dailyGoals: {
      cardio: 45,    // Higher goal for primary focus
      strength: 20,  // Supportive strength
      maintenance: 15,
    },
    weeklyGoals: {
      cardio: 200,   // ~4-5 sessions
      strength: 90,  // ~3 sessions
      maintenance: 60,
    },
  },
  
  // Lifestyle-focused: Cardio → Maintenance → Strength
  lifestyle: {
    programId: 'lifestyle',
    ringOrder: ['cardio', 'maintenance', 'strength'],
    dailyGoals: {
      cardio: 30,       // Balanced cardio
      maintenance: 30,  // Higher maintenance for wellness
      strength: 20,     // Light strength
    },
    weeklyGoals: {
      cardio: 150,
      maintenance: 120,
      strength: 90,
    },
  },
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ActivityPriorityService {
  
  /**
   * Get the priority configuration for a user's program
   * 
   * @param userProgram - The user's primary program ID
   * @returns PriorityConfig with ring order and goals
   * 
   * @example
   * const config = activityPriorityService.getPriorityConfig('calisthenics');
   * // Returns strength-focused config: [strength, cardio, maintenance]
   */
  getPriorityConfig(userProgram: string): PriorityConfig {
    const normalizedProgram = userProgram.toLowerCase().trim();
    
    // Check strength programs
    if (PROGRAM_ALIASES.strength.includes(normalizedProgram)) {
      return PRIORITY_CONFIGS.strength;
    }
    
    // Check cardio programs
    if (PROGRAM_ALIASES.cardio.includes(normalizedProgram)) {
      return PRIORITY_CONFIGS.cardio;
    }
    
    // Check lifestyle programs
    if (PROGRAM_ALIASES.lifestyle.includes(normalizedProgram)) {
      return PRIORITY_CONFIGS.lifestyle;
    }
    
    // Default to strength-focused (most common for calisthenics app)
    return PRIORITY_CONFIGS.strength;
  }

  /**
   * Get ring order based on user's program
   * 
   * @param userProgram - The user's primary program ID
   * @returns Array of categories in display order (outermost first)
   */
  getPriorityOrder(userProgram: string): [ActivityCategory, ActivityCategory, ActivityCategory] {
    return this.getPriorityConfig(userProgram).ringOrder;
  }

  /**
   * Get daily goals based on user's program
   */
  getDailyGoals(userProgram: string): Record<ActivityCategory, number> {
    return this.getPriorityConfig(userProgram).dailyGoals;
  }

  /**
   * Get weekly goals based on user's program
   */
  getWeeklyGoals(userProgram: string): Record<ActivityCategory, number> {
    return this.getPriorityConfig(userProgram).weeklyGoals;
  }

  /**
   * Build ring data array for the ConcentricRingsProgress component
   * 
   * @param activity - Current daily activity data
   * @param userProgram - The user's primary program
   * @returns Array of RingData sorted by priority (outermost first)
   */
  buildRingData(activity: DailyActivity, userProgram: string): RingData[] {
    const priorityOrder = this.getPriorityOrder(userProgram);
    
    return priorityOrder.map((category, index) => {
      const metrics = activity.categories[category];
      const colors = ACTIVITY_COLORS[category];
      const labels = ACTIVITY_LABELS[category];
      
      return {
        id: category,
        label: labels.he,
        value: metrics.minutes,
        max: metrics.goalMinutes,
        percentage: metrics.percentage,
        color: colors.hex,
        colorClass: colors.tailwind,
        order: index,
        icon: labels.icon,
      };
    });
  }

  /**
   * Calculate the dominant activity category for today/week
   * Based on which category has the highest completion percentage
   * 
   * @param activity - Daily activity data
   * @returns The dominant category, or null if no activity
   */
  calculateDominantCategory(activity: DailyActivity): ActivityCategory | null {
    const categories = activity.categories;
    
    let maxPercentage = 0;
    let dominant: ActivityCategory | null = null;
    
    (Object.keys(categories) as ActivityCategory[]).forEach(category => {
      const percentage = categories[category].percentage;
      if (percentage > maxPercentage) {
        maxPercentage = percentage;
        dominant = category;
      }
    });
    
    // Only return dominant if there's meaningful activity (>10%)
    return maxPercentage > 10 ? dominant : null;
  }

  /**
   * Get the color for the "path" or dominant activity
   * Used for dynamic path coloring in visualizations
   * 
   * @param activity - Daily activity data
   * @param userProgram - User's primary program (fallback color)
   * @returns Hex color code
   */
  getDominantActivityColor(activity: DailyActivity, userProgram: string): string {
    const dominant = this.calculateDominantCategory(activity);
    
    if (dominant) {
      return ACTIVITY_COLORS[dominant].hex;
    }
    
    // Fallback to primary program color
    const priorityOrder = this.getPriorityOrder(userProgram);
    return ACTIVITY_COLORS[priorityOrder[0]].hex;
  }

  /**
   * Determine activity type for calendar dot based on daily metrics
   * 
   * @param activity - Daily activity data
   * @returns ActivityType for the dot display
   */
  determineActivityType(activity: DailyActivity): 'super' | 'micro' | 'survival' | 'none' {
    const totalMinutes = Object.values(activity.categories)
      .reduce((sum, cat) => sum + cat.minutes, 0);
    
    // Super: Completed a full workout (any category goal met + significant time)
    const anyGoalMet = Object.values(activity.categories).some(cat => cat.isGoalMet);
    if (anyGoalMet && totalMinutes >= 30) {
      return 'super';
    }
    
    // Micro: Hit adaptive goal (steps/floors) or partial activity
    if (activity.stepsGoalMet || activity.floorsGoalMet || totalMinutes >= 15) {
      return 'micro';
    }
    
    // Survival: Some activity but below threshold
    if (totalMinutes >= 5 || activity.steps >= 3000) {
      return 'survival';
    }
    
    return 'none';
  }

  /**
   * Calculate streak based on activity history
   * Streak counts consecutive days with > 10 minutes of total activity
   * 
   * @param activityHistory - Array of past daily activities (most recent first)
   * @returns Current streak count
   */
  calculateStreak(activityHistory: DailyActivity[]): number {
    let streak = 0;
    
    for (const day of activityHistory) {
      const totalMinutes = Object.values(day.categories)
        .reduce((sum, cat) => sum + cat.minutes, 0);
      
      if (totalMinutes >= 10) {
        streak++;
      } else {
        break; // Streak broken
      }
    }
    
    return streak;
  }

  /**
   * Get suggested focus for today based on weekly progress
   * 
   * @param weeklyActivity - Weekly activity summary
   * @param userProgram - User's primary program
   * @returns The category that needs the most attention
   */
  getSuggestedFocus(
    weeklyActivity: Record<ActivityCategory, number>,
    weeklyGoals: Record<ActivityCategory, number>,
    userProgram: string
  ): ActivityCategory {
    const priorityOrder = this.getPriorityOrder(userProgram);
    
    // Find the category with lowest completion percentage
    let lowestPercentage = 100;
    let suggested: ActivityCategory = priorityOrder[0];
    
    priorityOrder.forEach(category => {
      const percentage = (weeklyActivity[category] / weeklyGoals[category]) * 100;
      if (percentage < lowestPercentage) {
        lowestPercentage = percentage;
        suggested = category;
      }
    });
    
    return suggested;
  }

  /**
   * Get motivational message based on today's progress
   */
  getProgressMessage(activity: DailyActivity, userProgram: string): string {
    const dominant = this.calculateDominantCategory(activity);
    const priorityOrder = this.getPriorityOrder(userProgram);
    const primaryCategory = priorityOrder[0];
    const primaryMetrics = activity.categories[primaryCategory];
    
    if (primaryMetrics.isGoalMet) {
      return `🎉 השלמת את יעד ה${ACTIVITY_LABELS[primaryCategory].he} להיום!`;
    }
    
    if (primaryMetrics.percentage >= 75) {
      return `💪 כמעט שם! עוד ${primaryMetrics.goalMinutes - primaryMetrics.minutes} דקות ${ACTIVITY_LABELS[primaryCategory].he}`;
    }
    
    if (primaryMetrics.percentage >= 50) {
      return `🔥 חצי מהדרך! המשך כך`;
    }
    
    if (dominant && dominant !== primaryCategory) {
      return `✨ עשית ${ACTIVITY_LABELS[dominant].he} - מעולה! מה עם קצת ${ACTIVITY_LABELS[primaryCategory].he}?`;
    }
    
    return `👋 בוא נתחיל את היום עם ${ACTIVITY_LABELS[primaryCategory].he}`;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const activityPriorityService = new ActivityPriorityService();

// Export individual functions for convenience
export const getPriorityOrder = (program: string) => 
  activityPriorityService.getPriorityOrder(program);

export const getPriorityConfig = (program: string) => 
  activityPriorityService.getPriorityConfig(program);

export const buildRingData = (activity: DailyActivity, program: string) => 
  activityPriorityService.buildRingData(activity, program);

export const getDominantActivityColor = (activity: DailyActivity, program: string) => 
  activityPriorityService.getDominantActivityColor(activity, program);
