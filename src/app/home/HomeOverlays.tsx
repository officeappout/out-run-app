'use client';

/**
 * Home screen overlays — every drawer / modal / sheet the home page can open,
 * code-split out of the page chunk (they used to be 18 static imports in
 * page.tsx and all shipped — and parsed — before the first paint).
 *
 * Each export is a drop-in replacement for the original component (same
 * props, same JSX at the call site): it isn't mounted or downloaded until it
 * first opens, then stays mounted so open/close animations and kept state are
 * unchanged. See src/components/system/lazyOverlay.tsx.
 *
 * `useHomeOverlayPreload()` warms all of them when the page goes idle, so the
 * first tap doesn't wait for the network.
 */
import dynamic from 'next/dynamic';
import { lazyOverlay, useIdlePreload } from '@/components/system/lazyOverlay';

const always = () => true;
const byIsOpen = (p: { isOpen: boolean }) => p.isOpen;

// ── Conditionally rendered by the page (`{x && <X/>}` / AnimatePresence) ──
export const AlertModal = lazyOverlay(
  'home.AlertModal',
  dynamic(() => import('@/features/home/components/AlertModal'), { ssr: false }),
  always,
  () => import('@/features/home/components/AlertModal'),
);
export const BlurryBridgeOverlay = lazyOverlay(
  'home.BlurryBridgeOverlay',
  dynamic(() => import('@/features/user/onboarding/components/BlurryBridgeOverlay'), { ssr: false }),
  always,
  () => import('@/features/user/onboarding/components/BlurryBridgeOverlay'),
);
export const WelcomeDrawer = lazyOverlay(
  'home.WelcomeDrawer',
  dynamic(() => import('@/features/user/onboarding/components/WelcomeDrawer'), { ssr: false }),
  always,
  () => import('@/features/user/onboarding/components/WelcomeDrawer'),
);
export const LifestyleWizard = lazyOverlay(
  'home.LifestyleWizard',
  dynamic(() => import('@/features/user/onboarding/components/LifestyleWizard'), { ssr: false }),
  always,
  () => import('@/features/user/onboarding/components/LifestyleWizard'),
);
export const ScheduleBuilderDrawer = lazyOverlay(
  'home.ScheduleBuilderDrawer',
  dynamic(() => import('@/features/schedule/components/ScheduleBuilderDrawer'), { ssr: false }),
  always,
  () => import('@/features/schedule/components/ScheduleBuilderDrawer'),
);
export const AddWorkoutModal = lazyOverlay(
  'home.AddWorkoutModal',
  dynamic(() => import('@/features/home/components/AddWorkoutModal'), { ssr: false }),
  always,
  () => import('@/features/home/components/AddWorkoutModal'),
);
export const WorkoutBuilderSheet = lazyOverlay(
  'home.WorkoutBuilderSheet',
  dynamic(() => import('@/features/home/components/WorkoutBuilderSheet'), { ssr: false }),
  always,
  () => import('@/features/home/components/WorkoutBuilderSheet'),
);

// ── Always rendered by the page with an open prop → sticky-mount on first open ──
export const FirstRunTour = lazyOverlay(
  'home.FirstRunTour',
  dynamic(() => import('@/features/user/onboarding/components/FirstRunTour'), { ssr: false }),
  (p: { active: boolean }) => p.active,
  () => import('@/features/user/onboarding/components/FirstRunTour'),
);
export const UnifiedPlusDrawer = lazyOverlay(
  'home.UnifiedPlusDrawer',
  dynamic(() => import('@/features/parks/client/components/planned-activity/UnifiedPlusDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/planned-activity/UnifiedPlusDrawer'),
);
export const PlannedActivityComposeSheet = lazyOverlay(
  'home.PlannedActivityComposeSheet',
  dynamic(() => import('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet'),
);
export const ContributionWizard = lazyOverlay(
  'home.ContributionWizard',
  dynamic(() => import('@/features/parks/client/components/contribution-wizard'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/contribution-wizard'),
);
export const QuickReportSheet = lazyOverlay(
  'home.QuickReportSheet',
  dynamic(() => import('@/features/parks/client/components/contribution-wizard/QuickReportSheet'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/contribution-wizard/QuickReportSheet'),
);
export const TrainingPlannerOverlay = lazyOverlay(
  'home.TrainingPlannerOverlay',
  dynamic(() => import('@/features/home/components/TrainingPlannerOverlay'), { ssr: false }),
  byIsOpen,
  () => import('@/features/home/components/TrainingPlannerOverlay'),
);
export const HealthConnectDisclosureModal = lazyOverlay(
  'home.HealthConnectDisclosureModal',
  dynamic(() => import('@/components/ui/HealthConnectDisclosureModal'), { ssr: false }),
  byIsOpen,
  () => import('@/components/ui/HealthConnectDisclosureModal'),
);
export const GroupDetailsDrawer = lazyOverlay(
  'home.GroupDetailsDrawer',
  dynamic(() => import('@/features/arena/components/GroupDetailsDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/GroupDetailsDrawer'),
);
export const PostJoinSuccessDrawer = lazyOverlay(
  'home.PostJoinSuccessDrawer',
  dynamic(() => import('@/features/arena/components/PostJoinSuccessDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/PostJoinSuccessDrawer'),
);
export const JITSetupModal = lazyOverlay(
  'home.JITSetupModal',
  dynamic(() => import('@/features/user/onboarding/components/JITSetupModal').then((m) => m.JITSetupModal), { ssr: false }),
  byIsOpen,
  () => import('@/features/user/onboarding/components/JITSetupModal'),
);

// ── Code-split but mounted as soon as its chunk arrives (NOT on first open):
// the preview drawer's closed-state hooks warm the program map + favorites on
// page load today (useProgramMap / useFavoritesActions); deferring them to the
// first tap would make the most-used drawer open with missing labels.
export const WorkoutPreviewDrawer = lazyOverlay(
  'home.WorkoutPreviewDrawer',
  dynamic(() => import('@/features/workouts/components/WorkoutPreviewDrawer'), { ssr: false }),
  always,
  () => import('@/features/workouts/components/WorkoutPreviewDrawer'),
);

const PRELOAD = [
  WorkoutPreviewDrawer,
  HealthConnectDisclosureModal,
  JITSetupModal,
  TrainingPlannerOverlay,
  UnifiedPlusDrawer,
  GroupDetailsDrawer,
  AddWorkoutModal,
  WorkoutBuilderSheet,
  PlannedActivityComposeSheet,
  PostJoinSuccessDrawer,
  ContributionWizard,
  QuickReportSheet,
  AlertModal,
  WelcomeDrawer,
  FirstRunTour,
  BlurryBridgeOverlay,
  LifestyleWizard,
  ScheduleBuilderDrawer,
] as const;

/** Call once from the home page: warms every overlay chunk when idle. */
export function useHomeOverlayPreload(): void {
  useIdlePreload(PRELOAD);
}
