/**
 * Workout Selection Utilities
 *
 * Exercise selection with domain quotas, dominance ratios, rescue logic,
 * difficulty filtering, SA/BA bias, and priority classification.
 * Extracted from WorkoutGenerator for modularity.
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs
 */

import { Exercise, MechanicalType, ExerciseTag } from '@/features/content/exercises/core/exercise.types';
import { ScoredExercise } from './ContextualEngine';
import { exerciseMatchesProgram } from '../services/shadow-level.utils';
import type {
  DifficultyLevel,
  ExercisePriority,
  WorkoutGenerationContext,
} from './workout-generator.types';

// ============================================================================
// DOMAIN ALIAS MAPS
// ============================================================================

const DOMAIN_ALIAS_MAP: Record<string, string[]> = {
  lower_body: ['legs'],
  upper_body: ['push', 'pull'],
};

const DOMAIN_PARENT_MAP: Record<string, string[]> = {};
for (const [parent, children] of Object.entries(DOMAIN_ALIAS_MAP)) {
  for (const child of children) {
    (DOMAIN_PARENT_MAP[child] ??= []).push(parent);
  }
}

export { DOMAIN_ALIAS_MAP, DOMAIN_PARENT_MAP };

// ============================================================================
// SHUFFLE UTILITIES
// ============================================================================

