/**
 * WorkoutGenerator - Builds complete workout sessions with volume logic
 * 
 * Features:
 * - Duration-based scaling (exercise count by available time)
 * - Inactivity volume reduction ("Rust" filter)
 * - Sets/Reps calculation based on level and time
 * - Compound/Skill exercise prioritization
 * - Blast mode EMOM/AMRAP structures
 * - 3-Bolt Difficulty System (Easy/Normal/Intense)
 * - Level 1-25 support with gradual scaling
 * - Calorie & Coins calculation
 * 
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { Exercise, MechanicalType, getLocalizedText, ExerciseTag } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise, IntentMode, LifestylePersona, LIFESTYLE_LABELS } from './ContextualEngine';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Difficulty level (1-3 bolts)
 * 1 = Easy (Recovery) - exercises below user level
 * 2 = Normal - exercises at user level
 * 3 = Intense (Strength) - includes exercises above user level
 */
export type DifficultyLevel = 1 | 2 | 3;

/**
 * Workout structure types
 */
export type WorkoutStructure = 'standard' | 'emom' | 'amrap' | 'circuit';

/**
 * Single exercise in a workout with volume details
 */
export interface WorkoutExercise {
  exercise: Exercise;
  method: ScoredExercise['method'];
  mechanicalType: MechanicalType;
  
  /** Number of sets */
  sets: number;
  
  /** Reps per set OR hold time in seconds (for isometric/SA exercises) */
  reps: number;
  
  /** Whether this is a timed hold vs rep-based */
  isTimeBased: boolean;
  
  /** Rest time in seconds between sets */
  restSeconds: number;
  
  /** Exercise priority for ordering */
  priority: ExercisePriority;
  
  /** Original score from contextual engine */
  score: number;
  
  /** Why this exercise was selected */
  reasoning: string[];
  
  /** Level of this exercise in the selected program */
  programLevel?: number;
  
  /** Whether this exercise is above user's current level (for intense mode) */
  isOverLevel?: boolean;
}

/**
 * Exercise priority for workout ordering
 */
export type ExercisePriority = 'skill' | 'compound' | 'accessory' | 'isolation';

/**
 * Workout stats for calories and coins
 */
export interface WorkoutStats {
  /** Estimated calories burned */
  calories: number;
  
  /** Coins earned (linked to calories and difficulty) */
  coins: number;
  
  /** Total reps across all exercises */
  totalReps: number;
  
  /** Total hold time in seconds */
  totalHoldTime: number;
  
  /** Difficulty multiplier applied */
  difficultyMultiplier: number;
}

/**
 * Complete generated workout session
 */
export interface GeneratedWorkout {
  /** Workout title */
  title: string;
  
  /** Dynamic description based on context */
  description: string;
  
  /** AI-generated context cue */
  aiCue?: string;
  
  /** Exercises in order */
  exercises: WorkoutExercise[];
  
  /** Total estimated duration in minutes */
  estimatedDuration: number;
  
  /** Workout structure type */
  structure: WorkoutStructure;
  
  /** Difficulty level (1-3 bolts) */
  difficulty: DifficultyLevel;
  
  /** Volume adjustment info */
  volumeAdjustment?: VolumeAdjustment;
  
  /** Blast mode details if active */
  blastMode?: BlastModeDetails;
  
  /** Mechanical balance stats */
  mechanicalBalance: MechanicalBalanceSummary;
  
  /** Workout stats (calories, coins) */
  stats: WorkoutStats;
}

/**
 * Volume adjustment for inactivity
 */
export interface VolumeAdjustment {
  reason: 'inactivity' | 'beginner' | 'injury_recovery';
  reductionPercent: number;
  originalSets: number;
  adjustedSets: number;
  badge: string;
}

/**
 * Blast mode workout details
 */
export interface BlastModeDetails {
  type: 'emom' | 'amrap';
  durationMinutes: number;
  rounds?: number;
  workSeconds?: number;
  restSeconds?: number;
}

/**
 * Mechanical balance summary
 */
export interface MechanicalBalanceSummary {
  straightArm: number;
  bentArm: number;
  hybrid: number;
  ratio: string;
  isBalanced: boolean;
}

/**
 * Workout generation context
 */
export interface WorkoutGenerationContext {
  availableTime: number;           // in minutes
  userLevel: number;               // 1-25
  daysInactive: number;            // days since last workout
  intentMode: IntentMode;
  persona: LifestylePersona | null;
  location: string;
  injuryCount: number;             // number of active injury shields
  energyLevel?: 'low' | 'medium' | 'high';
  difficulty?: DifficultyLevel;    // 1=Easy, 2=Normal, 3=Intense (default: 2)
  
