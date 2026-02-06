/**
 * ContextualEngine - The Ultimate Contextual Filtering & Scoring Engine
 * 
 * Combines:
 * - Location-based filters (sweat/noise limits)
 * - Lifestyle persona matching
 * - Technical balancing (SA/BA ratio)
 * - Special overrides (Blast Mode, On-the-way-to-work, Field Mode)
 * - Injury Shield safety filtering
 * 
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import {
  Exercise,
  ExecutionLocation,
  ExecutionMethod,
  MechanicalType,
  InjuryShieldArea,
  NoiseLevel,
  SweatLevel,
  MECHANICAL_TYPE_LABELS,
} from '@/features/content/exercises/core/exercise.types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported lifestyle personas (up to 3 can be selected)
 */
export type LifestylePersona = 
  | 'parent'
  | 'student'
  | 'office_worker'
  | 'home_worker'
  | 'senior'
  | 'athlete';

/**
 * Location constraint profiles
 * Maps locations to their environmental constraints
 */
export interface LocationConstraints {
  sweatLimit: NoiseLevel;
  noiseLimit: SweatLevel;
  methodPriority: 1 | 2 | 3;  // 1 = gym/street methods, 2 = home methods, 3 = office methods
  bypassLimits: boolean;      // For park (strict facility mapping instead)
  requireFieldReady?: boolean; // For field/military mode
}

/**
 * Intent override configuration
 */
export type IntentMode = 
  | 'normal'
  | 'blast'           // "לתת בראש" - ignore sweat, reduce rest, prioritize compound
  | 'on_the_way'      // Quick workout before work
  | 'field';          // Field/Military mode

/**
 * Program IDs for multi-level exercise mapping
 */
export type ProgramId = 
  | 'upper_body'
  | 'calisthenics'
  | 'lower_body'
  | 'handstand'
  | 'planche'
  | 'front_lever'
  | 'one_arm_pullup'
  | 'hspu';

/**
 * Full context for contextual filtering
 */
export interface ContextualFilterContext {
  /** User's location */
  location: ExecutionLocation;
  
  /** User's lifestyle personas (up to 3) */
  lifestyles: LifestylePersona[];
  
  /** User's injury areas to avoid */
  injuryShield: InjuryShieldArea[];
  
  /** Active intent override */
  intentMode: IntentMode;
  
  /** Available equipment (for park facility mapping) */
  availableEquipment: string[];
  
  /** User's level (for proximity scoring) */
  userLevel: number;
  
  /** Maximum duration in minutes (for on_the_way mode) */
  maxDuration?: number;
  
  /** Selected program for level filtering (optional) */
  selectedProgram?: ProgramId;
  
  /** Level tolerance for filtering (default: 3) */
  levelTolerance?: number;
}

/**
 * Exercise selection with scoring details
 */
export interface ScoredExercise {
  exercise: Exercise;
  method: ExecutionMethod;
  score: number;
  reasoning: string[];
  mechanicalType: MechanicalType;
  /** Level of this exercise in the selected program */
  programLevel?: number;
}

/**
 * Result of contextual filtering
 */
export interface ContextualFilterResult {
  /** Filtered and scored exercises */
  exercises: ScoredExercise[];
  
  /** Active filters applied */
  activeFilters: FilterDescription[];
  
  /** SA:BA balance stats */
  mechanicalBalance: MechanicalBalance;
  
  /** Exercises removed by filters */
  excludedCount: number;
  
  /** AI cue to show user (for on_the_way, etc.) */
  aiCue?: string;
  
  /** Adjusted rest time (for blast mode) */
  adjustedRestSeconds?: number;
}

/**
 * Filter description for UI display
 */
export interface FilterDescription {
  type: 'location' | 'lifestyle' | 'injury' | 'mechanical' | 'intent' | 'equipment';
  label: string;
  value: string;
}

/**
 * Mechanical balance stats
 */
