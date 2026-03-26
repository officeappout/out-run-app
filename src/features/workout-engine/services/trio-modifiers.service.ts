/**
 * Trio Modifiers — Post-processing logic for the 3 workout options.
 *
 * Extracted from home-workout.service.ts to reduce the orchestrator
 * to pure orchestration (~1,000 lines).
 *
 *   applyIntenseOption     → Option 2 "Intense" (difficulty 3)
 *   applyFlowRegression    → Option 3 "Flow/Technical" (difficulty 1)
 *   applyEssentialGearFilter → Bodyweight + essential gear only
 *   applyTagPreference     → Rest-day tag boosting
 *   logTrioSummary         → Console summary of all 3 options
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import type { Exercise, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../logic/WorkoutGenerator';
import type { WorkoutTrioOption } from './home-workout.types';
import { resolveToSlug } from './program-hierarchy.utils';
import { isTimeBasedExercise } from '../logic/workout-budgeting.utils';
import { normalizeGearId, ESSENTIAL_PARK_GEAR } from '../shared/utils/gear-mapping.utils';

/**
 * Check if userProgramLevels contains a key that matches `programId`
 * either directly or via slug resolution.
 */
function levelsHasProgram(levels: Map<string, number>, programId: string): boolean {
  if (levels.has(programId)) return true;
  return levels.has(resolveToSlug(programId));
}

function getLevelForProgram(levels: Map<string, number>, programId: string): number | undefined {
  return levels.get(programId) ?? levels.get(resolveToSlug(programId));
}

// ============================================================================
// GEAR HELPERS (Essential Gear Exception)
// ============================================================================

export function collectAllGearIds(
  method: { gearIds?: string[]; gearId?: string; equipmentIds?: string[]; equipmentId?: string } | undefined,
): string[] {
  if (!method) return [];
  const ids: string[] = [];
  if (method.gearIds) ids.push(...method.gearIds);
  else if (method.gearId) ids.push(method.gearId);
  if (method.equipmentIds) ids.push(...method.equipmentIds);
  else if (method.equipmentId) ids.push(method.equipmentId);
  return ids.filter(Boolean);
}

export function isEssentialGear(gearId: string): boolean {
  return ESSENTIAL_PARK_GEAR.has(normalizeGearId(gearId));
}

export function isGearFree(allIds: string[], allowEssential = false): boolean {
  if (allIds.length === 0) return true;
  return allIds.every(g => {
    const lower = g.toLowerCase();
    if (lower === 'bodyweight' || lower === 'none') return true;
    if (allowEssential && isEssentialGear(lower)) return true;
    return false;
  });
}

const GEAR_KEYWORDS = ['band', 'גומייה', 'ring', 'טבעות', 'טבעת', 'גומיה', 'רצועה', 'רצועות'];

export function hasGearKeywordInText(exercise: Exercise): boolean {
  const name = typeof exercise.name === 'string'
    ? exercise.name
    : ((exercise.name as any)?.he ?? '') + ' ' + ((exercise.name as any)?.en ?? '');
  const tags = (exercise.tags ?? []).join(' ');
  const combined = (name + ' ' + tags).toLowerCase();
  return GEAR_KEYWORDS.some(kw => combined.includes(kw));
}

// ============================================================================
// OPTION 2 — INTENSE (+1 to +3 levels, increased rest, volume fallback)
// ============================================================================

const INTENSE_REST_FLOOR = 90;
const MAX_MAIN = 5;   // raised from 3 — Option 3 must have substance
const MAX_CORE = 1;
const MAX_POTENTIATION = 1;

