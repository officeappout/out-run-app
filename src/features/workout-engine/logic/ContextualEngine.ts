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
  MuscleGroup,
  NoiseLevel,
  SweatLevel,
  MECHANICAL_TYPE_LABELS,
} from '@/features/content/exercises/core/exercise.types';

import { exerciseMatchesProgram } from '../services/shadow-level.utils';

// ============================================================================
// TYPES & CONSTANTS — Extracted to ./contextual-engine.types.ts (Phase 4)
// ============================================================================

import {
  LOCATION_CONSTRAINTS,
  LIFESTYLE_LABELS,
  type LifestylePersona,
  type LocationConstraints,
  type IntentMode,
  type ProgramId,
  type ContextualFilterContext,
  type ScoredExercise,
  type ContextualFilterResult,
  type FilterDescription,
  type MechanicalBalance,
} from './contextual-engine.types';

// Re-export so all external consumers keep their import path unchanged
export {
  LOCATION_CONSTRAINTS,
  LIFESTYLE_LABELS,
  type LifestylePersona,
  type LocationConstraints,
  type IntentMode,
  type ProgramId,
  type ContextualFilterContext,
  type ScoredExercise,
  type ContextualFilterResult,
  type FilterDescription,
  type MechanicalBalance,
} from './contextual-engine.types';

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
    
    // Resolve active program filters (from Shadow Matrix checkboxes)
    const activeProgramFilters = context.activeProgramFilters ?? [];
    const hasStrictProgramFilter = activeProgramFilters.length > 0;

    for (const exercise of exercises) {
      // ── STRICT PROGRAM FILTER ─────────────────────────────────────────
      // When any program checkbox is checked in the Shadow Matrix,
      // ONLY exercises matching at least one active program are allowed
      // in the strength portion. Uses movementGroup / primaryMuscle /
      // explicit programIds matching (exerciseMatchesProgram).
      let programLevel: number | undefined;

      if (hasStrictProgramFilter) {
        const matchesAnyProgram = activeProgramFilters.some(
          (programKey) => exerciseMatchesProgram(exercise, programKey)
        );
        if (!matchesAnyProgram) {
          excludedCount++;
          continue; // Hard-exclude: exercise is NOT in any selected program
        }
      }

      // Legacy programLevels check (for selectedProgram compat)
      if (context.selectedProgram) {
        const exerciseAny = exercise as any;
        if (exerciseAny.programLevels) {
          programLevel = exerciseAny.programLevels[context.selectedProgram];
          if (programLevel === undefined) {
            excludedCount++;
            continue;
          }
          const effectiveLevel = context.getUserLevelForExercise(exercise);
          const minLevel = Math.max(1, effectiveLevel - levelTolerance);
          const maxLevel = effectiveLevel + levelTolerance;
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

      // 48-Hour Muscle Shield — exclude exercises targeting recently trained muscles
      if (context.excludedMuscleGroups?.length && !this.passesMuscleShield(exercise, context.excludedMuscleGroups)) {
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
    // When a single program is selected, the user explicitly wants a
    // focused (non-balanced) workout — relax SA:BA enforcement.
    const relaxSABA = hasStrictProgramFilter && activeProgramFilters.length === 1;
    const balancedExercises = this.applyMechanicalBalancing(scoredExercises, relaxSABA);
    
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
    
    // Strict program filter (from Shadow Matrix checkboxes)
    if (context.activeProgramFilters?.length) {
      filters.push({
        type: 'lifestyle',
        label: 'פילטר תוכניות (מחייב)',
        value: context.activeProgramFilters.join(', '),
      });
    }

    // Legacy program filter (if selected)
    if (context.selectedProgram) {
      const levelTolerance = context.levelTolerance ?? 3;
      filters.push({
        type: 'lifestyle',
        label: 'תוכנית',
        value: context.selectedProgram,
      });
      filters.push({
        type: 'lifestyle',
        label: 'סבילות רמה',
        value: `±${levelTolerance} (Shadow Tracking)`,
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
   * Check if exercise passes 48-hour muscle shield.
   * Exclude if primaryMuscle or any secondaryMuscles is in excludedMuscleGroups.
   */
  private passesMuscleShield(exercise: Exercise, excludedMuscleGroups: MuscleGroup[]): boolean {
    const excludedSet = new Set(excludedMuscleGroups);
    if (exercise.primaryMuscle && excludedSet.has(exercise.primaryMuscle)) return false;
    if (exercise.secondaryMuscles?.some((m) => excludedSet.has(m))) return false;
    return true;
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
   * Find the best matching execution method for the context.
   *
   * PRECISION RULE: Only methods whose `location` field EXACTLY matches
   * the requested location are considered. The `locationMapping` array
   * is a secondary explicit multi-location tag (NOT fuzzy).
   *
   * For park: additionally checks equipment availability against
   * the user's available equipment list.
   */
  /**
   * ADVANCED LOCATION CHAIN — cascading fallback:
   *   Priority 1: Exact requested location (office/park/home/etc.)
   *   Priority 2: 'home' fallback (with equipment)
   *   Priority 3: Bodyweight-only (methods requiring no equipment)
   *
   * Park-specific: equipment gating applies to all candidates.
   */
  private findMatchingMethod(
    exercise: Exercise,
    context: ContextualFilterContext,
    constraints: LocationConstraints
  ): ExecutionMethod | null {
    const methods = exercise.execution_methods || exercise.executionMethods || [];
    if (!methods.length) return null;

    // Helper: prefer methods with media
    const preferMedia = (list: ExecutionMethod[]): ExecutionMethod | null => {
      const withMedia = list.filter(m => m.media?.mainVideoUrl || m.media?.imageUrl);
      return withMedia[0] || list[0] || null;
    };

    // Helper: park equipment gating
    const applyParkGating = (list: ExecutionMethod[]): ExecutionMethod[] => {
      if (!constraints.bypassLimits || context.location !== 'park') return list;
      return list.filter(m => {
        if (m.equipmentIds?.length) {
          return m.equipmentIds.some(eid => context.availableEquipment.includes(eid));
        }
        if (m.equipmentId && !context.availableEquipment.includes(m.equipmentId)) {
          return false;
        }
        return true;
      });
    };

    // Helper: check if a method is bodyweight-only (no equipment needed)
    const isBodyweight = (m: ExecutionMethod): boolean => {
      const noIds = !m.equipmentIds?.length;
      const noId = !m.equipmentId;
      return noIds && noId;
    };

    // ── Priority 1: Exact primary location match ──────────────────────
    let candidates = methods.filter(m => m.location === context.location);
    // Also check locationMapping
    if (candidates.length === 0) {
      candidates = methods.filter(m =>
        m.locationMapping?.includes(context.location)
      );
    }
    if (candidates.length > 0) {
      const gated = applyParkGating(candidates);
      if (gated.length > 0) return preferMedia(gated);
    }

    // ── Priority 2: Home fallback (with improvised equipment) ─────────
    if (context.location !== 'home') {
      const homeCandidates = methods.filter(
        m => m.location === 'home' || m.locationMapping?.includes('home')
      );
      if (homeCandidates.length > 0) {
        return preferMedia(homeCandidates);
      }
    }

    // ── Priority 3: Bodyweight-only (any method with no equipment) ────
    const bodyweightCandidates = methods.filter(isBodyweight);
    if (bodyweightCandidates.length > 0) {
      return preferMedia(bodyweightCandidates);
    }

    // ── No viable method found ────────────────────────────────────────
    return null;
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
    //    Uses Shadow Tracking callback for per-exercise level matching
    const exerciseLevel = this.getExerciseLevel(exercise);
    const userEffectiveLevel = context.getUserLevelForExercise(exercise);
    const levelDiff = Math.abs(exerciseLevel - userEffectiveLevel);
    const levelScore = Math.max(0, 3 - levelDiff);
    score += levelScore;
    reasoning.push(`קרבת רמה: +${levelScore} (הפרש ${levelDiff}, רמה אפקטיבית ${userEffectiveLevel})`);
    
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
   * Apply SA/BA balancing - limit straight arm to max 2 per session.
   *
   * @param relaxSABA  When true (single program selected), skip the SA
   *                   penalty so that focused pulling/pushing workouts
   *                   are not artificially limited.
   */
  private applyMechanicalBalancing(
    exercises: ScoredExercise[],
    relaxSABA = false,
  ): ScoredExercise[] {
    // When a single program filter is active, the user explicitly asked
    // for a focused (non-balanced) session — don't penalise SA excess.
    if (relaxSABA) {
      return exercises;
    }

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