  // === NEW: Professional Calisthenics Context ===
  userWeight?: number;             // in kg, for MET calorie calculation
  sessionCount?: number;           // total sessions completed (for survey logic)
  isFirstSessionInProgram?: boolean; // First session = auto Difficulty 1
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Duration-based exercise count scaling
 */
const DURATION_SCALING: Record<string, { min: number; max: number; includeAccessories: boolean }> = {
  '5': { min: 2, max: 3, includeAccessories: false },    // 5-10 min: strictly compounds
  '15': { min: 4, max: 5, includeAccessories: false },   // 15-30 min
  '30': { min: 4, max: 5, includeAccessories: false },
  '45': { min: 6, max: 8, includeAccessories: true },    // 45+ min: include accessories
  '60': { min: 7, max: 10, includeAccessories: true },
};

/**
 * Base sets by level (1-25)
 * Scaling: 2 sets at L1 → 5 sets at L25
 */
const BASE_SETS_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2, 5: 2,        // Beginner: 2 sets
  6: 3, 7: 3, 8: 3, 9: 3, 10: 3,       // Intermediate: 3 sets
  11: 3, 12: 3, 13: 4, 14: 4, 15: 4,   // Advanced: 3-4 sets
  16: 4, 17: 4, 18: 4, 19: 4, 20: 4,   // Expert: 4 sets
  21: 5, 22: 5, 23: 5, 24: 5, 25: 5,   // Elite: 5 sets
};

/**
 * Get base sets for any level (fallback for levels > 25)
 */
function getBaseSets(level: number): number {
  if (level <= 0) return 2;
  if (level > 25) return 5;
  return BASE_SETS_BY_LEVEL[level] || Math.min(5, 2 + Math.floor(level / 6));
}

/**
 * Base reps by exercise type and level (1-25)
 * Standard Reps: 6-8 at L1 → 15-18 at L25
 * Holds: 15s at L1 → 60s at L25
 */
const BASE_REPS_BY_LEVEL: Record<number, { standard: number; timeBased: number }> = {
  1: { standard: 6, timeBased: 15 },
  2: { standard: 6, timeBased: 18 },
  3: { standard: 7, timeBased: 20 },
  4: { standard: 7, timeBased: 22 },
  5: { standard: 8, timeBased: 25 },
  6: { standard: 8, timeBased: 28 },
  7: { standard: 9, timeBased: 30 },
  8: { standard: 9, timeBased: 32 },
  9: { standard: 10, timeBased: 35 },
  10: { standard: 10, timeBased: 38 },
  11: { standard: 11, timeBased: 40 },
  12: { standard: 11, timeBased: 42 },
  13: { standard: 12, timeBased: 45 },
  14: { standard: 12, timeBased: 47 },
  15: { standard: 13, timeBased: 50 },
  16: { standard: 13, timeBased: 52 },
  17: { standard: 14, timeBased: 54 },
  18: { standard: 14, timeBased: 56 },
  19: { standard: 15, timeBased: 58 },
  20: { standard: 15, timeBased: 60 },
  21: { standard: 16, timeBased: 60 },
  22: { standard: 16, timeBased: 60 },
  23: { standard: 17, timeBased: 60 },
  24: { standard: 17, timeBased: 60 },
  25: { standard: 18, timeBased: 60 },
};

/**
 * Get base reps for any level (fallback for levels > 25)
 */
function getBaseReps(level: number): { standard: number; timeBased: number } {
  if (level <= 0) return { standard: 6, timeBased: 15 };
  if (level > 25) return { standard: 18, timeBased: 60 };
  return BASE_REPS_BY_LEVEL[level] || { 
    standard: Math.min(18, 6 + Math.floor(level * 0.5)),
    timeBased: Math.min(60, 15 + Math.floor(level * 1.8))
  };
}

/**
 * Rest time by priority (in seconds)
 */
const REST_BY_PRIORITY: Record<ExercisePriority, number> = {
  skill: 90,
  compound: 60,
  accessory: 45,
  isolation: 30,
};

/**
 * Rest time for over-level (intense difficulty) exercises
 * Longer rest for strength recovery
 */
const REST_FOR_OVER_LEVEL = { min: 150, max: 180 };

/**
 * Inactivity threshold for volume reduction (in days)
 */
const INACTIVITY_THRESHOLD_DAYS = 4;

/**
 * Volume reduction percentage for inactivity
 */
const INACTIVITY_VOLUME_REDUCTION = 0.25;

/**
 * =============================================================================
 * PROFESSIONAL CALISTHENICS VOLUME SYSTEM
 * =============================================================================
 * 
 * Difficulty 1 (1 Bolt - Easy/Recovery):
 *   - Sets: 3
 *   - Reps: 10-15
 *   - Focus: Technique, recovery, volume
 * 
 * Difficulty 2 (2 Bolts - Challenging):
 *   - Sets: 3-4
 *   - Reps: 6-8
 *   - Focus: Hypertrophy, strength-endurance
 * 
 * Difficulty 3 (3 Bolts - Intense/Strength):
 *   - Sets: 4-5
 *   - Reps: 1-6 (flexible ranges)
 *   - Focus: Max strength, skill acquisition
 */
const DIFFICULTY_VOLUME: Record<DifficultyLevel, { 
  sets: { min: number; max: number }; 
  reps: { min: number; max: number };
  holdSeconds: { min: number; max: number };
}> = {
  1: { 
    sets: { min: 3, max: 3 }, 
    reps: { min: 10, max: 15 },
    holdSeconds: { min: 20, max: 30 }
  },
  2: { 
    sets: { min: 3, max: 4 }, 
    reps: { min: 6, max: 8 },
    holdSeconds: { min: 15, max: 25 }
  },
  3: { 
    sets: { min: 4, max: 5 }, 
    reps: { min: 1, max: 6 },
    holdSeconds: { min: 5, max: 15 }
  },
};

