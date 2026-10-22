/**
 * progression-calc — the PURE math of workout-completion progression.
 *
 * Extracted (22.10.2026, level-up v2) from progression.service.ts so the
 * service (which reads + writes Firestore) and the level-up screen (which
 * shows the result instantly, before the writes finish) run the exact same
 * formulas. No Firestore, no I/O — every input is passed in.
 *
 * Behaviour is byte-identical to the inline code it replaced; the service
 * still owns every read and write.
 */
import type {
  DomainTrackProgress,
  VolumeBreakdown,
  WorkoutExerciseResult,
} from '../../core/types/progression.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { LevelGoal } from '@/types/workout';

/**
 * Hardcoded known master programs as a bulletproof fallback.
 * Used when the Firestore document lookup by ID fails (e.g., when the
 * activeProgramId is a slug like "full_body" but the Firestore document
 * was created with an auto-generated ID via addDoc).
 * (Re-exported from progression.service.ts — existing imports keep working.)
 */
export const KNOWN_MASTER_PROGRAMS: Record<string, string[]> = {
  full_body: ['push', 'pull', 'legs', 'core'],
  upper_body: ['push', 'pull'],
  lower_body: ['legs', 'core'],
};

/** The rule fields the gain math needs (subset of ProgressionRuleResult). */
export interface SessionGainRule {
  baseSessionGain: number;
  bonusPercent: number;
  requiredSetsForFullGain: number;
}

/** Calculate total sets performed across all exercises */
export function calculateTotalSetsPerformed(exercises: WorkoutExerciseResult[]): number {
  return exercises.reduce((sum, exercise) => sum + exercise.setsCompleted, 0);
}

/**
 * Volume breakdown for the Dopamine Screen.
 * Pay-as-you-go: Gain is strictly linear — (Completed Sets / Target Sets) * Total Possible Gain.
 */
export function calculateVolumeBreakdown(setsPerformed: number, requiredSets: number): VolumeBreakdown {
  const volumeRatio = Math.min(1, setsPerformed / requiredSets);
  return {
    setsPerformed,
    requiredSets,
    volumeRatio,
    isFullVolume: volumeRatio >= 1,
  };
}

/** Calculate performance ratio (actual vs target) */
export function calculatePerformanceRatio(exercises: WorkoutExerciseResult[]): number {
  let totalActual = 0;
  let totalTarget = 0;

  for (const exercise of exercises) {
    const actualReps = exercise.repsPerSet.reduce((sum, r) => sum + r, 0);
    const targetReps = exercise.targetReps * exercise.setsCompleted;

    totalActual += actualReps;
    totalTarget += targetReps;
  }

  if (totalTarget === 0) return 1;
  return totalActual / totalTarget;
}

/**
 * Base + performance gain for one program from one session's exercises.
 * Pay-as-you-go: linear (Completed/Target) × baseSessionGain; the bonus for
 * exceeding target reps is capped at bonusPercent and also volume-scaled.
 */
export function computeSessionGain(
  exercises: WorkoutExerciseResult[],
  rule: SessionGainRule,
): { setsPerformed: number; volumeRatio: number; baseGain: number; bonusGain: number } {
  const setsPerformed = calculateTotalSetsPerformed(exercises);
  const volumeRatio = Math.min(1, setsPerformed / rule.requiredSetsForFullGain);
  const baseGain = volumeRatio * rule.baseSessionGain;
  const performanceRatio = calculatePerformanceRatio(exercises);
  let bonusGain = 0;
  if (performanceRatio > 1) {
    const excessPercent = (performanceRatio - 1) * 100;
    bonusGain = Math.min(excessPercent * (rule.bonusPercent / 100), rule.bonusPercent) * volumeRatio;
  }
  return { setsPerformed, volumeRatio, baseGain, bonusGain };
}

/** Fallback for goals without an admin-defined progressBonus. */
export const DEFAULT_PROGRESS_BONUS = 5;

/** The best value an exercise reached for a goal (best set for reps, total hold for seconds). */
export function goalBestValue(goal: Pick<LevelGoal, 'unit'>, match: WorkoutExerciseResult | undefined): number {
  if (!match) return 0;
  return goal.unit === 'reps'
    ? Math.max(...match.repsPerSet, 0)
    : match.repsPerSet.reduce((sum, r) => sum + r, 0);
}

export function findGoalExercise(
  goal: Pick<LevelGoal, 'exerciseId' | 'exerciseName'>,
  exercises: WorkoutExerciseResult[],
): WorkoutExerciseResult | undefined {
  return exercises.find(
    (ex) =>
      ex.exerciseId === goal.exerciseId ||
      ex.exerciseName.toLowerCase().includes(goal.exerciseName.toLowerCase()),
  );
}

/**
 * Manual weighted progress: each met goal adds its admin progressBonus.
 * `oneTimeGoals` = PROGRESSION_RULES_FROM_ADMIN_V1 (a goal already completed at
 * this level pays nothing). Flag off: the bonus repeats every session.
 */
