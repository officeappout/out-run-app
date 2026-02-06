/**
 * SwapEngine - Exercise Replacement Logic
 * 
 * Based on WORKOUT_ENGINE_SPECS.md Section 3.1 (Shadow Replacement Mechanism)
 * 
 * When a user requests to swap an exercise, the SwapEngine must ask/infer the Reason:
 * 
 * Case A: "Equipment Occupied / Missing" (Contextual Issue)
 *   Action: Find an alternative in the same MovementGroup + same Level.
 *   Persistence: None. Do not save this preference to the User Profile.
 *   It is a one-time "Shadow Swap" for this session only.
 * 
 * Case B: "Too Hard / Pain" (Capability Issue)
 *   Action: Find a Regression (Level - 1) or an Injury Variation.
 *   Persistence: Update TrackingMatrix. Downgrade the user's level for this
 *   specific movement pattern so next time they get the correct level.
 * 
 * ISOMORPHIC: Pure TypeScript, no React hooks
 */

import { MovementPattern, TrackingMatrix, getMovementLevel } from '../core/types/tracking-matrix.types';
import { ExerciseInstance, FilledSlot, GenerationContext } from '../core/types/blueprint.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reason for swap request
 */
export type SwapReason = 
  | 'equipment'     // Equipment occupied or missing (Shadow Swap)
  | 'too_hard'      // Exercise too difficult (Permanent Downgrade)
  | 'too_easy'      // Exercise too easy (Upgrade)
  | 'injury'        // Pain or injury concern (Permanent, find variation)
  | 'preference';   // User just doesn't like it (Shadow Swap)

/**
 * Swap persistence type
 */
export type SwapPersistence = 
  | 'session_only'   // Shadow swap - no profile update
  | 'permanent';     // Update TrackingMatrix

/**
 * Exercise candidate for replacement
 */
export interface SwapCandidate {
  exerciseId: string;
  displayName: string;
  level: number;
  movementPattern: MovementPattern;
  equipment: string[];
  videoUrl?: string;
  imageUrl?: string;
  /** Score based on matching criteria (higher = better match) */
  matchScore: number;
}

/**
 * Result of swap analysis
 */
export interface SwapResult {
  /** Original exercise */
  original: ExerciseInstance;
  
  /** Recommended replacement (best match) */
  recommended: SwapCandidate | null;
  
  /** All available alternatives */
  alternatives: SwapCandidate[];
  
  /** How to persist this swap */
  persistence: SwapPersistence;
  
  /** Level adjustment for tracking matrix (for 'too_hard'/'too_easy') */
  levelAdjustment: number;
  
  /** Explanation */
  reason: string;
}

/**
 * Swap request from user
 */
export interface SwapRequest {
  /** Current exercise to swap */
  currentExercise: ExerciseInstance;
  
  /** Slot being swapped */
  slot: FilledSlot;
  
  /** Reason for swap */
  reason: SwapReason;
  
  /** Context (available equipment, location, etc.) */
  context: GenerationContext;
  
  /** User's tracking matrix */
  trackingMatrix: TrackingMatrix;
}

/**
 * Exercise database query interface
 * This allows the SwapEngine to query exercises without knowing the DB implementation
 */
export interface ExerciseQuery {
  /** Movement patterns to match */
  movementPatterns?: MovementPattern[];
  
  /** Level range */
  minLevel?: number;
  maxLevel?: number;
  
  /** Equipment requirements (empty = bodyweight only) */
  availableEquipment?: string[];
  
  /** Exclude these exercise IDs */
  excludeIds?: string[];
  
  /** Maximum results */
  limit?: number;
  
  /** Injury areas to avoid */
  avoidInjuryAreas?: string[];
}

/**
 * Exercise database interface (to be implemented externally)
 */
export interface ExerciseDatabase {
  query(params: ExerciseQuery): Promise<SwapCandidate[]>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * How many consecutive "too hard" swaps trigger a permanent downgrade
 */
const TOO_HARD_THRESHOLD = 2;

/**
 * Level adjustment by reason
 */
const LEVEL_ADJUSTMENTS: Record<SwapReason, number> = {
  equipment: 0,      // Same level, different equipment
  too_hard: -1,      // One level down
  too_easy: 1,       // One level up
  injury: 0,         // Same level, different variation
  preference: 0,     // Same level, different exercise
};

// ============================================================================
// SWAP ENGINE CLASS
// ============================================================================

/**
 * SwapEngine - Pure TypeScript class for exercise replacement logic
 * ISOMORPHIC: No React hooks, no browser APIs
 */
export class SwapEngine {
  