/**
 * Isometric (Straight Arm) Hold Guardrails
 * 
 * - straight_arm + NOT handstand: Max 15s (too demanding otherwise)
 * - handstand tagged: Up to 60s (trained skill)
 * - Core/Plank exercises: No limit, follow level-based hold times
 */
const ISOMETRIC_GUARDRAILS = {
  straightArmMaxHold: 15,        // seconds, unless handstand
  handstandMaxHold: 60,          // seconds
  corePlanksFollowLevel: true,   // Core exercises use level-based timing
};

/**
 * MET Values for Calorie Calculation
 * MET (Metabolic Equivalent of Task) represents intensity
 * Formula: Calories = MET × 0.0175 × weightKg × durationMin
 */
const MET_BY_DIFFICULTY: Record<DifficultyLevel, number> = {
  1: 3.5,   // Light calisthenics (similar to slow walking)
  2: 6.0,   // Moderate calisthenics (similar to cycling)
  3: 8.0,   // Vigorous calisthenics (similar to running)
};

/**
 * Coin Bonuses by Difficulty
 * Extra coins for pushing harder (dopamine reward!)
 */
const COIN_BONUS_BY_DIFFICULTY: Record<DifficultyLevel, number> = {
  1: 0,     // No bonus for easy
  2: 20,    // +20 coins for challenging
  3: 50,    // +50 coins for intense
};

/**
 * Default user weight for MET calculation (kg)
 */
const DEFAULT_USER_WEIGHT = 70;

/**
 * Legacy difficulty multipliers (kept for backwards compatibility)
 */
const DIFFICULTY_MULTIPLIERS: Record<DifficultyLevel, number> = {
  1: 0.8,   // Easy: 80% reward
  2: 1.0,   // Normal: 100% reward  
  3: 1.5,   // Intense: 150% reward (dopamine for hard work!)
};

/**
 * Calorie calculation constants (legacy, kept for fallback)
 */
const CALORIE_PER_REP = 0.5;
const CALORIE_PER_HOLD_SECOND = 0.2;
const BASE_WORKOUT_CALORIES = 50; // Minimum calories for completing a workout

/**
 * Dynamic title templates by intent and location
 */
const TITLE_TEMPLATES: Record<IntentMode, Record<string, string>> = {
  normal: {
    home: 'אימון יומי בבית',
    park: 'אימון בפארק',
    office: 'מיני-אימון במשרד',
    street: 'אימון רחוב',
    gym: 'אימון חדר כושר',
    airport: 'אימון מהיר בשדה תעופה',
    school: 'אימון בהפסקה',
    default: 'אימון יומי',
  },
  blast: {
    home: 'Blast בבית! 🔥',
    park: 'Park Blast Session 🔥',
    office: 'Office Blast 🔥',
    street: 'Street Blast 🔥',
    gym: 'Gym Blast 🔥',
    default: 'Blast Session! 🔥',
  },
  on_the_way: {
    home: 'אימון בוקר מהיר',
    office: 'Quick Office Pump',
    default: 'אימון בדרך 🚗',
  },
  field: {
    default: 'אימון שטח 🎖️',
  },
};

/**
 * Title prefix by difficulty
 */
const DIFFICULTY_TITLE_PREFIX: Record<DifficultyLevel, string> = {
  1: 'אימון התאוששות',      // Easy: Recovery workout
  2: '',                     // Normal: no prefix
  3: 'אימון כוח עצים 💪',   // Intense: Strength workout
};

/**
 * Dynamic title templates combining difficulty, persona, and location
 * Format: "[Difficulty] [Type] ל[Persona] ב[Location]"
 * Example: "אימון כוח עצים להורים עסוקים במשרד"
 */
const PERSONA_LABELS_HE: Record<string, string> = {
  parent: 'הורים עסוקים',
  student: 'סטודנטים',
  office_worker: 'עובדי משרד',
  senior: 'מבוגרים',
  athlete: 'ספורטאים',
  default: '',
};

const LOCATION_LABELS_HE: Record<string, string> = {
  home: 'בבית',
  park: 'בפארק',
  office: 'במשרד',
  street: 'ברחוב',
  gym: 'בחדר כושר',
  airport: 'בשדה תעופה',
  school: 'בבית ספר',
  default: '',
};

/**
 * Description templates by persona and context
 */
