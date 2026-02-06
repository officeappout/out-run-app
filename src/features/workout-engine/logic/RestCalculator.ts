/**
 * RestCalculator - Dynamic Rest Time Logic
 * 
 * Based on TRAINING_LOGIC.md Section 3.2 (Dynamic Rest Timers)
 * 
 * Rest times are derived from the *Exercise Type* and *Level*:
 * - Skills / Heavy Strength (1-5 Reps): 180s (3 mins)
 * - Hypertrophy (6-12 Reps): 90s - 120s
 * - Endurance / Accessory (12+ Reps): 45s - 60s
 * 
 * Rule #17: If a Static Hold is short (4-8s), increase SETS (4-6) and keep REST long.
 * 
 * ISOMORPHIC: Pure TypeScript, no React hooks
 */

import { SlotType, SetType } from '../core/types/blueprint.types';
import { MovementPattern } from '../core/types/tracking-matrix.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Exercise type categories for rest calculation
 */
export type ExerciseCategory = 
  | 'skill'           // Skill work (high complexity)
  | 'strength'        // Heavy strength (1-5 reps)
  | 'hypertrophy'     // Moderate (6-12 reps)
  | 'endurance'       // Light (12+ reps)
  | 'static_hold'     // Isometric holds
  | 'mobility'        // Stretching/mobility
  | 'follow_along';   // Video-guided (warmup/cooldown)

/**
 * Parameters for rest calculation
 */
export interface RestCalculationParams {
  /** Target reps (or seconds for holds) */
  reps: number;
  
  /** Slot type (golden, compound, accessory) */
  slotType: SlotType;
  
  /** Set type (straight, antagonist_pair, etc.) */
  setType: SetType;
  
  /** Movement pattern */
  movementPattern: MovementPattern;
  
  /** User's level for this movement (1-22) */
  userLevel: number;
  
  /** Is this a static/isometric exercise? */
  isStatic: boolean;
  
  /** Is this a follow-along video? */
  isFollowAlong: boolean;
  
  /** Current set number (1-indexed) */
  currentSet: number;
  
  /** Total sets planned */
  totalSets: number;
}

/**
 * Result of rest calculation
 */
export interface RestCalculationResult {
  /** Rest time in seconds */
  restSeconds: number;
  
  /** Category used for calculation */
  category: ExerciseCategory;
  
  /** Explanation for debugging */
  reason: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base rest times by category (in seconds)
 */
const BASE_REST_TIMES: Record<ExerciseCategory, { min: number; max: number }> = {
  skill: { min: 180, max: 240 },        // 3-4 minutes
  strength: { min: 150, max: 180 },     // 2.5-3 minutes
  hypertrophy: { min: 90, max: 120 },   // 1.5-2 minutes
  endurance: { min: 45, max: 60 },      // 45-60 seconds
  static_hold: { min: 120, max: 180 },  // 2-3 minutes (short holds need more rest)
  mobility: { min: 10, max: 30 },       // Minimal rest
  follow_along: { min: 0, max: 0 },     // No rest (video controls pacing)
};

/**
 * Rest modifiers for set types
 */
const SET_TYPE_MODIFIERS: Record<SetType, number> = {
  straight: 1.0,
  antagonist_pair: 0.5,  // 30s between pair, 90s after pair
  superset: 0.3,         // Minimal rest within superset
  dropset: 0.2,          // Very short rest in dropsets
  rest_pause: 0.15,      // ~15-20s for rest-pause
  amrap: 1.0,            // Full rest after AMRAP
};

/**
 * Level-based modifiers
 * Advanced users (Level 10+) may need more rest for heavier loads
 */
const LEVEL_REST_ADJUSTMENT = {
  beginner: { maxLevel: 5, modifier: 0.85 },    // Beginners need slightly less
  intermediate: { maxLevel: 10, modifier: 1.0 }, // Standard
  advanced: { maxLevel: 15, modifier: 1.1 },     // Slightly more
  elite: { maxLevel: 22, modifier: 1.2 },        // Maximum rest for elite
};

/**
 * Skill movement patterns (require longer rest for CNS recovery)
 */
const SKILL_PATTERNS: MovementPattern[] = [
  'handstand_balance',
  'front_lever',
  'back_lever',
  'planche',
  'muscle_up',
  'one_arm_pull',
];

// ============================================================================
// REST CALCULATOR CLASS
// ============================================================================

/**
 * RestCalculator - Pure TypeScript class for rest time calculation
 * ISOMORPHIC: No React hooks, no browser APIs
 */
export class RestCalculator {
  
  /**
   * Calculate rest time for a given exercise/set
   */
  calculate(params: RestCalculationParams): RestCalculationResult {
    // Step 1: Determine exercise category
    const category = this.determineCategory(params);
    
    // Step 2: Get base rest time for category
    const baseRest = this.getBaseRestTime(category, params);
    
    // Step 3: Apply set type modifier
    const setTypeModifier = SET_TYPE_MODIFIERS[params.setType] || 1.0;
    let restSeconds = baseRest * setTypeModifier;
    
    // Step 4: Apply level modifier
    const levelModifier = this.getLevelModifier(params.userLevel);
    restSeconds = restSeconds * levelModifier;
    
    // Step 5: Apply slot type adjustments
    if (params.slotType === 'golden') {
      // Golden slot (skills) always gets full rest
      restSeconds = Math.max(restSeconds, 150);
    } else if (params.slotType === 'accessory') {
      // Accessories can have shorter rest
      restSeconds = Math.min(restSeconds, 90);
    }
    
    // Step 6: Special case for static holds (Rule #17)
    if (params.isStatic && params.reps <= 8) {
      // Short holds (4-8s) need longer rest between sets
      restSeconds = Math.max(restSeconds, 120);
    }
    
    // Step 7: Last set might have different rest (before next exercise)
    if (params.currentSet === params.totalSets) {
      // Between exercises rest (slightly longer)
      restSeconds = restSeconds * 1.1;
    }
    
    // Round to nearest 5 seconds for cleaner display
    restSeconds = Math.round(restSeconds / 5) * 5;
    
    // Ensure minimum of 10 seconds (except for follow-along)
    if (category !== 'follow_along') {
      restSeconds = Math.max(10, restSeconds);
    }
    
    return {
      restSeconds,
      category,
      reason: this.buildReason(category, params, restSeconds),
    };
  }
  