  /**
   * Analyze a swap request and determine the best action
   */
  analyze(request: SwapRequest): {
    persistence: SwapPersistence;
    levelAdjustment: number;
    queryParams: ExerciseQuery;
  } {
    const { reason, slot, context, trackingMatrix } = request;
    
    // Determine persistence
    let persistence: SwapPersistence = 'session_only';
    let levelAdjustment = LEVEL_ADJUSTMENTS[reason];
    
    if (reason === 'too_hard') {
      // Check failure streak
      const patternLevel = getMovementLevel(trackingMatrix, slot.movementPattern);
      if (patternLevel.failureStreak >= TOO_HARD_THRESHOLD - 1) {
        // This is the Nth failure - make it permanent
        persistence = 'permanent';
      }
    } else if (reason === 'injury') {
      // Injury swaps are always permanent (to remember the preference)
      persistence = 'permanent';
    }
    
    // Get current level for this movement
    const currentLevel = getMovementLevel(trackingMatrix, slot.movementPattern).currentLevel;
    const targetLevel = currentLevel + levelAdjustment;
    
    // Build query parameters
    const queryParams: ExerciseQuery = {
      movementPatterns: [slot.movementPattern],
      minLevel: Math.max(1, targetLevel - 1),
      maxLevel: targetLevel + 1,
      availableEquipment: context.availableEquipment,
      excludeIds: [request.currentExercise.exerciseId],
      limit: 5,
    };
    
    // Add injury filter if applicable
    if (reason === 'injury' && context.injuredAreas) {
      queryParams.avoidInjuryAreas = context.injuredAreas;
    }
    
    return {
      persistence,
      levelAdjustment,
      queryParams,
    };
  }
  
  /**
   * Execute a swap using the provided exercise database
   */
  async execute(
    request: SwapRequest,
    database: ExerciseDatabase
  ): Promise<SwapResult> {
    // Analyze the request
    const { persistence, levelAdjustment, queryParams } = this.analyze(request);
    
    // Query for alternatives
    const candidates = await database.query(queryParams);
    
    // Score and rank candidates
    const scoredCandidates = this.scoreCandidates(candidates, request);
    
    // Sort by score (descending)
    scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);
    
    // Get the best match
    const recommended = scoredCandidates[0] || null;
    
    return {
      original: request.currentExercise,
      recommended,
      alternatives: scoredCandidates,
      persistence,
      levelAdjustment,
      reason: this.buildReasonString(request.reason, persistence),
    };
  }
  
  /**
   * Score candidates based on matching criteria
   */
  private scoreCandidates(
    candidates: SwapCandidate[],
    request: SwapRequest
  ): SwapCandidate[] {
    const currentLevel = getMovementLevel(
      request.trackingMatrix, 
      request.slot.movementPattern
    ).currentLevel;
    
    return candidates.map(candidate => {
      let score = 100; // Base score
      
      // Penalize level difference
      const levelDiff = Math.abs(candidate.level - currentLevel);
      score -= levelDiff * 15;
      
      // Bonus for same movement pattern
      if (candidate.movementPattern === request.slot.movementPattern) {
        score += 20;
      }
      
      // Bonus for matching equipment
      const matchingEquipment = candidate.equipment.filter(eq => 
        request.context.availableEquipment.includes(eq)
      );
      score += matchingEquipment.length * 10;
      
      // Penalty for needing equipment not available
      const missingEquipment = candidate.equipment.filter(eq => 
        !request.context.availableEquipment.includes(eq)
      );
      score -= missingEquipment.length * 25;
      
      // Bonus if exercise has video
      if (candidate.videoUrl) {
        score += 5;
      }
      
      return {
        ...candidate,
        matchScore: Math.max(0, score),
      };
    });
  }
  
  /**
   * Build reason string for result
   */
  private buildReasonString(reason: SwapReason, persistence: SwapPersistence): string {
    const persistenceStr = persistence === 'permanent' 
      ? 'Level will be adjusted' 
      : 'This session only';
    
    const reasonMap: Record<SwapReason, string> = {
      equipment: `Equipment not available. ${persistenceStr}`,
      too_hard: `Exercise too difficult. ${persistenceStr}`,
      too_easy: `Exercise too easy. ${persistenceStr}`,
      injury: `Avoiding injury area. ${persistenceStr}`,
      preference: `User preference. ${persistenceStr}`,
    };
    
    return reasonMap[reason];
  }
  
  /**
   * Update tracking matrix after a permanent swap
   */
  applyPermanentSwap(
    matrix: TrackingMatrix,
    movementPattern: MovementPattern,
    levelAdjustment: number,
    reason: SwapReason
  ): TrackingMatrix {
    const patternLevel = getMovementLevel(matrix, movementPattern);
    
    // Update level
    patternLevel.currentLevel = Math.max(1, patternLevel.currentLevel + levelAdjustment);
    
    // Update failure streak
    if (reason === 'too_hard') {
      patternLevel.failureStreak++;
    } else if (reason === 'too_easy') {
      // Reset failure streak on upgrade
      patternLevel.failureStreak = 0;
      // Update peak if new level is higher
      if (patternLevel.currentLevel > patternLevel.peakLevel) {
        patternLevel.peakLevel = patternLevel.currentLevel;
      }
    }
    
    // Update last trained
    patternLevel.lastTrainedAt = new Date();
    
    // Update the matrix
    matrix.movements[movementPattern] = patternLevel;
    
    return matrix;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new SwapEngine instance
 * ISOMORPHIC: Can be called from server or client
 */
export function createSwapEngine(): SwapEngine {
  return new SwapEngine();
}

/**
 * Quick swap analysis (convenience function)
 */
export function analyzeSwap(request: SwapRequest): {
  persistence: SwapPersistence;
  levelAdjustment: number;
  queryParams: ExerciseQuery;
} {
  const engine = createSwapEngine();
  return engine.analyze(request);
}
