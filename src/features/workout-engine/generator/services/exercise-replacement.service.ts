/**
 * Exercise Replacement Service
 * Handles fetching alternative exercises for replacement modal
 *
 * "Smart Select 3" algorithm: each tab returns at most 3 exercises,
 * filling [1 Easier, 1 Same, 1 Harder] buckets with equipment-diversity
 * tie-breaking, then backfilling empty buckets.
 */
import { Exercise, ExecutionLocation, ExecutionMethod, RequiredGearType } from '@/features/content/exercises';
import { getAllExercises } from '@/features/content/exercises';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { selectExecutionMethodWithBrand } from './execution-method-selector.service';

export interface AlternativeExerciseOption {
  exercise: Exercise;
  selectedExecutionMethod?: ExecutionMethod;
  levelComparison: 'lower' | 'same' | 'higher';
  resolvedLevel: number;
}

// ── Helpers ──

function getExerciseLevel(exercise: Exercise, activeProgramId?: string): number {
  if (exercise.targetPrograms?.length) {
    if (activeProgramId) {
      const match = exercise.targetPrograms.find((tp) => tp.programId === activeProgramId);
      if (match) return match.level;
    }
    return exercise.targetPrograms[0].level;
  }
  if (exercise.recommendedLevel && exercise.recommendedLevel > 0) {
    return exercise.recommendedLevel;
  }
  return 1;
}

function methodMatchesLocation(method: ExecutionMethod, location: ExecutionLocation): boolean {
  if (method.location === location) return true;
  if (method.locationMapping?.includes(location)) return true;
  return false;
}

function exerciseHasLocation(exercise: Exercise, location: ExecutionLocation): boolean {
  if (!exercise.execution_methods || exercise.execution_methods.length === 0) return false;
  return exercise.execution_methods.some((m) => methodMatchesLocation(m, location));
}

function nameOf(ex: Exercise): string {
  if (typeof ex.name === 'string') return ex.name;
  return (ex.name as any)?.he || (ex.name as any)?.en || ex.id;
}

function debugMethodLocations(exercise: Exercise): string {
  if (!exercise.execution_methods) return '(no methods)';
  return exercise.execution_methods
    .map((m, i) => {
      const loc = m.location || '(empty)';
      const mapping = m.locationMapping?.length ? m.locationMapping.join(',') : '(none)';
      return `[${i}] location="${loc}" mapping=[${mapping}] gear=${m.requiredGearType || '?'}`;
    })
    .join(' | ');
}

// ── Smart Select 3 ──

const MAX_RESULTS = 3;

/**
 * Pick at most 3 exercises using bucket-fill + diversity logic.
 *
 * 1. Try to fill [lower, same, higher] — one each.
 * 2. When multiple candidates compete for the same bucket, prefer the one
 *    whose equipment type differs from `originalGearType` (variety).
 * 3. If any bucket is empty after step 1, backfill from the overflow of
 *    other buckets (still capping at 3 total).
 */
function smartSelect3(
  candidates: AlternativeExerciseOption[],
  originalGearType?: RequiredGearType,
): AlternativeExerciseOption[] {
  if (candidates.length <= MAX_RESULTS) return candidates;

  const buckets: Record<'lower' | 'same' | 'higher', AlternativeExerciseOption[]> = {
    lower: [],
    same: [],
    higher: [],
  };

  for (const c of candidates) {
    buckets[c.levelComparison].push(c);
  }

  const diversitySort = (a: AlternativeExerciseOption, b: AlternativeExerciseOption): number => {
    if (!originalGearType) return 0;
    const aIsDifferent = a.selectedExecutionMethod?.requiredGearType !== originalGearType ? 1 : 0;
    const bIsDifferent = b.selectedExecutionMethod?.requiredGearType !== originalGearType ? 1 : 0;
    return bIsDifferent - aIsDifferent;
  };

  for (const key of ['lower', 'same', 'higher'] as const) {
    buckets[key].sort(diversitySort);
  }

  const result: AlternativeExerciseOption[] = [];
  const overflow: AlternativeExerciseOption[] = [];

  for (const key of ['lower', 'same', 'higher'] as const) {
    if (buckets[key].length > 0) {
      result.push(buckets[key][0]);
      overflow.push(...buckets[key].slice(1));
    }
  }

  overflow.sort(diversitySort);

  while (result.length < MAX_RESULTS && overflow.length > 0) {
    result.push(overflow.shift()!);
  }

  result.sort((a, b) => a.resolvedLevel - b.resolvedLevel);
  return result;
}

// ── Tab 1: Variations (same base_movement_id) ──

