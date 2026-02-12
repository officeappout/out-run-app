/**
 * Workout Engine Master Barrel Export
 * Unified access to all workout functionality
 */

// Core (Session State, Types, Services)
export * from './core';

// Logic (ISOMORPHIC: Pure TypeScript, No React Hooks)
// - WorkoutGenerator: Core session generation
// - Fragmenter: Office/Home workout splitting
// - RestCalculator: Dynamic rest times
// - SwapEngine: Exercise replacement logic
export * from './logic';

// Generator (AI Workout Builder)
export * from './generator';

// Home Workout Service (Orchestrator for Home Dashboard)
export {
  generateHomeWorkout,
  calculateDaysInactive,
  extractInjuryShield,
  mapPersonaIdToLifestylePersona,
  detectTimeOfDay,
  TIME_OF_DAY_OPTIONS,
  type HomeWorkoutOptions,
  type HomeWorkoutResult,
  type TimeOfDay,
} from './services/home-workout.service';

// Workout Metadata Service (Firestore-driven titles, descriptions, AI cues)
export {
  resolveWorkoutMetadata,
  type WorkoutMetadataContext,
  type ResolvedWorkoutMetadata,
} from './services/workout-metadata.service';

// Shadow Level Utilities (Per-exercise level resolution)
export {
  getEffectiveLevelForExercise,
  createDefaultShadowMatrix,
  type ShadowMatrix,
  type LevelOverride,
} from './services/shadow-level.utils';

// Players (Running, Strength, Hybrid)
export * from './players';

// Shared (Utils, Components)
export * from './shared';