export interface MechanicalBalance {
  straightArm: number;
  bentArm: number;
  hybrid: number;
  none: number;
  ratio: string;
  isBalanced: boolean;
  warning?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Location constraint configurations
 */
export const LOCATION_CONSTRAINTS: Record<ExecutionLocation, LocationConstraints> = {
  // Strict environments - low sweat, low noise
  office: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
  airport: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
  school: { sweatLimit: 1, noiseLimit: 1, methodPriority: 3, bypassLimits: false },
  
  // Moderate environments
  home: { sweatLimit: 2, noiseLimit: 2, methodPriority: 2, bypassLimits: false },
  
  // Open environments - no limits
  gym: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: false },
  street: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: false },
  
  // Special: Park uses facility mapping instead of limits
  park: { sweatLimit: 3, noiseLimit: 3, methodPriority: 1, bypassLimits: true },
};

/**
 * Lifestyle persona labels (Hebrew)
 */
export const LIFESTYLE_LABELS: Record<LifestylePersona, string> = {
  parent: 'הורה',
  student: 'סטודנט',
  office_worker: 'עובד משרד',
  home_worker: 'עובד מהבית',
  senior: 'גיל הזהב',
  athlete: 'ספורטאי',
};

/**
 * Maximum straight arm exercises per session (SA limit)
 */
const MAX_STRAIGHT_ARM_PER_SESSION = 2;

/**
 * Blast mode rest time (seconds)
 */
const BLAST_MODE_REST_SECONDS = 30;

/**
 * On-the-way mode max duration (minutes)
 */
const ON_THE_WAY_MAX_DURATION = 15;

// ============================================================================
// CONTEXTUAL ENGINE CLASS
// ============================================================================

export class ContextualEngine {
  
  /**
   * Filter and score exercises based on contextual parameters
   */
  filterAndScore(
    exercises: Exercise[],
    context: ContextualFilterContext
  ): ContextualFilterResult {
    const activeFilters: FilterDescription[] = [];
    const constraints = LOCATION_CONSTRAINTS[context.location] || LOCATION_CONSTRAINTS.home;
    let excludedCount = 0;
    
    // Build active filters list
    this.buildActiveFilters(context, constraints, activeFilters);
    
    // Step 1: Hard filters (safety + location + program level)
    const passedHardFilters: { exercise: Exercise; method: ExecutionMethod; programLevel?: number }[] = [];
    const levelTolerance = context.levelTolerance ?? 3;
    
    for (const exercise of exercises) {
      // Program Level filter (if program selected)
      let programLevel: number | undefined;
      if (context.selectedProgram) {
        // Check if exercise has programLevels (from mock data)
        const exerciseAny = exercise as any;
        if (exerciseAny.programLevels) {
          programLevel = exerciseAny.programLevels[context.selectedProgram];
          if (programLevel === undefined) {
            // Exercise doesn't exist in this program
            excludedCount++;
            continue;
          }
          // Check if exercise is within level range
          const minLevel = Math.max(1, context.userLevel - levelTolerance);
          const maxLevel = context.userLevel + levelTolerance;
          if (programLevel < minLevel || programLevel > maxLevel) {
            excludedCount++;
            continue;
          }
        }
      }
      
      // Injury Shield filter
      if (!this.passesInjuryShield(exercise, context.injuryShield)) {
        excludedCount++;
        continue;
      }
      
      // Field mode filter
      if (context.intentMode === 'field') {
        if (!this.passesFieldMode(exercise)) {
          excludedCount++;
          continue;
        }
      }
      
      // Find matching execution method for location
      const matchingMethod = this.findMatchingMethod(exercise, context, constraints);
      if (!matchingMethod) {
        excludedCount++;
        continue;
      }
      
      // Environment constraints (unless bypassed for park)
      if (!constraints.bypassLimits) {
        // Sweat limit (ignore in blast mode)
        if (context.intentMode !== 'blast') {
          const effectiveSweatLimit = context.intentMode === 'on_the_way' ? 1 : constraints.sweatLimit;
          if (exercise.sweatLevel && exercise.sweatLevel > effectiveSweatLimit) {
            excludedCount++;
            continue;
          }
        }
        
        // Noise limit
        if (exercise.noiseLevel && exercise.noiseLevel > constraints.noiseLimit) {
          excludedCount++;
          continue;
        }
      }
      
      passedHardFilters.push({ exercise, method: matchingMethod, programLevel });
    }
    
    // Step 2: Score exercises (include program level)
    const scoredExercises = passedHardFilters.map(({ exercise, method, programLevel }) => {
      const scored = this.scoreExercise(exercise, method, context);
      scored.programLevel = programLevel;
      return scored;
    });
    
    // Step 3: Apply SA/BA balancing
    const balancedExercises = this.applyMechanicalBalancing(scoredExercises);
    
    // Step 4: Sort by score
    balancedExercises.sort((a, b) => b.score - a.score);
    
    // Step 5: Calculate mechanical balance
    const mechanicalBalance = this.calculateMechanicalBalance(balancedExercises);
    
    // Step 6: Generate AI cue for intent modes
    const aiCue = this.generateAICue(context);
    
    return {
      exercises: balancedExercises,
      activeFilters,
      mechanicalBalance,
      excludedCount,
      aiCue,
      adjustedRestSeconds: context.intentMode === 'blast' ? BLAST_MODE_REST_SECONDS : undefined,
    };
  }
  