export function computeGoalBonus(params: {
  goals: LevelGoal[];
  exercises: WorkoutExerciseResult[];
  completedGoalIds: string[] | undefined;
  oneTimeGoals: boolean;
}): { goalBonusGain: number; newlyCompletedGoalIds: string[] } {
  const { goals, exercises, oneTimeGoals } = params;
  let goalBonusGain = 0;
  const newlyCompletedGoalIds: string[] = [];
  const alreadyCompleted = new Set(params.completedGoalIds || []);

  for (const goal of goals) {
    const bonus = (goal as { progressBonus?: number }).progressBonus ?? DEFAULT_PROGRESS_BONUS;
    const match = findGoalExercise(goal, exercises);
    if (!match) {
      console.log(`[Progression] Goal "${goal.exerciseName}": not in workout → +0%`);
      continue;
    }
    const bestValue = goalBestValue(goal, match);
    if (bestValue >= goal.targetValue) {
      if (oneTimeGoals && alreadyCompleted.has(goal.exerciseId)) {
        console.log(`[Progression] Goal "${goal.exerciseName}": already completed at this level → +0%`);
        continue;
      }
      goalBonusGain += bonus;
      if (!alreadyCompleted.has(goal.exerciseId)) {
        newlyCompletedGoalIds.push(goal.exerciseId);
      }
      if (oneTimeGoals) alreadyCompleted.add(goal.exerciseId);
      console.log(
        `[Progression] Goal "${goal.exerciseName}": ${bestValue}/${goal.targetValue} ${goal.unit}` +
          ` ✅ MET → +${bonus}%`,
      );
    } else {
      console.log(
        `[Progression] Goal "${goal.exerciseName}": ${bestValue}/${goal.targetValue} ${goal.unit}` +
          ` ❌ NOT MET → +0% (needed ${goal.targetValue}, bonus would be ${bonus}%)`,
      );
    }
  }
  return { goalBonusGain, newlyCompletedGoalIds };
}

/** Skill programs that can earn the one-time mastery bonus. */
export const SKILL_PROGRAMS = new Set([
  'front_lever',
  'planche',
  'muscle_up',
  'handstand',
  'hspu',
  'back_lever',
  'human_flag',
  'one_arm_pullup',
  'one_arm_pushup',
]);
const SKILL_REP_THRESHOLD = 5; // 5 clean bilateral reps
const SKILL_HOLD_THRESHOLD = 10; // 10s isometric hold
export const SKILL_MASTERY_BONUS = 17.5; // midpoint of the agreed 15-20% band
const ISOMETRIC_HEURISTIC_REPS = 5; // any single "rep" ≥ 5 implies a hold log

/**
 * Skill mastery: +17.5% once per session when a skill program hits 5 reps
 * (best set) or 10s total hold. A set whose every value is ≥ 5 is treated
 * as a hold log.
 */
export function computeSkillMasteryBonus(
  programId: string,
  exercises: WorkoutExerciseResult[],
): { masteryBonusGain: number; trigger: string | null } {
  if (!SKILL_PROGRAMS.has(programId)) return { masteryBonusGain: 0, trigger: null };
  for (const ex of exercises) {
    if (ex.repsPerSet.length === 0) continue;
    const isLikelyHold = ex.repsPerSet.every((r) => r >= ISOMETRIC_HEURISTIC_REPS);
    if (isLikelyHold) {
      const totalHold = ex.repsPerSet.reduce((s, r) => s + r, 0);
      if (totalHold >= SKILL_HOLD_THRESHOLD) {
        return { masteryBonusGain: SKILL_MASTERY_BONUS, trigger: `${ex.exerciseName} (${totalHold}s hold)` };
      }
    } else {
      const bestSet = Math.max(...ex.repsPerSet, 0);
      if (bestSet >= SKILL_REP_THRESHOLD) {
        return { masteryBonusGain: SKILL_MASTERY_BONUS, trigger: `${ex.exerciseName} (${bestSet} reps)` };
      }
    }
  }
  return { masteryBonusGain: 0, trigger: null };
}

/**
 * Apply a gain to a track: ≥ 100% → next level, excess carried over.
 * (No cap on the carry — matches the stored behaviour.)
 */
export function applyGainToTrack(
  track: Pick<DomainTrackProgress, 'currentLevel' | 'percent'>,
  gain: number,
): { rawPercent: number; leveledUp: boolean; newLevel: number; newPercent: number } {
  const rawPercent = track.percent + gain;
  if (rawPercent >= 100) {
    return { rawPercent, leveledUp: true, newLevel: track.currentLevel + 1, newPercent: rawPercent - 100 };
  }
  return { rawPercent, leveledUp: false, newLevel: track.currentLevel, newPercent: rawPercent };
}

/** Minimal slug-map shape the classifier needs. */
export interface IdToSlugMap {
  idToSlug: Map<string, string>;
}

/** Result of exercise classification — carries diagnostic info for logging. */
export interface ClassificationResult {
  childSlug: string | null;
  tier: 'targetPrograms' | 'programIds' | 'programLevels' | 'keyword' | null;
  resolvedFrom?: string;
}