export function applyIntenseOption(
  workout: GeneratedWorkout,
  _blacklistedIds: Set<string>,
  userProgramLevels: Map<string, number>,
  allExercises: Exercise[],
): void {
  const warmups = workout.exercises.filter(ex => ex.exerciseRole === 'warmup');
  const cooldowns = workout.exercises.filter(ex => ex.exerciseRole === 'cooldown');
  const main = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );

  const potentiationWarmups = warmups.filter(ex =>
    ex.reasoning.some(r => r.includes('potentiation')),
  );
  const keptWarmups = potentiationWarmups.slice(0, MAX_POTENTIATION);
  const droppedWarmups = warmups.length - keptWarmups.length;

  const isCore = (ex: WorkoutExercise): boolean => {
    const mg = ex.exercise.movementGroup;
    const pm = ex.exercise.primaryMuscle;
    return mg === 'core' || pm === 'core' || pm === 'abs';
  };

  const corePool = main.filter(isCore).sort((a, b) => b.score - a.score);
  const nonCorePool = main.filter(ex => !isCore(ex));

  // ── Domain-Aware Intense Selection ────────────────────────────────────────
  // Guarantee at least one Push, one Pull, and one Legs exercise among the
  // MAX_MAIN non-core slots.  This prevents "all-Pull" sessions even when Pull
  // exercises score highest (e.g., David at L19 Pull).
  const MG_TO_DOMAIN_INTENSE: Record<string, string> = {
    vertical_pull: 'pull',  horizontal_pull: 'pull',
    vertical_push: 'push',  horizontal_push: 'push',
    squat: 'legs', hinge: 'legs', lunge: 'legs',
  };
  const REQUIRED_DOMAINS_INTENSE = ['push', 'pull', 'legs'] as const;

  const intenseSelected: typeof nonCorePool = [];
  const intenseUsed = new Set<string>();

  // Sort non-core by vertical preference first, then score
  const sortedNonCore = [...nonCorePool].sort((a, b) => {
    const aVert = a.exercise.movementGroup?.includes('vertical') ? 1 : 0;
    const bVert = b.exercise.movementGroup?.includes('vertical') ? 1 : 0;
    if (bVert !== aVert) return bVert - aVert;
    return b.score - a.score;
  });

  // First pass: claim one slot per required domain (highest-scored for that domain)
  for (const domain of REQUIRED_DOMAINS_INTENSE) {
    const best = sortedNonCore.find(e =>
      !intenseUsed.has(e.exercise.id) &&
      MG_TO_DOMAIN_INTENSE[e.exercise.movementGroup ?? ''] === domain,
    );
    if (best) {
      intenseSelected.push(best);
      intenseUsed.add(best.exercise.id);
    }
  }

  // Second pass: fill remaining slots with highest-scored non-duplicate exercises
  for (const ex of sortedNonCore) {
    if (intenseSelected.length >= MAX_MAIN) break;
    if (!intenseUsed.has(ex.exercise.id)) {
      intenseSelected.push(ex);
      intenseUsed.add(ex.exercise.id);
    }
  }

  // Third pass (global pool fallback): if the scored pool was too small,
  // draw level-appropriate exercises from the full DB to always reach MAX_MAIN.
  if (intenseSelected.length < MAX_MAIN) {
    const maxUserLevel = Math.max(...Array.from(userProgramLevels.values()), 1);
    const template = intenseSelected[intenseSelected.length - 1] ?? main[0];
    const beforeFallback = intenseSelected.length;

    if (template) {
      const fallbackCandidates = allExercises.filter(ex =>
        !intenseUsed.has(ex.id)
        && ex.exerciseRole !== 'warmup'
        && ex.exerciseRole !== 'cooldown'
        && !(ex.movementGroup === 'core' || ex.primaryMuscle === 'core' || ex.primaryMuscle === 'abs')
        && ex.targetPrograms?.some(tp => {
          const userLvl = getLevelForProgram(userProgramLevels, tp.programId);
          return userLvl !== undefined && Math.abs(tp.level - userLvl) <= 4;
        }),
      );

      for (const candidate of fallbackCandidates) {
        if (intenseSelected.length >= MAX_MAIN) break;
        const newIsTimeBased = isTimeBasedExercise(candidate);
        const typeChanged = newIsTimeBased !== template.isTimeBased;
        intenseSelected.push({
          ...template,
          exercise: candidate,
          method: (candidate.executionMethods?.[0] ?? template.method) as any,
          mechanicalType: (candidate.mechanicalType || 'none') as any,
          isTimeBased: newIsTimeBased,
          reps: typeChanged ? (newIsTimeBased ? 30 : Math.min(template.reps, 12)) : template.reps,
          repsRange: typeChanged
            ? (newIsTimeBased ? { min: 20, max: 45 } : { min: 6, max: 12 })
            : template.repsRange,
          reasoning: [...(template.reasoning ?? []), 'intense_global_pool_fallback'],
        });
        intenseUsed.add(candidate.id);
      }

      if (intenseSelected.length > beforeFallback) {
        console.log(
          `[WorkoutTrio] Intense: global pool fallback added ${intenseSelected.length - beforeFallback} ` +
          `exercise(s) (maxLevel=${maxUserLevel})`,
        );
      }
    }
  }

  const domainsRepresented = [...new Set(
    intenseSelected.map(e => MG_TO_DOMAIN_INTENSE[e.exercise.movementGroup ?? ''] ?? 'other'),
  )];
  console.log(
    `[WorkoutTrio] Intense selection: ${intenseSelected.length}/${MAX_MAIN} slots filled, ` +
    `domains: [${domainsRepresented.join(', ')}]`,
  );

  const keptNonCore = intenseSelected;
  const keptCore = corePool.slice(0, MAX_CORE);
  const keptMain = [...keptNonCore, ...keptCore];

  // ── DAVID RULE EXTENDED: try +1, +2, +3 in order ──────────────────────
  const maxUserLevel = Math.max(...Array.from(userProgramLevels.values()), 1);
  const usedIds = new Set(keptMain.map(ex => ex.exercise.id));
  let injectedLevel: number | null = null;

  const hasHigherLevel = keptMain.some(ex => {
    if (!ex.exercise.targetPrograms?.length) return false;
    return ex.exercise.targetPrograms.some(tp => {
      const userLvl = getLevelForProgram(userProgramLevels, tp.programId);
      return userLvl !== undefined && tp.level > userLvl;
    });
  });

  if (!hasHigherLevel && keptMain.length > 0) {
    for (let delta = 1; delta <= 3; delta++) {
      const targetLevel = maxUserLevel + delta;
      const candidate = allExercises.find(ex =>
        !usedIds.has(ex.id)
        && ex.targetPrograms?.some(tp =>
          levelsHasProgram(userProgramLevels, tp.programId) && tp.level === targetLevel,
        )
        && ex.exerciseRole !== 'cooldown'
        && ex.exerciseRole !== 'warmup',
      );
      if (candidate) {
        const lowestIdx = keptMain.length - 1;
        const replaced = keptMain[lowestIdx];
        const newIsTimeBased = isTimeBasedExercise(candidate);
        const typeChanged = newIsTimeBased !== replaced.isTimeBased;
        keptMain[lowestIdx] = {
          ...replaced,
          exercise: candidate,
          method: (candidate.executionMethods?.[0] ?? replaced.method) as any,
          mechanicalType: (candidate.mechanicalType || 'none') as any,
          isTimeBased: newIsTimeBased,
          reps: typeChanged ? (newIsTimeBased ? 30 : Math.min(replaced.reps, 12)) : replaced.reps,
          repsRange: typeChanged
            ? (newIsTimeBased ? { min: 20, max: 45 } : { min: 6, max: 12 })
            : replaced.repsRange,
          reasoning: [...replaced.reasoning, `david_rule:level_${targetLevel}_inject`],
        };
        injectedLevel = targetLevel;
        console.log(
          `[WorkoutTrio] David Rule: injected "${candidate.id}" (L${targetLevel}) ` +
          `replacing "${replaced.exercise.id}" (attempt +${delta})`,
        );
        break;
      }
    }
  }

  // ── VOLUME FALLBACK: if no higher-level exercise found, boost reps +20% ─
  if (!hasHigherLevel && injectedLevel === null) {
    for (const ex of keptMain) {
      if (!isCore(ex)) {
        ex.reps = Math.round(ex.reps * 1.2);
        ex.reasoning.push('intense_volume_fallback:+20%_reps');
      }
    }
    console.log('[WorkoutTrio] Intense: no higher-level found → volume fallback (+20% reps)');
  }

  // ── REST: ensure rest is at LEAST the intense floor (increase, not flatten) ─
  const allKept = [...keptWarmups, ...keptMain, ...cooldowns];
  for (const ex of allKept) {
    ex.restSeconds = Math.max(ex.restSeconds, INTENSE_REST_FLOOR);
    ex.reasoning.push(`intense:rest_floor_${INTENSE_REST_FLOOR}s`);
  }

  workout.exercises = allKept;
  workout.totalPlannedSets = allKept.reduce((s, ex) => s + ex.sets, 0);

  const durationSeconds = allKept.reduce(
    (acc, ex) => acc + ex.sets * ((ex.isTimeBased ? ex.reps : 45) + ex.restSeconds),
    0,
  );
  workout.estimatedDuration = Math.max(1, Math.round(durationSeconds / 60));

  workout.difficulty = 3 as any;

  console.log(
    `[WorkoutTrio] Intense: ${keptWarmups.length} potentiation, ` +
    `${keptNonCore.length} main(domains:${domainsRepresented.join('/')}) + ${keptCore.length} core, ` +
    `dropped ${droppedWarmups} warmups, rest≥${INTENSE_REST_FLOOR}s, ` +
    `David Rule: ${hasHigherLevel ? 'natural' : injectedLevel ? `injected L${injectedLevel}` : 'volume_fallback'} → ~${workout.estimatedDuration} min`,
  );
}

