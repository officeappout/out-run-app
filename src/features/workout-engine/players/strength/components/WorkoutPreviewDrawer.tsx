'use client';

/**
 * WorkoutPreviewDrawer — Single Source of Truth Re-export
 *
 * The canonical drawer lives at:
 *   @/features/workouts/components/WorkoutPreviewDrawer
 *
 * This file re-exports it so that any existing barrel imports
 * (e.g. from '@/features/workout-engine/players/strength')
 * resolve to the same, premium-design component.
 */
export { default } from '@/features/workouts/components/WorkoutPreviewDrawer';
export type { default as WorkoutPreviewDrawerType } from '@/features/workouts/components/WorkoutPreviewDrawer';