const DEBUG_SHUFFLE_ON_REFRESH = true;

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function getShuffleSeed(context: { userId?: string; selectedDate?: string }): number {
  if (DEBUG_SHUFFLE_ON_REFRESH) {
    return Date.now();
  }
  const date = context.selectedDate ?? new Date().toISOString().split('T')[0];
  const str = `${context.userId ?? 'anon'}_${date}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ============================================================================
// PRIORITY CLASSIFICATION
// ============================================================================

export function classifyPriority(exercise: Exercise): ExercisePriority {
  const tags = exercise.tags || [];

  if (tags.includes('skill')) return 'skill';
  if (tags.includes('compound') || exercise.movementType === 'compound') return 'compound';
  if (tags.includes('isolation')) return 'isolation';
  if (exercise.primaryMuscle === 'full_body') return 'compound';
  return 'accessory';
}

// ============================================================================
// DIFFICULTY FILTER
// ============================================================================

export function applyDifficultyFilter(
  exercises: ScoredExercise[],
  context: WorkoutGenerationContext,
  _difficulty: DifficultyLevel,
): (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] {
  const userLevel = context.userLevel;

  return exercises.map((ex) => {
    const exerciseLevel = ex.programLevel || ex.exercise.recommendedLevel || userLevel;
    const levelDiff = exerciseLevel - userLevel;
    return { ...ex, isOverLevel: levelDiff > 0, levelDiff };
  });
}

/**
 * David Rule: difficulty NEVER changes which program-level exercises are
 * selected. A Level-7 user always trains with Level-7 exercises regardless
 * of whether they chose 1, 2, or 3 bolts.
 *
 * All three bolt settings pick exercises at |levelDiff| <= 1 (the user's
 * own program level ±1). Volume (sets / reps / rest) is what changes between
 * bolt settings — that is handled downstream by DIFFICULTY_VOLUME and
 * assignVolume in workout-budgeting.utils.ts.
 *
 * The ContextualEngine already applies levelTolerance:3 hard exclusion and
 * level-proximity scoring (+3 exact, -1 per level away), so the scored pool
 * arriving here is already biased toward the user's own level.
 */
export function selectExercisesForDifficulty(
  exercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
  count: number,
  _context: WorkoutGenerationContext,
  _difficulty: DifficultyLevel,
): ScoredExercise[] {
  const atLevel = exercises
    .filter((ex) => Math.abs(ex.levelDiff || 0) <= 1)
    .sort((a, b) => b.score - a.score);

  if (atLevel.length >= count) return atLevel.slice(0, count);

  // Fallback: if the at-level pool is smaller than requested, fill from the
  // rest of the (already ContextualEngine-filtered) pool.
  const atLevelIds = new Set(atLevel.map((ex) => ex.exercise.id));
  const overflow = exercises
    .filter((ex) => !atLevelIds.has(ex.exercise.id))
    .sort((a, b) => b.score - a.score);

  return [...atLevel, ...overflow].slice(0, count);
}

// ============================================================================
// SA/BA SELECTION BIAS
// ============================================================================

export function applySABASelectionBias(
  selected: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
  allCandidates: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
  targetSARatio: number,
): void {
  const classified = selected.filter(
    (s) => s.exercise.mechanicalType && s.exercise.mechanicalType !== 'none',
  );
  if (classified.length === 0) return;

  const saCount = classified.filter((s) => s.exercise.mechanicalType === 'straight_arm').length;
  const currentRatio = saCount / classified.length;
  const tolerance = 0.15;

  if (Math.abs(currentRatio - targetSARatio) <= tolerance) return;

  const selectedIds = new Set(selected.map((s) => s.exercise.id));
  const needMoreSA = currentRatio < targetSARatio - tolerance;
  const seekType = needMoreSA ? 'straight_arm' : 'bent_arm';
  const replaceType = needMoreSA ? 'bent_arm' : 'straight_arm';

  const replacement = allCandidates
    .filter((s) => !selectedIds.has(s.exercise.id) && s.exercise.mechanicalType === seekType)
    .sort((a, b) => b.score - a.score)[0];

  if (!replacement) return;

  const bottomHalf = Math.floor(selected.length / 2);
  for (let i = selected.length - 1; i >= bottomHalf; i--) {
    if (selected[i].exercise.mechanicalType === replaceType) {
      console.log(
        `[WorkoutGenerator] SA/BA selection bias: swapping ` +
        `${selected[i].exercise.name?.en || selected[i].exercise.id} → ` +
        `${replacement.exercise.name?.en || replacement.exercise.id} ` +
        `(ratio ${currentRatio.toFixed(2)} → target ${targetSARatio})`,
      );
      selected[i] = replacement;
      return;
    }
  }
}

// ============================================================================
// DOMAIN QUOTA SELECTION
// ============================================================================

export function selectExercisesWithDomainQuotas(
  scoredExercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
  count: number,
  includeAccessories: boolean,
  context: WorkoutGenerationContext,
  difficulty: DifficultyLevel,
): (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] {
  const difficultyFiltered = selectExercisesForDifficulty(scoredExercises, count * 2, context, difficulty);
  const seed = getShuffleSeed(context);
  const shuffled = seededShuffle(difficultyFiltered, seed);

  const selected: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] = [];
  const selectedIds = new Set<string>();

  for (const domain of context.requiredDomains!) {
    const domainPool = shuffled.filter(
      (s) => !selectedIds.has(s.exercise.id) && exerciseMatchesProgram(s.exercise, domain),
    );
    if (domainPool.length > 0) {
      domainPool.sort((a, b) => b.score - a.score);
      const best = domainPool[0];
      if (!selectedIds.has(best.exercise.id)) {
        selected.push(best);
        selectedIds.add(best.exercise.id);
      }
    } else if (context.globalExercisePool?.length) {
      const pool = context.globalExercisePool;
      const userLevel = context.userProgramLevels?.get(domain) ?? context.userLevel ?? 1;
      const parentAliases = DOMAIN_PARENT_MAP[domain] ?? [];

      // Location-aware method resolution: try the user's actual location first,
      // then 'home', then any available method. This ensures park exercises (Dips
      // on parallel bars) are found when the user is at a park.
      const loc = context.location ?? 'home';
      const findMethod = (ex: Exercise) => {
        const methods = ex.execution_methods || ex.executionMethods || [];
        return methods.find((x) => x.location === loc)
          || methods.find((x) => x.location === 'home')
          || methods.find((x) => x.locationMapping?.includes(loc))
          || methods[0];
      };
      const hasMethod = (ex: Exercise) => !!findMethod(ex);
      const isLocationCompatible = (ex: Exercise) => {
        const m = findMethod(ex);
        if (!m) return false;
        // At a park, allow fixed equipment (bars, dip station) — they're built-in
        if (loc === 'park' || loc === 'outdoor_gym') return true;
        const gearIds = m.gearIds ?? (m.gearId ? [m.gearId] : []);
        const equipmentIds = m.equipmentIds ?? (m.equipmentId ? [m.equipmentId] : []);
        const all = [...gearIds, ...equipmentIds].filter(Boolean);
        return all.length === 0 || all.every((id) => String(id).toLowerCase() === 'bodyweight' || String(id).toLowerCase() === 'none');
      };
      const getLevelForDomain = (ex: Exercise): number => {
        const directMatch = ex.targetPrograms?.find((tp) => tp.programId === domain);
        if (directMatch) return directMatch.level;
        for (const alias of parentAliases) {
          const aliasMatch = ex.targetPrograms?.find((tp) => tp.programId === alias);
          if (aliasMatch) return aliasMatch.level;
        }
        return ex.recommendedLevel ?? userLevel;
      };
      const belongsToDomain = (ex: Exercise): boolean => {
        if (ex.targetPrograms?.some((tp) => tp.programId === domain)) return true;
        for (const alias of parentAliases) {
          if (ex.targetPrograms?.some((tp) => tp.programId === alias)) return true;
        }
        return false;
      };

      let rescue: Exercise | undefined;

      // Vertical-aware random pick: prefer vertical_pull / vertical_push
      // within rescue candidates so the +25 Vertical Preference isn't bypassed.
      const pickVerticalFirst = (arr: Exercise[]): Exercise | undefined => {
        if (arr.length === 0) return undefined;
        const vertical = arr.filter(ex =>
          ex.movementGroup === 'vertical_pull' || ex.movementGroup === 'vertical_push',
        );
        const pool = vertical.length > 0 ? vertical : arr;
        return pool[Math.floor(Math.random() * pool.length)];
      };

      // Step 1: Strict — exact domain + exact user level
      const step1 = pool.filter((ex) => {
        if (selectedIds.has(ex.id)) return false;
        if (!belongsToDomain(ex) || !exerciseMatchesProgram(ex, domain)) return false;
        if (getLevelForDomain(ex) !== userLevel) return false;
        return hasMethod(ex) && isLocationCompatible(ex);
      });
      rescue = pickVerticalFirst(step1);

      // Step 2: Relaxed level — step down 1 then 2
      if (!rescue) {
        for (const delta of [1, 2]) {
          const relaxedLevel = Math.max(1, userLevel - delta);
          const step2 = pool.filter((ex) => {
            if (selectedIds.has(ex.id)) return false;
            if (!belongsToDomain(ex) || !exerciseMatchesProgram(ex, domain)) return false;
            if (getLevelForDomain(ex) !== relaxedLevel) return false;
            return hasMethod(ex) && isLocationCompatible(ex);
          });
          rescue = pickVerticalFirst(step2);
          if (rescue) break;
        }
      }

      // Step 3: Broad muscle fallback — any matching exercise within level cap
      if (!rescue) {
        const levelCap = userLevel + 2;
        const muscleFallback = pool.filter((ex) => {
          if (selectedIds.has(ex.id)) return false;
          if (!exerciseMatchesProgram(ex, domain)) return false;
          const lvl = getLevelForDomain(ex);
          if (typeof lvl !== 'number' || lvl < 1 || lvl > levelCap) return false;
          return hasMethod(ex) && isLocationCompatible(ex);
        });
        if (muscleFallback.length > 0) {
          muscleFallback.sort((a, b) => {
            const aDist = Math.abs(getLevelForDomain(a) - userLevel);
            const bDist = Math.abs(getLevelForDomain(b) - userLevel);
            return aDist - bDist;
          });
          const bestDist = Math.abs(getLevelForDomain(muscleFallback[0]) - userLevel);
          const sameTier = muscleFallback.filter(
            (ex) => Math.abs(getLevelForDomain(ex) - userLevel) === bestDist,
          );
          rescue = pickVerticalFirst(sameTier);
        }
      }

      if (rescue) {
        const method = findMethod(rescue)!;
        const resolvedLevel = getLevelForDomain(rescue);
        const rescuedScored: ScoredExercise & { isOverLevel?: boolean; levelDiff?: number } = {
          exercise: rescue,
          method,
          mechanicalType: (rescue.mechanicalType || 'none') as MechanicalType,
          score: 0,
          reasoning: [`domain rescue: ${domain} (L${resolvedLevel})`],
          programLevel: userLevel,
        };
        selected.push(rescuedScored);
        selectedIds.add(rescue.id);
        const isVertical = rescue.movementGroup === 'vertical_pull' || rescue.movementGroup === 'vertical_push';
        console.log(
          `[WorkoutGenerator] Domain Rescue: injected ${rescue.id} for "${domain}" ` +
          `(L${resolvedLevel}, user L${userLevel}, location:${loc}` +
          `${isVertical ? ', VERTICAL ✓' : ''})`,
        );
      } else {
        console.warn(
          `[WorkoutGenerator] DOMAIN QUOTA FAILED: No exercise for "${domain}" in global pool (aliases: [${parentAliases.join(',')}]).`,
        );
      }
    } else {
      console.warn(
        `[WorkoutGenerator] DOMAIN QUOTA FAILED: No exercise for "${domain}" (no globalExercisePool).`,
      );
    }
  }

  // Domain-guard: track per-domain counts and cap at ceil(budget / domainCount)
  const domainCount = context.requiredDomains!.length;
  const maxPerDomain = Math.ceil(count / domainCount);
  const domainCounts = new Map<string, number>();
  for (const s of selected) {
    for (const d of context.requiredDomains!) {
      if (exerciseMatchesProgram(s.exercise, d)) {
        domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
      }
    }
  }
  const isDomainFull = (ex: Exercise): boolean => {
    for (const d of context.requiredDomains!) {
      if (exerciseMatchesProgram(ex, d) && (domainCounts.get(d) ?? 0) >= maxPerDomain) {
        return true;
      }
    }
    return false;
  };

  const byPriority: Record<ExercisePriority, typeof shuffled> = {
    skill: [],
    compound: [],
    accessory: [],
    isolation: [],
  };
  for (const s of shuffled) {
    if (selectedIds.has(s.exercise.id)) continue;
    byPriority[classifyPriority(s.exercise)].push(s);
  }
  const primaryPool = [...byPriority.skill, ...byPriority.compound].sort((a, b) => b.score - a.score);
  const secondaryPool = [...byPriority.accessory, ...byPriority.isolation].sort((a, b) => b.score - a.score);

  const takeFromPool = (pool: typeof primaryPool, n: number) => {
    const top = pool
      .filter((s) => !selectedIds.has(s.exercise.id) && !isDomainFull(s.exercise))
      .slice(0, Math.min(n * 2, pool.length));
    const shuffledTop = seededShuffle(top, seed + selected.length);
    for (const s of shuffledTop) {
      if (selected.length >= count) break;
      if (!selectedIds.has(s.exercise.id) && !isDomainFull(s.exercise)) {
        selected.push(s);
        selectedIds.add(s.exercise.id);
        for (const d of context.requiredDomains!) {
          if (exerciseMatchesProgram(s.exercise, d)) {
            domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
          }
        }
      }
    }
  };

  const remaining = count - selected.length;
  const primaryCount = includeAccessories ? Math.min(remaining, Math.ceil(remaining * 0.6)) : remaining;
  takeFromPool(primaryPool, primaryCount);
  takeFromPool(secondaryPool, count - selected.length);

  if (selected.length < count) {
    const any = shuffled.filter((s) => !selectedIds.has(s.exercise.id)).sort((a, b) => b.score - a.score);
    const shuffledAny = seededShuffle(any.slice(0, (count - selected.length) * 2), seed + 999);
    for (const s of shuffledAny) {
      if (selected.length >= count) break;
      if (!selectedIds.has(s.exercise.id)) {
        selected.push(s);
        selectedIds.add(s.exercise.id);
      }
    }
  }

  console.log(`[WorkoutGenerator] Domain quotas: ${context.requiredDomains!.join(', ')} → ${selected.length} exercises`);
  return selected.slice(0, count);
}

// ============================================================================
// DOMINANCE SELECTION
// ============================================================================

export function selectExercisesWithDominance(
  scoredExercises: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[],
  count: number,
  includeAccessories: boolean,
  context: WorkoutGenerationContext,
  _difficulty: DifficultyLevel,
): (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] {
  const dailyBudget = context.dailySetBudget ?? 6;
  const p1Ratio = context.dominanceRatio!.p1;
  const p2Ratio = context.dominanceRatio!.p2;
  const p3Ratio = context.dominanceRatio!.p3 ?? 0;
  const hasP3 = p3Ratio > 0 && context.priority3SkillIds?.length;

  console.group('[WorkoutGenerator] Workout Generation Logic');
  console.log('User base level (context.userLevel):', context.userLevel);
  console.log('Target level per category — P1:', context.priority1SkillIds, '| P2:', context.priority2SkillIds, '| P3:', context.priority3SkillIds);
  console.log('Dominance ratio:', { p1: p1Ratio, p2: p2Ratio, p3: p3Ratio });
  console.log('Daily set budget:', dailyBudget);
  const levelCounts = scoredExercises.reduce((acc, s) => {
    const lvl = s.programLevel ?? 1;
    acc[lvl] = (acc[lvl] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  console.log('Exercise levels in pool (programLevel):', levelCounts);
  const defaultedTo1 = scoredExercises.filter((s) => (s.programLevel ?? 1) === 1);
  if (defaultedTo1.length > 0) {
    console.warn(
      `Level 1 or defaulted: ${defaultedTo1.length} exercises. ` +
      `Reasons: programLevel undefined → defaults to 1; or Program mapping not found; or Defaulting due to missing progression.`,
    );
    defaultedTo1.slice(0, 3).forEach((s) => {
      console.log(`  - "${typeof s.exercise.name === 'string' ? s.exercise.name : (s.exercise.name as any)?.he}" programLevel=${s.programLevel ?? '(undefined→1)'}`);
    });
  }
  console.groupEnd();

  let p1Sets = Math.floor(dailyBudget * p1Ratio);
  let p2Sets = Math.floor(dailyBudget * p2Ratio);
  let p3Sets = hasP3 ? Math.floor(dailyBudget * p3Ratio) : 0;

  const MIN_SETS_PER_SKILL = 2;
  if (hasP3 && p3Sets > 0 && p3Sets < MIN_SETS_PER_SKILL) {
    p1Sets += p3Sets;
    p3Sets = 0;
  }
  if (p2Sets > 0 && p2Sets < MIN_SETS_PER_SKILL) {
    p1Sets += p2Sets;
    p2Sets = 0;
  }
  p1Sets = Math.min(p1Sets, dailyBudget);
  const accessorySets = Math.max(0, dailyBudget - p1Sets - p2Sets - p3Sets);

  const p1Pool = scoredExercises.filter((s) =>
    context.priority1SkillIds!.some((programId) => exerciseMatchesProgram(s.exercise, programId)),
  );
  const p2Pool = scoredExercises.filter(
    (s) =>
      !p1Pool.some((p) => p.exercise.id === s.exercise.id) &&
      context.priority2SkillIds!.some((programId) => exerciseMatchesProgram(s.exercise, programId)),
  );
  const p3Pool = hasP3
    ? scoredExercises.filter(
        (s) =>
          !p1Pool.some((p) => p.exercise.id === s.exercise.id) &&
          !p2Pool.some((p) => p.exercise.id === s.exercise.id) &&
          context.priority3SkillIds!.some((programId) => exerciseMatchesProgram(s.exercise, programId)),
      )
    : [];
  const p1P2P3Ids = new Set([
    ...p1Pool.map((s) => s.exercise.id),
    ...p2Pool.map((s) => s.exercise.id),
    ...p3Pool.map((s) => s.exercise.id),
  ]);
  const accessoryPool = scoredExercises.filter((s) => !p1P2P3Ids.has(s.exercise.id));

  p1Pool.sort((a, b) => b.score - a.score);
  p2Pool.sort((a, b) => b.score - a.score);
  p3Pool.sort((a, b) => b.score - a.score);
  accessoryPool.sort((a, b) => b.score - a.score);

  const seed = getShuffleSeed(context);
  const avgSetsPerEx = 3;
  const p1Count = Math.min(Math.ceil(p1Sets / avgSetsPerEx), p1Pool.length, Math.ceil(count * (p1Ratio + 0.1)));
  const p2Count = Math.min(Math.ceil(p2Sets / avgSetsPerEx), p2Pool.length, Math.ceil(count * (p2Ratio + 0.05)));
  const p3Count = hasP3
    ? Math.min(Math.ceil(p3Sets / avgSetsPerEx), p3Pool.length, Math.ceil(count * (p3Ratio + 0.05)))
    : 0;
  const accessoryCount = Math.min(
    count - p1Count - p2Count - p3Count,
    accessoryPool.length,
    includeAccessories ? Math.ceil(accessorySets / avgSetsPerEx) : 0,
  );

  const selected: (ScoredExercise & { isOverLevel?: boolean; levelDiff?: number })[] = [];
  const selectedIds = new Set<string>();
  const addUnique = (arr: typeof p1Pool, n: number) => {
    const shuffledArr = seededShuffle(arr.filter((s) => !selectedIds.has(s.exercise.id)), seed + selected.length);
    for (const s of shuffledArr) {
      if (selected.length >= n || selectedIds.has(s.exercise.id)) break;
      selected.push(s);
      selectedIds.add(s.exercise.id);
    }
  };
  addUnique(p1Pool.slice(0, p1Count * 2), p1Count);
  addUnique(p2Pool.slice(0, p2Count * 2), selected.length + p2Count);
  if (hasP3) addUnique(p3Pool.slice(0, p3Count * 2), selected.length + p3Count);
  addUnique(accessoryPool.slice(0, Math.max(0, accessoryCount) * 2), selected.length + Math.max(0, accessoryCount));

  if (selected.length < count) {
    const rem = count - selected.length;
    const additional = scoredExercises
      .filter((s) => !selectedIds.has(s.exercise.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, rem * 2);
    const shuffledRem = seededShuffle(additional, seed + 99);
    for (const s of shuffledRem) {
      if (selected.length >= count) break;
      if (!selectedIds.has(s.exercise.id)) {
        selected.push(s);
        selectedIds.add(s.exercise.id);
      }
    }
  }

  if (selected.length > 0) {
    const logParts = hasP3
      ? `P1=${p1Count} P2=${p2Count} P3=${p3Count} accessory=${accessoryCount} (budget: ${p1Sets}+${p2Sets}+${p3Sets}+${accessorySets})`
      : `P1=${p1Count} P2=${p2Count} accessory=${accessoryCount} (budget: ${p1Sets}+${p2Sets}+${accessorySets})`;
    console.log(`[WorkoutGenerator] Dominance: ${logParts}`);
    console.log(`[WorkoutGenerator] Budget allows: P1=${p1Sets} sets, P2=${p2Sets} sets${hasP3 ? `, P3=${p3Sets} sets` : ''}`);
  }

  return selected.slice(0, count);
}