/**
 * Classify an exercise to a child program slug.
 * Priority: targetPrograms → programIds (both via the slug map, masters
 * skipped) → programLevels on the log entry → keyword match on the name.
 */
export function classifyExerciseToChild(
  exerciseName: string,
  programLevels: Record<string, number> | undefined,
  childSlugs: string[],
  firestoreExercise: Exercise | null | undefined,
  slugMap: IdToSlugMap | null,
): ClassificationResult {
  const masterSlugs = new Set(Object.keys(KNOWN_MASTER_PROGRAMS));

  if (firestoreExercise?.targetPrograms?.length && slugMap) {
    for (const tp of firestoreExercise.targetPrograms) {
      const slug = slugMap.idToSlug.get(tp.programId);
      if (slug && masterSlugs.has(slug)) continue;
      if (slug && childSlugs.includes(slug)) {
        return { childSlug: slug, tier: 'targetPrograms', resolvedFrom: tp.programId };
      }
    }
  }

  if (firestoreExercise?.programIds?.length && slugMap) {
    for (const pid of firestoreExercise.programIds) {
      const slug = slugMap.idToSlug.get(pid);
      if (slug && masterSlugs.has(slug)) continue;
      if (slug && childSlugs.includes(slug)) {
        return { childSlug: slug, tier: 'programIds', resolvedFrom: pid };
      }
    }
  }

  if (programLevels) {
    for (const childSlug of childSlugs) {
      if (programLevels[childSlug] !== undefined) {
        return { childSlug, tier: 'programLevels' };
      }
    }
  }

  const name = exerciseName.toLowerCase();
  if (name.includes('pull') || name.includes('row') || name.includes('chin') || name.includes('curl') || name.includes('משיכ') || name.includes('מתח')) {
    const match = childSlugs.find((id) => id.includes('pull'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }
  if (name.includes('squat') || name.includes('lunge') || name.includes('leg') || name.includes('calf') || name.includes('רגל') || name.includes('סקוואט') || name.includes('ירך')) {
    const match = childSlugs.find((id) => id.includes('leg'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }
  if (name.includes('plank') || name.includes('core') || name.includes('abs') || name.includes('ליבה') || name.includes('בטן')) {
    const match = childSlugs.find((id) => id.includes('core'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }
  if (name.includes('push') || name.includes('press') || name.includes('dip') || name.includes('fly') || name.includes('דחיפ') || name.includes('שכיב') || name.includes('לחיצ')) {
    const match = childSlugs.find((id) => id.includes('push'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }

  return { childSlug: null, tier: null };
}

// ── Master averaging (the stored definition — recalculateMasterLevel) ──────

/** Foundational slugs that must NEVER contribute to a skill-master average. */
const SKILL_MASTER_FOUNDATIONAL_EXCLUDE = new Set([
  'push', 'pull', 'legs', 'core',
  'upper_body', 'lower_body', 'full_body',
]);
const EXCLUDED_FROM_AVG: Record<string, string[]> = { full_body: ['core'] };
const MASTER_CAP: Record<string, number> = { full_body: 15 };

export interface MasterChildEntry {
  programId: string;
  level: number;
  percent: number;
}

/**
 * Master level/percent = plain average of the CONFIGURED children (level > 0),
 * with per-master exclusions (full_body: no core) and caps (full_body ≤ 15).
 * calisthenics_upper averages only the user's skill focus (or, without it,
 * every non-foundational child). `routingEmptySkip` = children exist but the
 * filter rejected all of them (the write is aborted upstream).
 */
export function averageMasterChildren(params: {
  masterSlug: string;
  subPrograms: MasterChildEntry[];
  configuredChildIds: ReadonlySet<string>;
  skillFocusIds?: string[];
}): { displayLevel: number; displayPercent: number; routingEmptySkip: boolean } {
  const { masterSlug, subPrograms, configuredChildIds, skillFocusIds } = params;
  const excluded = EXCLUDED_FROM_AVG[masterSlug] ?? [];
  const avgChildren = subPrograms.filter((sp) => {
    if (excluded.includes(sp.programId)) return false;
    if (!configuredChildIds.has(sp.programId)) return false;
    if (masterSlug === 'calisthenics_upper') {
      if (skillFocusIds && skillFocusIds.length > 0) {
        return skillFocusIds.includes(sp.programId);
      }
      return !SKILL_MASTER_FOUNDATIONAL_EXCLUDE.has(sp.programId);
    }
    return true;
  });

  if (avgChildren.length === 0 && configuredChildIds.size > 0) {
    return { displayLevel: 0, displayPercent: 0, routingEmptySkip: true };
  }

  const avgCount = avgChildren.length || 1;
  const avgLevel = avgChildren.reduce((sum, sp) => sum + sp.level, 0) / avgCount;
  const avgPercent = avgChildren.reduce((sum, sp) => sum + sp.percent, 0) / avgCount;
  const cap = MASTER_CAP[masterSlug] ?? Infinity;
  return {
    displayLevel: Math.min(cap, Math.round(avgLevel)),
    displayPercent: Math.round(avgPercent * 100) / 100,
    routingEmptySkip: false,
  };
}
