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
import { resolveToSlug } from '../services/program-hierarchy.utils';
import { normalizeGearId } from '../shared/utils/gear-mapping.utils';

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
import { HORIZONTAL_MOVEMENT_GROUPS } from './workout-generator.types';

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
  resolveExerciseLevelForDomains,
} from './workout-selection.utils';

// Budgeting utils
import {
  getExerciseCountForDuration,
  calculateVolumeAdjustment,
  assignVolume,
  applySmartSetCap,
  calculateEstimatedDuration,
  calculateWorkoutStats,
  isTimeBasedExercise,
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
// LEVEL-AWARE SUBSTITUTE HELPER
// ============================================================================

interface LevelSubstituteResult {
  exercise: Exercise;
  level: number;
  gap: number;
  radius: number;
}

// Movement-group → logical domain mapping (shared by guarantee steps)
const MG_TO_OWN_DOMAIN: Record<string, string> = {
  vertical_pull:    'pull',  horizontal_pull:  'pull',
  vertical_push:    'push',  horizontal_push:  'push',
  squat:            'legs',  hinge:            'legs', lunge: 'legs',
  core:             'core',  anti_extension:   'core', anti_rotation: 'core',
};

/**
 * Resolve the correct programLevel for an INJECTED exercise.
 *
 * Problem: When an exercise is placed by HorizontalGuarantee or
 * FullBodyGuarantee it may have multiple targetPrograms entries
 * (e.g., push L12 and full_body L19).  If the search domainLevel was
 * wrong the substitute search could have returned L19, producing a
 * push exercise stamped as L19 in the workout.
 *
 * Fix: Always resolve the level from the exercise's OWN movement
 * domain (horizontal_push → push) by scanning its targetPrograms:
 *   1. Find an entry whose programId slug === ownDomain  (exact match)
 *   2. Find an entry whose slug contains ownDomain keyword (loose match)
 *   3. Fall back to the entry closest to domainLevel
 */
function resolveInjectedLevel(
  exercise: Exercise,
  movementGroup: string,
  domainLevel: number,
): number {
  const ownDomain = MG_TO_OWN_DOMAIN[movementGroup] ?? movementGroup;
  const tps = exercise.targetPrograms ?? [];
  if (tps.length === 0) return domainLevel;

  // 1. Exact slug match — resolveToSlug maps Firestore IDs → canonical slug
  const exactMatch = tps.find(tp => {
    const slug = resolveToSlug(tp.programId);
    return slug === ownDomain || tp.programId === ownDomain;
  });
  if (exactMatch) return exactMatch.level;

  // 2. Loose slug containment (e.g. 'full_body_push' contains 'push')
  const looseMatch = tps.find(tp => {
    const slug = resolveToSlug(tp.programId).toLowerCase();
    return slug.includes(ownDomain);
  });
  if (looseMatch) return looseMatch.level;

  // 3. Closest to the expected domain level
  const sorted = [...tps].sort(
    (a, b) => Math.abs(a.level - domainLevel) - Math.abs(b.level - domainLevel),
  );
  const closest = sorted[0];
  if (closest) {
    console.warn(
      `[resolveInjectedLevel] No ${ownDomain}-domain match for "${getLocalizedText(exercise.name)}" ` +
      `— falling back to closest tp (programId=${closest.programId}, L${closest.level})`,
    );
    return closest.level;
  }

  return domainLevel;
}

/**
 * Progressive-radius search for a level-appropriate exercise.
 *
 * Searches globalExercisePool for exercises matching `targetGroup`
 * using expanding search radii (±2 → ±4 → ±6).  Within each radius
 * candidates are sorted by level proximity first, score second.
 *
 * Returns null if nothing is found within ±6 — callers must NOT
 * inject a low-level exercise in that case.
 */
function findLevelAppropriateSubstitute(
  pool: Exercise[],
  targetGroup: string,
  domainLevel: number,
  usedIds: Set<string>,
  _userLevelsMap: Map<string, number> | undefined,
  domain: string | undefined,
): LevelSubstituteResult | null {
  const RADII = [2, 4, 6] as const;

  const groupCandidates = pool.filter(
    ex => ex.movementGroup === targetGroup && !usedIds.has(ex.id),
  );

  if (groupCandidates.length === 0) return null;

  type Flat = { exercise: Exercise; level: number; gap: number };

  // Gap is ALWAYS computed against domainLevel (the user's actual level
  // for this movement category).  Never against a per-program level that
  // can silently resolve to L1.
  const flatten = (ex: Exercise): Flat[] =>
    (ex.targetPrograms ?? []).map(tp => ({
      exercise: ex,
      level: tp.level,
      gap: Math.abs(tp.level - domainLevel),
    }));

  const allFlat: Flat[] = groupCandidates.flatMap(flatten);

  for (const radius of RADII) {
    const inRange = allFlat.filter(c => c.gap <= radius);
    if (inRange.length === 0) continue;

    inRange.sort((a, b) => {
      if (a.gap !== b.gap) return a.gap - b.gap;
      return b.level - a.level;
    });

    const best = inRange[0];
    console.log(
      `[findLevelSub] ✅ ${targetGroup}: picked "${getLocalizedText(best.exercise.name)}" ` +
      `L${best.level} (gap=${best.gap}, radius=±${radius}, domain=${domain ?? '?'} L${domainLevel})`,
    );
    return { exercise: best.exercise, level: best.level, gap: best.gap, radius };
  }

  console.warn(
    `[findLevelSub] ❌ ${targetGroup}: no candidate within ±6 of L${domainLevel} ` +
    `(${groupCandidates.length} candidates checked, domain=${domain ?? '?'})`,
  );
  return null;
}

// ============================================================================
// SUBSTITUTION HELPER
// ============================================================================

/**
 * Build the exercise-specific fields for a substitution slot, re-resolving
 * isTimeBased from the NEW exercise's DB definition to prevent identity leaks
 * (e.g., a pull-up substituted for a plank should never display as "שניות").
 *
 * If the type changes (time ↔ reps), reps and repsRange are reset to
 * sensible defaults so the display number is never wildly wrong.
 */
const SUBST_PUSH_PULL = new Set(['vertical_pull', 'horizontal_pull', 'vertical_push', 'horizontal_push']);
const SUBST_LEGS      = new Set(['squat', 'hinge', 'lunge']);

function substituteExercise(
  target: WorkoutExercise,
  newEx: Exercise,
  newMethod: any,
): Pick<WorkoutExercise, 'exercise' | 'method' | 'mechanicalType' | 'isTimeBased' | 'reps' | 'repsRange'> {
  const newIsTimeBased = isTimeBasedExercise(newEx);
  let reps = target.reps;
  let repsRange: { min: number; max: number } = target.repsRange ?? { min: 6, max: 12 };

  if (newIsTimeBased !== target.isTimeBased) {
    // Type changed — reset to sensible defaults for the new type
    if (newIsTimeBased) {
      reps = 30;
      repsRange = { min: 20, max: 45 };
    } else {
      reps = Math.min(reps, 12);
      repsRange = { min: 6, max: 12 };
    }
  }

  // Skill-Rep Guard: unilateral high-skill exercises (One-Arm Pull-up, Pistol Squat,
  // etc.) must NEVER inherit the replaced exercise's rep count.  Discard it entirely
  // and apply the level-appropriate unilateral range regardless of type change.
  if (!newIsTimeBased && newEx.symmetry === 'unilateral') {
    const mg = newEx.movementGroup ?? '';
    if (SUBST_PUSH_PULL.has(mg)) {
      reps = 1 + Math.floor(Math.random() * 3); // 1–3 reps
      repsRange = { min: 1, max: 3 };
    } else if (SUBST_LEGS.has(mg)) {
      reps = 3 + Math.floor(Math.random() * 4); // 3–6 reps
      repsRange = { min: 3, max: 6 };
    }
  }

  return {
    exercise: newEx,
    method: (newMethod ?? target.method) as any,
    mechanicalType: (newEx.mechanicalType || 'none') as any,
    isTimeBased: newIsTimeBased,
    reps,
    repsRange,
  };
}

// ============================================================================
// WORKOUT GENERATOR CLASS
// ============================================================================

export class WorkoutGenerator {
  generateWorkout(
    scoredExercises: ScoredExercise[],
    context: WorkoutGenerationContext,
  ): GeneratedWorkout {
    const pipelineLog: string[] = [];
    const fc = context.filterCounts;
    if (fc) {
      pipelineLog.push(`pool_start: ${fc.pool_start} exercises`);
      pipelineLog.push(`after_program_filter: ${fc.pool_start - fc.excluded_program_filter}`);
      pipelineLog.push(`after_level_tolerance(±3): ${fc.pool_start - fc.excluded_program_filter - fc.excluded_level_tolerance}`);
      pipelineLog.push(`after_skill_gate: ${fc.pool_start - fc.excluded_program_filter - fc.excluded_level_tolerance - fc.excluded_skill_gate}`);
      pipelineLog.push(`after_injury_shield: ${fc.after_hard_filters + fc.excluded_location + fc.excluded_sweat + fc.excluded_noise + fc.excluded_field_mode}`);
      pipelineLog.push(`after_48h_muscle: ${fc.after_hard_filters + fc.excluded_location + fc.excluded_sweat + fc.excluded_noise + fc.excluded_field_mode + fc.excluded_48h_muscle - fc.excluded_48h_muscle}`);
      pipelineLog.push(`after_location+sweat+noise: ${fc.after_hard_filters}`);
    }
    pipelineLog.push(`scored_pool: ${scoredExercises.length}`);

    // ── Difficulty Resolution ──
    let difficulty: DifficultyLevel = context.difficulty || 2;
    if (context.isFirstSessionInProgram) difficulty = 1;
    if (context.detrainingLock && difficulty === 3) {
      difficulty = 2;
      console.log('[WorkoutGenerator] Detraining lock active — Intense downgraded to Challenging');
    }

    const isRecovery = context.isRecoveryDay === true;

    // ── Active Recovery Guard ──
    if (context.isRecoveryDay === true) {
      const RECOVERY_ROLES = new Set(['cooldown', 'warmup']);
      const before = scoredExercises.length;
      scoredExercises = scoredExercises.filter(se => {
        const role = se.exercise.exerciseRole;
        if (role && RECOVERY_ROLES.has(role)) return true;
        if (se.exercise.movementGroup === 'flexibility') return true;
        return false;
      });
      pipelineLog.push(`after_recovery_guard: ${scoredExercises.length} (was ${before})`);
      console.log(
        `[ActiveRecovery] Pool filtered: ${before} → ${scoredExercises.length} ` +
        `(cooldown/flexibility/warmup only)`,
      );
    }

    if (context.domainBudgets?.length) {
      console.group('[WorkoutGenerator] Domain Budgets Received (Phase 1)');
      for (const db of context.domainBudgets) {
        console.log(`  ${db.domain} L${db.level}: ${db.daily} sets/day (${db.weekly}/week)`);
      }
      console.groupEnd();
    }

    // Step 1: Exercise count
    const { exerciseCount, includeAccessories } = getExerciseCountForDuration(context.availableTime);

    // Step 1b: Variety jitter (0-51 pts)
    const jitterSeed = getShuffleSeed(context);
    let jRng = jitterSeed;
    const jitterMap = new Map<string, number>();
    const nextJitter = () => { jRng = (jRng * 1103515245 + 12345) & 0x7fffffff; return jRng % 52; };
    const jitteredExercises = scoredExercises.map((s) => {
      const j = nextJitter();
      jitterMap.set(s.exercise.id, j);
      return { ...s, score: s.score + j, reasoning: [...s.reasoning, `jitter:+${j}`] };
    });

    // Step 1c: Master Synergy Scoring (Phase 4B)
    const synergyExercises = this.applySynergyBonuses(jitteredExercises, context);

    // Step 2: Difficulty filter
    const filteredExercises = applyDifficultyFilter(synergyExercises, context, difficulty);
    pipelineLog.push(`after_difficulty_filter: ${filteredExercises.length}`);

    // Step 3: Select exercises
    const rawSelected = this.selectExercises(filteredExercises, exerciseCount, includeAccessories, context, difficulty);
    pipelineLog.push(`after_bolt_selection(bolt=${difficulty}): ${rawSelected.length}`);

    // Step 3b: Movement Group Diversity Pass
    //
    // Prevent the same pull/push movement group from claiming multiple slots.
    // Example: With Pull L19, Muscle-up, Ring Muscle-up and Weighted Pull-up
    // all score highly, but including all three would create a "Muscle-up fest".
    // Rule: max 1 exercise per primary movement group (vertical/horizontal pull/push).
    // Displaced slots are backfilled from the filtered pool with different groups.
    const STRICT_MG_MAX = 1;
    const STRICT_MG_GROUPS = new Set([
      'vertical_pull', 'horizontal_pull',
      'vertical_push', 'horizontal_push',
    ]);
    const mgUsage = new Map<string, number>();
    const diversePrimary: (typeof rawSelected)[number][] = [];
    const usedIdsDiversity = new Set<string>();

    // Process highest-scored first so top exercises claim their MG slot.
    // Foundation exercises always win their MG slot over Skill exercises —
    // a Muscle-up (skill) must not displace a Pull-up (foundation) from
    // the vertical_pull slot.
    for (const ex of [...rawSelected].sort((a, b) => {
      const aIsFoundation = classifyPriority(a.exercise) === 'foundation' ? 1 : 0;
      const bIsFoundation = classifyPriority(b.exercise) === 'foundation' ? 1 : 0;
      if (aIsFoundation !== bIsFoundation) return bIsFoundation - aIsFoundation;
      return b.score - a.score;
    })) {
      const mg = ex.exercise.movementGroup ?? 'none';
      const isStrict = STRICT_MG_GROUPS.has(mg);
      const used = mgUsage.get(mg) ?? 0;
      if (!isStrict || used < STRICT_MG_MAX) {
        diversePrimary.push(ex);
        mgUsage.set(mg, used + 1);
        usedIdsDiversity.add(ex.exercise.id);
      }
      // else: exercise displaced — backfilled below
    }

    // Backfill displaced slots with highest-scored alternatives from filtered pool
    const slotsNeeded = rawSelected.length - diversePrimary.length;
    if (slotsNeeded > 0) {
      const backfill = filteredExercises
        .filter(e => {
          if (usedIdsDiversity.has(e.exercise.id)) return false;
          const mg = e.exercise.movementGroup ?? 'none';
          if (!STRICT_MG_GROUPS.has(mg)) return true;
          return (mgUsage.get(mg) ?? 0) < STRICT_MG_MAX;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, slotsNeeded);

      for (const ex of backfill) {
        diversePrimary.push(ex);
        usedIdsDiversity.add(ex.exercise.id);
        const mg = ex.exercise.movementGroup ?? 'none';
        mgUsage.set(mg, (mgUsage.get(mg) ?? 0) + 1);
      }

      pipelineLog.push(`mg_diversity: displaced ${slotsNeeded} duplicate-group exercises, backfilled ${backfill.length}`);
      console.log(`[MGDiversity] Displaced ${slotsNeeded} same-group duplicates → backfilled ${backfill.length} (pool had ${filteredExercises.length} candidates)`);
    }

    // Use the diversity-enforced list for all downstream steps
    const selectedExercises = diversePrimary;

    // Step 4: Volume
    const volumeAdjustment = calculateVolumeAdjustment(context, difficulty);
    let workoutExercises = assignVolume(selectedExercises, context, volumeAdjustment, difficulty);

    // Step 4b: Smart set cap
    const maxCap = context.maxSets != null && context.maxSets > 0 ? context.maxSets : Infinity;
    const domainCount = context.requiredDomains?.length;
    const setsBeforeCap = workoutExercises.reduce((s, e) => s + e.sets, 0);
    workoutExercises = applySmartSetCap(workoutExercises, maxCap, domainCount);
    const setsAfterCap = workoutExercises.reduce((s, e) => s + e.sets, 0);
    if (setsAfterCap < setsBeforeCap) {
      pipelineLog.push(`set_cap_applied: ${setsBeforeCap} → ${setsAfterCap} (daily=${context.dailySetBudget ?? 'n/a'}, max=${maxCap === Infinity ? 'none' : maxCap})`);
    }

    // Step 4c: Global budget guardrail
    const weeklyBudget = context.remainingWeeklyBudget;
    if (
      weeklyBudget != null &&
      weeklyBudget > 0 &&
      weeklyBudget < workoutExercises.reduce((s, e) => s + e.sets, 0)
    ) {
      const plannedBefore = workoutExercises.reduce((s, e) => s + e.sets, 0);
      workoutExercises = applySmartSetCap(workoutExercises, weeklyBudget, domainCount);
      pipelineLog.push(`weekly_guard: ${plannedBefore} → ${workoutExercises.reduce((s, e) => s + e.sets, 0)} (remaining=${weeklyBudget})`);
    }
    pipelineLog.push(`weekly_budget: ${weeklyBudget ?? 'n/a'}, used_so_far: ${weeklyBudget != null ? 'see_store' : 'n/a'}, daily_budget: ${context.dailySetBudget ?? 'n/a'}`);

    // Step 4c-prime: Hard Daily Budget Cap
    //
    // The dailySetBudget is the authoritative per-session set limit derived
    // from the Lead Program service.  Apply it AFTER the weekly guard so both
    // constraints are respected.  Prevents the engine from overshooting when
    // domain budgets or exercise counts naturally accumulate too many sets.
    if (context.dailySetBudget != null && context.dailySetBudget > 0) {
      const preCap = workoutExercises.reduce((s, e) => s + e.sets, 0);
      if (preCap > context.dailySetBudget) {
        workoutExercises = applySmartSetCap(workoutExercises, context.dailySetBudget, domainCount);
        const postCap = workoutExercises.reduce((s, e) => s + e.sets, 0);
        pipelineLog.push(`daily_budget_cap: ${preCap} → ${postCap} sets (cap=${context.dailySetBudget})`);
        console.log(`[WorkoutGenerator] 🚦 Daily budget cap: ${preCap} → ${postCap} sets (cap=${context.dailySetBudget})`);
      }
    }

    // Step 4d: "David Rule" — Relative Gap Guard
    //
    // Two tiers of protection:
    //   Tier 1 (original): userLevel > 5  → rescue any L1 exercise
    //   Tier 2 (strict):   userLevel > 15 → rescue any exercise where
    //                      programLevel < (domainLevel - 6)
    //
    // Uses findLevelAppropriateSubstitute (progressive ±2→±4→±6 radius)
    // for replacement selection.  If no replacement is found within ±6,
    // the under-level exercise stays (better than nothing).
    if (context.userLevel > 5 && context.globalExercisePool?.length) {
      const MAX_GAP = 6;

      const MG_TO_DOMAIN: Record<string, string> = {
        vertical_pull: 'pull', horizontal_pull: 'pull',
        vertical_push: 'push', horizontal_push: 'push',
        squat: 'legs', hinge: 'legs', lunge: 'legs',
        core: 'core', anti_extension: 'core', anti_rotation: 'core',
      };

      const rescueIndices: number[] = [];
      const userLevels = context.userProgramLevels;

      for (let i = 0; i < workoutExercises.length; i++) {
        const we = workoutExercises[i];
        if (we.exerciseRole !== 'main') continue;
        const exLevel = we.programLevel ?? 1;
        const mg = we.exercise.movementGroup;
        const targetDomain = mg ? MG_TO_DOMAIN[mg] : undefined;
        const domainLevel = targetDomain
          ? (userLevels?.get(targetDomain) ?? context.userLevel)
          : context.userLevel;

        if (exLevel <= 1) {
          rescueIndices.push(i);
          continue;
        }

        if (context.userLevel > 15 && exLevel < (domainLevel - MAX_GAP)) {
          rescueIndices.push(i);
        }
      }

      if (rescueIndices.length > 0) {
        console.group(`[DavidRule] 🚨 ${rescueIndices.length} under-level exercise(s) for L${context.userLevel} user — Rescue Re-scan`);
        const usedIds = new Set(workoutExercises.map(we => we.exercise.id));

        for (const idx of rescueIndices) {
          const victim = workoutExercises[idx];
          const mg = victim.exercise.movementGroup;
          const victimLevel = victim.programLevel ?? 1;
          const victimName = getLocalizedText(victim.exercise.name);

          if (!mg) {
            console.log(`[DavidRule] Skipping "${victimName}" — no movementGroup`);
            continue;
          }

          const targetDomain = MG_TO_DOMAIN[mg];
          const domainLevel = targetDomain
            ? (userLevels?.get(targetDomain) ?? context.userLevel)
            : context.userLevel;

          const sub = findLevelAppropriateSubstitute(
            context.globalExercisePool, mg, domainLevel, usedIds, userLevels, targetDomain,
          );

          if (sub) {
            workoutExercises[idx] = {
              ...workoutExercises[idx],
              ...substituteExercise(workoutExercises[idx], sub.exercise, sub.exercise.executionMethods?.[0]),
              programLevel: sub.level,
              isOverLevel: sub.level > domainLevel,
              levelDelta: sub.level - domainLevel,
              reasoning: [
                ...workoutExercises[idx].reasoning,
                `david_rule:rescued(L${victimLevel}→L${sub.level},mg=${mg},gap=${domainLevel - victimLevel},radius=±${sub.radius})`,
              ],
            };

            usedIds.add(sub.exercise.id);
            const repName = getLocalizedText(sub.exercise.name);
            pipelineLog.push(`david_rule: "${victimName}" (L${victimLevel}) → "${repName}" (L${sub.level}) [${mg}]`);
            console.log(`[DavidRule] ✅ "${victimName}" (L${victimLevel}) → "${repName}" (L${sub.level}) [${mg}, domain=${targetDomain} L${domainLevel}, gap=${domainLevel - victimLevel}, radius=±${sub.radius}]`);
          } else {
            console.warn(`[DavidRule] ❌ No rescue candidate for "${victimName}" (L${victimLevel}, mg=${mg}, domain=${targetDomain} L${domainLevel})`);
            pipelineLog.push(`david_rule: no_rescue_for_"${victimName}"(L${victimLevel},mg=${mg})`);
          }
        }
        console.groupEnd();
      }
    }

    // Step 5: Protocol injection
    const protocolResult = this.selectProtocol(difficulty, context);

    // Step 5: Physiological sort
    workoutExercises = applyPhysiologicalSort(workoutExercises);

    // Step 5b: Antagonist pairing
    if (protocolResult.setType === 'antagonist_pair') {
      workoutExercises = applyAntagonistPairing(workoutExercises);
    }

    // Step 5c: Deduplicate
    workoutExercises = deduplicateExercises(workoutExercises);

    // Step 5d: Level-Aware Horizontal Guarantee (full_body workouts only)
    //
    // Ensures at least one horizontal_push and one horizontal_pull among
    // main exercises.  Unlike the old logic (which sorted by score only),
    // this uses findLevelAppropriateSubstitute — a progressive-radius
    // search over globalExercisePool that prioritises level proximity:
    //   Priority 1: ±2 of domainLevel
    //   Priority 2: ±4
    //   Priority 3: ±6
    //   Hard limit:  gap > 6 → skip (better unbalanced than irrelevant)
    //
    if (context.requiredDomains && context.requiredDomains.length >= 3) {
      // MG_TO_OWN_DOMAIN is defined at module level — reuse it here
      const mainEx = workoutExercises.filter(e => e.exerciseRole === 'main');
      const usedIds = new Set(workoutExercises.map(we => we.exercise.id));
      const userLevelsMap = context.userProgramLevels;
      const pool = context.globalExercisePool ?? [];

      const tryLevelAwareSwap = (targetGroup: string) => {
        const domain = MG_TO_OWN_DOMAIN[targetGroup];
        const domainLevel = domain
          ? (userLevelsMap?.get(domain) ?? context.userLevel)
          : context.userLevel;

        const substitute = findLevelAppropriateSubstitute(
          pool, targetGroup, domainLevel, usedIds, userLevelsMap, domain,
        );

        if (!substitute) {
          console.log(`[HorizontalGuarantee] skipped ${targetGroup} — no candidate within ±6 of L${domainLevel}`);
          pipelineLog.push(`horizontal_guarantee: SKIPPED ${targetGroup} (no candidate ≤ gap 6, L${domainLevel})`);
          return;
        }

        const repName  = getLocalizedText(substitute.exercise.name);
        // Always derive the program level from the injected exercise's OWN domain
        // (horizontal_push → push), not from the search result which could inherit
        // the wrong domain level (e.g., L19 full_body instead of L12 push).
        const repLevel = resolveInjectedLevel(substitute.exercise, targetGroup, domainLevel);
        const gap      = Math.abs(repLevel - domainLevel);

        // Check domain budget: if the domain already has enough sets (>3),
        // ADD the horizontal exercise instead of replacing the vertical one.
        // David (L19) needs BOTH pull-ups AND back levers in the same session.
        const domainSets = mainEx
          .filter(e => domain && MG_TO_OWN_DOMAIN[e.exercise.movementGroup ?? ''] === domain)
          .reduce((s, e) => s + (e.sets ?? 3), 0);

        const verticalCounterpart = targetGroup === 'horizontal_pull' ? 'vertical_pull'
          : targetGroup === 'horizontal_push' ? 'vertical_push'
          : null;

        const hasVertical = verticalCounterpart
          && mainEx.some(e => e.exercise.movementGroup === verticalCounterpart);

        if (domainSets > 3 && hasVertical) {
          // Domain has rich budget AND a vertical exercise → ADD the horizontal
          // by replacing the lowest-scoring NON-domain exercise (accessory/core/legs)
          const otherDomainEx = mainEx
            .filter(e => {
              const eMg = e.exercise.movementGroup ?? '';
              const eDomain = MG_TO_OWN_DOMAIN[eMg];
              return eDomain !== domain && !HORIZONTAL_MOVEMENT_GROUPS.has(eMg);
            })
            .sort((a, b) => a.score - b.score);

          const victim = otherDomainEx[0];
          if (victim) {
            const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
            if (idx >= 0) {
              const victimName = getLocalizedText(victim.exercise.name);
              const victimMg   = victim.exercise.movementGroup ?? '?';

              workoutExercises[idx] = {
                ...workoutExercises[idx],
                ...substituteExercise(workoutExercises[idx], substitute.exercise, substitute.exercise.executionMethods?.[0]),
                programLevel: repLevel,
                isOverLevel: repLevel > domainLevel,
                levelDelta: repLevel - domainLevel,
                reasoning: [
                  ...workoutExercises[idx].reasoning,
                  `horizontal_guarantee:added(L${repLevel},gap=${gap},mg=${targetGroup},replaced_accessory=${victimMg})`,
                ],
              };

              usedIds.add(substitute.exercise.id);
              pipelineLog.push(`horizontal_guarantee: ADDED "${repName}"(L${repLevel}) replacing accessory "${victimName}"(${victimMg}) — preserved vertical [${targetGroup}]`);
              console.log(`[HorizontalGuarantee] ✅ ADDED "${repName}"(L${repLevel}) replacing accessory "${victimName}"(${victimMg}) — preserved ${verticalCounterpart} [domain=${domain} L${domainLevel}, budget=${domainSets} sets]`);
              return;
            }
          }
        }

        // Standard path: replace lowest-scored same-domain exercise
        const sameDomainVertical = mainEx
          .filter(e => verticalCounterpart && e.exercise.movementGroup === verticalCounterpart)
          .sort((a, b) => a.score - b.score);

        const sameDomainAny = mainEx
          .filter(e => {
            const eMg = e.exercise.movementGroup ?? '';
            if (HORIZONTAL_MOVEMENT_GROUPS.has(eMg)) return false;
            return domain && MG_TO_OWN_DOMAIN[eMg] === domain;
          })
          .sort((a, b) => a.score - b.score);

        const anyNonHorizontal = mainEx
          .filter(e => !HORIZONTAL_MOVEMENT_GROUPS.has(e.exercise.movementGroup ?? ''))
          .sort((a, b) => a.score - b.score);

        const victim = sameDomainVertical[0] ?? sameDomainAny[0] ?? anyNonHorizontal[0];
        if (!victim) return;
        const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
        if (idx < 0) return;

        const victimName = getLocalizedText(victim.exercise.name);
        const victimMg   = victim.exercise.movementGroup ?? '?';

        workoutExercises[idx] = {
          ...workoutExercises[idx],
          ...substituteExercise(workoutExercises[idx], substitute.exercise, substitute.exercise.executionMethods?.[0]),
          programLevel: repLevel,
          isOverLevel: repLevel > domainLevel,
          levelDelta: repLevel - domainLevel,
          reasoning: [
            ...workoutExercises[idx].reasoning,
            `horizontal_guarantee:swapped(L${repLevel},gap=${gap},mg=${targetGroup},replaced=${victimMg})`,
          ],
        };

        usedIds.add(substitute.exercise.id);
        pipelineLog.push(`horizontal_guarantee: "${victimName}"(${victimMg}) → "${repName}" (L${repLevel}, gap=${gap}) [${targetGroup}]`);
        console.log(`[HorizontalGuarantee] ✅ "${victimName}"(${victimMg}) → "${repName}" (L${repLevel}, domain=${domain} L${domainLevel}, gap=${gap}) [${targetGroup}]`);
      };

      const hasHPush = mainEx.some(e => e.exercise.movementGroup === 'horizontal_push');
      const hasHPull = mainEx.some(e => e.exercise.movementGroup === 'horizontal_pull');
      if (!hasHPush) tryLevelAwareSwap('horizontal_push');
      if (!hasHPull) tryLevelAwareSwap('horizontal_pull');
    }

    // Step 5d-prime: Vertical Foundation Guarantee
    //
    // A workout MUST include at least one 'foundation' exercise from
    // vertical_pull (Pull-ups) and one from vertical_push (Dips).
    // If the MG slot was claimed by a skill exercise, inject a foundation
    // exercise by replacing the lowest-scored non-foundation exercise.
    if (context.globalExercisePool?.length) {
      const VERTICAL_FOUNDATION_GROUPS = ['vertical_pull', 'vertical_push'] as const;
      const mainVFG = workoutExercises.filter(e => e.exerciseRole === 'main');
      const usedIdsVFG = new Set(workoutExercises.map(we => we.exercise.id));
      const poolVFG = context.globalExercisePool;
      const userLevelsVFG = context.userProgramLevels;

      for (const targetMg of VERTICAL_FOUNDATION_GROUPS) {
        const hasFoundationInMg = mainVFG.some(
          e => e.exercise.movementGroup === targetMg && classifyPriority(e.exercise) === 'foundation',
        );
        if (hasFoundationInMg) continue;

        const targetDomain = MG_TO_OWN_DOMAIN[targetMg];
        const domainLevel = targetDomain
          ? (userLevelsVFG?.get(targetDomain) ?? context.userLevel)
          : context.userLevel;

        const foundationCandidates = poolVFG
          .filter(ex => {
            if (usedIdsVFG.has(ex.id)) return false;
            if (ex.movementGroup !== targetMg) return false;
            if (classifyPriority(ex) !== 'foundation') return false;
            const lvl = resolveExerciseLevelForDomains(ex, targetDomain ? [targetDomain] : []).level;
            return Math.abs(lvl - domainLevel) <= 6;
          })
          .map(ex => {
            const lvl = resolveExerciseLevelForDomains(ex, targetDomain ? [targetDomain] : []).level;
            return { exercise: ex, level: lvl, gap: Math.abs(lvl - domainLevel) };
          })
          .sort((a, b) => a.gap - b.gap);

        const sub = foundationCandidates[0];
        if (!sub) {
          console.warn(`[VerticalFoundation] ⚠️ No foundation candidate for ${targetMg} within ±6 of L${domainLevel}`);
          pipelineLog.push(`vertical_foundation: SKIPPED ${targetMg} — no foundation within ±6`);
          continue;
        }

        // Find victim — priority order:
        // 1. A skill exercise occupying the SAME MG slot (ideal swap)
        // 2. Any skill exercise in the workout (skills are optional accessories)
        // 3. Lowest-scored non-foundation exercise from a non-sole domain
        const skillInSlot = workoutExercises.find(
          e => e.exerciseRole === 'main' &&
               e.exercise.movementGroup === targetMg &&
               classifyPriority(e.exercise) === 'skill',
        );

        const anySkill = !skillInSlot
          ? workoutExercises
              .filter(e => e.exerciseRole === 'main' && classifyPriority(e.exercise) === 'skill')
              .sort((a, b) => a.score - b.score)[0]
          : undefined;

        const lowestNonFoundation = workoutExercises
          .filter(e => {
            if (e.exerciseRole !== 'main') return false;
            if (classifyPriority(e.exercise) === 'foundation') return false;
            return true;
          })
          .sort((a, b) => a.score - b.score)[0];

        const victim = skillInSlot ?? anySkill ?? lowestNonFoundation;
        if (!victim) continue;

        const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
        if (idx < 0) continue;

        const repName = getLocalizedText(sub.exercise.name);
        const victimName = getLocalizedText(victim.exercise.name);
        const repLevel = resolveInjectedLevel(sub.exercise, targetMg, domainLevel);

        workoutExercises[idx] = {
          ...workoutExercises[idx],
          ...substituteExercise(workoutExercises[idx], sub.exercise, sub.exercise.executionMethods?.[0]),
          programLevel: repLevel,
          isOverLevel: repLevel > domainLevel,
          levelDelta: repLevel - domainLevel,
          reasoning: [
            ...workoutExercises[idx].reasoning,
            `vertical_foundation:injected(L${repLevel},gap=${sub.gap},mg=${targetMg},replaced=${victim.exercise.movementGroup ?? '?'})`,
          ],
        };

        usedIdsVFG.add(sub.exercise.id);
        pipelineLog.push(`vertical_foundation: "${victimName}" → "${repName}" (L${repLevel}) [${targetMg}]`);
        console.log(`[VerticalFoundation] ✅ "${victimName}"(${classifyPriority(victim.exercise)}) → "${repName}"(foundation, L${repLevel}) [${targetMg}, domain=${targetDomain} L${domainLevel}]`);
      }
    }

    // Step 5e: Strict Full-Body Domain Guarantee
    //
    // Every full_body workout MUST contain at least one exercise from each
    // primary domain: [push, pull, legs].  This fires after Step 5d so the
    // Horizontal Guarantee has already run and we won't double-inject.
    //
    // Strategy: for each missing domain, iterate through its representative
    // movement groups and use findLevelAppropriateSubstitute (progressive ±2→±6)
    // to find a level-appropriate exercise.  The lowest-scored exercise that is
    // NOT the sole representative of another primary domain is replaced.
    if (
      context.requiredDomains &&
      context.requiredDomains.length >= 3 &&
      context.globalExercisePool?.length
    ) {
      const DOMAIN_MG_CANDIDATES: Record<string, string[]> = {
        push: ['vertical_push', 'horizontal_push'],
        pull: ['vertical_pull', 'horizontal_pull'],
        legs: ['squat', 'hinge', 'lunge'],
      };

      // MG_TO_OWN_DOMAIN is defined at module level — reuse it here
      const PRIMARY_DOMAINS = new Set(['push', 'pull', 'legs']);

      const mainExFB = workoutExercises.filter(e => e.exerciseRole === 'main');
      const usedIdsFB = new Set(workoutExercises.map(we => we.exercise.id));
      const userLevelsMapFB = context.userProgramLevels;
      const poolFB = context.globalExercisePool;

      for (const [domain, mgList] of Object.entries(DOMAIN_MG_CANDIDATES)) {
        const hasDomain = mainExFB.some(e => MG_TO_OWN_DOMAIN[e.exercise.movementGroup ?? ''] === domain);
        if (hasDomain) continue;

        let injected = false;
        const domainLevel = userLevelsMapFB?.get(domain) ?? context.userLevel;

        for (const mg of mgList) {
          const sub = findLevelAppropriateSubstitute(poolFB, mg, domainLevel, usedIdsFB, userLevelsMapFB, domain);
          if (!sub) continue;

          // Replace the lowest-scored exercise that is not the sole member of another primary domain
          const domainCounts = new Map<string, number>();
          for (const e of mainExFB) {
            const d = MG_TO_OWN_DOMAIN[e.exercise.movementGroup ?? ''];
            if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
          }

          const victim = workoutExercises
            .filter(e => {
              if (e.exerciseRole !== 'main') return false;
              // Never replace a foundation exercise (Pull-ups, Dips, etc.)
              if (classifyPriority(e.exercise) === 'foundation') return false;
              const eMg   = e.exercise.movementGroup ?? '';
              const eDomain = MG_TO_OWN_DOMAIN[eMg];
              // Never steal the last exercise of another required domain
              if (PRIMARY_DOMAINS.has(eDomain ?? '') && (domainCounts.get(eDomain!) ?? 0) <= 1) return false;
              return true;
            })
            .sort((a, b) => a.score - b.score)[0];

          if (!victim) {
            pipelineLog.push(`full_body_guarantee: ${domain} missing but no safe victim to replace`);
            break;
          }

          const idx = workoutExercises.findIndex(e => e.exercise.id === victim.exercise.id);
          if (idx < 0) break;

          const repName    = getLocalizedText(sub.exercise.name);
          const victimName = getLocalizedText(victim.exercise.name);
          // Resolve level from the injected exercise's OWN movement domain,
          // not from the search result (which could pick a full_body level instead).
          const injectedLevel = resolveInjectedLevel(sub.exercise, mg, domainLevel);

          workoutExercises[idx] = {
            ...workoutExercises[idx],
            ...substituteExercise(workoutExercises[idx], sub.exercise, sub.exercise.executionMethods?.[0]),
            programLevel:  injectedLevel,
            isOverLevel:   injectedLevel > domainLevel,
            levelDelta:    injectedLevel - domainLevel,
            reasoning: [
              ...workoutExercises[idx].reasoning,
              `full_body_guarantee:${domain}(L${injectedLevel},gap=${sub.gap},mg=${mg},replaced=${victim.exercise.movementGroup ?? '?'})`,
            ],
          };

          usedIdsFB.add(sub.exercise.id);
          // Refresh mainExFB counts for next domain iteration
          mainExFB.splice(0, mainExFB.length, ...workoutExercises.filter(e => e.exerciseRole === 'main'));

          pipelineLog.push(`full_body_guarantee: "${victimName}" → "${repName}" (L${injectedLevel}) [domain=${domain}, mg=${mg}]`);
          console.log(`[FullBodyGuarantee] ✅ ${domain} missing → "${repName}"(L${injectedLevel}) replacing "${victimName}" [mg=${mg}, gap=${sub.gap}]`);
          injected = true;
          break;
        }

        if (!injected) {
          console.warn(`[FullBodyGuarantee] ⚠️ Could not guarantee ${domain} domain — no candidate within ±6 of L${domainLevel}`);
          pipelineLog.push(`full_body_guarantee: SKIPPED ${domain} — no candidate within ±6 of L${domainLevel}`);
        }
      }
    }

    // Step 5f: Final physiological sort — anchors guarantee-injected exercises in correct tier
    workoutExercises = applyPhysiologicalSort(workoutExercises);

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
    }
    const blastMode = context.intentMode === 'blast' ? this.getBlastModeDetails(context, workoutExercises) : undefined;

    // Step 9: Mechanical balance
    const mechanicalBalance = this.calculateMechanicalBalance(workoutExercises);

    // Step 10: Stats
    const stats = calculateWorkoutStats(workoutExercises, difficulty, estimatedDuration, context.userWeight);
    const totalPlannedSets = workoutExercises.reduce((sum, ex) => sum + ex.sets, 0);

    // ── WHY LOGGER: Per-exercise score breakdown ──
    const exerciseBreakdowns: string[] = [];
    workoutExercises.forEach((ex) => {
      const name = typeof ex.exercise.name === 'string'
        ? ex.exercise.name
        : (ex.exercise.name as any)?.he || ex.exercise.id;
      const pLevel = ex.programLevel ?? '?';
      const parts = ex.reasoning.join(' ');
      exerciseBreakdowns.push(`${name}_L${pLevel}: ${parts} TOTAL=${ex.score}`);
    });
    pipelineLog.push(...exerciseBreakdowns.map(b => `exercise: ${b}`));

    // ── WHY LOGGER: Console summary ──
    const poolChain = fc
      ? `${fc.pool_start}→${fc.pool_start - fc.excluded_program_filter}→${fc.after_hard_filters}`
      : `${scoredExercises.length}`;
    console.log(
      `[Engine] Pool: ${poolChain}→${filteredExercises.length}→${rawSelected.length}(raw)→${selectedExercises.length}(diverse) | ` +
      `Selected: ${workoutExercises.length} | ` +
      `Budget: ${weeklyBudget ?? '?'}/${context.dailySetBudget ?? '?'} remaining/daily | ` +
      `Difficulty: ${difficulty} | Sets: ${totalPlannedSets}`,
    );

    // Level Resolution log — shows which domain each exercise's level was resolved from
    console.group('[WorkoutGenerator] Level Resolution & Mapping');
    workoutExercises.forEach((ex, i) => {
      const name = typeof ex.exercise.name === 'string' ? ex.exercise.name : (ex.exercise.name as any)?.he || ex.exercise.id;
      const programLevel = ex.programLevel ?? 1;
      const levelResLog = ex.reasoning.find(r => r.startsWith('[LevelResolution]')) ?? '';
      const videoUrl = ex.method?.media?.mainVideoUrl || (ex.exercise as any).media?.videoUrl || '(none)';
      console.log(
        `[${i + 1}] ${name} | programLevel=${programLevel} ${levelResLog} | ` +
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
      pipelineLog,
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
    let saDeprioritised = 0;
    let regressionBoosted = 0;
    let regressionPenalised = 0;
    let foundationBoosted = 0;
    let skillPenalised = 0;

    // ── Option 1 Level Regression Setup ───────────────────────────────────
    // When generating the 1-bolt (recovery/flow) option, exercises at
    // userLevel - 2 are the sweet spot.  An L19 user should be picking
    // L17 exercises, not L19.  We boost exercises near the regression target
    // and penalise over-level exercises so the SELECTION (not just post-
    // processing) naturally favours the right level.
    const isRecoveryOption = (context.difficulty ?? 2) === 1;
    const regressionTarget = isRecoveryOption
      ? Math.max(1, (context.userLevel ?? 1) - 2)
      : null;

    // ── SA Deprioritisation Setup ──────────────────────────────────────────
    // Straight-Arm (SA) exercises are skill work (Planche, Skin the Cat), not
    // Bent-Arm (BA) strength volume.  For high-level users (L>12) who haven't
    // explicitly requested SA skill focus, penalise SA exercises so they don't
    // occupy primary strength slots (Pull-ups, Dips) that BA work should fill.
    const userHighLevel = (context.userLevel ?? 0) > 12;
    // SA skill focus is active when the session explicitly targets a skill program
    // (e.g., Planche, Front Lever) via priority1SkillIds, OR when a weekly SA
    // set cap has been allocated, indicating the scheduler planned SA work.
    const saSkillFocusRequested =
      (context.priority1SkillIds?.length ?? 0) > 0 ||
      (context.weeklySACap != null && context.weeklySACap > 0);

    // 1. Equipment Synergy (+15): Find dominant equipment across top-scored exercises
    const topN = exercises.slice().sort((a, b) => b.score - a.score).slice(0, 10);
    const gearFrequency: Record<string, number> = {};
    for (const ex of topN) {
      const methodAny = ex.method as { gearIds?: string[]; gearId?: string; equipmentIds?: string[]; equipmentId?: string } | undefined;
      const gPart = methodAny?.gearIds ?? (methodAny?.gearId ? [methodAny.gearId] : []);
      const ePart = methodAny?.equipmentIds ?? (methodAny?.equipmentId ? [methodAny.equipmentId] : []);
      for (const g of [...gPart, ...ePart]) {
        if (g) {
          const norm = normalizeGearId(g);
          gearFrequency[norm] = (gearFrequency[norm] ?? 0) + 1;
        }
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
    //    1st vertical gets +15, 2nd gets +8, rest get +0.
    const VERTICAL_BONUSES = [15, 8];
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

    // 3b. Push-Pull Vertical Symmetry (+100):
    // When vertical_pull dominates the pool (e.g., Pull L19), vertical_push
    // receives a dominant bonus that guarantees it outscores any horizontal_push
    // or other upper-body exercise, ensuring the Antagonist Pair (Superset) is
    // always a vertical compound pair (Pull-up × Dip / HSPU).
    const VPUSH_SYMMETRY_BONUS = 100;
    const topVerticalIsPull = verticalCandidates[0]?.exercise.movementGroup === 'vertical_pull';
    const verticalPushSymmetryIds = new Set<string>();
    if (topVerticalIsPull) {
      for (const ex of exercises) {
        if (ex.exercise.movementGroup === 'vertical_push') {
          verticalPushSymmetryIds.add(ex.exercise.id);
        }
      }
    }

    // 4. Apply bonuses
    const result = exercises.map(ex => {
      let bonus = 0;
      const reasoning = [...ex.reasoning];

      // Hierarchical Vertical Preference (+15/+8)
      const vBonus = verticalBonusById.get(ex.exercise.id);
      if (vBonus) {
        bonus += vBonus;
        verticalCount++;
        reasoning.push(`vertical_pref:+${vBonus}(${ex.exercise.movementGroup})`);
      }

      // Push-Pull Vertical Symmetry (+15): boost vertical_push when pull dominates
      if (verticalPushSymmetryIds.has(ex.exercise.id)) {
        bonus += VPUSH_SYMMETRY_BONUS;
        verticalCount++;
        reasoning.push(`vpush_symmetry:+${VPUSH_SYMMETRY_BONUS}(vpull_dominant)`);
      }

      // Variety Guard (-40): penalize exercises used in last 2 sessions
      if (context.recentExerciseIds?.has(ex.exercise.id)) {
        bonus -= 40;
        varietyCount++;
        reasoning.push('variety_guard:-40');
      }

      const methodAny = ex.method as { gearIds?: string[]; gearId?: string; equipmentIds?: string[]; equipmentId?: string } | undefined;
      const gearPart = methodAny?.gearIds ?? (methodAny?.gearId ? [methodAny.gearId] : []);
      const eqPart = methodAny?.equipmentIds ?? (methodAny?.equipmentId ? [methodAny.equipmentId] : []);
      const allGear = [...gearPart, ...eqPart].filter(Boolean).map(normalizeGearId);
      const isNaked = allGear.length === 0
        || allGear.every(g => g === 'bodyweight' || g === 'none');
      if (isNaked) {
        bonus += 8;
        nakedCount++;
        reasoning.push('naked_strength:+8');
      }

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

      // ── Option 1 Level Regression Bias ───────────────────────────────────
      // Boost exercises that sit near the regression target (userLevel - 2).
      // Penalise exercises at or above the user's current level — an L19 user
      // should not be picking L19 exercises for their "light recovery" session.
      if (regressionTarget !== null) {
        const tps = ex.exercise.targetPrograms ?? [];
        if (tps.length > 0) {
          const closestLevel = tps.reduce((best, tp) => {
            const dist = Math.abs(tp.level - regressionTarget);
            const bestDist = Math.abs(best - regressionTarget);
            return dist < bestDist ? tp.level : best;
          }, tps[0].level);

          const dist = Math.abs(closestLevel - regressionTarget);
          if (dist <= 2) {
            bonus += 20;
            regressionBoosted++;
            reasoning.push(`regression_bias:+20(L${closestLevel}≈target_L${regressionTarget})`);
          } else if (closestLevel >= (context.userLevel ?? 1)) {
            bonus -= 15;
            regressionPenalised++;
            reasoning.push(`regression_bias:-15(L${closestLevel}≥userLevel_L${context.userLevel})`);
          }
        }
      }

      // ── Straight-Arm Deprioritisation (-25) ──────────────────────────────
      // SA exercises in non-skill-focused strength sessions for high-level
      // users must not compete with BA compound lifts for the same slot.
      // Example: Skin the Cat L8 should not edge out Pull-up L8 for Pull slot.
      if (
        userHighLevel &&
        !saSkillFocusRequested &&
        ex.exercise.mechanicalType === 'straight_arm'
      ) {
        const exPriority = classifyPriority(ex.exercise);
        if (exPriority !== 'skill') {
          bonus -= 25;
          saDeprioritised++;
          reasoning.push('sa_deprioritised:-25(high_level_strength_session)');
        }
      }

      // ── Foundation Priority Buffer (+30) ──────────────────────────────
      // Foundational movements (Pull-ups, Dips, Push-ups, Rows) get a
      // moderate priority buffer over skills in the same MG. This ensures
      // they land in the initial plan without banning skills entirely.
      const exPriorityClass = classifyPriority(ex.exercise);
      if (exPriorityClass === 'foundation') {
        bonus += 30;
        foundationBoosted++;
        reasoning.push('foundation_buffer:+30');
      }

      // ── Skill Soft Offset (-10) ────────────────────────────────────────
      // Skills (Lever, Flag, Muscle-up, Planche) get a small negative offset
      // in general training so they naturally rank below foundations in the
      // same MG. They remain competitive for remaining slots and the Swap UI.
      if (exPriorityClass === 'skill' && !saSkillFocusRequested) {
        bonus -= 10;
        skillPenalised++;
        reasoning.push('skill_soft_offset:-10(general_training)');
      }

      if (bonus === 0) return ex;
      return { ...ex, score: ex.score + bonus, reasoning };
    });

    if (verticalCount > 0 || varietyCount > 0 || nakedCount > 0 || equipmentCount > 0 || modalityCount > 0 || saDeprioritised > 0 || regressionBoosted > 0 || foundationBoosted > 0 || skillPenalised > 0) {
      console.group('[Synergy Scoring] Master Coach Rules');
      if (foundationBoosted > 0) console.log(`Foundation Buffer: ${foundationBoosted} exercises boosted (+30) — Pull-ups/Dips/Push-ups/Rows prioritised`);
      if (skillPenalised > 0) console.log(`Skill Offset: ${skillPenalised} skill exercises offset (-10) — general training, foundations preferred`);
      if (verticalCount > 0) console.log(`Vertical Preference: ${verticalCount} exercises boosted (diminishing: ${VERTICAL_BONUSES.join('/')})`);
      if (nakedCount > 0) console.log(`Naked Strength: ${nakedCount} bodyweight exercises boosted (+8)`);
      if (varietyCount > 0) console.log(`Variety Guard: ${varietyCount} exercises penalized (-40)`);
      if (dominantGear) console.log(`Equipment Synergy: "${dominantGear}" dominant → ${equipmentCount} exercises boosted (+8)`);
      if (dominantMech) console.log(`Modality Match: "${dominantMech}" dominant → ${modalityCount} exercises boosted (+10)`);
      if (saDeprioritised > 0) console.log(`SA Deprioritised: ${saDeprioritised} straight-arm exercises penalized (-25) — BA strength preferred at L${context.userLevel}`);
      if (regressionBoosted > 0 || regressionPenalised > 0) {
        console.log(`Regression Bias (1-bolt): target=L${regressionTarget} — ${regressionBoosted} boosted(+20), ${regressionPenalised} penalized(-15)`);
      }
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

    // SA hard block — apply BEFORE any selection path
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

    // Domain quota path (full body)
    if (context.requiredDomains?.length && context.requiredDomains.length > 0) {
      const domainSelected = selectExercisesWithDomainQuotas(
        safePool, count, includeAccessories, context, difficulty,
      );
      if (domainSelected.length > 0) return domainSelected;
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
