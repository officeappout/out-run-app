/**
 * Exercise Replacement Service
 * Handles fetching alternative exercises for replacement modal
 */
import { Exercise, ExecutionLocation, ExecutionMethod, MuscleGroup } from '@/types/exercise.type';
import { getAllExercises } from '@/features/admin/services/exercise.service';
import { UserFullProfile } from '@/types/user-profile';
import { Park } from '@/types/admin-types';
import { selectExecutionMethodWithBrand } from './execution-method-selector.service';

export interface AlternativeExerciseOption {
  exercise: Exercise;
  selectedExecutionMethod?: ExecutionMethod;
  levelComparison: 'lower' | 'same' | 'higher';
}

/**
 * Get exercise level from targetPrograms, defaulting to 1 if not found
 */
function getExerciseLevel(exercise: Exercise, activeProgramId?: string): number {
  if (exercise.targetPrograms && activeProgramId) {
    const matchingTarget = exercise.targetPrograms.find(
      (tp) => tp.programId === activeProgramId
    );
    if (matchingTarget) {
      return matchingTarget.level;
    }
  }
  // Default to Level 1 if no targetPrograms match
  return 1;
}

/**
 * Get alternative exercises for Tab 1: Same exercise variations (different levels)
 * Priority 1: Match by base_movement_id, filter by userLevel +/- 1 and available equipment
 */
export async function getExerciseVariations(
  currentExercise: Exercise,
  currentLevel: number,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile,
  activeProgramId?: string
): Promise<AlternativeExerciseOption[]> {
  if (!currentExercise.base_movement_id) {
    // Log warning for missing base_movement_id
    console.warn(
      `[Exercise Replacement] Exercise "${currentExercise.name}" (ID: ${currentExercise.id}) ` +
        `is missing base_movement_id. Cannot find exercise variations for Smart Swap. ` +
        `Please add base_movement_id in the admin panel.`
    );
    return []; // No base movement ID, can't find variations
  }

  const allExercises = await getAllExercises();
  const { selectExecutionMethodWithBrand } = await import('./execution-method-selector.service');
  
  const variations: AlternativeExerciseOption[] = [];

  for (const ex of allExercises) {
    // Exclude current exercise
    if (ex.id === currentExercise.id) continue;

    // Priority 1: Match by base_movement_id (Family)
    if (ex.base_movement_id !== currentExercise.base_movement_id) continue;

    // Filter by level: userLevel +/- 1
    const exLevel = getExerciseLevel(ex, activeProgramId);
    if (Math.abs(exLevel - currentLevel) > 1) continue;

    // Check if has execution method for current location and available equipment
    if (!ex.execution_methods || ex.execution_methods.length === 0) continue;
    
    // MUST have execution method matching current location
    const locationMatch = ex.execution_methods.some(method => method.location === location);
    if (!locationMatch) continue; // Skip exercises without matching location
    
    const selectedMethod = await selectExecutionMethodWithBrand(ex, location, park, userProfile);
    if (!selectedMethod) continue; // No suitable method for this context

    // Determine level comparison
    let levelComparison: 'lower' | 'same' | 'higher' = 'same';
    if (exLevel < currentLevel) {
      levelComparison = 'lower';
    } else if (exLevel > currentLevel) {
      levelComparison = 'higher';
    }

    variations.push({
      exercise: ex,
      selectedExecutionMethod: selectedMethod,
      levelComparison,
    });
  }

  // All variations already have location match (filtered above)
  const allVariations = variations;
  
  // Sort by level
  return allVariations.sort((a, b) => getExerciseLevel(a.exercise, activeProgramId) - getExerciseLevel(b.exercise, activeProgramId));
}

/**
 * Get alternative exercises for Tab 2: Different exercises from same movement group
 * Priority 2: If no family match, match by movementGroup. Filter by userLevel +/- 1 and available equipment
 */
export async function getAlternativeExercises(
  currentExercise: Exercise,
  currentLevel: number,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile,
  activeProgramId?: string
): Promise<AlternativeExerciseOption[]> {
  // Priority 2: Match by movementGroup (Group)
  if (!currentExercise.movementGroup) {
    return []; // No movement group, can't find alternatives
  }

  const allExercises = await getAllExercises();
  const alternatives: AlternativeExerciseOption[] = [];

  for (const ex of allExercises) {
    // Skip current exercise
    if (ex.id === currentExercise.id) continue;

    // Priority 2: Match by movementGroup
    if (ex.movementGroup !== currentExercise.movementGroup) continue;

    // Filter by level: userLevel +/- 1
    const exLevel = getExerciseLevel(ex, activeProgramId);
    if (Math.abs(exLevel - currentLevel) > 1) continue;

    // Check if has execution method for current location and available equipment
    if (!ex.execution_methods || ex.execution_methods.length === 0) continue;
    
    // MUST have execution method matching current location
    const locationMatch = ex.execution_methods.some(method => method.location === location);
    if (!locationMatch) continue; // Skip exercises without matching location
    
    const selectedMethod = await selectExecutionMethodWithBrand(ex, location, park, userProfile);
    if (!selectedMethod) continue; // No suitable method for this context

    // Determine level comparison
    let levelComparison: 'lower' | 'same' | 'higher' = 'same';
    if (exLevel < currentLevel) {
      levelComparison = 'lower';
    } else if (exLevel > currentLevel) {
      levelComparison = 'higher';
    }

    alternatives.push({
      exercise: ex,
      selectedExecutionMethod: selectedMethod,
      levelComparison,
    });
  }

  // All alternatives already have location match (filtered above)
  const allAlternatives = alternatives;
  
  // Sort by level
  return allAlternatives.sort((a, b) => getExerciseLevel(a.exercise, activeProgramId) - getExerciseLevel(b.exercise, activeProgramId));
}