  /**
   * Build the list of active filters for UI display
   */
  private buildActiveFilters(
    context: ContextualFilterContext,
    constraints: LocationConstraints,
    filters: FilterDescription[]
  ): void {
    // Location filter
    filters.push({
      type: 'location',
      label: 'מיקום',
      value: context.location,
    });
    
    // Program filter (if selected)
    if (context.selectedProgram) {
      const levelTolerance = context.levelTolerance ?? 3;
      const minLevel = Math.max(1, context.userLevel - levelTolerance);
      const maxLevel = context.userLevel + levelTolerance;
      filters.push({
        type: 'lifestyle',
        label: 'תוכנית',
        value: context.selectedProgram,
      });
      filters.push({
        type: 'lifestyle',
        label: 'טווח רמות',
        value: `${minLevel}-${maxLevel}`,
      });
    }
    
    // Sweat/Noise limits (if applicable)
    if (!constraints.bypassLimits) {
      const effectiveSweatLimit = context.intentMode === 'on_the_way' ? 1 : 
                                  context.intentMode === 'blast' ? 3 : 
                                  constraints.sweatLimit;
      filters.push({
        type: 'location',
        label: 'מגבלת זיעה',
        value: `≤ ${effectiveSweatLimit}`,
      });
      filters.push({
        type: 'location',
        label: 'מגבלת רעש',
        value: `≤ ${constraints.noiseLimit}`,
      });
    } else {
      filters.push({
        type: 'equipment',
        label: 'מצב פארק',
        value: 'מיפוי מתקנים בלבד',
      });
    }
    
    // Lifestyle filters
    if (context.lifestyles.length > 0) {
      filters.push({
        type: 'lifestyle',
        label: 'סגנון חיים',
        value: context.lifestyles.map(l => LIFESTYLE_LABELS[l]).join(', '),
      });
    }
    
    // Injury filters
    if (context.injuryShield.length > 0) {
      filters.push({
        type: 'injury',
        label: 'Injury Shield',
        value: `${context.injuryShield.length} אזורים מוגנים`,
      });
    }
    
    // Intent mode filters
    if (context.intentMode === 'blast') {
      filters.push({
        type: 'intent',
        label: 'מצב Blast',
        value: 'מנוח 30ש, עדיפות compound',
      });
    } else if (context.intentMode === 'on_the_way') {
      filters.push({
        type: 'intent',
        label: 'בדרך לעבודה',
        value: `זיעה ≤1, ${ON_THE_WAY_MAX_DURATION} דק מקס`,
      });
    } else if (context.intentMode === 'field') {
      filters.push({
        type: 'intent',
        label: 'מצב שטח',
        value: 'ללא ציוד, field_ready',
      });
    }
    
    // SA limit
    filters.push({
      type: 'mechanical',
      label: 'מגבלת SA',
      value: `מקס ${MAX_STRAIGHT_ARM_PER_SESSION} ליד ישרה`,
    });
  }
  