// ============================================================================
// OPTION 3 — FLOW / TECHNICAL (regression -1 to -3, rep compensation)
// ============================================================================

const FLOW_REP_MULTIPLIER = 1.2;

/**
 * Regression floor: advanced users should never regress into
 * beginner territory.  Their "easy" day is still substantial.
 */
function regressionFloor(domainLevel: number): number {
  if (domainLevel >= 18) return 12;
  if (domainLevel >= 12) return 7;
  if (domainLevel >= 6) return 3;
  return 1;
}

export function applyFlowRegression(
  workout: GeneratedWorkout,
  userProgramLevels: Map<string, number>,
  allExercises: Exercise[],
  _blacklistedIds: Set<string>,
  location?: ExecutionLocation,
): void {
  workout.difficulty = 1 as any;

  const main = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );
  if (main.length === 0) return;

  const maxUserLevel = Math.max(...Array.from(userProgramLevels.values()), 1);
  const levelFloor = regressionFloor(maxUserLevel);
  const usedIds = new Set(workout.exercises.map(ex => ex.exercise.id));

  let swapped = 0;
  for (const ex of main) {
    const tp = ex.exercise.targetPrograms;
    if (!tp?.length) continue;

    const relevantTp = tp.find(t => levelsHasProgram(userProgramLevels, t.programId));
    const exLevel = relevantTp?.level ?? maxUserLevel;

    let found = false;
    for (let delta = 1; delta <= 3; delta++) {
      const targetLevel = Math.max(levelFloor, exLevel - delta);
      if (targetLevel >= exLevel) continue;

      const replacement = allExercises.find(raw => {
        if (usedIds.has(raw.id)) return false;
        if (raw.exerciseRole === 'cooldown' || raw.exerciseRole === 'warmup') return false;
        if (raw.primaryMuscle !== ex.exercise.primaryMuscle) return false;
        if (!raw.targetPrograms?.some(t =>
          levelsHasProgram(userProgramLevels, t.programId) && t.level === targetLevel,
        )) return false;
        if (hasGearKeywordInText(raw)) return false;
        const methods = raw.execution_methods ?? raw.executionMethods ?? [];
        const hasNakedMethod = methods.length === 0
          || methods.some(m => isGearFree(collectAllGearIds(m as any), true));
        if (!hasNakedMethod) return false;
        return true;
      });

      if (replacement) {
        const oldReps = ex.reps;
        usedIds.delete(ex.exercise.id);
        usedIds.add(replacement.id);
        ex.exercise = replacement;
        const nakedMethod = (replacement.execution_methods ?? replacement.executionMethods ?? [])
          .find(m => isGearFree(collectAllGearIds(m as any), true));
        ex.method = (nakedMethod ?? replacement.executionMethods?.[0] ?? ex.method) as any;
        ex.reps = Math.round(oldReps * FLOW_REP_MULTIPLIER);
        ex.reasoning.push(`flow_regression:L${exLevel}→L${targetLevel}(floor=L${levelFloor})`);
        ex.reasoning.push(`flow_rep_compensation:${oldReps}→${ex.reps}`);
        swapped++;
        found = true;
        break;
      }
    }

    if (!found && exLevel > 1) {
      const oldReps = ex.reps;
      ex.reps = Math.round(oldReps * FLOW_REP_MULTIPLIER);
      ex.reasoning.push(`flow_rep_compensation_inplace:${oldReps}→${ex.reps}`);
    }
  }

  console.log(
    `[WorkoutTrio] Flow: swapped ${swapped}/${main.length} exercises ` +
    `(regression -1/-2/-3, floor=L${levelFloor}, rep×${FLOW_REP_MULTIPLIER})`,
  );

  applyEssentialGearFilter(workout, _blacklistedIds, allExercises, location);
}

