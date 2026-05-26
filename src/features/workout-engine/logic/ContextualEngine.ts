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

import { normalizeGearId, isGearOptional, satisfiesGearRequirement } from '../shared/utils/gear-mapping.utils';
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
import { resolveExerciseLevelForDomains } from './workout-selection.utils';

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
  type FilterStageCounts,
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
  type FilterStageCounts,
} from './contextual-engine.types';

/**
 * Maximum straight arm exercises per session (SA limit)
 */
const MAX_STRAIGHT_ARM_PER_SESSION = 2;

// ── Exclusive Skill Domain Gate ───────────────────────────────────────────────
// Technique-heavy skill tracks that must NOT appear in general strength sessions
// unless the user has explicitly scheduled that skill as their active program.
// Extend this array when new advanced skill tracks are introduced.
const GATED_SKILL_DOMAINS = ['muscle_up'] as const;

// Baseline strength domains: exercises shared with any of these always pass
// the gate even if they also belong to a gated skill track (e.g. an exercise
// in both muscle_up and pull is a legitimate pull-session exercise).
const BASELINE_DOMAINS = ['push', 'pull', 'legs', 'core'] as const;

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

    const fCounts: FilterStageCounts = {
      pool_start: exercises.length,
      excluded_program_filter: 0,
      excluded_level_tolerance: 0,
      excluded_skill_gate: 0,
      excluded_exclusive_skill_gate: 0,
      excluded_balance_gate: 0,
      excluded_injury_shield: 0,
      excluded_48h_muscle: 0,
      excluded_field_mode: 0,
      excluded_location: 0,
      excluded_sweat: 0,
      excluded_noise: 0,
      after_hard_filters: 0,
    };

    const activeDomains = context.activeDomains ?? context.activeProgramFilters;

    for (const exercise of exercises) {
      let programLevel: number | undefined;

      if (hasStrictProgramFilter) {
        const matchesAnyProgram = activeProgramFilters.some(
          (programKey) => exerciseMatchesProgram(exercise, programKey)
        );
        if (!matchesAnyProgram) {
          excludedCount++;
          fCounts.excluded_program_filter++;
          continue;
        }
      }

      // Domain-aware level resolution: resolve programLevel from the
      // targetPrograms entry matching the active domains, not [0].
      // The primary active program (e.g. `planche`) is forwarded so that
      // multi-assigned exercises resolve to the skill-level entry instead
      // of being hijacked by a baseline foundational entry indexed earlier.
      const resolved = resolveExerciseLevelForDomains(
        exercise,
        activeDomains,
        context.activeProgramId,
      );
      programLevel = resolved.level;

      // Level tolerance filter: exercise must be within ±tolerance of user's domain level
      const effectiveLevelForTolerance = context.getUserLevelForExercise(exercise);
      const minLevel = Math.max(1, effectiveLevelForTolerance - levelTolerance);
      const maxLevel = effectiveLevelForTolerance + levelTolerance;
      if (programLevel < minLevel || programLevel > maxLevel) {
        excludedCount++;
        fCounts.excluded_level_tolerance++;
        continue;
      }

      // ── Exclusive Skill Domain Gate ────────────────────────────────────────
      // An exercise is "exclusively gated" when ALL of its targetPrograms belong
      // to gated skill tracks and NONE overlap with baseline domains.
      // Such exercises are only included when the relevant skill track is active
      // in the current session (present in activeDomains or activeProgramFilters).
      //
      // Decision matrix:
      //   [muscle_up] only, skill inactive  → excluded
      //   [muscle_up] only, skill active    → passes
      //   [muscle_up, pull]                 → passes (shared with baseline 'pull')
      //   [push] only                       → passes (pure baseline)
      const hasGatedDomain = (GATED_SKILL_DOMAINS as readonly string[]).some(
        d => exerciseMatchesProgram(exercise, d),
      );
      if (hasGatedDomain) {
        const hasBaselineDomain = (BASELINE_DOMAINS as readonly string[]).some(
          d => exerciseMatchesProgram(exercise, d),
        );
        if (!hasBaselineDomain) {
          // Exercise is 100% exclusive to a gated skill track.
          // Allow it only when the specific skill domain is active in this session.
          const activeDomainsSet = new Set(activeDomains ?? []);
          const skillDomainIsActive = (GATED_SKILL_DOMAINS as readonly string[]).some(
            d => exerciseMatchesProgram(exercise, d) && activeDomainsSet.has(d),
          );
          if (!skillDomainIsActive) {
            excludedCount++;
            fCounts.excluded_exclusive_skill_gate++;
            continue;
          }
        }
        // hasBaselineDomain === true → shared exercise → pass through unconditionally
      }

      // ── Balance Score Gate ─────────────────────────────────────────────────
      // Exercises with a balanceScore > 10 on the 1-15 Handstand Triad scale are
      // freestanding / balance-dominant handstand skills that require deliberate
      // technique practice.  They must NOT leak into general Push sessions.
      // Exercises with no balanceScore, or balanceScore ≤ 10 (wall handstands,
      // pike push-ups, crow holds, etc.) pass freely in any Push context.
      //
      // The gate fires only when the user has NOT selected a handstand/hspu
      // program for the current session (checked via activeDomains).
      {
        const BALANCE_GATE_THRESHOLD = 10;
        const maxBalanceScore = Math.max(
          0,
          ...(exercise.targetPrograms ?? []).map(tp => (tp as any).balanceScore ?? 0),
        );
        if (maxBalanceScore > BALANCE_GATE_THRESHOLD) {
          const HANDSTAND_DOMAINS = new Set(['handstand', 'hspu']);
          const handstandIsActive = (activeDomains ?? []).some(d => HANDSTAND_DOMAINS.has(d));
          if (!handstandIsActive) {
            excludedCount++;
            fCounts.excluded_balance_gate++;
            continue;
          }
        }
      }

      // Skill Gate: uses the domain-resolved level, not .some() across all targetPrograms
      const SKILL_GATE_MIN_LEVEL = 15;
      const exerciseTags = exercise.tags || [];
      const isSkillTagged = exerciseTags.includes('skill' as any);
      const isEliteInActiveDomain = programLevel > SKILL_GATE_MIN_LEVEL;

      if (isSkillTagged || isEliteInActiveDomain) {
        const userEffective = context.getUserLevelForExercise(exercise);
        if (userEffective < SKILL_GATE_MIN_LEVEL) {
          excludedCount++;
          fCounts.excluded_skill_gate++;
          continue;
        }
      }

      if (!this.passesInjuryShield(exercise, context.injuryShield)) {
        excludedCount++;
        fCounts.excluded_injury_shield++;
        continue;
      }

      if (context.excludedMuscleGroups?.length && !this.passesMuscleShield(exercise, context.excludedMuscleGroups)) {
        excludedCount++;
        fCounts.excluded_48h_muscle++;
        continue;
      }
      
      if (context.intentMode === 'field') {
        if (!this.passesFieldMode(exercise)) {
          excludedCount++;
          fCounts.excluded_field_mode++;
          continue;
        }
      }
      
      const matchingMethod = this.findMatchingMethod(exercise, context, constraints);
      if (!matchingMethod) {
        excludedCount++;
        fCounts.excluded_location++;
        continue;
      }
      
      if (!constraints.bypassLimits) {
        if (context.intentMode !== 'blast') {
          const effectiveSweatLimit = context.intentMode === 'on_the_way' ? 1 : constraints.sweatLimit;
          if (exercise.sweatLevel && exercise.sweatLevel > effectiveSweatLimit) {
            excludedCount++;
            fCounts.excluded_sweat++;
            continue;
          }
        }
        
        if (exercise.noiseLevel && exercise.noiseLevel > constraints.noiseLimit) {
          excludedCount++;
          fCounts.excluded_noise++;
          continue;
        }
      }
      
      passedHardFilters.push({ exercise, method: matchingMethod, programLevel });
    }

    fCounts.after_hard_filters = passedHardFilters.length;
    
    // Step 2: Score exercises (include domain-resolved program level)
    const scoredExercises = passedHardFilters.map(({ exercise, method, programLevel }) => {
      const scored = this.scoreExercise(exercise, method, context, activeDomains);
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
      filterCounts: fCounts,
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
    
    // Fallback: field mode requires no equipment.
    // Prefer executionMethods if available; legacy exercise.equipment is unreliable
    // because duplicated exercises often carry stale data.
    const methods = (exercise as any).execution_methods ?? [];
    if (methods.length > 0) {
      const allIds = methods.flatMap((m: any) => [
        ...((m.gearIds as string[]) ?? []),
        ...((m.equipmentIds as string[]) ?? []),
      ]).filter(Boolean);
      return allIds.length === 0 || allIds.every((id: string) => id === 'none' || id === 'bodyweight');
    }
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

    // Unified gear collector — merges equipmentIds + gearIds, normalises all
    const collectMethodGear = (m: ExecutionMethod): string[] => {
      const raw: string[] = [];
      if (m.equipmentIds?.length) raw.push(...m.equipmentIds);
      else if ((m as any).equipmentId) raw.push((m as any).equipmentId);
      if (m.gearIds?.length) raw.push(...m.gearIds);
      else if ((m as any).gearId) raw.push((m as any).gearId);
      return raw.filter(Boolean).map(normalizeGearId);
    };

    // Tier 1 middleware (`InputSanitizerMiddleware.normalizeEquipmentArray`)
    // guarantees `context.availableEquipment` is non-empty and contains the
    // canonical gear IDs for the session, including the ESSENTIAL_PARK_GEAR
    // catastrophic fallback when no real park inventory was resolved.  The
    // local fallback that previously fired here is therefore obsolete.
    const normalizedAvailable = context.availableEquipment.map(normalizeGearId);

    // Gear that every park/outdoor location effectively provides:
    // floor surface replaces a mat, walls exist everywhere.
    const SURFACE_GEAR_AT_PARK = new Set(['mat', 'yoga_mat', 'wall', 'chair']);

    // ── Park equipment gating ─────────────────────────────────────────────────
    // satisfiesGearRequirement (imported from gear-mapping.utils.ts) is the
    // single source of truth for unidirectional rules such as:
    //   parallettes → satisfied by 'parallettes' OR 'dip_station'
    //   dip_station → satisfied by 'dip_station' ONLY
    // Both `applyParkGating` and `requiresOnlyAvailableGear` route through it
    // so the rule is enforced consistently across the entire engine.

    const applyParkGating = (list: ExecutionMethod[]): ExecutionMethod[] => {
      if (!constraints.bypassLimits || context.location !== 'park') return list;
      return list.filter(m => {
        const allIds = collectMethodGear(m);
        if (allIds.length === 0) return true;
        const requiredIds = allIds.filter(
          id => id !== 'bodyweight' && id !== 'none' && !SURFACE_GEAR_AT_PARK.has(id) && !isGearOptional(id),
        );
        if (requiredIds.length === 0) return true;
        return requiredIds.every(reqId => satisfiesGearRequirement(reqId, normalizedAvailable));
      });
    };

    const isBodyweight = (m: ExecutionMethod): boolean => {
      const ids = collectMethodGear(m);
      return ids.length === 0 ||
        ids.every(id => id === 'bodyweight' || id === 'none');
    };

    // Priority 2.5 helper: a method qualifies if all its required gear is in the
    // resolved available set (which already contains ESSENTIAL_PARK_GEAR IDs when
    // the catastrophic fallback is active, so this works correctly in both modes).
    const requiresOnlyAvailableGear = (m: ExecutionMethod): boolean => {
      const allIds = collectMethodGear(m);
      if (allIds.length === 0) return false;
      const requiredIds = allIds.filter(
        id => id !== 'bodyweight' && id !== 'none' && !SURFACE_GEAR_AT_PARK.has(id) && !isGearOptional(id),
      );
      if (requiredIds.length === 0) return false;
      return requiredIds.every(reqId => satisfiesGearRequirement(reqId, normalizedAvailable));
    };

    // ── PARK: Strict location enforcement ────────────────────────────────
    // At a park, only methods explicitly tagged for park/outdoor are considered.
    // If park methods exist but ALL fail equipment gating, the exercise is
    // hard-rejected — there is NO fallback to home or generic gear paths.
    // This prevents location mixing: a TRX-dependent "home" method must never
    // be selected just because TRX happens to be available at this park.
    //
    // The only non-park-tagged methods that survive are purely bodyweight/surface
    // methods, which have no equipment requirement and are universally outdoor-
    // compatible (e.g. a push-up with no gearId).
    if (context.location === 'park') {
      const parkCandidates = methods.filter(m =>
        m.location === 'park' || m.locationMapping?.includes('park' as any),
      );

      if (parkCandidates.length > 0) {
        const gated = applyParkGating(parkCandidates);
        if (gated.length > 0) return preferMedia(gated);

        // Park methods exist but ALL failed equipment gating → strict rejection.
        // Do not fall through to home, available-gear, or bodyweight paths.
        const exName = typeof exercise.name === 'string'
          ? exercise.name
          : (exercise.name?.he || exercise.name?.en || exercise.id);
        console.warn(
          `[ParkGating] "${exName}" — ${parkCandidates.length} park method(s) all gated → exercise excluded`,
          'Required gear not in park inventory:',
          parkCandidates.map(m => ({ method: m.methodName, gear: collectMethodGear(m) })),
          'Available:', context.availableEquipment.slice(0, 20),
        );
        return null;
      }

      // No park-tagged methods at all → only pure bodyweight/surface methods survive.
      // Home-tagged methods are NOT used even if their gear happens to be available.
      const BODYWEIGHT_PASS = new Set(['bodyweight', 'none', ...Array.from(SURFACE_GEAR_AT_PARK)]);
      const bwCandidates = methods.filter(m => {
        const ids = collectMethodGear(m);
        return ids.length === 0 || ids.every(id => BODYWEIGHT_PASS.has(id));
      });
      return bwCandidates.length > 0 ? preferMedia(bwCandidates) : null;
    }

    // ── Priority 1: Exact primary location match (non-park locations) ─────
    const candidates = methods.filter(m =>
      m.location === context.location ||
      m.locationMapping?.includes(context.location),
    );
    if (candidates.length > 0) return preferMedia(candidates);

    // ── Priority 2: Home fallback (non-park, non-home locations) ──────────
    if (context.location !== 'home') {
      const homeCandidates = methods.filter(
        m => m.location === 'home' || m.locationMapping?.includes('home'),
      );
      if (homeCandidates.length > 0) return preferMedia(homeCandidates);
    }

    // ── Priority 2.5: Methods requiring only available gear (non-park) ────
    const availableGearCandidates = methods.filter(requiresOnlyAvailableGear);
    if (availableGearCandidates.length > 0) return preferMedia(availableGearCandidates);

    // ── Priority 3: Bodyweight-only (non-park, any method, no equipment) ──
    const PASSTHROUGH_GEAR = new Set([
      'bodyweight', 'none',
      ...Array.from(SURFACE_GEAR_AT_PARK),
    ]);
    const bodyweightCandidates = methods.filter(m => {
      const ids = collectMethodGear(m);
      return ids.length === 0 || ids.every(id => PASSTHROUGH_GEAR.has(id));
    });
    if (bodyweightCandidates.length > 0) return preferMedia(bodyweightCandidates);

    // ── No viable method found ─────────────────────────────────────────────
    return null;
  }
  
  /**
   * Score an exercise based on context
   */
  private scoreExercise(
    exercise: Exercise,
    method: ExecutionMethod,
    context: ContextualFilterContext,
    activeDomains?: string[],
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
    //    Uses domain-aware level resolution + Shadow Tracking callback.
    //    The primary `activeProgramId` is forwarded so multi-assigned
    //    exercises resolve to the skill-level entry (e.g. planche L7) rather
    //    than the baseline (push L5) when the user is training that skill.
    const { level: exerciseLevel, resolvedDomain } = resolveExerciseLevelForDomains(
      exercise,
      activeDomains,
      context.activeProgramId,
    );
    const userEffectiveLevel = context.getUserLevelForExercise(exercise);
    const levelDiff = Math.abs(exerciseLevel - userEffectiveLevel);
    const levelScore = Math.max(0, 3 - levelDiff);
    score += levelScore;
    const exerciseName = typeof exercise.name === 'string'
      ? exercise.name : (exercise.name as any)?.he || exercise.id;
    reasoning.push(`קרבת רמה: +${levelScore} (הפרש ${levelDiff}, רמה אפקטיבית ${userEffectiveLevel})`);
    // NOTE: userDomainLevel is the DOMAIN-SPECIFIC user level (e.g. push-L22
    // for a full_body master user). This is the level used for BOTH scoring
    // and tier classification. The format "userDomainL=X" distinguishes it
    // clearly from the global userLevel so logs are never misleading.
    reasoning.push(`[LevelResolution] ${exerciseName} → L${exerciseLevel} via ${resolvedDomain ?? 'fallback'} | userDomainL=${userEffectiveLevel}`);
    
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
   * Get exercise level, domain-aware.
   * Resolves from targetPrograms matching the active domains, falling back
   * to the first targetPrograms entry or recommendedLevel.
   */
  private getExerciseLevel(exercise: Exercise, activeDomains?: string[]): number {
    return resolveExerciseLevelForDomains(exercise, activeDomains).level;
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
