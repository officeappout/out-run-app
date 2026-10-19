'use client';

/**
 * Map (Discover layer) overlays, code-split out of the map chunk. Drop-in
 * replacements for the original imports (same props): not mounted or
 * downloaded until first opened, then sticky-mounted so animations and state
 * are unchanged. See src/components/system/lazyOverlay.tsx.
 */
import dynamic from 'next/dynamic';
import { lazyOverlay, useIdlePreload } from '@/components/system/lazyOverlay';

const always = () => true;
const byIsOpen = (p: { isOpen: boolean }) => p.isOpen;

// Rendered conditionally by DiscoverLayer (`{cond && <X isOpen …/>}`).
export const FreeRunDrawer = lazyOverlay(
  'map.FreeRunDrawer',
  dynamic(() => import('@/features/parks/core/components/FreeRunDrawer'), { ssr: false }),
  always,
  () => import('@/features/parks/core/components/FreeRunDrawer'),
);
export const RouteDetailSheet = lazyOverlay(
  'map.RouteDetailSheet',
  dynamic(() => import('@/features/parks/client/components/route-preview/RouteDetailSheet'), { ssr: false }),
  always,
  () => import('@/features/parks/client/components/route-preview/RouteDetailSheet'),
);
export const ExerciseReplacementModal = lazyOverlay(
  'map.ExerciseReplacementModal',
  dynamic(() => import('@/features/workout-engine/players/strength/components/ExerciseReplacementModal'), { ssr: false }),
  byIsOpen,
  () => import('@/features/workout-engine/players/strength/components/ExerciseReplacementModal'),
);
export const ExerciseDetailDrawer = lazyOverlay(
  'map.ExerciseDetailDrawer',
  dynamic(() => import('@/features/workouts/components/workout-preview-drawer/components/ExerciseDetailDrawer'), { ssr: false }),
  (p: { detailExercise: unknown }) => !!p.detailExercise,
  () => import('@/features/workouts/components/workout-preview-drawer/components/ExerciseDetailDrawer'),
);

// Always rendered with an open prop → sticky-mount on first open.
export const ContributionWizard = lazyOverlay(
  'map.ContributionWizard',
  dynamic(() => import('@/features/parks/client/components/contribution-wizard'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/contribution-wizard'),
);
export const QuickReportSheet = lazyOverlay(
  'map.QuickReportSheet',
  dynamic(() => import('@/features/parks/client/components/contribution-wizard/QuickReportSheet'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/contribution-wizard/QuickReportSheet'),
);
export const PlannedActivityComposeSheet = lazyOverlay(
  'map.PlannedActivityComposeSheet',
  dynamic(() => import('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet'),
);
export const UnifiedPlusDrawer = lazyOverlay(
  'map.UnifiedPlusDrawer',
  dynamic(() => import('@/features/parks/client/components/planned-activity/UnifiedPlusDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/planned-activity/UnifiedPlusDrawer'),
);
export const SetSavedPlaceSheet = lazyOverlay(
  'map.SetSavedPlaceSheet',
  dynamic(() => import('@/features/user/places/components/SetSavedPlaceSheet'), { ssr: false }),
  (p: { openKind: unknown }) => p.openKind != null,
  () => import('@/features/user/places/components/SetSavedPlaceSheet'),
);

const PRELOAD = [
  FreeRunDrawer,
  RouteDetailSheet,
  UnifiedPlusDrawer,
  ExerciseDetailDrawer,
  ExerciseReplacementModal,
  PlannedActivityComposeSheet,
  ContributionWizard,
  QuickReportSheet,
  SetSavedPlaceSheet,
] as const;

/** Call once from DiscoverLayer: warms every overlay chunk when idle. */
export function useDiscoverOverlayPreload(): void {
  useIdlePreload(PRELOAD);
}