const DESCRIPTION_TEMPLATES: Record<string, string[]> = {
  parent: [
    'אימון מותאם להורים עסוקים - יעיל ומדויק!',
    'מקסימום תוצאות בזמן מינימלי 👨‍👧',
    'בין המשימות - רגע לעצמך',
  ],
  student: [
    'הפסקה פעילה מהלימודים 📚',
    'שובר את השיגרה - גוף ונפש!',
    'מנקה את הראש ומחזק את הגוף',
  ],
  office_worker: [
    'הפסקה אקטיבית מהמחשב 💼',
    'מתיחות ותנועה - ללא זיעה',
    'ניתוק מהמסכים, חיבור לגוף',
  ],
  senior: [
    'אימון בטוח ומותאם 🧓',
    'שמירה על גמישות וכוח',
    'תנועה היא בריאות!',
  ],
  athlete: [
    'Push your limits! 🏆',
    'אימון ברמה גבוהה',
    'כל אימון מקרב למטרה',
  ],
  default: [
    'אימון מותאם אישית',
    'התחל את היום נכון!',
    'כל צעד קטן הוא התקדמות',
  ],
};

// ============================================================================
// WORKOUT GENERATOR CLASS
// ============================================================================

export class WorkoutGenerator {
  
  /**
   * Generate a complete workout from scored exercises
   */
  generateWorkout(
    scoredExercises: ScoredExercise[],
    context: WorkoutGenerationContext
  ): GeneratedWorkout {
    // FIRST SESSION BUFFER: Auto-set to Difficulty 1 for first session of any program
    // This ensures a success experience and proper onboarding
    let difficulty: DifficultyLevel = context.difficulty || 2;
    if (context.isFirstSessionInProgram) {
      difficulty = 1; // Force Easy mode for first session
    }
    
    // Step 1: Determine exercise count based on available time
    const { exerciseCount, includeAccessories } = this.getExerciseCountForDuration(context.availableTime);
    
    // Step 2: Apply difficulty-based exercise selection
    const filteredExercises = this.applyDifficultyFilter(scoredExercises, context, difficulty);
    
    // Step 3: Prioritize and select exercises
    const selectedExercises = this.selectExercises(filteredExercises, exerciseCount, includeAccessories, context, difficulty);
    
    // Step 4: Calculate volume (sets/reps) with inactivity and difficulty adjustment
    const volumeAdjustment = this.calculateVolumeAdjustment(context, difficulty);
    const workoutExercises = this.assignVolume(selectedExercises, context, volumeAdjustment, difficulty);
    
    // Step 5: Sort by priority (skill -> compound -> accessory -> isolation)
    workoutExercises.sort((a, b) => {
      const priorityOrder: Record<ExercisePriority, number> = { skill: 0, compound: 1, accessory: 2, isolation: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    // Step 6: Generate title and description (with difficulty prefix)
    const title = this.generateTitle(context, difficulty);
    const description = this.generateDescription(context, difficulty);
    const aiCue = this.generateAICue(context, workoutExercises.length, difficulty);
    
    // Step 7: Calculate estimated duration
    const estimatedDuration = this.calculateEstimatedDuration(workoutExercises);
    
    // Step 8: Determine structure
    const structure = this.determineStructure(context, workoutExercises);
    const blastMode = context.intentMode === 'blast' ? this.getBlastModeDetails(context, workoutExercises) : undefined;
    
    // Step 9: Calculate mechanical balance
    const mechanicalBalance = this.calculateMechanicalBalance(workoutExercises);
    
    // Step 10: Calculate stats (calories, coins) using MET formula
    const stats = this.calculateWorkoutStats(workoutExercises, difficulty, estimatedDuration, context.userWeight);
    
    return {
      title,
      description,
      aiCue,
      exercises: workoutExercises,
      estimatedDuration,
      structure,
      difficulty,
      volumeAdjustment: volumeAdjustment.reductionPercent > 0 ? volumeAdjustment : undefined,
      blastMode,
      mechanicalBalance,
      stats,
    };
  }
  
  /**
   * Apply difficulty-based filtering to exercises
   */
  private applyDifficultyFilter(
    exercises: ScoredExercise[],
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel
  ): ScoredExercise[] {
    const userLevel = context.userLevel;
    
    return exercises.map(ex => {
      const exerciseLevel = ex.programLevel || ex.exercise.recommendedLevel || userLevel;
      const levelDiff = exerciseLevel - userLevel;
      
      // Tag exercises that are above user level
      return {
        ...ex,
        isOverLevel: levelDiff > 0,
        levelDiff,
      };
    });
  }
  
  /**
   * Select exercises based on difficulty
   * Easy (1): Only exercises at UserLevel - 1 or below
   * Normal (2): Exercises at user level
   * Intense (3): Include 1-2 exercises at UserLevel + 1 or + 2
   */
  private selectExercisesForDifficulty(
    exercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
    count: number,
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel
  ): ScoredExercise[] {
    const userLevel = context.userLevel;
    
    if (difficulty === 1) {
      // Easy: Only exercises below user level
      return exercises
        .filter(ex => (ex.levelDiff || 0) <= -1)
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
    }
    
    if (difficulty === 3) {
      // Intense: Include 1-2 over-level exercises
      const overLevelCount = Math.min(2, Math.floor(count * 0.3));
      const normalCount = count - overLevelCount;
      
      // Select over-level exercises (UserLevel + 1 or + 2)
      const overLevel = exercises
        .filter(ex => (ex.levelDiff || 0) >= 1 && (ex.levelDiff || 0) <= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, overLevelCount);
      
      // Select normal exercises
      const normal = exercises
        .filter(ex => (ex.levelDiff || 0) <= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, normalCount);
      
      return [...overLevel, ...normal];
    }
    
    // Normal (2): Standard selection at user level
    return exercises
      .filter(ex => Math.abs(ex.levelDiff || 0) <= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }
  
  /**
   * Get exercise count based on available time
   */
  private getExerciseCountForDuration(availableTime: number): { exerciseCount: number; includeAccessories: boolean } {
    let config = DURATION_SCALING['30']; // default
    
    if (availableTime <= 10) {
      config = DURATION_SCALING['5'];
    } else if (availableTime <= 30) {
      config = DURATION_SCALING['15'];
    } else if (availableTime <= 45) {
      config = DURATION_SCALING['45'];
    } else {
      config = DURATION_SCALING['60'];
    }
    
    // Pick a random count within range
    const exerciseCount = config.min + Math.floor(Math.random() * (config.max - config.min + 1));
    
    return {
      exerciseCount,
      includeAccessories: config.includeAccessories,
    };
  }
  
  /**
   * Select exercises with priority sorting and difficulty consideration
   */
  private selectExercises(
    scoredExercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
    count: number,
    includeAccessories: boolean,
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel
  ): (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] {
    if (scoredExercises.length === 0) return [];
    
    // First, apply difficulty-based selection
    const difficultyFiltered = this.selectExercisesForDifficulty(scoredExercises, count * 2, context, difficulty);
    
    // Classify by priority
    const byPriority: Record<ExercisePriority, (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[]> = {
      skill: [],
      compound: [],
      accessory: [],
      isolation: [],
    };
    
    for (const scored of difficultyFiltered) {
      const priority = this.classifyPriority(scored.exercise);
      byPriority[priority].push(scored);
    }
    
    const selected: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] = [];
    
    // For short workouts: strictly compounds/skills
    if (!includeAccessories) {
      // Pick from skill and compound only
      const primaryPool = [...byPriority.skill, ...byPriority.compound];
      primaryPool.sort((a, b) => b.score - a.score);
      selected.push(...primaryPool.slice(0, count));
    } else {
      // Full workout: balance between categories
      // 1-2 skill/compound exercises first
      const primaryPool = [...byPriority.skill, ...byPriority.compound];
      primaryPool.sort((a, b) => b.score - a.score);
      const primaryCount = Math.min(Math.ceil(count * 0.6), primaryPool.length);
      selected.push(...primaryPool.slice(0, primaryCount));
      
      // Fill remaining with accessories/isolation
      const secondaryPool = [...byPriority.accessory, ...byPriority.isolation];
      secondaryPool.sort((a, b) => b.score - a.score);
      const remaining = count - selected.length;
      selected.push(...secondaryPool.slice(0, remaining));
    }
    
    // If still not enough, add from any available
    if (selected.length < count) {
      const remaining = count - selected.length;
      const alreadySelected = new Set(selected.map(s => s.exercise.id));
      const additional = scoredExercises
        .filter(s => !alreadySelected.has(s.exercise.id))
        .sort((a, b) => b.score - a.score)
        .slice(0, remaining);
      selected.push(...additional);
    }
    
    return selected.slice(0, count);
  }
  
  /**
   * Classify exercise priority
   */
  private classifyPriority(exercise: Exercise): ExercisePriority {
    const tags = exercise.tags || [];
    
    if (tags.includes('skill')) return 'skill';
    if (tags.includes('compound') || exercise.movementType === 'compound') return 'compound';
    if (tags.includes('isolation')) return 'isolation';
    
    // Default based on muscle groups
    if (exercise.primaryMuscle === 'full_body') return 'compound';
    
    return 'accessory';
  }
  
  /**
   * Calculate volume adjustment for inactivity and difficulty
   */
  private calculateVolumeAdjustment(context: WorkoutGenerationContext, difficulty: DifficultyLevel): VolumeAdjustment {
    const baseSets = getBaseSets(context.userLevel);
    let adjustedSets = baseSets;
    let reductionPercent = 0;
    let badge = '';
    let reason: VolumeAdjustment['reason'] = 'inactivity';
    
    // Easy difficulty: reduce sets by 1
    if (difficulty === 1) {
      adjustedSets = Math.max(2, baseSets - 1);
      reductionPercent = ((baseSets - adjustedSets) / baseSets) * 100;
      badge = 'Recovery Mode';
    }
    
    // Inactivity reduction (stacks with difficulty)
    if (context.daysInactive > INACTIVITY_THRESHOLD_DAYS) {
      const inactivityReduction = Math.round(adjustedSets * INACTIVITY_VOLUME_REDUCTION);
      adjustedSets = Math.max(2, adjustedSets - inactivityReduction);
      reductionPercent = ((baseSets - adjustedSets) / baseSets) * 100;
      badge = badge ? `${badge} + Back to Routine` : 'Volume Reduced (Back to routine)';
    }
    
    return {
      reason,
      reductionPercent: Math.round(reductionPercent),
      originalSets: baseSets,
      adjustedSets,
      badge,
    };
  }
  
  /**
   * Assign volume (sets/reps/rest) to exercises using Professional Calisthenics Logic
   * 
   * DIFFICULTY-BASED VOLUME:
   * - Difficulty 1: 3 sets, 10-15 reps
   * - Difficulty 2: 3-4 sets, 6-8 reps
   * - Difficulty 3: 4-5 sets, 1-6 reps
   * 
   * ISOMETRIC GUARDRAILS:
   * - straight_arm + NOT handstand: Max 15s
   * - handstand tagged: Up to 60s
   * - Core/Plank: No limit, follow level-based
   */
  private assignVolume(
    exercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
    context: WorkoutGenerationContext,
    volumeAdjustment: VolumeAdjustment,
    difficulty: DifficultyLevel
  ): WorkoutExercise[] {
    // Get difficulty-based volume configuration
    const volumeConfig = DIFFICULTY_VOLUME[difficulty];
    
    // Blast mode: reduce rest time
    const blastRestMultiplier = context.intentMode === 'blast' ? 0.5 : 1;
    
    return exercises.map((scored) => {
      const priority = this.classifyPriority(scored.exercise);
      const isTimeBased = this.isTimeBasedExercise(scored.exercise);
      const isOverLevel = scored.isOverLevel || false;
      const exercise = scored.exercise;
      
      // === SETS CALCULATION (Difficulty-based) ===
      let sets = volumeConfig.sets.min + Math.floor(Math.random() * (volumeConfig.sets.max - volumeConfig.sets.min + 1));
      
      // Priority adjustments
      if (priority === 'skill') {
        sets = Math.min(sets, 4); // Skills cap at 4 sets
      } else if (priority === 'isolation') {
        sets = Math.max(2, sets - 1); // Less sets for isolation
      }
      
      // Apply inactivity reduction
      if (volumeAdjustment.reductionPercent > 0) {
        sets = Math.max(2, Math.round(sets * (1 - volumeAdjustment.reductionPercent / 100)));
      }
      
      // === REPS/HOLD CALCULATION ===
      let reps: number;
      
      if (isTimeBased) {
        // TIME-BASED (Isometric/Holds)
        reps = this.calculateHoldTime(exercise, context.userLevel, difficulty, volumeConfig);
      } else {
        // REP-BASED
        reps = volumeConfig.reps.min + Math.floor(Math.random() * (volumeConfig.reps.max - volumeConfig.reps.min + 1));
        
        // Apply inactivity reduction to reps
        if (volumeAdjustment.reductionPercent > 0) {
          reps = Math.max(volumeConfig.reps.min, Math.round(reps * (1 - volumeAdjustment.reductionPercent / 100)));
        }
      }
      
      // === REST TIME CALCULATION ===
      let restSeconds = REST_BY_PRIORITY[priority];
      
      // Intense difficulty: Longer rest for strength recovery
      if (difficulty === 3) {
        restSeconds = REST_FOR_OVER_LEVEL.min + Math.floor(Math.random() * (REST_FOR_OVER_LEVEL.max - REST_FOR_OVER_LEVEL.min));
      } else {
        restSeconds = Math.round(restSeconds * blastRestMultiplier);
      }
      
      return {
        exercise: scored.exercise,
        method: scored.method,
        mechanicalType: scored.mechanicalType,
        sets,
        reps,
        isTimeBased,
        restSeconds,
        priority,
        score: scored.score,
        reasoning: scored.reasoning,
        programLevel: scored.programLevel,
        isOverLevel,
      };
    });
  }
  
  /**
   * Calculate hold time with Isometric Guardrails
   * 
   * Rules:
   * - straight_arm + NOT handstand: Max 15s
   * - handstand tagged: Up to 60s
   * - Core/Plank exercises: Follow level-based timing (no strict cap)
   */
  private calculateHoldTime(
    exercise: Exercise,
    userLevel: number,
    difficulty: DifficultyLevel,
    volumeConfig: typeof DIFFICULTY_VOLUME[DifficultyLevel]
  ): number {
    const name = getLocalizedText(exercise.name).toLowerCase();
    const tags = exercise.tags || [];
    
    // Check if this is a handstand exercise
    const isHandstand = tags.includes('handstand' as ExerciseTag) || 
                        name.includes('handstand') || 
                        name.includes('עמידת ידיים');
    
    // Check if this is a core/plank exercise
    const isCorePlank = name.includes('plank') || 
                        name.includes('פלאנק') ||
                        exercise.primaryMuscle === 'core' ||
                        tags.includes('core' as ExerciseTag);
    
    // Check if this is a straight arm exercise (not handstand, not core)
    const isStraightArm = exercise.mechanicalType === 'straight_arm';
    
    // Get base hold time from difficulty config
    let holdTime = volumeConfig.holdSeconds.min + 
                   Math.floor(Math.random() * (volumeConfig.holdSeconds.max - volumeConfig.holdSeconds.min + 1));
    
    // Apply level-based scaling for higher levels
    const levelBonus = Math.floor(userLevel / 5) * 5; // +5s every 5 levels
    holdTime += levelBonus;
    
    // === ISOMETRIC GUARDRAILS ===
    
    if (isHandstand) {
      // Handstand: Allow up to 60s
      holdTime = Math.min(holdTime, ISOMETRIC_GUARDRAILS.handstandMaxHold);
    } else if (isCorePlank) {
      // Core/Plank: No strict limit, follow level-based timing
      // Cap at a reasonable max based on level
      const levelBasedMax = 30 + (userLevel * 2); // 30s + 2s per level
      holdTime = Math.min(holdTime, levelBasedMax);
    } else if (isStraightArm) {
      // Straight arm (not handstand, not core): Max 15s
      holdTime = Math.min(holdTime, ISOMETRIC_GUARDRAILS.straightArmMaxHold);
    }
    
    // Ensure minimum hold time
    return Math.max(5, holdTime);
  }
  
  /**
   * Check if exercise is time-based (holds, isometric)
   */
  private isTimeBasedExercise(exercise: Exercise): boolean {
    // Check exercise type
    if (exercise.type === 'time') return true;
    
    // Straight arm exercises are often isometric holds
    if (exercise.mechanicalType === 'straight_arm') return true;
    
    // Check for hold-related tags or names
    const name = getLocalizedText(exercise.name).toLowerCase();
    if (name.includes('hold') || name.includes('plank') || name.includes('hang') || name.includes('החזקה')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate workout title with difficulty prefix
   * Dynamic format: "[Difficulty] [Type] ל[Persona] ב[Location]"
   * Example: "אימון כוח עצים להורים עסוקים במשרד"
   */
  private generateTitle(context: WorkoutGenerationContext, difficulty: DifficultyLevel): string {
    const parts: string[] = [];
    
    // 1. Difficulty prefix
    const difficultyPrefix = DIFFICULTY_TITLE_PREFIX[difficulty];
    if (difficultyPrefix) {
      parts.push(difficultyPrefix);
    } else {
      // Normal difficulty - use intent/location based title
      const templates = TITLE_TEMPLATES[context.intentMode] || TITLE_TEMPLATES.normal;
      parts.push(templates[context.location] || templates.default || 'אימון יומי');
    }
    
    // 2. Persona suffix (if available and not using difficulty prefix)
    if (context.persona && !difficultyPrefix) {
      const personaLabel = PERSONA_LABELS_HE[context.persona];
      if (personaLabel) {
        parts[0] = `${parts[0]} ל${personaLabel}`;
      }
    }
    
    // 3. Location suffix (if using difficulty prefix)
    if (difficultyPrefix && context.location) {
      const locationLabel = LOCATION_LABELS_HE[context.location];
      if (locationLabel) {
        // Add persona if available
        if (context.persona) {
          const personaLabel = PERSONA_LABELS_HE[context.persona];
          if (personaLabel) {
            parts.push(`ל${personaLabel}`);
          }
        }
        parts.push(locationLabel);
      }
    }
    
    return parts.join(' ');
  }
  
  /**
   * Generate workout description with difficulty context
   */
  private generateDescription(context: WorkoutGenerationContext, difficulty: DifficultyLevel): string {
    // Difficulty-specific descriptions
    if (difficulty === 1) {
      return 'אימון קל להחלמה ושיקום - מושלם לימים שצריך לנוח!';
    }
    
    if (difficulty === 3) {
      return 'אימון אינטנסיבי לפיתוח כוח - תרגילים מאתגרים עם מנוחות ארוכות!';
    }
    
    const persona = context.persona || 'default';
    const templates = DESCRIPTION_TEMPLATES[persona] || DESCRIPTION_TEMPLATES.default;
    return templates[Math.floor(Math.random() * templates.length)];
  }
  
  /**
   * Generate AI cue based on context and difficulty
   */
  private generateAICue(context: WorkoutGenerationContext, exerciseCount: number, difficulty: DifficultyLevel): string | undefined {
    // Difficulty-specific cues take priority
    if (difficulty === 1) {
      return `🧘 מצב התאוששות. ${exerciseCount} תרגילים קלים - הגוף ישכור לך מחר!`;
    }
    
    if (difficulty === 3) {
      return `💪 מצב כוח! ${exerciseCount} תרגילים עם אתגרים מעל הרמה שלך. מנוחות ארוכות - תן בכל חזרה!`;
    }
    
    if (context.intentMode === 'blast') {
      return `🔥 מצב Blast! ${exerciseCount} תרגילים באינטנסיביות גבוהה. מנוח מקוצר - תן בראש!`;
    }
    
    if (context.intentMode === 'on_the_way') {
      return `🚗 אימון מהיר לפני היום הגדול. ${exerciseCount} תרגילים, אפס זיעה!`;
    }
    
    if (context.intentMode === 'field') {
      return `🎖️ מצב שטח! ${exerciseCount} תרגילים ללא ציוד. לחימה!`;
    }
    
    if (context.daysInactive > INACTIVITY_THRESHOLD_DAYS) {
      return `💪 חזרת אחרי ${context.daysInactive} ימים! נתחיל בקלות - העיקר להתחיל.`;
    }
    
    if (context.persona) {
      const personaLabel = LIFESTYLE_LABELS[context.persona];
      return `👋 אימון מותאם ל${personaLabel}. מוכן?`;
    }
    
    return undefined;
  }
  
  /**
   * Calculate estimated duration
   */
  private calculateEstimatedDuration(exercises: WorkoutExercise[]): number {
    let totalSeconds = 0;
    
    for (const ex of exercises) {
      // Time per set
      const setTime = ex.isTimeBased ? ex.reps : ex.reps * 3; // ~3 sec per rep
      const workTime = ex.sets * setTime;
      const restTime = (ex.sets - 1) * ex.restSeconds;
      
      totalSeconds += workTime + restTime;
    }
    
    // Add transition time (30 sec between exercises)
    totalSeconds += (exercises.length - 1) * 30;
    
    return Math.ceil(totalSeconds / 60);
  }
  
  /**
   * Determine workout structure
   */
  private determineStructure(context: WorkoutGenerationContext, exercises: WorkoutExercise[]): WorkoutStructure {
    if (context.intentMode === 'blast') {
      return Math.random() > 0.5 ? 'emom' : 'amrap';
    }
    
    if (exercises.length <= 3 && context.availableTime <= 15) {
      return 'circuit';
    }
    
    return 'standard';
  }
  
  /**
   * Get blast mode details
   */
  private getBlastModeDetails(context: WorkoutGenerationContext, exercises: WorkoutExercise[]): BlastModeDetails {
    const isEMOM = Math.random() > 0.5;
    
    if (isEMOM) {
    return {
        type: 'emom',
        durationMinutes: Math.min(context.availableTime, 20),
        workSeconds: 40,
        restSeconds: 20,
      };
    }
    
    return {
      type: 'amrap',
      durationMinutes: Math.min(context.availableTime, 15),
      rounds: undefined, // As many as possible
    };
  }
  
  /**
   * Calculate mechanical balance
   */
  private calculateMechanicalBalance(exercises: WorkoutExercise[]): MechanicalBalanceSummary {
    const counts = { straightArm: 0, bentArm: 0, hybrid: 0 };
    
    for (const ex of exercises) {
      if (ex.mechanicalType === 'straight_arm') counts.straightArm++;
      else if (ex.mechanicalType === 'bent_arm') counts.bentArm++;
      else if (ex.mechanicalType === 'hybrid') counts.hybrid++;
    }
    
    const ratio = `${counts.straightArm}:${counts.bentArm}`;
    const isBalanced = counts.straightArm <= 2 && Math.abs(counts.straightArm - counts.bentArm) <= 2;
    
    return { ...counts, ratio, isBalanced };
  }
  
  /**
   * Calculate workout stats using MET-based Calorie Formula
   * 
   * MET Formula: Calories = MET × 0.0175 × weightKg × durationMin
   * 
   * MET Values:
   * - 1 Bolt (Easy): 3.5
   * - 2 Bolts (Challenging): 6.0
   * - 3 Bolts (Intense): 8.0
   * 
   * Coins = Calories + Difficulty Bonus
   * - 1 Bolt: +0
   * - 2 Bolts: +20
   * - 3 Bolts: +50
   */
  private calculateWorkoutStats(
    exercises: WorkoutExercise[], 
    difficulty: DifficultyLevel,
    durationMinutes?: number,
    userWeight?: number
  ): WorkoutStats {
    let totalReps = 0;
    let totalHoldTime = 0;
    
    for (const ex of exercises) {
      if (ex.isTimeBased) {
        // Time-based: reps represents seconds
        totalHoldTime += ex.sets * ex.reps;
      } else {
        // Rep-based
        totalReps += ex.sets * ex.reps;
      }
    }
    
    // Get MET value for this difficulty
    const met = MET_BY_DIFFICULTY[difficulty];
    
    // Use provided weight or default
    const weight = userWeight || DEFAULT_USER_WEIGHT;
    
    // Use provided duration or estimate from exercises
    const duration = durationMinutes || this.calculateEstimatedDuration(exercises);
    
    // === MET-BASED CALORIE CALCULATION ===
    // Formula: MET × 0.0175 × weightKg × durationMin
    const metCalories = met * 0.0175 * weight * duration;
    
    // Ensure minimum calories (completing a workout always earns something!)
    const calories = Math.max(BASE_WORKOUT_CALORIES, Math.round(metCalories));
    
    // === COINS CALCULATION ===
    // Coins = Calories + Difficulty Bonus
    const difficultyBonus = COIN_BONUS_BY_DIFFICULTY[difficulty];
    const coins = calories + difficultyBonus;
    
    // Get legacy multiplier for backwards compatibility
    const multiplier = DIFFICULTY_MULTIPLIERS[difficulty];
    
    return {
      calories,
      coins,
      totalReps,
      totalHoldTime,
      difficultyMultiplier: multiplier,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new WorkoutGenerator instance
 * ISOMORPHIC: Can be called from server or client
 */
export function createWorkoutGenerator(): WorkoutGenerator {
  return new WorkoutGenerator();
}

/**
 * Quick generate function (convenience wrapper)
 */
export function generateWorkout(
  scoredExercises: ScoredExercise[],
  context: WorkoutGenerationContext
): GeneratedWorkout {
  const generator = createWorkoutGenerator();
  return generator.generateWorkout(scoredExercises, context);
}