  /**
   * Determine exercise category based on parameters
   */
  private determineCategory(params: RestCalculationParams): ExerciseCategory {
    // Follow-along videos
    if (params.isFollowAlong) {
      return 'follow_along';
    }
    
    // Mobility work
    if (params.movementPattern.includes('mobility') || 
        params.slotType === 'warmup' || 
        params.slotType === 'cooldown') {
      return 'mobility';
    }
    
    // Skill patterns
    if (SKILL_PATTERNS.includes(params.movementPattern)) {
      return 'skill';
    }
    
    // Static holds
    if (params.isStatic) {
      return 'static_hold';
    }
    
    // Rep-based categorization
    if (params.reps <= 5) {
      return 'strength';
    } else if (params.reps <= 12) {
      return 'hypertrophy';
    } else {
      return 'endurance';
    }
  }
  
  /**
   * Get base rest time for a category
   */
  private getBaseRestTime(category: ExerciseCategory, params: RestCalculationParams): number {
    const range = BASE_REST_TIMES[category];
    
    // Interpolate based on reps within the category
    // Lower reps = more rest (closer to max)
    // Higher reps = less rest (closer to min)
    
    if (category === 'strength') {
      // For strength (1-5 reps), closer to 5 = less rest
      const ratio = (5 - params.reps) / 4; // 1 rep = 1.0, 5 reps = 0.0
      return range.min + (range.max - range.min) * ratio;
    }
    
    if (category === 'hypertrophy') {
      // For hypertrophy (6-12 reps), closer to 6 = more rest
      const ratio = (12 - params.reps) / 6;
      return range.min + (range.max - range.min) * ratio;
    }
    
    // Default: use midpoint
    return (range.min + range.max) / 2;
  }
  
  /**
   * Get level-based rest modifier
   */
  private getLevelModifier(level: number): number {
    if (level <= LEVEL_REST_ADJUSTMENT.beginner.maxLevel) {
      return LEVEL_REST_ADJUSTMENT.beginner.modifier;
    }
    if (level <= LEVEL_REST_ADJUSTMENT.intermediate.maxLevel) {
      return LEVEL_REST_ADJUSTMENT.intermediate.modifier;
    }
    if (level <= LEVEL_REST_ADJUSTMENT.advanced.maxLevel) {
      return LEVEL_REST_ADJUSTMENT.advanced.modifier;
    }
    return LEVEL_REST_ADJUSTMENT.elite.modifier;
  }
  
  /**
   * Build explanation string for debugging
   */
  private buildReason(
    category: ExerciseCategory,
    params: RestCalculationParams,
    finalRest: number
  ): string {
    return `Category: ${category}, Reps: ${params.reps}, Level: ${params.userLevel}, SetType: ${params.setType} → ${finalRest}s`;
  }
  
  /**
   * Get rest time for antagonist pair
   * Rule: Push -> 30s -> Pull -> 90s -> Next pair
   */
  calculateAntagonistPairRest(params: RestCalculationParams): {
    betweenExercises: number;
    afterPair: number;
  } {
    const fullRest = this.calculate(params);
    
    return {
      betweenExercises: 30, // 30s between push and pull
      afterPair: fullRest.restSeconds, // Full rest after the pair
    };
  }
  
  /**
   * Get recommended sets for static holds (Rule #17)
   * If hold is short (4-8s), increase sets to 4-6
   */
  getRecommendedSetsForHold(holdDurationSeconds: number): {
    sets: number;
    restSeconds: number;
  } {
    if (holdDurationSeconds <= 8) {
      // Short holds: more sets, longer rest
      return { sets: 5, restSeconds: 150 };
    } else if (holdDurationSeconds <= 15) {
      // Medium holds: moderate sets
      return { sets: 4, restSeconds: 120 };
    } else if (holdDurationSeconds <= 30) {
      // Longer holds: standard sets
      return { sets: 3, restSeconds: 90 };
    } else {
      // Very long holds: fewer sets
      return { sets: 2, restSeconds: 60 };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new RestCalculator instance
 * ISOMORPHIC: Can be called from server or client
 */
export function createRestCalculator(): RestCalculator {
  return new RestCalculator();
}

/**
 * Quick rest time lookup (convenience function)
 */
export function getRestSeconds(params: RestCalculationParams): number {
  const calculator = createRestCalculator();
  return calculator.calculate(params).restSeconds;
}

/**
 * Get simple rest time by rep range (quick lookup)
 */
export function getSimpleRestByReps(reps: number, isSkill: boolean = false): number {
  if (isSkill) {
    return 180; // 3 minutes for skills
  }
  
  if (reps <= 5) {
    return 150; // 2.5 minutes for strength
  } else if (reps <= 12) {
    return 90; // 1.5 minutes for hypertrophy
  } else {
    return 45; // 45 seconds for endurance
  }
}
