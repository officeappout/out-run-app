/**
 * Workout Engine Logic Module
 * 
 * ISOMORPHIC: All exports are pure TypeScript, no React hooks
 * 
 * These modules can be used on:
 * - Server: For pre-generating weekly workout plans
 * - Client: For real-time swaps and adaptations
 */

// Fragmenter - Workout splitting (Office/Home mode)
export {
  Fragmenter,
  createFragmenter,
  shouldFragmentWorkout,
  type FragmenterConfig,
  type FragmentationResult,
} from './Fragmenter';

// RestCalculator - Dynamic rest times
export {
  RestCalculator,
  createRestCalculator,
  getRestSeconds,
  getSimpleRestByReps,
  type ExerciseCategory,
  type RestCalculationParams,
  type RestCalculationResult,
} from './RestCalculator';

// SwapEngine - Exercise replacement
export {
  SwapEngine,
  createSwapEngine,
  analyzeSwap,
  type SwapReason,
  type SwapPersistence,
  type SwapCandidate,
  type SwapResult,
  type SwapRequest,
  type ExerciseQuery,
  type ExerciseDatabase,
} from './SwapEngine';

// WorkoutGenerator - Duration-based workout building
export {
  WorkoutGenerator,
  createWorkoutGenerator,
  generateWorkout,
  type WorkoutExercise,
  type ExercisePriority,
  type GeneratedWorkout,
  type VolumeAdjustment,
  type BlastModeDetails,
  type MechanicalBalanceSummary,
  type WorkoutGenerationContext,
  type WorkoutStructure,
  type DifficultyLevel,
  type WorkoutStats,
} from './WorkoutGenerator';

// ContextualEngine - Location/Lifestyle/Intent filtering
export {
  ContextualEngine,
  createContextualEngine,
  filterExercisesContextually,
  LOCATION_CONSTRAINTS,
  LIFESTYLE_LABELS,
  type ContextualFilterContext,
  type ContextualFilterResult,
  type LifestylePersona,
  type IntentMode,
  type ProgramId,
  type LocationConstraints,
  type ScoredExercise,
  type MechanicalBalance,
  type FilterDescription,
} from './ContextualEngine';