// ============================================================================
// ESSENTIAL GEAR FILTER (Naked Strength with pull-up/dip bar exception)
// ============================================================================

export function applyEssentialGearFilter(
  workout: GeneratedWorkout,
  _blacklistedIds: Set<string>,
  allExercises: Exercise[],
  location?: ExecutionLocation,
): void {
  // Park workouts always have essential calisthenics fixtures (pull-up bars,
  // dip bars) available.  Applying the naked filter in a park would wrongly
  // strip Pull-up and Dip exercises, so we skip the filter entirely.
  if (location === 'park' || location === 'street') {
    console.log(
      `[WorkoutTrio] Naked filter SKIPPED for location="${location}" — ` +
      'essential park fixtures (pull-up bar, dip bar) are always available.',
    );
    return;
  }
  const isNaked = (ex: WorkoutExercise): boolean => {
    if (!isGearFree(collectAllGearIds(ex.method as any), true)) return false;
    if (hasGearKeywordInText(ex.exercise)) return false;
    return true;
  };

  const isRawExNaked = (ex: Exercise): boolean => {
    if (hasGearKeywordInText(ex)) return false;
    const methods = ex.execution_methods ?? ex.executionMethods ?? [];
    if (methods.length === 0) return true;
    return methods.some(m => isGearFree(collectAllGearIds(m as any), true));
  };

  const warmups = workout.exercises.filter(ex => ex.exerciseRole === 'warmup');
  const cooldowns = workout.exercises.filter(ex => ex.exerciseRole === 'cooldown');
  const main = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );

  let nakedMain: typeof main = [];
  let gearRemoved = 0;
  for (const ex of main) {
    const gearIds = collectAllGearIds(ex.method as any);
    const gearFree = isGearFree(gearIds, true);
    const keywordHit = hasGearKeywordInText(ex.exercise);
    const pass = gearFree && !keywordHit;
    const exName = typeof ex.exercise.name === 'string'
      ? ex.exercise.name
      : ((ex.exercise.name as any)?.he ?? ex.exercise.id);
    console.log(
      `[NakedAudit] "${exName}" → gear:[${gearIds.join(',')}] gearFree=${gearFree} keywordHit=${keywordHit} → ${pass ? 'PASS ✓' : 'FAIL ✗'}`,
    );
    if (pass) {
      nakedMain.push(ex);
    } else {
      gearRemoved++;
    }
  }

  const MIN_EXERCISES = 3;
  if (nakedMain.length < MIN_EXERCISES) {
    const usedIds = new Set([
      ...nakedMain.map(ex => ex.exercise.id),
      ...Array.from(_blacklistedIds),
    ]);
    const candidates = allExercises.filter(ex =>
      !usedIds.has(ex.id)
      && isRawExNaked(ex)
      && ex.exerciseRole !== 'cooldown'
      && ex.exerciseRole !== 'warmup',
    );
    const needed = MIN_EXERCISES - nakedMain.length;
    const backfill = candidates.slice(0, needed);
    for (const raw of backfill) {
      const nakedMethod = (raw.execution_methods ?? raw.executionMethods ?? [])
        .find(m => isGearFree(collectAllGearIds(m as any), true));
      nakedMain.push({
        exercise: raw,
        score: 0,
        reasoning: ['naked_backfill:bodyweight_global_pool'],
        sets: 3,
        reps: 10,
        restSeconds: 60,
        isTimeBased: false,
        exerciseRole: 'main',
        method: (nakedMethod ?? {}) as any,
      } as any);
    }
    console.log(
      `[WorkoutTrio] Naked: backfilled ${backfill.length} bodyweight exercises from global pool`,
    );
  }

  // Final validation: catch any exercises that slipped through
  const violations: typeof nakedMain = [];
  const clean: typeof nakedMain = [];
  for (const ex of nakedMain) {
    if (isNaked(ex)) {
      clean.push(ex);
    } else {
      violations.push(ex);
    }
  }
  if (violations.length > 0) {
    const usedIds = new Set([
      ...clean.map(ex => ex.exercise.id),
      ...Array.from(_blacklistedIds),
    ]);
    for (const violator of violations) {
      const replacement = allExercises.find(raw =>
        !usedIds.has(raw.id)
        && isRawExNaked(raw)
        && raw.exerciseRole !== 'cooldown'
        && raw.exerciseRole !== 'warmup',
      );
      if (replacement) {
        const nakedMethod = (replacement.execution_methods ?? replacement.executionMethods ?? [])
          .find(m => isGearFree(collectAllGearIds(m as any), true));
        clean.push({
          ...violator,
          exercise: replacement,
          method: (nakedMethod ?? {}) as any,
          reasoning: [...violator.reasoning, 'naked_violation_replaced'],
        });
        usedIds.add(replacement.id);
        console.warn(
          `[NakedViolation] Replaced "${violator.exercise.id}" with "${replacement.id}" (gear slipped through)`,
        );
      } else {
        console.warn(
          `[NakedViolation] Could not replace "${violator.exercise.id}" — no bodyweight alternative found`,
        );
      }
    }
    nakedMain = clean;
  }

  workout.exercises = [...warmups, ...nakedMain, ...cooldowns];
  workout.totalPlannedSets = workout.exercises.reduce((s, ex) => s + ex.sets, 0);

  const finalGearIds = new Set<string>();
  const essentialGearUsed = new Set<string>();
  for (const ex of workout.exercises) {
    if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
    const ids = collectAllGearIds(ex.method as any);
    for (const g of ids) {
      const lower = g.toLowerCase();
      if (lower === 'bodyweight' || lower === 'none') continue;
      if (isEssentialGear(lower)) {
        essentialGearUsed.add(g);
      } else {
        finalGearIds.add(g);
      }
    }
  }

  console.log(
    `[WorkoutTrio] Naked STRICT: removed ${gearRemoved} gear exercises, ` +
    `${violations.length} violations caught, ` +
    `${nakedMain.length} bodyweight remain → ${workout.totalPlannedSets} total sets, ` +
    `Non-essential gear: ${finalGearIds.size} ${finalGearIds.size === 0 ? '(0 ✓)' : `⚠️ [${Array.from(finalGearIds).join(', ')}]`}` +
    (essentialGearUsed.size > 0 ? `, Essential gear: [${Array.from(essentialGearUsed).join(', ')}]` : ''),
  );
}

