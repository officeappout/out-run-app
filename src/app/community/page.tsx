'use client';

/**
 * /community — unified Community + League page.
 *
 * Replaces the legacy split between /feed (community + groups + events) and
 * /arena (city/school/park leaderboards). Both former pages still exist as
 * thin redirect stubs while we migrate.
 *
 * Top-level tab is URL-driven so the bottom-navbar can link directly to
 * either view and the back/forward buttons restore the right tab:
 *   /community              → tab=feed (default)
 *   /community?tab=leagues  → tab=leagues
 *
 * Deep-link query params are preserved across the merge:
 *   ?groupId=xxx   — auto-open GroupDetailsDrawer (from /join/[code] and gateway)
 *   ?editGroup=xxx — auto-open CreateGroupWizard in edit mode (from profile)
 *
 * `useArenaData(cityAuthorityId)` is called ONCE at the top level — both the
 * feed and league sub-views read the same `events`, `groups`, `authority`,
 * `isLeagueActive` so we don't double-fetch.
 *
 * A thin composition: state lives in ./_hooks (in the original hook / effect
 * order), pure logic in ./_lib, and each surface in ./_components.
 */

export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { loadingLook } from '@/hooks/feature-flag-viewer-cache';
import ScreenSkeleton from '@/components/ui/v2/ScreenSkeleton';
import { feedPrefsFrom, type FeedPrefs } from '@/features/social/services/feed-prefs';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useViewerArenaAccess } from '@/features/demo-viewer/useViewerArenaAccess';
import { useMyMilitaryDeclaration } from '@/features/arena/hooks/useHasDeclaredReserveStatus';
import { usePendingUnitSelfHeal } from '@/features/arena/hooks/usePendingUnitSelfHeal';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import { useChatStore } from '@/features/social/store/useChatStore';
import { firstRunToursEnabled } from '@/features/user/onboarding/services/first-run-tour';
import AppHeader from '@/components/ui/AppHeader';
// Overlays are code-split + mounted on first open (see CommunityOverlays).
import { FirstRunTour, useCommunityOverlayPreload } from './CommunityOverlays';
import TourReplayHost from '@/features/user/onboarding/components/TourReplayHost';
import type { FeedFilter } from './_lib/community-constants';
import { usePendingShare } from './_hooks/usePendingShare';
import { useCommunityTopTab } from './_hooks/useCommunityTopTab';
import { useLeagueSelection } from './_hooks/useLeagueSelection';
import { useLeaderboardState } from './_hooks/useLeaderboardState';
import { useMyScopeKm } from './_hooks/useMyScopeKm';
import { useSocialLeagueGroups } from './_hooks/useSocialLeagueGroups';
import { useLeaguesViewState } from './_hooks/useLeaguesViewState';
import { useCommunityOverlays } from './_hooks/useCommunityOverlays';
import { useSocialBootstrap, useSyncJoinedGroupIds } from './_hooks/useCommunitySync';
import { useFeedPosts } from './_hooks/useFeedPosts';
import { useCommunityJoinActions } from './_hooks/useCommunityJoinActions';
import { CommunityTopTabs } from './_components/CommunityTopTabs';
import { CommunityDrawers } from './_components/CommunityDrawers';
import { FeedTab } from './_components/feed/FeedTab';
import { LeaguesTab } from './_components/leagues/LeaguesTab';
import { LeaguesTabV2 } from './_components/leagues/LeaguesTabV2';
import type { LeaguesVM } from './_components/leagues/leagues-vm';