  /**
   * Check if exercise passes injury shield filter
   */
  private passesInjuryShield(
    exercise: Exercise,
    userInjuries: InjuryShieldArea[]
  ): boolean {
    if (!userInjuries.length) return true;
    if (!exercise.injuryShield?.length) return true;
    
    // Exclude if any overlap between exercise stress areas and user injuries
    return !exercise.injuryShield.some(area => userInjuries.includes(area));
  }
  
  /**
   * Check if exercise is suitable for field mode
   */
  private passesFieldMode(exercise: Exercise): boolean {
    // If fieldReady is explicitly set, use that
    if (exercise.fieldReady !== undefined) {
      return exercise.fieldReady;
    }
    
    // Fallback: Field mode requires no equipment
    const hasNoEquipment = 
      exercise.equipment.length === 0 ||
      exercise.equipment.includes('none') ||
      (exercise.equipment.length === 1 && exercise.equipment[0] === 'none');
    
    return hasNoEquipment;
  }
  
  /**
   * Find the best matching execution method for the context
   */
  private findMatchingMethod(
    exercise: Exercise,
    context: ContextualFilterContext,
    constraints: LocationConstraints
  ): ExecutionMethod | null {
    const methods = exercise.execution_methods || exercise.executionMethods || [];
    if (!methods.length) return null;
    
    // For park: strict facility mapping - check equipment availability
    if (constraints.bypassLimits && context.location === 'park') {
      const parkMethods = methods.filter(m => {
        if (m.location !== 'park') return false;
        // Check if required equipment is available
        if (m.equipmentId && !context.availableEquipment.includes(m.equipmentId)) {
          return false;
        }
        return true;
      });
      return parkMethods[0] || null;
    }
    
    // Standard location matching
    const locationMethods = methods.filter(m => 
      m.location === context.location ||
      m.locationMapping?.includes(context.location)
    );
    
    return locationMethods[0] || null;
  }
  
  /**
   * Score an exercise based on context
   */
  private scoreExercise(
    exercise: Exercise,
    method: ExecutionMethod,
    context: ContextualFilterContext
  ): ScoredExercise {
    let score = 0;
    const reasoning: string[] = [];
    
    // 1. Lifestyle Match: +2 points per matching tag
    const lifestyleMatches = this.countLifestyleMatches(method, context.lifestyles);
    const lifestyleScore = lifestyleMatches * 2;
    score += lifestyleScore;
    if (lifestyleMatches > 0) {
      reasoning.push(`התאמת סגנון חיים: +${lifestyleScore} (${lifestyleMatches} התאמות)`);
    }
    
    // 2. Level Proximity: +3 points for exact match, -1 per level difference
    const exerciseLevel = this.getExerciseLevel(exercise);
    const levelDiff = Math.abs(exerciseLevel - context.userLevel);
    const levelScore = Math.max(0, 3 - levelDiff);
    score += levelScore;
    reasoning.push(`קרבת רמה: +${levelScore} (הפרש ${levelDiff})`);
    
    // 3. Blast Mode: Prioritize compound/hybrid
    if (context.intentMode === 'blast') {
      if (exercise.movementType === 'compound' || exercise.tags?.includes('compound')) {
        score += 3;
        reasoning.push('Blast: +3 (compound)');
      }
      if (exercise.mechanicalType === 'hybrid') {
        score += 2;
        reasoning.push('Blast: +2 (hybrid)');
      }
      if (exercise.tags?.includes('hiit_friendly')) {
        score += 2;
        reasoning.push('Blast: +2 (HIIT)');
      }
    }
    
    // 4. Has video: +1 point
    if (method.media?.mainVideoUrl) {
      score += 1;
      reasoning.push('יש וידאו: +1');
    }
    
    return {
      exercise,
      method,
      score,
      reasoning,
      mechanicalType: exercise.mechanicalType || 'none',
    };
  }
  
  /**
   * Count lifestyle tag matches
   */
  private countLifestyleMatches(
    method: ExecutionMethod,
    userLifestyles: LifestylePersona[]
  ): number {
    if (!method.lifestyleTags?.length || !userLifestyles.length) return 0;
    
    return userLifestyles.filter(lifestyle => 
      method.lifestyleTags?.includes(lifestyle)
    ).length;
  }
  