// ============================================================================
// REST DAY — TAG PREFERENCE
// ============================================================================

export function applyTagPreference(
  workout: GeneratedWorkout,
  tag: string,
  _blacklistedIds: Set<string>,
): void {
  const mainExercises = workout.exercises.filter(
    ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
  );

  let boosted = 0;
  for (const ex of mainExercises) {
    const tags = (ex.exercise.tags as string[]) ?? [];
    const matchesTag = tags.includes(tag)
      || ex.exercise.exerciseRole === tag
      || ex.exercise.movementGroup === tag;
    if (matchesTag) {
      ex.score += 30;
      ex.reasoning.push(`rest_tag_pref:+30(${tag})`);
      boosted++;
    }
  }

  mainExercises.sort((a, b) => b.score - a.score);
  const warmups = workout.exercises.filter(ex => ex.exerciseRole === 'warmup');
  const cooldowns = workout.exercises.filter(ex => ex.exerciseRole === 'cooldown');
  workout.exercises = [...warmups, ...mainExercises, ...cooldowns];

  console.log(`[WorkoutTrio] Tag preference '${tag}': boosted ${boosted}/${mainExercises.length} exercises`);
}

// ============================================================================
// TRIO LOGGING
// ============================================================================

export function logTrioSummary(
  options: WorkoutTrioOption[],
  isRestDay: boolean,
): void {
  const boltLabel = (d: number) => '⚡'.repeat(Math.min(3, Math.max(1, d)));

  console.group(`[WorkoutTrio] ═══ SUMMARY (${isRestDay ? 'REST DAY' : 'TRAINING DAY'}) ═══`);
  for (let idx = 0; idx < options.length; idx++) {
    const opt = options[idx];
    const w = opt.result.workout;
    const mainExercises = w.exercises.filter(
      ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown',
    );
    const warmupCount = w.exercises.filter(ex => ex.exerciseRole === 'warmup').length;
    const exerciseNames = mainExercises.map(ex => {
      const name = typeof ex.exercise.name === 'string'
        ? ex.exercise.name
        : (ex.exercise.name as any)?.he || ex.exercise.id;
      return name;
    });

    const gearIds = new Set<string>();
    for (const ex of w.exercises) {
      if (ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown') continue;
      const ids = collectAllGearIds(ex.method as any);
      for (const g of ids) {
        const lower = g.toLowerCase();
        if (lower !== 'bodyweight' && lower !== 'none') {
          gearIds.add(g);
        }
      }
    }

    console.group(`Option ${idx + 1}: ${opt.label}`);
    console.log(`  Difficulty: ${w.difficulty} ${boltLabel(w.difficulty)}`);
    console.log(`  Title: ${w.title || '(fallback)'}`);
    console.log(`  Duration: ~${w.estimatedDuration} min`);
    console.log(`  Warmups: ${warmupCount} | Main: ${mainExercises.length} | Sets: ${w.totalPlannedSets}`);
    console.log(`  Gear: ${gearIds.size} ${gearIds.size === 0 ? '(0 Gear ✓)' : `⚠️ [${Array.from(gearIds).join(', ')}]`}`);
    console.log(`  Exercises: [${exerciseNames.join(', ')}]`);
    console.groupEnd();
  }

  const sets = options.map(o =>
    new Set(
      o.result.workout.exercises
        .filter(ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown')
        .map(ex => ex.exercise.id),
    ),
  );
  const overlap = (a: Set<string>, b: Set<string>) => Array.from(a).filter(id => b.has(id)).length;
  console.log(
    `Overlap: 1↔2=${overlap(sets[0], sets[1])}, 1↔3=${overlap(sets[0], sets[2])}, 2↔3=${overlap(sets[1], sets[2])}`,
  );
  console.groupEnd();
}
