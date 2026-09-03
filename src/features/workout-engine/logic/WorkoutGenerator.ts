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

import { Exercise, ExecutionMethod, ExecutionLocation, getLocalizedText } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise, IntentMode, LifestylePersona, LIFESTYLE_LABELS } from './ContextualEngine';
import { resolveToSlug } from '../services/program-hierarchy.utils';
import { normalizeGearId } from '../shared/utils/gear-mapping.utils';
import {
  MG_TO_DOMAIN,
  collectMethodGear,
  isWithinBolt1Window,
} from '../shared/constants/domain-mapping.constants';
import { resolveEffectiveDifficulty } from '../core/middleware/InputSanitizerMiddleware';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';

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
  PyramidStep,
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
  calculateEstimatedDuration,
  calculateWorkoutStats,
  isTimeBasedExercise,
  applySmartSetCap,
} from './workout-budgeting.utils';

// Sorting utils
import {
  applyPhysiologicalSort,
  deduplicateExercises,
} from './workout-sorting.utils';

// Protocol registry — dispatcher replaces hard-coded protocol if-tree
import { findProcessor } from './protocols/protocol-processor.registry';
import { buildTabataBlock } from './protocols/tabata.block';

// StructureDirector — declarative session topology + strategy detection
import { createStructureDirector } from '../core/pipeline/StructureDirector';

// PoolFactory — findLevelAppropriateSubstitute migrated here (Phase 5)
import {
  findLevelAppropriateSubstitute,
  type LevelSubstituteResult,
} from '../core/pipeline/PoolFactory';

// BudgetDistributor — Tier-2 volume + cap math owner (Phase 3a)
import { createBudgetDistributor } from '../core/pipeline/BudgetDistributor';

// GuaranteePassRunner — Tier-2 coverage guarantees (Phase 3b)
import { runAllGuarantees } from '../core/pipeline/GuaranteePassRunner';

// ============================================================================
// PYRAMID TARGET SELECTION
// ============================================================================

/**
 * Movement groups that count as dominant upper-body compound / skill work
 * — the natural home for a pyramid stamp.  Anything outside this set is
 * eligible only as a fallback when no upper compound is present in the
 * workout (e.g. pure legs day or core-only sessions).
 */
const PYRAMID_UPPER_COMPOUND_MGS = new Set<string>([
  'vertical_push',  'horizontal_push',
  'vertical_pull',  'horizontal_pull',
  'muscle_up',
  'handstand_pushup',
  'planche',
]);

/**
 * Pick EXACTLY ONE exercise to receive the pyramid protocol stamp.
 *
 * CNS Protection Rule (Hard Cap = 1):
 *   A pyramid is a neurological overload protocol.  Stamping two pyramids
 *   on a single session — even on different movement groups — fries the
 *   user's nervous system because both protocols ramp toward a peak / wave
 *   apex on the same day.  The previous 50/50 random roll between 1 and 2
 *   pyramids occasionally produced two simultaneous CNS overloads in one
 *   workout; this is now strictly prohibited.
 *
 *   If a session needs broader skill volume, the engine should add
 *   straight-set skill work — NOT a second pyramid.
 *
 * Selection algorithm:
 *   1. From all main exercises, collect upper-body compound/skill candidates
 *      (movement group in `PYRAMID_UPPER_COMPOUND_MGS`).
 *   2. If found, sort them by score (desc) and take exactly ONE — the
 *      single pyramid headliner of the session.
 *   3. If NO upper compound exists, fall back to the highest-scored main
 *      exercise regardless of movement group — legs / core can host the
 *      single pyramid when they are the standalone focus, but they will
 *      never get pulled in alongside an upper compound.
 *
 * Returns the same `WorkoutExercise` reference that exists in the input
 * array (so mutations inside the processor propagate back automatically).
 */
function selectPyramidTargets(
  exercises: WorkoutExercise[],
  context: WorkoutGenerationContext,
): WorkoutExercise[] {
  const mainEx = exercises.filter((e) => (e.exerciseRole ?? 'main') === 'main');
  if (mainEx.length === 0) return [];

  const upperCompounds = mainEx.filter((e) => {
    const mg = e.exercise.movementGroup ?? '';
    if (!PYRAMID_UPPER_COMPOUND_MGS.has(mg)) return false;
    return e.priority === 'compound' || e.priority === 'skill';
  });

  const pool = upperCompounds.length > 0 ? upperCompounds : mainEx;

  // Resolve the effective user level for level-proximity tie-breaking.
  // Prefer the domain-specific level when available so a planche user
  // (planche=L7, push=absent) anchors to their skill level, not a
  // globalLevel average that might be lower or unrelated.
  const userLevel = context.userLevel ?? 1;

  // Sort primary: score descending.
  // Tie-break: level proximity to userLevel ascending — the exercise
  // closest to the user's actual capability anchors the pyramid so the
  // D3 shape (-2, 0, +2) targets the correct level range.
  const ranked = pool.slice().sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aGap = Math.abs((a.programLevel ?? 0) - userLevel);
    const bGap = Math.abs((b.programLevel ?? 0) - userLevel);
    return aGap - bGap;
  });

  // CNS Protection Rule: exactly ONE pyramid per workout, never two.
  // The legacy `Math.random() < 0.5 ? 1 : 2` roll has been removed — see
  // function header for rationale.
  const desired = 1;
  const take = Math.min(desired, ranked.length);
  return ranked.slice(0, take);
}