export default function CommunityPage() {
  // ── Shared hooks (called ONCE for both sub-views) ────────────────────────
  // Warm the code-split overlay chunks once the screen is idle (first tap stays instant).
  useCommunityOverlayPreload();
  const { profile, _hasHydrated, refreshProfile } = useUserStore();
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const { flags: featureFlags, loading: flagsLoading, ready: flagsReady } = useFeatureFlags(isSuperAdmin);
  const { following, isLoaded: socialLoaded, loadConnections, isPartner } = useSocialStore();
  // Home v2 feed filter (all / partners / my neighborhood / my groups).
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  // Opt-in publishing (feed-prefs.ts): the last unshared workout + the sheets.
  const share = usePendingShare();
  const feedPrefs: FeedPrefs = feedPrefsFrom((profile?.social as { feedPrefs?: unknown } | undefined)?.feedPrefs);
  const myDeclaration = useMyMilitaryDeclaration();
  usePendingUnitSelfHeal();
  // Demo viewer (PR 5): this page only READS, so the owner's viewer account
  // reads its demo home city / neighbourhood here. Everyone else: unchanged.
  const access = useViewerArenaAccess(useArenaAccess(myDeclaration.isReserve, !!myDeclaration.orgId));
  const cityData = useArenaData(access.cityAuthorityId);
  const { events, groups, authority, isLeagueActive, isLoading: arenaLoading } = cityData;
  const searchParams = useSearchParams();
  const router = useRouter();
  const openChat = useChatStore((s) => s.open);

  // ── Top-level tab (URL ?tab=) + the both-surfaces-off route guard ────────
  const { isFeedTabAvailable, leaguesFirst, topTab, applyTabParam, setTopTab } =
    useCommunityTopTab(featureFlags, flagsLoading, searchParams, router);

  const userId = profile?.id;
  const photoURL = profile?.core?.photoURL;
  const userName = profile?.core?.name ?? 'משתמש';

  // ── Leagues state ────────────────────────────────────────────────────────
  const league = useLeagueSelection(access);
  const lb = useLeaderboardState(league.selectedLeague);
  const scopeKm = useMyScopeKm(featureFlags.enableHomeV2, lb.activeScopeEntry, access.neighborhoodAuthorityId, lb.leaderboardTimeWindow);
  const socialGroups = useSocialLeagueGroups(profile?.social?.groupIds);
  const view = useLeaguesViewState(league.selectedLeague);

  // ── Overlays, deep links, membership, feed ───────────────────────────────
  const overlays = useCommunityOverlays({
    searchParams, router, groups, arenaLoading, applyTabParam, setLeagueSheetOpen: league.setLeagueSheetOpen,
  });
  useSocialBootstrap(_hasHydrated, userId, socialLoaded, loadConnections);
  useSyncJoinedGroupIds(profile?.social?.groupIds, overlays.setJoinedGroupIds);
  const { posts, setPosts, loadingPosts, fetchPosts } = useFeedPosts(userId, following, isPartner, socialLoaded);
  const actions = useCommunityJoinActions({
    overlays, userId, userName, photoURL, groups, events,
    profileId: profile?.id, profileName: profile?.core?.name, refreshProfile, router,
  });

  // ── Render guards ────────────────────────────────────────────────────────
  // While feature flags haven't arrived yet, show the same loading spinner
  // used by the profile-hydration guard below. Without this, the component
  // briefly renders with enableLeagues=false (the safe default) which can
  // flash the "city not connected" state before the real flags are known.
  // Flags unknown, or v2 on: the neutral v2 skeleton (never the old loader first
  // and then v2 — owner bug 21.10.2026). Flags known off: the old loader.
  if (flagsLoading || !_hasHydrated || access.isLoading) {
    if (loadingLook(flagsReady, featureFlags.enableHomeV2) === 'skeleton') return <ScreenSkeleton />;
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען...</p>
      </div>
    );
  }

  if (!featureFlags.enableCommunityFeed && !featureFlags.enableLeagues) return null;

  // First-run community tour (slice 2) — leagues tab (v2), loaded, nothing else open.
  // The same calm-screen check gates a tour replay (ai_coach_round4 writes the request).
  const communityCalm =
    !!featureFlags.enableLeagues && topTab === 'leagues' && !arenaLoading &&
    !overlays.selectedGroup && !overlays.selectedEvent && !overlays.successData && !overlays.wizardOpen &&
    !view.scopePointsOpen && !view.groupWalkOpen && !league.leagueSheetOpen && !view.leagueFilterSheetOpen &&
    !view.axisMenuOpen && !share.shareOpen && !share.privacyOpen;
  const communityTourActive = !flagsLoading && firstRunToursEnabled(featureFlags) && communityCalm;

  const vm: LeaguesVM = {
    featureFlags, access, authority, isLeagueActive, arenaLoading, groups, myDeclaration, router, socialGroups,
    ...league, ...lb, ...scopeKm, ...view,
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC]">
      <FirstRunTour tour="community" active={communityTourActive} uid={userId} gender={profile?.core?.gender} />
      <TourReplayHost tour="community" ready={communityCalm} gender={profile?.core?.gender} />
      {/* ── Shared App Header ───────────────────────────────────────────────
            Top-level tabs (פיד / ליגות) live INSIDE the AppHeader's children
            slot so they collapse together as one sticky unit. No sub-bar —
            the leagues selector renders inline below, and the feed tab has
            no sub-tabs (discover lives at /search?tab=social). ──────────── */}
      <AppHeader zIndex={30}>
        <CommunityTopTabs
          topTab={topTab}
          setTopTab={setTopTab}
          leaguesFirst={leaguesFirst}
          isFeedTabAvailable={isFeedTabAvailable}
          enableLeagues={featureFlags.enableLeagues}
        />
      </AppHeader>

      {/* ── Drawers (mounted globally for the page so deep links work in
            either tab) ─────────────────────────────────────────────────── */}
      <CommunityDrawers
        overlays={overlays}
        actions={actions}
        userId={userId}
        openChat={openChat}
        enableHomeV2={featureFlags.enableHomeV2}
        scopePointsOpen={view.scopePointsOpen}
        setScopePointsOpen={view.setScopePointsOpen}
        groupWalkOpen={view.groupWalkOpen}
        setGroupWalkOpen={view.setGroupWalkOpen}
      />

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <AnimatePresence mode="wait">
          {topTab === 'feed' ? (
            <m.div
              key="feed"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <FeedTab
                featureFlags={featureFlags}
                profile={profile}
                userId={userId}
                share={share}
                feedPrefs={feedPrefs}
                feedFilter={feedFilter}
                setFeedFilter={setFeedFilter}
                posts={posts}
                setPosts={setPosts}
                loadingPosts={loadingPosts}
                fetchPosts={fetchPosts}
                following={following}
                isPartner={isPartner}
                setSelectedGroup={overlays.setSelectedGroup}
                handleCreatePress={actions.handleCreatePress}
                refreshProfile={refreshProfile}
                router={router}
              />
            </m.div>
          ) : (
            <m.div
              key="leagues"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {featureFlags.enableHomeV2 ? <LeaguesTabV2 vm={vm} /> : <LeaguesTab vm={vm} />}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
