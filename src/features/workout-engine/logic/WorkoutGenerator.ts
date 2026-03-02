/**
 * WorkoutGenerator - Orchestrator for complete workout session generation
 *
 * Delegates to modular utilities:
 *   - workout-generator.types.ts    → All types and interfaces
 *   - workout-selection.utils.ts    → Domain quotas, rescue, dominance, filtering
 *   - workout-budgeting.utils.ts    → Volume, sets/reps, duration, stats
 *   - workout-sorting.utils.ts      → Physiological sort, antagonist pairing
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { Exercise, getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise, IntentMode, LifestylePersona, LIFESTYLE_LABELS } from './ContextualEngine';

// Re-export all types so external consumers keep importing from this file
export type {
  DifficultyLevel,
  WorkoutStructure,
  ExercisePriority,
  TierName,
  TierConfig,
  WorkoutExercise,
  WorkoutStats,
  GeneratedWorkout,
  VolumeAdjustment,
  BlastModeDetails,
  MechanicalBalanceSummary,
  WorkoutGenerationContext,
} from './workout-generator.types';

export { TIER_TABLE, resolveTier, restSafetyFloor } from './workout-generator.types';

import type {
  DifficultyLevel,
  WorkoutStructure,
  ExercisePriority,
  WorkoutExercise,
  GeneratedWorkout,
  WorkoutGenerationContext,
  BlastModeDetails,
  MechanicalBalanceSummary,
} from './workout-generator.types';

// Selection utils
import {
  getShuffleSeed,
  classifyPriority,
  applyDifficultyFilter,
  selectExercisesForDifficulty,
  selectExercisesWithDomainQuotas,
  selectExercisesWithDominance,
  applySABASelectionBias,
} from './workout-selection.utils';

// Budgeting utils
import {
  getExerciseCountForDuration,
  calculateVolumeAdjustment,
  assignVolume,
  applySmartSetCap,
  calculateEstimatedDuration,
  calculateWorkoutStats,
} from './workout-budgeting.utils';

// Sorting utils
import {
  applyPhysiologicalSort,
  applyAntagonistPairing,
  deduplicateExercises,
} from './workout-sorting.utils';

// ============================================================================
// CONSTANTS (Title / Description templates — kept here, orchestrator-specific)
// ============================================================================

const INACTIVITY_THRESHOLD_DAYS = 3;

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

const DIFFICULTY_TITLE_PREFIX: Record<DifficultyLevel, string> = {
  1: 'אימון התאוששות',
  2: '',
  3: 'אימון כוח עצים 💪',
};

const PERSONA_LABELS_HE: Record<string, string> = {
  parent: 'הורים עסוקים',
  student: 'סטודנטים',
  school_student: 'תלמידים',
  office_worker: 'עובדי משרד',
  home_worker: 'עובדים מהבית',
  senior: 'מבוגרים',
  athlete: 'ספורטאים',
  reservist: 'מילואימניקים',
  active_soldier: 'חיילים סדירים',
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
  generateWorkout(
    scoredExercises: ScoredExercise[],
    context: WorkoutGenerationContext,
  ): GeneratedWorkout {
    // ── Difficulty Resolution ──
    let difficulty: DifficultyLevel = context.difficulty || 2;
    if (context.isFirstSessionInProgram) difficulty = 1;
    if (context.detrainingLock && difficulty === 3) {
      difficulty = 2;
      console.log('[WorkoutGenerator] Detraining lock active — Intense downgraded to Challenging');
    }

    // Difficulty 1 = light strength workout (exercises still picked from full pool).
    // Active Recovery = mobility-only mode (triggered by isRecoveryDay, NOT difficulty).
    const isRecovery = context.isRecoveryDay === true;

    // ── Active Recovery Guard ──────────────────────────────────────────────
    // When explicitly flagged as a recovery day, strip the pool to ONLY
    // cooldown / flexibility / warmup exercises — zero strength allowed.
    if (context.isRecoveryDay === true) {
      const RECOVERY_ROLES = new Set(['cooldown', 'warmup']);
      const before = scoredExercises.length;
      scoredExercises = scoredExercises.filter(se => {
        const role = se.exercise.exerciseRole;
        if (role && RECOVERY_ROLES.has(role)) return true;
        if (se.exercise.movementGroup === 'flexibility') return true;
        return false;
      });
      console.log(
        `[ActiveRecovery] Pool filtered: ${before} → ${scoredExercises.length} ` +
        `(cooldown/flexibility/warmup only)`,
      );
    }

    // Phase 1 Verification: Domain budgets plumbing
    if (context.domainBudgets?.length) {
      console.group('[WorkoutGenerator] Domain Budgets Received (Phase 1)');
      for (const db of context.domainBudgets) {
        console.log(`  ${db.domain} L${db.level}: ${db.daily} sets/day (${db.weekly}/week)`);
      }
      console.groupEnd();
    }

    // Step 1: Exercise count
    const { exerciseCount, includeAccessories } = getExerciseCountForDuration(context.availableTime);

    // Step 1b: Variety jitter (0-30 pts) — wider range for meaningful refresh variety
    const jitterSeed = getShuffleSeed(context);
    let jRng = jitterSeed;
    const nextJitter = () => { jRng = (jRng * 1103515245 + 12345) & 0x7fffffff; return jRng % 31; };
    const jitteredExercises = scoredExercises.map((s) => ({ ...s, score: s.score + nextJitter() }));

    // Step 1c: Master Synergy Scoring (Phase 4B)
    const synergyExercises = this.applySynergyBonuses(jitteredExercises, context);

    // Step 2: Difficulty filter
    const filteredExercises = applyDifficultyFilter(synergyExercises, context, difficulty);

    // Step 3: Select exercises
    const selectedExercises = this.selectExercises(filteredExercises, exerciseCount, includeAccessories, context, difficulty);

    // Step 4: Volume
    const volumeAdjustment = calculateVolumeAdjustment(context, difficulty);
    let workoutExercises = assignVolume(selectedExercises, context, volumeAdjustment, difficulty);

    // Step 4b: Smart set cap
    const maxCap = context.maxSets != null && context.maxSets > 0 ? context.maxSets : Infinity;
    const domainCount = context.requiredDomains?.length;
    if (context.dailySetBudget != null || maxCap !== Infinity) {
      console.group('[Budget Math Formulation] WorkoutGenerator');
      console.log('dailySetBudget:', context.dailySetBudget ?? '(not set)');
      console.log('maxSets cap:', maxCap === Infinity ? 'none' : maxCap);
      console.log('requiredDomains:', domainCount ?? 0);
      console.groupEnd();
    }
    workoutExercises = applySmartSetCap(workoutExercises, maxCap, domainCount);

    // Step 4c: Global budget guardrail
    if (
      context.remainingWeeklyBudget != null &&
      context.remainingWeeklyBudget > 0 &&
      context.remainingWeeklyBudget < workoutExercises.reduce((s, e) => s + e.sets, 0)
    ) {
      const cap = context.remainingWeeklyBudget;
      console.group('[Budget Guard] remainingWeeklyBudget enforcement');
      console.log('Remaining budget:', cap, 'sets');
      console.log('Planned sets:', workoutExercises.reduce((s, e) => s + e.sets, 0));
      console.log('User level:', context.userLevel);
      console.groupEnd();
      workoutExercises = applySmartSetCap(workoutExercises, cap, domainCount);
    }

    // Step 5: Protocol injection
    const protocolResult = this.selectProtocol(difficulty, context);

    // Step 5: Physiological sort — Upper Body (Push/Pull) → Legs → Core
    workoutExercises = applyPhysiologicalSort(workoutExercises);

    // Step 5b: Antagonist pairing
    if (protocolResult.setType === 'antagonist_pair') {
      workoutExercises = applyAntagonistPairing(workoutExercises);
    }

    // Step 5c: Deduplicate
    workoutExercises = deduplicateExercises(workoutExercises);

    // Step 6: Title/description/cue
    const title = this.generateTitle(context, difficulty);
    const description = this.generateDescription(context, difficulty);
    const aiCue = this.generateAICue(context, workoutExercises.length, difficulty);

    // Step 7: Duration
    const estimatedDuration = calculateEstimatedDuration(workoutExercises);

    // Step 8: Structure
    let structure = this.determineStructure(context, workoutExercises);
    if (protocolResult.structure !== 'standard') {
      structure = protocolResult.structure;
      console.log(`[WorkoutGenerator] Protocol injected: structure=${structure}`);
    }
    const blastMode = context.intentMode === 'blast' ? this.getBlastModeDetails(context, workoutExercises) : undefined;

    // Step 9: Mechanical balance
    const mechanicalBalance = this.calculateMechanicalBalance(workoutExercises);

    // Step 10: Stats
    const stats = calculateWorkoutStats(workoutExercises, difficulty, estimatedDuration, context.userWeight);
    const totalPlannedSets = workoutExercises.reduce((sum, ex) => sum + ex.sets, 0);

    // Debug log
    console.group('[WorkoutGenerator] Video Resolution & Level Mapping');
    workoutExercises.forEach((ex, i) => {
      const name = typeof ex.exercise.name === 'string' ? ex.exercise.name : (ex.exercise.name as any)?.he || ex.exercise.id;
      const programLevel = ex.programLevel ?? 1;
      const videoUrl = ex.method?.media?.mainVideoUrl || (ex.exercise as any).media?.videoUrl || '(none)';
      console.log(
        `[${i + 1}] ${name} | User Level ${context.userLevel} → Exercise programLevel=${programLevel} | ` +
        `Tier=${ex.tier} | Sets=${ex.sets} Reps=${ex.reps} Rest=${ex.restSeconds}s | Video=${videoUrl ? 'YES' : 'NO'}`,
      );
    });
    console.groupEnd();

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
      isRecovery,
      totalPlannedSets,
    };
  }

  // ── MASTER SYNERGY SCORING (Phase 4B) ──────────────────────────────────

  private applySynergyBonuses(
    exercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
    context: WorkoutGenerationContext,
  ): (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] {
    if (exercises.length === 0) return exercises;

    let varietyCount = 0;
    let equipmentCount = 0;
    let nakedCount = 0;
    let modalityCount = 0;
    let verticalCount = 0;

    // 1. Equipment Synergy (+15): Find dominant equipment across top-scored exercises
    const topN = exercises.slice().sort((a, b) => b.score - a.score).slice(0, 10);
    const gearFrequency: Record<string, number> = {};
    for (const ex of topN) {
      const methodAny = ex.method as { gearIds?: string[]; gearId?: string } | undefined;
      const gearIds = methodAny?.gearIds ?? (methodAny?.gearId ? [methodAny.gearId] : []);
      for (const g of gearIds) {
        if (g) gearFrequency[g] = (gearFrequency[g] ?? 0) + 1;
      }
    }
    let dominantGear: string | undefined;
    let maxGearCount = 1;
    for (const [gear, count] of Object.entries(gearFrequency)) {
      if (count > maxGearCount) { dominantGear = gear; maxGearCount = count; }
    }

    // 2. Modality Matching (+10): Find dominant mechanical type from top exercises
    const mechFrequency: Record<string, number> = {};
    for (const ex of topN) {
      const mt = ex.mechanicalType;
      if (mt) mechFrequency[mt] = (mechFrequency[mt] ?? 0) + 1;
    }
    let dominantMech: string | undefined;
    let maxMechCount = 1;
    for (const [mech, count] of Object.entries(mechFrequency)) {
      if (count > maxMechCount) { dominantMech = mech; maxMechCount = count; }
    }

    // 3. Hierarchical Vertical Preference — diminishing bonus:
    //    1st vertical gets +25, 2nd gets +12, rest get +0.
    //    This lets the engine "stack" 2 verticals before preferring horizontals.
    const VERTICAL_BONUSES = [25, 12];
    const verticalCandidates = exercises
      .filter(ex => {
        const mg = ex.exercise.movementGroup;
        return mg === 'vertical_pull' || mg === 'vertical_push';
      })
      .sort((a, b) => b.score - a.score);

    const verticalBonusById = new Map<string, number>();
    for (let i = 0; i < Math.min(verticalCandidates.length, VERTICAL_BONUSES.length); i++) {
      verticalBonusById.set(verticalCandidates[i].exercise.id, VERTICAL_BONUSES[i]);
    }

    // 4. Apply bonuses
    const result = exercises.map(ex => {
      let bonus = 0;
      const reasoning = [...ex.reasoning];

      // Hierarchical Vertical Preference (+25/+12)
      const vBonus = verticalBonusById.get(ex.exercise.id);
      if (vBonus) {
        bonus += vBonus;
        verticalCount++;
        reasoning.push(`vertical_pref:+${vBonus}(${ex.exercise.movementGroup})`);
      }

      // Variety Guard (-20): penalize exercises used in last 2 sessions
      if (context.recentExerciseIds?.has(ex.exercise.id)) {
        bonus -= 20;
        varietyCount++;
        reasoning.push('variety_guard:-20');
      }

      // Naked Strength (+12): prefer bodyweight exercises by default
      const methodAny = ex.method as { gearIds?: string[]; gearId?: string } | undefined;
      const allGear = methodAny?.gearIds ?? (methodAny?.gearId ? [methodAny.gearId] : []);
      const isNaked = allGear.length === 0
        || allGear.every(g => !g || g.toLowerCase() === 'bodyweight' || g.toLowerCase() === 'none');
      if (isNaked) {
        bonus += 12;
        nakedCount++;
        reasoning.push('naked_strength:+12');
      }

      // Equipment Synergy (+8): reward same equipment as dominant
      if (dominantGear) {
        if (allGear.includes(dominantGear)) {
          bonus += 8;
          equipmentCount++;
          reasoning.push(`equip_synergy:+8(${dominantGear})`);
        }
      }

      // Modality Matching (+10): reward same mechanical type as dominant
      if (dominantMech && ex.mechanicalType === dominantMech) {
        bonus += 10;
        modalityCount++;
        reasoning.push(`modality_match:+10(${dominantMech})`);
      }

      if (bonus === 0) return ex;
      return { ...ex, score: ex.score + bonus, reasoning };
    });

    if (verticalCount > 0 || varietyCount > 0 || nakedCount > 0 || equipmentCount > 0 || modalityCount > 0) {
      console.group('[Synergy Scoring] Master Coach Rules');
      if (verticalCount > 0) console.log(`Vertical Preference: ${verticalCount} exercises boosted (diminishing: ${VERTICAL_BONUSES.join('/')})`);
      if (nakedCount > 0) console.log(`Naked Strength: ${nakedCount} bodyweight exercises boosted (+12)`);
      if (varietyCount > 0) console.log(`Variety Guard: ${varietyCount} exercises penalized (-20)`);
      if (dominantGear) console.log(`Equipment Synergy: "${dominantGear}" dominant → ${equipmentCount} exercises boosted (+8)`);
      if (dominantMech) console.log(`Modality Match: "${dominantMech}" dominant → ${modalityCount} exercises boosted (+10)`);
      console.groupEnd();
    }

    return result;
  }

  // ── EXERCISE SELECTION ROUTER ────────────────────────────────────────────

  private selectExercises(
    scoredExercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
    count: number,
    includeAccessories: boolean,
    context: WorkoutGenerationContext,
    difficulty: DifficultyLevel,
  ): (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] {
    if (scoredExercises.length === 0) return [];

    // Dominance ratio path
    if (
      context.dominanceRatio &&
      context.priority1SkillIds?.length &&
      (context.priority2SkillIds?.length || context.priority3SkillIds?.length) &&
      context.dailySetBudget != null
    ) {
      const dominanceSelected = selectExercisesWithDominance(
        scoredExercises, count, includeAccessories, context, difficulty,
      );
      if (dominanceSelected.length > 0) return dominanceSelected;
    }

    // Domain quota path (full body)
    if (context.requiredDomains?.length && context.requiredDomains.length > 0) {
      const domainSelected = selectExercisesWithDomainQuotas(
        scoredExercises, count, includeAccessories, context, difficulty,
      );
      if (domainSelected.length > 0) return domainSelected;
    }

    // SA hard block
    let safePool = scoredExercises;
    if (
      context.weeklySACap != null &&
      context.weeklySASets != null &&
      context.weeklySASets >= context.weeklySACap
    ) {
      const before = safePool.length;
      safePool = safePool.filter((s) => {
        if (s.exercise.mechanicalType !== 'straight_arm') return true;
        const tags = s.exercise.tags || [];
        const name = (typeof s.exercise.name === 'string'
          ? s.exercise.name
          : (s.exercise.name as any)?.he || (s.exercise.name as any)?.en || ''
        ).toLowerCase();
        return tags.includes('handstand' as any) || name.includes('handstand') || name.includes('עמידת ידיים');
      });
      if (safePool.length < before) {
        console.log(
          `[WorkoutGenerator] SA HARD BLOCK: Removed ${before - safePool.length} straight-arm exercises ` +
          `(weekly SA sets ${context.weeklySASets} >= cap ${context.weeklySACap})`,
        );
      }
    }

    // Score-based selection
    const difficultySelected = selectExercisesForDifficulty(safePool, count, context, difficulty);
    const selected = [...difficultySelected];

    // SA/BA selection bias
    if (context.straightArmRatio != null) {
      applySABASelectionBias(selected, safePool, context.straightArmRatio);
    }

    return selected.slice(0, count);
  }

  // ── PROTOCOL SELECTION ───────────────────────────────────────────────────

  private selectProtocol(
    difficulty: DifficultyLevel,
    context: WorkoutGenerationContext,
  ): { structure: WorkoutStructure; setType: string } {
    if (difficulty === 1) {
      return { structure: 'standard', setType: 'straight' };
    }

    const adminProtocols = context.preferredProtocols;
    const adminProbability = context.protocolProbability;

    if (!adminProtocols?.length) {
      if (adminProbability != null && adminProbability > 0) {
        console.log('[WorkoutGenerator] Admin set probability but no protocols — defaulting to standard');
      }
      return { structure: 'standard', setType: 'straight' };
    }

    const probability = adminProbability ?? 0;
    if (probability <= 0 || Math.random() > probability) {
      return { structure: 'standard', setType: 'straight' };
    }

    const selected = adminProtocols[Math.floor(Math.random() * adminProtocols.length)];
    console.log(`[WorkoutGenerator] Admin protocol injected: ${selected} (p=${probability})`);

    if (selected === 'emom') {
      return { structure: 'emom', setType: 'straight' };
    }

    return { structure: 'standard', setType: selected };
  }

  // ── TITLE / DESCRIPTION / CUE ───────────────────────────────────────────

  private generateTitle(context: WorkoutGenerationContext, difficulty: DifficultyLevel): string {
    const parts: string[] = [];
    const difficultyPrefix = DIFFICULTY_TITLE_PREFIX[difficulty];
    if (difficultyPrefix) {
      parts.push(difficultyPrefix);
    } else {
      const templates = TITLE_TEMPLATES[context.intentMode] || TITLE_TEMPLATES.normal;
      parts.push(templates[context.location] || templates.default || 'אימון יומי');
    }
    if (context.persona && !difficultyPrefix) {
      const personaLabel = PERSONA_LABELS_HE[context.persona];
      if (personaLabel) parts[0] = `${parts[0]} ל${personaLabel}`;
    }
    if (difficultyPrefix && context.location) {
      const locationLabel = LOCATION_LABELS_HE[context.location];
      if (locationLabel) {
        if (context.persona) {
          const personaLabel = PERSONA_LABELS_HE[context.persona];
          if (personaLabel) parts.push(`ל${personaLabel}`);
        }
        parts.push(locationLabel);
      }
    }
    return parts.join(' ');
  }

  private generateDescription(context: WorkoutGenerationContext, difficulty: DifficultyLevel): string {
    if (difficulty === 1) return 'אימון קל להחלמה ושיקום - מושלם לימים שצריך לנוח!';
    if (difficulty === 3) return 'אימון אינטנסיבי לפיתוח כוח - תרגילים מאתגרים עם מנוחות ארוכות!';
    const persona = context.persona || 'default';
    const templates = DESCRIPTION_TEMPLATES[persona] || DESCRIPTION_TEMPLATES.default;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateAICue(context: WorkoutGenerationContext, exerciseCount: number, difficulty: DifficultyLevel): string | undefined {
    if (difficulty === 1) return `🧘 מצב התאוששות. ${exerciseCount} תרגילים קלים - הגוף ישכור לך מחר!`;
    if (difficulty === 3) return `💪 מצב כוח! ${exerciseCount} תרגילים עם אתגרים מעל הרמה שלך. מנוחות ארוכות - תן בכל חזרה!`;
    if (context.intentMode === 'blast') return `🔥 מצב Blast! ${exerciseCount} תרגילים באינטנסיביות גבוהה. מנוח מקוצר - תן בראש!`;
    if (context.intentMode === 'on_the_way') return `🚗 אימון מהיר לפני היום הגדול. ${exerciseCount} תרגילים, אפס זיעה!`;
    if (context.intentMode === 'field') return `🎖️ מצב שטח! ${exerciseCount} תרגילים ללא ציוד. לחימה!`;
    if (context.daysInactive > INACTIVITY_THRESHOLD_DAYS) return `💪 חזרת אחרי ${context.daysInactive} ימים! נתחיל בקלות - העיקר להתחיל.`;
    if (context.persona) {
      const personaLabel = LIFESTYLE_LABELS[context.persona];
      return `👋 אימון מותאם ל${personaLabel}. מוכן?`;
    }
    return undefined;
  }

  // ── STRUCTURE / BLAST / BALANCE ──────────────────────────────────────────

  private determineStructure(context: WorkoutGenerationContext, exercises: WorkoutExercise[]): WorkoutStructure {
    if (context.intentMode === 'blast') return Math.random() > 0.5 ? 'emom' : 'amrap';
    if (exercises.length <= 3 && context.availableTime <= 15) return 'circuit';
    return 'standard';
  }

  private getBlastModeDetails(context: WorkoutGenerationContext, _exercises: WorkoutExercise[]): BlastModeDetails {
    const isEMOM = Math.random() > 0.5;
    if (isEMOM) {
      return { type: 'emom', durationMinutes: Math.min(context.availableTime, 20), workSeconds: 40, restSeconds: 20 };
    }
    return { type: 'amrap', durationMinutes: Math.min(context.availableTime, 15), rounds: undefined };
  }

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
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createWorkoutGenerator(): WorkoutGenerator {
  return new WorkoutGenerator();
}

export function generateWorkout(
  scoredExercises: ScoredExercise[],
  context: WorkoutGenerationContext,
): GeneratedWorkout {
  const generator = createWorkoutGenerator();
  return generator.generateWorkout(scoredExercises, context);
}