// ============================================================================
// CONSTANTS (Title / Description templates — kept here, orchestrator-specific)
// ============================================================================

const INACTIVITY_THRESHOLD_DAYS = 3;

// Tabata finisher is offered only from general user level 4+ (hard enforcement of
// intent, independent of the admin toggle). Gates the separate tabata roll below.
const MIN_TABATA_USER_LEVEL = 4;

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
  pupil: 'תלמידים',
  office_worker: 'עובדי משרד',
  military: 'אנשי צה"ל',
  vatikim: 'בני גיל הזהב',
  pro_athlete: 'ספורטאי קצה',
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
// findLevelAppropriateSubstitute and LevelSubstituteResult are now imported
// from PoolFactory (Phase 5 migration). The implementations remain identical.
// ============================================================================

// Movement-group → logical domain mapping is imported from
// `../shared/constants/domain-mapping.constants` as `MG_TO_DOMAIN` —
// the single source of truth shared by the guarantee steps, the David
// Rule rescue scan, the synergy bonus engine, and the protocol
// processors.  Foundational MGs map to their parent domain
// ('push'/'pull'/'legs'/'core'); skill MGs map to their own canonical
// program slug (e.g. 'planche', 'muscle_up').

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
export function resolveInjectedLevel(
  exercise: Exercise,
  movementGroup: string,
  domainLevel: number,
): number {
  const ownDomain = MG_TO_DOMAIN[movementGroup] ?? movementGroup;
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

export function substituteExercise(
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

/**
 * Resolve the ExecutionMethod to attach to a guarantee/rescue substitute exercise.
 * Routes through the single-source `selectMethodForContext` so an injected
 * substitute renders with a method valid for THIS session's location + gear
 * (park → bodyweight, NEVER home) instead of `executionMethods[0]`, which is
 * authored home-first and leaks a home method into a park workout.
 *
 * Substitutes originate from `context.globalExercisePool`, the ContextualEngine-
 * filtered pool (`se.method != null`), so the selector returns a valid method in
 * practice. On the guarded, can't-happen null path we return undefined so
 * `substituteExercise` keeps the victim's (context-valid) method rather than
 * re-introducing the `executionMethods[0]` leak.
 *
 * Shared by the WorkoutGenerator david-rule and the GuaranteePassRunner passes.
 * Flag OFF → byte-identical legacy behaviour (`executionMethods[0]`).
 */
export function resolveSubstituteMethod(
  exercise: Exercise,
  context: WorkoutGenerationContext,
): ExecutionMethod | undefined {
  if (!CONTEXT_AWARE_SELECTION_ENABLED) {
    return exercise.executionMethods?.[0];
  }
  return selectMethodForContext(
    exercise,
    // WorkoutGenerationContext.location is loosely typed `string`; it holds a
    // valid ExecutionLocation at runtime.
    context.location as ExecutionLocation,
    context.availableEquipment ?? [],
  ) ?? undefined;
}

// ============================================================================
// WORKOUT GENERATOR CLASS
// ============================================================================

export class WorkoutGenerator {
  generateWorkout(
    scoredExercises: ScoredExercise[],
    context: WorkoutGenerationContext,
  ): GeneratedWorkout {
    const pipelineLog: string[] = [...(context.earlyPipelineNotes ?? [])];
    if (context.relaxedConstraints?.length) {
      pipelineLog.push(`relaxed_constraints: [${context.relaxedConstraints.join(', ')}]`);
    }
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
    // Tier 1 middleware applies the periodization clock + detraining lock +
    // first-session guard.  After this returns, `difficulty` is final and
    // must not be re-derived anywhere downstream in this method.
    const difficulty: DifficultyLevel = resolveEffectiveDifficulty(
      context.difficulty,
      {
        detrainingLock: context.detrainingLock ?? false,
        periodizationWeek: context.periodizationWeek ?? 1,
      },
      context.isFirstSessionInProgram,
    );

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
    const annotatedExercises = applyDifficultyFilter(synergyExercises, context, difficulty, pipelineLog);
    pipelineLog.push(`after_difficulty_filter: ${annotatedExercises.length}`);

    // ── Bolt-2 Narrow Level Ceiling ───────────────────────────────────────
    // Bolt 2 (Normal / Challenging) is the volume + mastery zone — the user
    // works at or near their current SKILL level to consolidate strength
    // and accumulate quality reps.  Above-level exposures of +2 / +3 belong
    // exclusively to Bolt 3 (Intense); D2 admits at most +1.
    //
    // Per-domain ceiling (replaces the previous global-max approach):
    //   When domainBudgets is populated (master sessions — full_body or
    //   calisthenics_upper), each exercise is evaluated against the ceiling
    //   of ITS OWN domain rather than the single max across all domains.
    //
    //   Example — calisthenics_upper with planche=L5, pull=L14:
    //     Old: bolt2Ceiling = max(5,14)+1 = 15 → all exercises ≤L15 pass
    //          (planche L12 incorrectly admitted even though user is L5).
    //     Old (before parent domains were added): bolt2Ceiling = max(5)+1 = 6
    //          → all pull exercises at L14 excluded (39 candidates dropped).
    //     New: planche exercises use ceiling L6, pull exercises use ceiling L15.
    //          Planche L12 → excluded ✓   Pull L14 → admitted ✓
    //
    // Unleveled exercises (programLevel === 0 — typically warmup / mobility
    // / accessory MGs) are always admitted.
    let filteredExercises = annotatedExercises;
    if (difficulty === 2) {
      // Build per-domain ceiling map from domainBudgets when available.
      const bolt2DomainCeilingMap = new Map<string, number>();
      let bolt2FallbackLevel: number;

      if (context.domainBudgets?.length) {
        for (const db of context.domainBudgets) {
          bolt2DomainCeilingMap.set(db.domain, db.level + 1);
        }
        bolt2FallbackLevel = Math.max(...context.domainBudgets.map(d => d.level)) + 1;
      } else if (context.activeProgramId) {
        const skillLevel =
          context.userProgramLevels?.get(context.activeProgramId) ??
          context.userProgramLevels?.get(context.activeProgramId.toLowerCase());
        bolt2FallbackLevel = (skillLevel != null && skillLevel > 0 ? skillLevel : (context.userLevel ?? 1)) + 1;
      } else {
        bolt2FallbackLevel = (context.userLevel ?? 1) + 1;
      }

      const beforeCount = annotatedExercises.length;
      filteredExercises = annotatedExercises.filter(ex => {
        const level = ex.programLevel ?? 0;
        if (level === 0) return true; // unleveled (warmup / mobility) — always pass

        if (bolt2DomainCeilingMap.size === 0) return level <= bolt2FallbackLevel;

        // Pass 1: movement group → domain ceiling
        const mgDomain = MG_TO_DOMAIN[ex.exercise?.movementGroup ?? ''];
        if (mgDomain) {
          const ceiling = bolt2DomainCeilingMap.get(mgDomain);
          if (ceiling !== undefined) return level <= ceiling;
        }

        // Pass 2: targetPrograms → slug domain ceiling
        for (const tp of ex.exercise?.targetPrograms ?? []) {
          const slug = resolveToSlug(tp.programId);
          const ceiling = bolt2DomainCeilingMap.get(slug) ?? bolt2DomainCeilingMap.get(tp.programId);
          if (ceiling !== undefined) return level <= ceiling;
        }

        // No domain match — use global fallback ceiling
        return level <= bolt2FallbackLevel;
      });
      const droppedCount = beforeCount - filteredExercises.length;
      if (droppedCount > 0) {
        const ceilingStr = bolt2DomainCeilingMap.size > 0
          ? `per-domain [${Array.from(bolt2DomainCeilingMap.entries()).map(([d, c]) => `${d}→L${c}`).join(', ')}]`
          : `L${bolt2FallbackLevel}`;
        console.log(
          `[Bolt2Cap] ${ceilingStr} ` +
          `(activeProgram=${context.activeProgramId ?? 'none'}): ` +
          `filtered out ${droppedCount} above-ceiling exercise(s). ` +
          `Pool: ${beforeCount} → ${filteredExercises.length}`,
        );
        pipelineLog.push(
          `bolt2_cap: dropped ${droppedCount} exercises above per-domain ceilings ` +
          `(activeProgramId=${context.activeProgramId ?? 'none'})`,
        );
      }
    }

    // ── Bolt-1 Regression Ceiling ─────────────────────────────────────────
    // Bolt 1 (Recovery/Flow) keeps exercises within [ref−3, ref−1] of the
    // user's SKILL program level — not the global baseUserLevel maximum.
    //
    // Per-domain window (mirrors Bolt-2 per-domain logic):
    //   When domainBudgets is available, each exercise is evaluated inside
    //   the recovery window anchored to ITS OWN domain's reference level.
    //   A calisthenics_upper recovery session with planche=L5 / pull=L14
    //   produces two independent windows:
    //     planche domain → window [L2, L4]
    //     pull domain    → window [L11, L13]
    //   — so planche recovery exercises (L2–L4) and pull recovery exercises
    //   (L11–L13) are both admitted simultaneously without either window
    //   excluding the other domain's appropriate level range.
    //
    // Only fires for sessions where the maximum domain reference > 4.
    const bolt1DomainRefMap = new Map<string, number>();
    let bolt1FallbackRef: number;

    if (context.domainBudgets?.length) {
      for (const db of context.domainBudgets) {
        bolt1DomainRefMap.set(db.domain, db.level);
      }
      bolt1FallbackRef = Math.max(...context.domainBudgets.map(d => d.level));
    } else if (context.activeProgramId) {
      const skillLevel =
        context.userProgramLevels?.get(context.activeProgramId) ??
        context.userProgramLevels?.get(context.activeProgramId.toLowerCase());
      bolt1FallbackRef = (skillLevel != null && skillLevel > 0) ? skillLevel : (context.userLevel ?? 1);
    } else {
      bolt1FallbackRef = context.userLevel ?? 1;
    }

    // Guard threshold: use the maximum reference level so the block fires
    // whenever ANY domain requires a recovery window.
    const bolt1ReferenceLevel = bolt1FallbackRef;

    if (difficulty === 1 && bolt1ReferenceLevel > 4) {
      // Flexible recovery window: keep exercises whose level falls inside
      // [ref − 3, ref − 1] of their own domain's reference.
      // Unleveled (level === 0) exercises are always admitted so warmup /
      // mobility / accessory MGs are not collateral-pruned.
      const windowLow  = Math.max(1, bolt1ReferenceLevel - 3);
      const windowHigh = Math.max(1, bolt1ReferenceLevel - 1);
      const beforeCount = filteredExercises.length;
      filteredExercises = filteredExercises.filter(ex => {
        const level = ex.programLevel ?? 0;
        if (level === 0) return true;

        if (bolt1DomainRefMap.size === 0) return isWithinBolt1Window(level, bolt1FallbackRef);

        // Pass 1: movement group → domain reference
        const mgDomain = MG_TO_DOMAIN[ex.exercise?.movementGroup ?? ''];
        if (mgDomain) {
          const domainRef = bolt1DomainRefMap.get(mgDomain);
          if (domainRef !== undefined) return isWithinBolt1Window(level, domainRef);
        }

        // Pass 2: targetPrograms → slug domain reference
        for (const tp of ex.exercise?.targetPrograms ?? []) {
          const slug = resolveToSlug(tp.programId);
          const domainRef = bolt1DomainRefMap.get(slug) ?? bolt1DomainRefMap.get(tp.programId);
          if (domainRef !== undefined) return isWithinBolt1Window(level, domainRef);
        }

        // No domain match — use fallback reference
        return isWithinBolt1Window(level, bolt1FallbackRef);
      });
      const droppedCount = beforeCount - filteredExercises.length;
      if (droppedCount > 0) {
        const windowStr = bolt1DomainRefMap.size > 0
          ? `per-domain [${Array.from(bolt1DomainRefMap.entries()).map(([d, r]) => `${d}→[L${Math.max(1,r-3)}-L${Math.max(1,r-1)}]`).join(', ')}]`
          : `L${windowLow}–L${windowHigh}`;
        console.log(
          `[Bolt1Cap] Recovery window ${windowStr} ` +
          `(activeProgram=${context.activeProgramId ?? 'none'}): ` +
          `filtered out ${droppedCount} out-of-window exercise(s). ` +
          `Pool: ${beforeCount} → ${filteredExercises.length}`,
        );
        pipelineLog.push(
          `bolt1_recovery_window: dropped ${droppedCount} exercises outside per-domain windows ` +
          `(activeProgramId=${context.activeProgramId ?? 'none'})`,
        );
      }
    }

    // Step 3: Select exercises
    const rawSelected = this.selectExercises(filteredExercises, exerciseCount, includeAccessories, context, difficulty);
    pipelineLog.push(`after_bolt_selection(bolt=${difficulty}): ${rawSelected.length}`);

    // Detect single-domain sessions (e.g. Pull-only, Push-only tracks).
    // In this mode the entire pool shares the same movement groups by definition,
    // so the strict MG cap would displace valid exercises with nothing to backfill,
    // collapsing the workout to 1-2 exercises.
    const blueprint = createStructureDirector().plan(context, difficulty);
    const isSingleDomain = blueprint.strategy === 'single_domain';

    // Step 3b: Movement Group Diversity Pass
    //
    // Multi-domain: max 1 exercise per primary movement group (vertical/horizontal
    // pull/push). Prevents a "Muscle-up fest" when all top scorers share one group.
    // Displaced slots are backfilled from the filtered pool with different groups.
    //
    // Single-domain (e.g. Pull-only, Push-only): enforcing the MG cap is harmful
    // because every exercise in the pool belongs to the same 1-2 movement groups.
    // In this mode we only prevent true duplicates — the exact same exercise ID
    // appearing more than once — so the workout can include wide-grip, close-grip,
    // and ring pull-ups as distinct slots rather than collapsing to one.
    const STRICT_MG_MAX = 1;
    const STRICT_MG_GROUPS = new Set([
      'vertical_pull', 'horizontal_pull',
      'vertical_push', 'horizontal_push',
    ]);
    const diversePrimary: (typeof rawSelected)[number][] = [];
    const usedIdsDiversity = new Set<string>();

    if (isSingleDomain) {
      // Slug-based dedup only: allow multiple exercises from the same movement
      // group; only block the exact same exercise ID appearing more than once.
      for (const ex of rawSelected) {
        if (!usedIdsDiversity.has(ex.exercise.id)) {
          diversePrimary.push(ex);
          usedIdsDiversity.add(ex.exercise.id);
        }
      }
      // Backfill remaining slots with additional slug-unique exercises from the pool.
      const slotsNeeded = rawSelected.length - diversePrimary.length;
      if (slotsNeeded > 0) {
        const backfill = filteredExercises
          .filter(e => !usedIdsDiversity.has(e.exercise.id))
          .sort((a, b) => b.score - a.score)
          .slice(0, slotsNeeded);
        for (const ex of backfill) {
          diversePrimary.push(ex);
          usedIdsDiversity.add(ex.exercise.id);
        }
        pipelineLog.push(`mg_diversity(single-domain): slug-dedup only, backfilled ${backfill.length}`);
        console.log(`[MGDiversity] Single-domain mode: slug-dedup only, backfilled ${backfill.length} (pool had ${filteredExercises.length} candidates)`);
      } else {
        pipelineLog.push(`mg_diversity(single-domain): slug-dedup only, no slots displaced`);
        console.log(`[MGDiversity] Single-domain mode: slug-dedup only, all ${rawSelected.length} exercises kept`);
      }
    } else {
      const mgUsage = new Map<string, number>();

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
    }

    // Use the diversity-enforced list for all downstream steps
    const selectedExercises = diversePrimary;

    // ── Step 4: Volume + Budget Distribution (Tier-2 BudgetDistributor) ──────
    //
    // BudgetDistributor.distribute() owns the entire volume math chain in one
    // call:  assignVolume → maxSets cap → weeklyBudget cap → dailyBudget cap →
    //        set rebalance → skill cluster cap.
    //
    // Migration: replaces the legacy Steps 4b/4c/4c-prime cap loops + Step 5g
    // (set rebalance) + Step 5h (skill cluster cap) that previously lived
    // inline here, gated by !context.useModularPipeline.  The modular path
    // is now the only path.
    const volumeAdjustment = calculateVolumeAdjustment(context, difficulty);
    const weeklyBudget = context.remainingWeeklyBudget;
    pipelineLog.push(`weekly_budget: ${weeklyBudget ?? 'n/a'}, used_so_far: ${weeklyBudget != null ? 'see_store' : 'n/a'}, daily_budget: ${context.dailySetBudget ?? 'n/a'}`);

    const budgetDistributor = createBudgetDistributor();
    const distResult = budgetDistributor.distribute(
      selectedExercises,
      context,
      difficulty,
      blueprint.budgetConstraints,
    );
    let workoutExercises = distResult.exercises;
    pipelineLog.push(...distResult.log);

    // ── Step 4d: "David Rule" — Relative Gap Guard ───────────────────────────
    //
    // Quality-rescue substitution pass (NOT a budget cap).  Stays in
    // WorkoutGenerator because it operates on the post-distribute
    // WorkoutExercise[] using findLevelAppropriateSubstitute.
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

        for (const idx of rescueIndices) {
          const victim = workoutExercises[idx];
          const mg = victim.exercise.movementGroup;
          const victimLevel = victim.programLevel ?? 1;
          const victimName = getLocalizedText(victim.exercise.name);

          if (!mg) {
            console.log(`[DavidRule] Skipping "${victimName}" — no movementGroup`);
            continue;
          }

          // ── Anti-Duplication Law (Strict In-Workout ID Tracking) ────────
          // Rebuild the exclusion set FRESH at every iteration so any
          // substitutions performed in previous iterations are reflected
          // immediately.  The earlier "build-once-then-incrementally-add"
          // pattern was correct in theory but brittle: if any code path
          // mutated `workoutExercises` between iterations (e.g., an
          // intermediate guarantee pass running on a copied reference, a
          // trio-modifier pass on the same array, or a stale `usedIds`
          // scope crossed boundaries), the static `usedIds` set could
          // diverge from the actual workout state and admit duplicates
          // such as the live-log "שכיבות סמיכה פלאנץ׳ טאק" appearing twice.
          //
          // Rebuilding from `workoutExercises` per-iteration guarantees
          // the exclusion set is always THE source of truth for currently
          // selected exercise IDs, regardless of any upstream mutations.
          const currentWorkoutIds = new Set<string>();
          for (const we of workoutExercises) {
            const id = we?.exercise?.id;
            if (id) currentWorkoutIds.add(id);
          }

          const targetDomain = MG_TO_DOMAIN[mg];
          const domainLevel = targetDomain
            ? (userLevels?.get(targetDomain) ?? context.userLevel)
            : context.userLevel;

          const targetOffset = difficulty === 1 ? -2 : difficulty === 2 ? -1 : 1;
          const targetLevel = Math.max(1, domainLevel + targetOffset);
          const sub = findLevelAppropriateSubstitute(
            context.globalExercisePool, mg, targetLevel, currentWorkoutIds, userLevels, targetDomain, difficulty,
          );

          if (sub) {
            // Defensive double-check: even with the exclusion filter,
            // refuse to apply a substitute whose id already exists in
            // the current workout list.  This is the absolute last line
            // of defense — if PoolFactory's filter drifts in the future,
            // or the substitute search returns a falsely "fresh" id (data
            // corruption / mis-keyed Firestore docs), the rescue swap is
            // skipped rather than admitting a duplicate that would corrupt
            // the user's session with conflicting rep ranges.
            if (currentWorkoutIds.has(sub.exercise.id)) {
              const dupName = getLocalizedText(sub.exercise.name);
              console.warn(
                `[DavidRule] ⚠️ Anti-Duplication: substitute "${dupName}" ` +
                `(L${sub.level}) already present in workout — leaving ` +
                `"${victimName}" (L${victimLevel}) unrescued rather than admit a duplicate.`,
              );
              pipelineLog.push(
                `david_rule: dedup_skip_"${dupName}"_for_"${victimName}"(L${victimLevel},mg=${mg})`,
              );
              continue;
            }

            workoutExercises[idx] = {
              ...workoutExercises[idx],
              ...substituteExercise(workoutExercises[idx], sub.exercise, resolveSubstituteMethod(sub.exercise, context)),
              programLevel: sub.level,
              isOverLevel: sub.level > domainLevel,
              levelDelta: sub.level - domainLevel,
              reasoning: [
                ...workoutExercises[idx].reasoning,
                `david_rule:rescued(L${victimLevel}→L${sub.level},mg=${mg},target=L${targetLevel}(D${difficulty}),radius=±${sub.radius})`,
              ],
            };

            const repName = getLocalizedText(sub.exercise.name);
            pipelineLog.push(`david_rule: "${victimName}" (L${victimLevel}) → "${repName}" (L${sub.level}) [${mg}]`);
            console.log(`[DavidRule] ✅ "${victimName}" (L${victimLevel}) → "${repName}" (L${sub.level}) [${mg}, domain=${targetDomain} L${domainLevel}, target=L${targetLevel}(D${difficulty}), radius=±${sub.radius}]`);
          } else {
            console.warn(`[DavidRule] ❌ No rescue candidate for "${victimName}" (L${victimLevel}, mg=${mg}, domain=${targetDomain} L${domainLevel}, target=L${targetLevel}(D${difficulty})`);
            pipelineLog.push(`david_rule: no_rescue_for_"${victimName}"(L${victimLevel},mg=${mg})`);
          }
        }
        console.groupEnd();
      }
    }

    // Step 5: Protocol injection
    const protocolResult = this.selectProtocol(difficulty, context);

    // Step 5: Physiological sort
    // Female full_body users get legs first (Tier 0) — more approachable ordering
    const isFemaleFullBody =
      context.gender === 'female' && blueprint.strategy === 'full_body';
    workoutExercises = applyPhysiologicalSort(workoutExercises, { femaleFullBody: isFemaleFullBody });

    // Step 5b: Protocol processor dispatch
    // Replaces the hard-coded if-tree.  Add new protocols by registering them
    // in `protocols/protocol-processor.registry.ts` — no changes here.
    //
    // PYRAMID SPECIAL CASE — surgical, not blanket
    //   When the rolled protocol is 'pyramid', we do NOT pyramidize the
    //   entire exercise list.  Instead we pick 1-2 dominant upper-body
    //   compound/skill exercises (push / pull / muscle_up / HSPU /
    //   planche) and pass only that subset to the processor.  The other
    //   exercises stay as standard straight sets / antagonist pairs.
    //
    //   Pyramid targets are mutated in place by the processor, so the
    //   references already inside `workoutExercises` pick up the
    //   pyramidSequence / repsSequence fields without us re-assigning.
    //
    //   If no upper compound candidate exists (e.g. pure legs day), the
    //   fallback selects the top-scored main exercise regardless of
    //   movement group — legs / core CAN host a pyramid when they are
    //   the standalone focus, but are NEVER forced into one alongside
    //   an upper compound.
    const processor = findProcessor(protocolResult.setType);
    if (processor) {
      if (protocolResult.setType === 'pyramid') {
        const pyramidTargets = selectPyramidTargets(workoutExercises, context);
        if (pyramidTargets.length === 0) {
          console.log(
            '[WorkoutGenerator] Pyramid rolled but no main exercises to target — ' +
            'reverting to straight sets',
          );
          protocolResult.setType = 'straight';
        } else {
          console.log(
            `[WorkoutGenerator] Pyramid applied to ${pyramidTargets.length}/` +
            `${workoutExercises.filter((e) => (e.exerciseRole ?? 'main') === 'main').length} ` +
            `main exercise(s): ${pyramidTargets
              .map((t) => (t.exercise.name as any)?.he ?? t.exercise.id)
              .join(', ')}`,
          );
          processor.process(pyramidTargets, context);
        }
      } else {
        workoutExercises = processor.process(workoutExercises, context);
      }
      if (processor.mutateStructure) {
        protocolResult.structure = processor.mutateStructure(protocolResult.structure);
      }
    }

    // Step 5c: Deduplicate
    workoutExercises = deduplicateExercises(workoutExercises);

    // ── Step 5d / 5d-prime / 5e: Coverage Guarantees (Tier-2 GuaranteePassRunner) ──
    //
    // GuaranteePassRunner.runAllGuarantees() owns the 3 coverage guarantee
    // passes that previously lived inline here as Steps 5d, 5d-prime, 5e
    // (~380 lines):
    //
    //   1. Horizontal Guarantee        — at least 1 horizontal_push +
    //                                    1 horizontal_pull in full_body sessions
    //   2. Vertical Foundation Guard   — foundation movement in
    //                                    vertical_pull / vertical_push slots
    //   3. Full-Body Domain Guarantee  — push + pull + legs presence
    //
    // Migrated verbatim — no behavioural changes.  The runner mutates
    // `workoutExercises` indices in place (preserving the original semantics)
    // but always returns the WorkoutExercise[] reference for the chain.
    workoutExercises = runAllGuarantees(
      workoutExercises,
      context,
      blueprint,
      difficulty,
      pipelineLog,
    );

    // Step 5e-bis: Legs Cap for Full-Body sessions
    //
    // In a Full Body workout the legs slot is a balance anchor — it provides
    // the lower-body stimulus for the session.  More than 2 leg exercises
    // dilutes push/pull volume and over-extends the workout.
    //
    // Rule: If more than MAX_LEGS_FULL_BODY main exercises resolve to the
    // 'legs' domain (squat/hinge/lunge MGs), remove the excess — lowest-scored
    // leg exercise first — UNLESS the removed exercise is the ONLY legs
    // exercise in the workout (the guarantee below always ensures at least 1).
    // Only fires when StructureDirector resolves a full_body session so
    // single-track Legs programs are never affected.
    const MAX_LEGS_FULL_BODY = 2;
    const LEGS_MG_SET = new Set(['squat', 'hinge', 'lunge']);
    const isFullBodySession = blueprint.strategy === 'full_body';

    if (isFullBodySession) {
      const legExercises = workoutExercises
        .filter(e => e.exerciseRole === 'main' && LEGS_MG_SET.has(e.exercise.movementGroup ?? ''));

      if (legExercises.length > MAX_LEGS_FULL_BODY) {
        // Sort by score ascending — drop weakest legs exercises first
        const sorted = [...legExercises].sort((a, b) => a.score - b.score);
        const toRemove = sorted.slice(0, legExercises.length - MAX_LEGS_FULL_BODY);
        const removeIds = new Set(toRemove.map(e => e.exercise.id));
        const beforeCount = workoutExercises.length;
        workoutExercises = workoutExercises.filter(e => !removeIds.has(e.exercise.id));
        const removed = beforeCount - workoutExercises.length;
        console.log(
          `[LegsCapGuard] Full Body — removed ${removed} excess leg exercise(s) ` +
          `(was ${legExercises.length}, cap=${MAX_LEGS_FULL_BODY}): ` +
          `[${toRemove.map(e => getLocalizedText(e.exercise.name)).join(', ')}]`,
        );
        pipelineLog.push(`legs_cap: removed ${removed} excess leg(s) (was ${legExercises.length})`);
      }
    }

    // Step 5f: Final physiological sort — anchors guarantee-injected exercises in correct tier
    workoutExercises = applyPhysiologicalSort(workoutExercises, { femaleFullBody: isFemaleFullBody });

    // NOTE: The Strict Domain-Priority Sort (upper=1, legs=2, core/iso=3)
    // does NOT run here.  It is the FINAL operation in the pipeline and
    // lives in `home-workout.service.ts` AFTER VolumeGuard pruning and
    // antagonist-pair re-application — see `applyDomainPrioritySort()`.
    // Running it earlier would let VolumeGuard's per-exercise removals
    // re-shuffle legs above push/pull (the bug we fixed in Phase 2.5+).

    // ── Steps 5g + 5h removed in Phase 3 ─────────────────────────────────────
    //
    // BudgetDistributor.distribute() (Phase 3a) is now the single owner of:
    //   • Step 5g — Set Re-Balancing  (`_rebalanceSets()`)
    //   • Step 5h — Skill / Strength Cluster Cap  (`_skillClusterCap()`)
    //
    // The legacy inline blocks were guarded by !context.useModularPipeline and
    // are no longer reachable now that the modular pipeline is the only path.

    // Step 6: Title/description/cue
    const title = this.generateTitle(context, difficulty);
    const description = this.generateDescription(context, difficulty);
    const aiCue = this.generateAICue(context, workoutExercises.length, difficulty);

    // Step 6b: Tabata FINISHER — resolved on a SEPARATE union track
    // (context.tabataProbability, already periodization-scaled) and rolled
    // independently of the main protocol. Fires as an ADDED conditioning finisher
    // when: some enrolled program enables it (p>0), difficulty≥2 (never Bolt-1/
    // regression), general userLevel≥4, and the roll lands. buildTabataBlock then
    // pool-injects the members (protocolBlock='tabata' + gw.tabataBlock). It rides
    // ALONGSIDE the main protocol — never competes for the winner-takes-all slot.
    const tabataP = context.tabataProbability ?? 0;
    const fireTabata =
      tabataP > 0 &&
      difficulty >= 2 &&
      (context.userLevel ?? 0) >= MIN_TABATA_USER_LEVEL &&
      Math.random() <= tabataP;
    const tabataBlock = fireTabata
      ? buildTabataBlock('tabata', workoutExercises, context)
      : undefined;

    // Step 7: Duration
    const estimatedDuration = calculateEstimatedDuration(workoutExercises);

    // ── Time-Volume Feedback Loop ─────────────────────────────────────────
    // If the assembled workout runs longer than `availableTime` by more than
    // 3 minutes, iteratively shave sets (accessories / isolations first, then
    // skill, then compound — via the priority order inside applySmartSetCap)
    // until the re-estimated duration fits within the ceiling.
    //
    // Safety bounds:
    //   • Only fires when context.availableTime is a positive number.
    //   • Each iteration reduces the total set count by at least 1.  If a full
    //     pass produces no reduction (everything is at its floor), the loop
    //     breaks to prevent infinite iteration.
    //   • Max 20 iterations — in practice the inner cap is reached in ≤ 5 passes.
    //   • applySmartSetCap is a pure function; no mutation of the input array.
    if (context.availableTime > 0) {
      const TIME_TOLERANCE_MINUTES = 3;
      let compressedExercises = workoutExercises;
      let currentDuration = estimatedDuration;
      const maxIterations = 20;
      let iterations = 0;

      while (
        currentDuration > context.availableTime + TIME_TOLERANCE_MINUTES &&
        iterations < maxIterations
      ) {
        const totalSetsBefore = compressedExercises.reduce((s, e) => s + e.sets, 0);
        // Reduce the global set cap by 1 on each pass so applySmartSetCap
        // has a strictly tighter ceiling to trim towards.
        const newCap = Math.max(1, totalSetsBefore - 1);
        const candidate = applySmartSetCap(
          compressedExercises,
          newCap,
          compressedExercises.length,
        );
        const totalSetsAfter = candidate.reduce((s, e) => s + e.sets, 0);
        // Guard: if nothing was trimmed the floor has been reached — stop.
        if (totalSetsAfter >= totalSetsBefore) break;
        compressedExercises = candidate;
        currentDuration = calculateEstimatedDuration(compressedExercises);
        iterations++;
      }

      if (iterations > 0) {
        console.log(
          `[TimeVolumeFeedback] ${iterations} compression pass(es): ` +
          `${estimatedDuration} min → ${currentDuration} min ` +
          `(ceiling=${context.availableTime} min, tolerance=3 min)`,
        );
        workoutExercises = compressedExercises;
      }
    }
    // Re-derive final duration after any compression so Step 10 stats are accurate.
    const finalEstimatedDuration = calculateEstimatedDuration(workoutExercises);

    // Step 8: Structure
    let structure = this.determineStructure(context, workoutExercises);
    if (protocolResult.structure !== 'standard') {
      structure = protocolResult.structure;
    }
    const blastMode = context.intentMode === 'blast' ? this.getBlastModeDetails(context, workoutExercises) : undefined;

    // Step 9: Mechanical balance
    const mechanicalBalance = this.calculateMechanicalBalance(workoutExercises);

    // Step 10: Stats
    const stats = calculateWorkoutStats(workoutExercises, difficulty, finalEstimatedDuration, context.userWeight);
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
        `Tier=${ex.tier} | Sets=${ex.sets} ${ex.isTimeBased ? `Hold=${ex.reps}s` : `Reps=${ex.reps}`} Rest=${ex.restSeconds}s | Video=${videoUrl ? 'YES' : 'NO'}`,
      );
    });
    console.groupEnd();

    return {
      title,
      description,
      aiCue,
      exercises: workoutExercises,
      estimatedDuration: finalEstimatedDuration,
      structure,
      difficulty,
      volumeAdjustment: volumeAdjustment.reductionPercent > 0 ? volumeAdjustment : undefined,
      blastMode,
      mechanicalBalance,
      stats,
      isRecovery,
      totalPlannedSets,
      appliedProtocol: protocolResult.setType !== 'straight' ? protocolResult.setType : undefined,
      tabataBlock,
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
    // skillLevel - 2 are the sweet spot.  A Planche L7 user should pick
    // L5 exercises, not L14 (the Push-domain-biased (16 - 2) target).
    //
    // Use the active skill program level from userProgramLevels instead of
    // the global baseUserLevel so the boost/penalty window is anchored to
    // the user's SKILL floor, not the highest cross-domain level.
    const isRecoveryOption = (context.difficulty ?? 2) === 1;
    const synergyReferenceLevel: number = (() => {
      if (context.activeProgramId) {
        const skillLevel =
          context.userProgramLevels?.get(context.activeProgramId) ??
          context.userProgramLevels?.get(context.activeProgramId.toLowerCase());
        if (skillLevel != null && skillLevel > 0) return skillLevel;
      }
      return context.userLevel ?? 1;
    })();
    const regressionTarget = isRecoveryOption
      ? Math.max(1, synergyReferenceLevel - 2)
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
      const rawGear = collectMethodGear(ex.method as any);
      for (const g of rawGear) {
        const norm = normalizeGearId(g);
        gearFrequency[norm] = (gearFrequency[norm] ?? 0) + 1;
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

      const allGear = collectMethodGear(ex.method as any).map(normalizeGearId);
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
    // ── DIAGNOSTIC: always print what the engine received ────────────────
    console.log(
      `[WorkoutGenerator][selectProtocol] difficulty=${difficulty} | ` +
      `adminProtocols=${JSON.stringify(context.preferredProtocols ?? null)} | ` +
      `adminProbability=${context.protocolProbability ?? 'undefined'} | ` +
      `periodizationWeek=${context.periodizationWeek ?? 'n/a'}`,
    );

    if (difficulty === 1) {
      console.log('[WorkoutGenerator][selectProtocol] Bolt 1 → always straight sets');
      return { structure: 'standard', setType: 'straight' };
    }

    const adminProtocols = context.preferredProtocols;
    const adminProbability = context.protocolProbability;

    if (!adminProtocols?.length) {
      if (adminProbability != null && adminProbability > 0) {
        console.log('[WorkoutGenerator][selectProtocol] ⚠️  Probability set but no protocols list — check Firestore lookup');
      } else {
        console.log('[WorkoutGenerator][selectProtocol] No protocols configured — straight sets');
      }
      return { structure: 'standard', setType: 'straight' };
    }

    const probability = adminProbability ?? 0;
    if (probability <= 0) {
      console.log(
        '[WorkoutGenerator][selectProtocol] ⛔ Protocol probability = 0 ' +
        '(Deload/Rebuild week or protocolMultiplier killed it) — straight sets',
      );
      return { structure: 'standard', setType: 'straight' };
    }

    const roll = Math.random();
    if (roll > probability) {
      console.log(
        `[WorkoutGenerator][selectProtocol] Random roll ${roll.toFixed(3)} > p=${probability} — ` +
        `protocol did NOT fire this session (expected ~${Math.round((1 - probability) * 100)}% of the time)`,
      );
      return { structure: 'standard', setType: 'straight' };
    }

    const selected = adminProtocols[Math.floor(Math.random() * adminProtocols.length)];
    console.log(
      `[WorkoutGenerator][selectProtocol] ✅ Protocol injected: "${selected}" ` +
      `(roll=${roll.toFixed(3)} ≤ p=${probability}, options=[${adminProtocols.join(', ')}])`,
    );

    // (Tabata is no longer a main-lottery option — it's resolved on a separate
    // union track and rolled independently, so the old MIN_USER_LEVEL gate here
    // was removed. See Step 6b in generateWorkout.)

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
