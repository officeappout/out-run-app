'use client';

/**
 * Active-workout overlays, code-split out of the player chunk. Drop-in
 * replacements for the original imports (same props). Only mid-workout
 * modals live here; see useActiveWorkoutOverlayPreload for why they're warmed
 * early, and the PR notes for why the dopamine / summary screens are NOT split
 * (a chunk that fails to load at the end of a park workout can't be retried —
 * React.lazy caches the failure — so they stay in the page chunk).
 */
import dynamic from 'next/dynamic';
import { lazyOverlay, useIdlePreload } from '@/components/system/lazyOverlay';

const always = () => true;

export const ExerciseReplacementModal = lazyOverlay(
  'workout.ExerciseReplacementModal',
  dynamic(() => import('@/features/workout-engine/players/strength/components/ExerciseReplacementModal'), { ssr: false }),
  (p: { isOpen: boolean }) => p.isOpen,
  () => import('@/features/workout-engine/players/strength/components/ExerciseReplacementModal'),
);
export const ResumeWorkoutDialog = lazyOverlay(
  'workout.ResumeWorkoutDialog',
  dynamic(() => import('@/features/workout-engine/players/strength/components/ResumeWorkoutDialog'), { ssr: false }),
  always,
  () => import('@/features/workout-engine/players/strength/components/ResumeWorkoutDialog'),
);

const PRELOAD = [ExerciseReplacementModal, ResumeWorkoutDialog] as const;

/**
 * Call once from the active-workout page. Warmed soon after mount (the page
 * was just fetched, so the network is there) so a mid-workout swap never
 * depends on park connectivity.
 */
export function useActiveWorkoutOverlayPreload(): void {
  useIdlePreload(PRELOAD, 1000);
}