export async function getExerciseVariations(
  currentExercise: Exercise,
  currentLevel: number,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile,
  activeProgramId?: string,
): Promise<AlternativeExerciseOption[]> {
  if (!currentExercise.base_movement_id || currentExercise.base_movement_id === 'unspecified_movement') {
    console.warn(
      `[SmartSwap] "${nameOf(currentExercise)}" (${currentExercise.id}) has no base_movement_id — skipping Variations tab.`,
    );
    return [];
  }

  const allExercises = await getAllExercises();
  const { selectExecutionMethodWithBrand } = await import('./execution-method-selector.service');

  const all: AlternativeExerciseOption[] = [];
  let originalGearType: RequiredGearType | undefined;

  console.group(`[SwapDebug][Variations] base_movement_id="${currentExercise.base_movement_id}" | level=${currentLevel} | loc="${location}" | prog="${activeProgramId}"`);

  let familyCount = 0;

  // Resolve original exercise gear type for diversity scoring
  const origMethod = currentExercise.execution_methods?.find((m) => methodMatchesLocation(m, location));
  if (origMethod) originalGearType = origMethod.requiredGearType;

  for (const ex of allExercises) {
    if (ex.id === currentExercise.id) continue;
    if (ex.base_movement_id !== currentExercise.base_movement_id) continue;

    familyCount++;
    const exLevel = getExerciseLevel(ex, activeProgramId);

    console.log(`  [RAW DB]   "${nameOf(ex)}" (${ex.id}) — methods: ${debugMethodLocations(ex)}`);

    // ±3 level radius — gives Pro-level users (e.g. L19) access to L16–L22
    if (Math.abs(exLevel - currentLevel) > 3) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — Level Δ ${Math.abs(exLevel - currentLevel)} > 3`);
      continue;
    }

    if (!ex.execution_methods?.length) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — No execution_methods`);
      continue;
    }

    if (!exerciseHasLocation(ex, location)) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — No method for "${location}"`);
      continue;
    }

    const selectedMethod = await selectExecutionMethodWithBrand(ex, location, park, userProfile);
    if (!selectedMethod) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — Equipment mismatch (selectExecutionMethodWithBrand → null)`);
      continue;
    }

    const levelComparison: 'lower' | 'same' | 'higher' =
      exLevel < currentLevel ? 'lower' : exLevel > currentLevel ? 'higher' : 'same';

    console.log(`  [PASSED]   "${nameOf(ex)}" — L${exLevel} ${levelComparison} gear=${selectedMethod.requiredGearType}`);

    all.push({ exercise: ex, selectedExecutionMethod: selectedMethod, levelComparison, resolvedLevel: exLevel });
  }

  const selected = smartSelect3(all, originalGearType);
  console.log(`[SwapDebug][Variations] ${familyCount} family → ${all.length} valid → ${selected.length} shown`);
  console.groupEnd();
  return selected;
}

// ── Tab 2: Alternatives (same movementGroup, excluding Tab 1) ──

export async function getAlternativeExercises(
  currentExercise: Exercise,
  currentLevel: number,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile,
  activeProgramId?: string,
  excludeIds?: Set<string>,
): Promise<AlternativeExerciseOption[]> {
  if (!currentExercise.movementGroup) {
    console.warn(
      `[SmartSwap] "${nameOf(currentExercise)}" (${currentExercise.id}) has no movementGroup — skipping Alternatives tab.`,
    );
    return [];
  }

  const allExercises = await getAllExercises();
  const all: AlternativeExerciseOption[] = [];
  let originalGearType: RequiredGearType | undefined;

  console.group(`[SwapDebug][Alternatives] movementGroup="${currentExercise.movementGroup}" | level=${currentLevel} | loc="${location}" | excluding=${excludeIds?.size ?? 0}`);

  let groupCount = 0;

  const origMethod = currentExercise.execution_methods?.find((m) => methodMatchesLocation(m, location));
  if (origMethod) originalGearType = origMethod.requiredGearType;

  for (const ex of allExercises) {
    if (ex.id === currentExercise.id) continue;
    if (excludeIds?.has(ex.id)) continue;
    if (ex.movementGroup !== currentExercise.movementGroup) continue;

    groupCount++;
    const exLevel = getExerciseLevel(ex, activeProgramId);

    console.log(`  [RAW DB]   "${nameOf(ex)}" (${ex.id}) — methods: ${debugMethodLocations(ex)}`);

    // ±3 level radius — gives Pro-level users (e.g. L19) access to L16–L22
    if (Math.abs(exLevel - currentLevel) > 3) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — Level Δ ${Math.abs(exLevel - currentLevel)} > 3`);
      continue;
    }

    if (!ex.execution_methods?.length) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — No execution_methods`);
      continue;
    }

    if (!exerciseHasLocation(ex, location)) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — No method for "${location}"`);
      continue;
    }

    const selectedMethod = await selectExecutionMethodWithBrand(ex, location, park, userProfile);
    if (!selectedMethod) {
      console.log(`  [FILTERED] "${nameOf(ex)}" — Equipment mismatch`);
      continue;
    }

    const levelComparison: 'lower' | 'same' | 'higher' =
      exLevel < currentLevel ? 'lower' : exLevel > currentLevel ? 'higher' : 'same';

    console.log(`  [PASSED]   "${nameOf(ex)}" — L${exLevel} ${levelComparison} gear=${selectedMethod.requiredGearType}`);

    all.push({ exercise: ex, selectedExecutionMethod: selectedMethod, levelComparison, resolvedLevel: exLevel });
  }

  const selected = smartSelect3(all, originalGearType);
  console.log(`[SwapDebug][Alternatives] ${groupCount} group → ${all.length} valid → ${selected.length} shown`);
  console.groupEnd();
  return selected;
}