  /**
   * Get exercise level (from targetPrograms or default to 1)
   */
  private getExerciseLevel(exercise: Exercise): number {
    if (exercise.targetPrograms?.length) {
      return exercise.targetPrograms[0].level;
    }
    return exercise.recommendedLevel || 1;
  }
  
  /**
   * Apply SA/BA balancing - limit straight arm to max 2 per session
   */
  private applyMechanicalBalancing(exercises: ScoredExercise[]): ScoredExercise[] {
    let straightArmCount = 0;
    
    return exercises.map(scored => {
      // Track and potentially penalize excess straight arm exercises
      if (scored.mechanicalType === 'straight_arm') {
        straightArmCount++;
        if (straightArmCount > MAX_STRAIGHT_ARM_PER_SESSION) {
          // Penalize score for excess SA
          const penalty = (straightArmCount - MAX_STRAIGHT_ARM_PER_SESSION) * 5;
          return {
            ...scored,
            score: scored.score - penalty,
            reasoning: [...scored.reasoning, `SA עודף: -${penalty} (${straightArmCount}/${MAX_STRAIGHT_ARM_PER_SESSION})`],
          };
        }
      }
      return scored;
    });
  }
  
  /**
   * Calculate mechanical type balance stats
   */
  private calculateMechanicalBalance(exercises: ScoredExercise[]): MechanicalBalance {
    const counts: Record<MechanicalType, number> = {
      straight_arm: 0,
      bent_arm: 0,
      hybrid: 0,
      none: 0,
    };
    
    exercises.forEach(({ mechanicalType }) => {
      counts[mechanicalType]++;
    });
    
    const sa = counts.straight_arm;
    const ba = counts.bent_arm;
    const ratio = ba > 0 ? `${sa}:${ba}` : sa > 0 ? `${sa}:0` : '0:0';
    
    // Balance check: SA should not exceed BA by more than 1, and SA <= 2
    const isBalanced = sa <= MAX_STRAIGHT_ARM_PER_SESSION && Math.abs(sa - ba) <= 2;
    
    let warning: string | undefined;
    if (sa > MAX_STRAIGHT_ARM_PER_SESSION) {
      warning = `עודף יד ישרה (${sa} מתוך מקס ${MAX_STRAIGHT_ARM_PER_SESSION})`;
    } else if (sa > ba + 2) {
      warning = `חוסר איזון SA:BA (${ratio})`;
    }
    
    return {
      straightArm: sa,
      bentArm: ba,
      hybrid: counts.hybrid,
      none: counts.none,
      ratio,
      isBalanced,
      warning,
    };
  }
  
  /**
   * Generate AI cue for special intent modes
   */
  private generateAICue(context: ContextualFilterContext): string | undefined {
    switch (context.intentMode) {
      case 'on_the_way':
        return 'סיימת! 🏃 הסדר דופק לפני המשרד. יום פרודוקטיבי מחכה לך!';
      case 'blast':
        return 'מצב BLAST! 🔥 מנוח מקוצר, אינטנסיביות מקסימלית. תן בראש!';
      case 'field':
        return 'מצב שטח! 💪 ללא ציוד, ביצוע טקטי. לחימה!';
      default:
        return undefined;
    }
  }
  
  /**
   * Get recommended workout structure for blast mode (AMRAP/EMOM)
   */
  getBlastModeStructure(): { type: 'amrap' | 'emom'; duration: number; rounds?: number } {
    // Randomize between AMRAP and EMOM for variety
    const isAMRAP = Math.random() > 0.5;
    return {
      type: isAMRAP ? 'amrap' : 'emom',
      duration: isAMRAP ? 15 : 12, // 15 min AMRAP or 12 min EMOM
      rounds: isAMRAP ? undefined : 4,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ContextualEngine instance
 * ISOMORPHIC: Can be called from server or client
 */
export function createContextualEngine(): ContextualEngine {
  return new ContextualEngine();
}

/**
 * Quick filter function (convenience wrapper)
 */
export function filterExercisesContextually(
  exercises: Exercise[],
  context: ContextualFilterContext
): ContextualFilterResult {
  const engine = createContextualEngine();
  return engine.filterAndScore(exercises, context);
}
