/**
 * Tracking Matrix Types
 * 
 * The Shadow Tracking Matrix (Rule #13 from TRAINING_LOGIC.md)
 * 
 * User View: "Full Body Program - Level 10"
 * System View: Decoupled progression per movement pattern:
 *   - vertical_pull: Level 12
 *   - horizontal_push: Level 8
 *   - squat: Level 4
 * 
 * This allows the algorithm to select exercises matching the user's
 * actual capability in each movement pattern, not a global average.
 */

/**
 * Movement patterns for the tracking matrix
 * These are distinct from TrainingDomainId - they represent
 * biomechanical movement patterns, not program categories.
 */
export type MovementPattern =
  // Push patterns
  | 'horizontal_push'   // Push-ups, Bench Press
  | 'vertical_push'     // Overhead Press, Handstand Push-ups
  // Pull patterns
  | 'horizontal_pull'   // Rows, Face Pulls
  | 'vertical_pull'     // Pull-ups, Lat Pulldowns
  // Lower body patterns
  | 'squat'             // Squats, Lunges
  | 'hinge'             // Deadlifts, Hip Thrusts, RDLs
  // Core patterns
  | 'core_anti_extension'  // Planks, Ab Rollouts
  | 'core_anti_rotation'   // Pallof Press, Bird Dogs
  | 'core_flexion'         // Crunches, Leg Raises
  // Skill patterns (Calisthenics specific)
  | 'handstand_balance'    // Handstand holds
  | 'front_lever'          // Front Lever progressions
  | 'back_lever'           // Back Lever progressions
  | 'planche'              // Planche progressions
  | 'muscle_up'            // Muscle-up progressions
  | 'one_arm_pull'         // One Arm Pull-up progressions
  // Mobility
  | 'mobility_upper'       // Shoulder/Thoracic mobility
  | 'mobility_lower';      // Hip/Ankle mobility

/**
 * Level tracking for a single movement pattern
 */
export interface MovementPatternLevel {
  /** Current level (1-22+) */
  currentLevel: number;
  
  /** Progress within current level (0-100%) */
  progressPercent: number;
  
  /** Last date this pattern was trained */
  lastTrainedAt?: Date;
  
  /** Number of consecutive "Too Hard" swaps (for auto-regression) */
  failureStreak: number;
  
  /** Historical max level achieved (for deload reference) */
  peakLevel: number;
}

/**
 * The Shadow Tracking Matrix
 * 
 * This is the TRUE representation of user's capability.
 * The algorithm uses this to select appropriate exercises,
 * while the user sees a simplified "Global Level" display.
 */
export interface TrackingMatrix {
  /**
   * Per-movement pattern progression
   * Key: MovementPattern
   * Value: Level data
   */
  movements: Partial<Record<MovementPattern, MovementPatternLevel>>;
  
  /**
   * Display level for UI (simplified view)
   * Calculated from weighted average of active patterns
   */
  displayLevel: number;
  
  /**
   * Last full recalculation timestamp
   */
  lastRecalculatedAt: Date;
}

/**
 * Movement pattern to exercise mapping hint
 * Used by the algorithm to select exercises from the DB
 */
export interface MovementPatternMapping {
  pattern: MovementPattern;
  /** Tags or keywords to search in exercise database */
  exerciseTags: string[];
  /** Movement group in Exercise schema */
  movementGroup?: string;
}

/**
 * Default mapping from MovementPattern to exercise lookup
 */
export const MOVEMENT_PATTERN_MAPPINGS: MovementPatternMapping[] = [
  { pattern: 'horizontal_push', exerciseTags: ['push', 'chest', 'pushup'], movementGroup: 'horizontal_push' },
  { pattern: 'vertical_push', exerciseTags: ['overhead', 'shoulder', 'handstand'], movementGroup: 'vertical_push' },
  { pattern: 'horizontal_pull', exerciseTags: ['row', 'pull', 'back'], movementGroup: 'horizontal_pull' },
  { pattern: 'vertical_pull', exerciseTags: ['pullup', 'chinup', 'lat'], movementGroup: 'vertical_pull' },
  { pattern: 'squat', exerciseTags: ['squat', 'lunge', 'leg'], movementGroup: 'squat' },
  { pattern: 'hinge', exerciseTags: ['deadlift', 'hip', 'glute', 'hinge'], movementGroup: 'hinge' },
  { pattern: 'core_anti_extension', exerciseTags: ['plank', 'rollout', 'core'], movementGroup: 'core' },
  { pattern: 'core_anti_rotation', exerciseTags: ['pallof', 'rotation', 'core'], movementGroup: 'core' },
  { pattern: 'core_flexion', exerciseTags: ['crunch', 'leg raise', 'abs'], movementGroup: 'core' },
  { pattern: 'handstand_balance', exerciseTags: ['handstand', 'balance'], movementGroup: 'vertical_push' },
  { pattern: 'front_lever', exerciseTags: ['front lever', 'fl'], movementGroup: 'horizontal_pull' },
  { pattern: 'back_lever', exerciseTags: ['back lever', 'bl'], movementGroup: 'horizontal_pull' },
  { pattern: 'planche', exerciseTags: ['planche'], movementGroup: 'horizontal_push' },
  { pattern: 'muscle_up', exerciseTags: ['muscle up', 'muscle-up'], movementGroup: 'vertical_pull' },
  { pattern: 'one_arm_pull', exerciseTags: ['one arm', 'oac', 'oap'], movementGroup: 'vertical_pull' },
  { pattern: 'mobility_upper', exerciseTags: ['mobility', 'stretch', 'shoulder'], movementGroup: 'core' },
  { pattern: 'mobility_lower', exerciseTags: ['mobility', 'stretch', 'hip'], movementGroup: 'core' },
];

/**
 * Calculate the display level from a TrackingMatrix
 * Uses weighted average based on pattern frequency/importance
 */
export function calculateDisplayLevel(matrix: TrackingMatrix): number {
  const patterns = Object.values(matrix.movements);
  if (patterns.length === 0) return 1;
  
  // Weight skill patterns higher (they take longer to develop)
  const skillPatterns = ['handstand_balance', 'front_lever', 'back_lever', 'planche', 'muscle_up', 'one_arm_pull'];
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const [pattern, data] of Object.entries(matrix.movements)) {
    if (!data) continue;
    
    const isSkill = skillPatterns.includes(pattern);
    const weight = isSkill ? 1.5 : 1.0;
    
    totalWeight += weight;
    weightedSum += data.currentLevel * weight;
  }
  
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 1;
}

/**
 * Create an empty TrackingMatrix with default values
 */
export function createEmptyTrackingMatrix(initialLevel: number = 1): TrackingMatrix {
  return {
    movements: {},
    displayLevel: initialLevel,
    lastRecalculatedAt: new Date(),
  };
}

/**
 * Get or create a movement pattern level in the matrix
 */
export function getMovementLevel(
  matrix: TrackingMatrix,
  pattern: MovementPattern
): MovementPatternLevel {
  if (!matrix.movements[pattern]) {
    matrix.movements[pattern] = {
      currentLevel: matrix.displayLevel,
      progressPercent: 0,
      failureStreak: 0,
      peakLevel: matrix.displayLevel,
    };
  }
  return matrix.movements[pattern]!;
}
