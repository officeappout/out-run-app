'use client';

/**
 * Community screen overlays, code-split out of the page chunk. Drop-in
 * replacements for the original imports (same props): not mounted or
 * downloaded until first opened, then sticky-mounted so animations and state
 * are unchanged. See src/components/system/lazyOverlay.tsx.
 *
 * Not here on purpose: FeedShareSheet / FeedPrivacySheet / BoardSheet live in
 * modules the page also imports small non-overlay pieces from
 * (SharePromptCard, ScopePointsContent), so splitting them would save nothing.
 */
import dynamic from 'next/dynamic';
import { lazyOverlay, useIdlePreload } from '@/components/system/lazyOverlay';

const byIsOpen = (p: { isOpen: boolean }) => p.isOpen;

export const FirstRunTour = lazyOverlay(
  'community.FirstRunTour',
  dynamic(() => import('@/features/user/onboarding/components/FirstRunTour'), { ssr: false }),
  (p: { active: boolean }) => p.active,
  () => import('@/features/user/onboarding/components/FirstRunTour'),
);
export const GroupDetailsDrawer = lazyOverlay(
  'community.GroupDetailsDrawer',
  dynamic(() => import('@/features/arena/components/GroupDetailsDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/GroupDetailsDrawer'),
);
export const SessionDrawer = lazyOverlay(
  'community.SessionDrawer',
  dynamic(() => import('@/features/arena/components/SessionDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/SessionDrawer'),
);
export const PostJoinSuccessDrawer = lazyOverlay(
  'community.PostJoinSuccessDrawer',
  dynamic(() => import('@/features/arena/components/PostJoinSuccessDrawer'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/PostJoinSuccessDrawer'),
);
export const CreateGroupWizard = lazyOverlay(
  'community.CreateGroupWizard',
  dynamic(() => import('@/features/arena/components/CreateGroupWizard'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/CreateGroupWizard'),
);
export const PlannedActivityComposeSheet = lazyOverlay(
  'community.PlannedActivityComposeSheet',
  dynamic(() => import('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet'), { ssr: false }),
  byIsOpen,
  () => import('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet'),
);
export const LeagueFilterSheet = lazyOverlay(
  'community.LeagueFilterSheet',
  dynamic(() => import('@/features/arena/components/LeagueFilterSheet'), { ssr: false }),
  byIsOpen,
  () => import('@/features/arena/components/LeagueFilterSheet'),
);

const PRELOAD = [
  GroupDetailsDrawer,
  SessionDrawer,
  PostJoinSuccessDrawer,
  CreateGroupWizard,
  LeagueFilterSheet,
  PlannedActivityComposeSheet,
  FirstRunTour,
] as const;

/** Call once from the community page: warms every overlay chunk when idle. */
export function useCommunityOverlayPreload(): void {
  useIdlePreload(PRELOAD);
}
