/**
 * Exercises Domain - Barrel Export
 * 
 * All exercise-related types, services, and utilities are exported from here.
 * External modules should import from this file for stable API.
 */

// Types
export * from './core/exercise.types';

// Centralized Location Constants (SINGLE SOURCE OF TRUTH)
export * from './core/exercise-location.constants';

// Mapping Utilities (sanitization, normalization, field mapping)
export * from './services/exercise-mapping.utils';

// Analysis Services (production readiness, content matrix)
export * from './services/exercise-analysis.service';

// CRUD Services (Firestore operations)
export * from './core/exercise.service';

// Admin Components
export { default as ExerciseEditorForm } from './admin/ExerciseEditorForm';
