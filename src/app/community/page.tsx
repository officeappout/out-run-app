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
 */

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { m, AnimatePresence, motion } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, RefreshCw, Share2, ChevronDown } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { IS_COMMUNITY_FEED_ENABLED } from '@/config/feature-flags';
import { getFeedPosts, type FeedPost } from '@/features/social/services/feed.service';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import FeedPostCard from '@/features/social/components/FeedPostCard';
import GroupCard from '@/features/arena/components/GroupCard';
import { useChatStore } from '@/features/social/store/useChatStore';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import CommunityCircles from '@/features/arena/components/CommunityCircles';
import CreateGroupWizard from '@/features/arena/components/CreateGroupWizard';
import CityArenaView from '@/features/arena/components/CityArenaView';
import NeighborhoodLeaderboard from '@/features/arena/components/NeighborhoodLeaderboard';
import GroupLeaderboard from '@/features/arena/components/GroupLeaderboard';
import MunicipalPressureCard from '@/features/arena/components/MunicipalPressureCard';
import SchoolOutreachCard from '@/features/arena/components/SchoolOutreachCard';
import LeagueCarousel, {
  type LeagueCardData,
} from '@/features/arena/components/LeagueCarousel';
import type {
  LeaderboardCategory,
  LeaderboardTimeWindow,
  LeaderboardGenderFilter,
  LeaderboardEntry,
} from '@/features/arena/services/ranking.service';
import { joinGroup, leaveGroup, getMyGroups } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import { addCommunitySessionsToPlanner } from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityGroup, CommunityEvent } from '@/types/community.types';
import AppHeader from '@/components/ui/AppHeader';

type CommunityTopTab = 'feed' | 'leagues';

// ── Verb mappings for success drawer ──────────────────────────────────────────
const GROUP_VERB: Record<string, string> = {
  walking:      'ילך',
  running:      'ירוץ',
  yoga:         'יתאמן',
  calisthenics: 'יתאמן',
  cycling:      'ירכב',
  other:        'יתאמן',
};

const EVENT_VERB: Record<string, string> = {
  race:             'ירוץ',
  fitness_day:      'יתאמן',
  workshop:         'ישתתף',
  community_meetup: 'ישתתף',
  other:            'יתאמן',
};

export default function CommunityPage() {
  // ── Shared hooks (called ONCE for both sub-views) ────────────────────────
  const { profile, _hasHydrated, refreshProfile } = useUserStore();
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags: featureFlags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);
  const { following, isLoaded: socialLoaded, loadConnections, isPartner } = useSocialStore();
  const access = useArenaAccess();
  const cityData = useArenaData(access.cityAuthorityId);
  const { events, groups, authority, isLeagueActive, isLoading: arenaLoading } = cityData;
  const searchParams = useSearchParams();
  const router = useRouter();
  const openChat = useChatStore((s) => s.open);

  // ── Top-level tab from URL param ─────────────────────────────────────────
  // When the feed is compile-time disabled, force 'leagues' as the default so
  // the user never lands on the empty feed view, even without a ?tab= param.
  const tabParam = searchParams.get('tab');
  const topTab: CommunityTopTab =
    tabParam === 'leagues' ? 'leagues'
    : tabParam === 'feed' && IS_COMMUNITY_FEED_ENABLED ? 'feed'
    : IS_COMMUNITY_FEED_ENABLED ? 'feed'
    : 'leagues';

  const setTopTab = useCallback(
    (next: CommunityTopTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'feed') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      const qs = params.toString();
      router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );

  // ── Route guard: redirect only when BOTH surfaces are disabled ───────────
  // The page hosts two independent surfaces: the social feed (enableCommunityFeed)
  // and leagues (enableLeagues). We only bounce to /home when neither is on.
  useEffect(() => {
    if (!flagsLoading && !featureFlags.enableCommunityFeed && !featureFlags.enableLeagues) {
      router.replace('/home');
    }
  }, [flagsLoading, featureFlags.enableCommunityFeed, featureFlags.enableLeagues, router]);

  const userId = profile?.id;
  const photoURL = profile?.core?.photoURL;
  const userName = profile?.core?.name ?? 'משתמש';

  // ── Selected league (replaces the old segmented bar) ─────────────────────
  // The carousel surfaces every league the user belongs to; this state tracks
  // which card is currently highlighted and which segment renders below.
  // Type is `string` (not `ArenaTabKey`) because social group keys are dynamic:
  // 'league_<groupId>'.
  const [selectedLeague, setSelectedLeague] = useState<string>('global');
  const defaultLeagueApplied = useRef(false);

  // Bottom-sheet league selector — replaces the inline horizontal carousel.
  // The summary button shows the active league; tapping it opens this sheet.
  const [leagueSheetOpen, setLeagueSheetOpen] = useState(false);

  useEffect(() => {
    if (access.activeTabs.length === 0) return;

    if (!defaultLeagueApplied.current) {
      defaultLeagueApplied.current = true;
      const hasCity = access.activeTabs.some((t) => t.key === 'city');
      setSelectedLeague(hasCity ? 'city' : access.activeTabs[0].key);
    } else if (!access.activeTabs.find((t) => t.key === selectedLeague)) {
      setSelectedLeague(access.activeTabs[0].key);
    }
  }, [access.activeTabs, selectedLeague]);

  // ── Leaderboard filter state — lifted out of NeighborhoodLeaderboard ─────
  // Lifted because the carousel needs to read `category` + `timeWindow` to
  // render the small filter label on the active card ("ריצה • שבועי" etc.).
  const [leaderboardCategory, setLeaderboardCategory] =
    useState<LeaderboardCategory>('overall');
  const [leaderboardTimeWindow, setLeaderboardTimeWindow] =
    useState<LeaderboardTimeWindow>('weekly');
  const [leaderboardGender, setLeaderboardGender] =
    useState<LeaderboardGenderFilter>('all');

  // Bubbled from the active NeighborhoodLeaderboard. Used to display the
  // user's rank on the active league card without firing a duplicate query.
  const [activeMyEntry, setActiveMyEntry] = useState<LeaderboardEntry | null>(
    null,
  );

  // Reset the bubbled rank whenever the user selects a different league —
  // the new leaderboard hasn't fetched yet, so showing the previous rank
  // would be stale. The new value will arrive on the next bubble.
  useEffect(() => {
    setActiveMyEntry(null);
  }, [selectedLeague]);

  // ── Social groups (family/friends) for the league carousel ───────────────
  // Loaded once from profile.social.groupIds — only groups of type 'family'
  // or 'friends' become league cards (neighborhood/work/park are institutional).
  const [socialGroups, setSocialGroups] = useState<CommunityGroup[]>([]);
  useEffect(() => {
    const gids = profile?.social?.groupIds;
    if (!gids?.length) { setSocialGroups([]); return; }
    getMyGroups(gids).then((all) => {
      setSocialGroups(all.filter((g) => g.groupType === 'family' || g.groupType === 'friends'));
    }).catch(() => {});
  }, [profile?.social?.groupIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Individual vs group competition toggle ────────────────────────────────
  const [competitionMode, setCompetitionMode] = useState<'individual' | 'group'>('individual');

  // Reset to individual whenever the active league card changes.
  useEffect(() => {
    setCompetitionMode('individual');
  }, [selectedLeague]);

  // ── Feed-only state ──────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    name: string;
    verb: string;
    groupId?: string;
    scheduleSlots?: import('@/types/community.types').ScheduleSlot[];
    category?: string;
    address?: string;
  } | null>(null);

  // ── Deep-link: ?groupId=xxx → open drawer, or ?groupId=xxx&joined=true →
  //    fire the post-join success drawer (gateway auto-join completed). ──────
  useEffect(() => {
    const targetId = searchParams.get('groupId');
    if (!targetId || !groups.length || arenaLoading) return;
    const target = groups.find((g) => g.id === targetId);
    if (target) {
      const justJoined = searchParams.get('joined') === 'true';
      if (justJoined) {
        // The membership write already happened at the gateway — mark joined
        // locally and celebrate with the success drawer.
        setJoinedGroupIds((prev) => new Set([...prev, target.id]));
        const allSlots = target.scheduleSlots?.length
          ? target.scheduleSlots
          : target.schedule
            ? [target.schedule]
            : [];
        setSuccessData({
          name: target.name,
          verb: GROUP_VERB[target.category] ?? 'יתאמן',
          groupId: target.id,
          scheduleSlots: allSlots,
          category: target.category,
          address: target.meetingLocation?.address,
        });
      } else {
        // Force feed view so the drawer feels in-context.
        if (topTab !== 'feed') setTopTab('feed');
        setSelectedGroup(target);
      }
      // Strip query params without nuking ?tab= if it was set.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('groupId');
      params.delete('joined');
      const qs = params.toString();
      router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
    }
  }, [searchParams, groups, arenaLoading, router, topTab, setTopTab]);

  // ── Deep-link: ?editGroup=xxx → open CreateGroupWizard in edit mode ──────
  useEffect(() => {
    const editId = searchParams.get('editGroup');
    if (!editId) return;
    setEditGroupId(editId);
    setWizardOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('editGroup');
    const qs = params.toString();
    router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  // ── Deep-link: ?openCreate=true → reopen wizard after profile-only detour ─
  useEffect(() => {
    if (searchParams.get('openCreate') !== 'true') return;
    setEditGroupId(null);
    setWizardOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('openCreate');
    const qs = params.toString();
    router.replace(`/community${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  // ── Social connections bootstrap ─────────────────────────────────────────
  useEffect(() => {
    if (_hasHydrated && userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [_hasHydrated, userId, socialLoaded, loadConnections]);

  // ── Sync joinedGroupIds with profile-level groupIds ──────────────────────
  useEffect(() => {
    const savedIds = profile?.social?.groupIds;
    if (savedIds?.length) {
      setJoinedGroupIds((prev) => {
        const merged = new Set(prev);
        for (const id of savedIds) merged.add(id);
        return merged.size !== prev.size ? merged : prev;
      });
    }
  }, [profile?.social?.groupIds]);

  // ── Fetch feed posts ─────────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    const uids = [...new Set([userId, ...following])];
    setLoadingPosts(true);
    try {
      const fetched = await getFeedPosts(uids, 30);
      fetched.sort((a, b) => {
        const aPartner = isPartner(a.authorUid) ? 0 : 1;
        const bPartner = isPartner(b.authorUid) ? 0 : 1;
        return aPartner - bPartner || b.createdAt.getTime() - a.createdAt.getTime();
      });
      setPosts(fetched);
    } catch (err) {
      console.error('[CommunityPage] fetchPosts failed:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [userId, following, isPartner]);

  useEffect(() => {
    if (socialLoaded && userId) {
      fetchPosts();
    }
  }, [socialLoaded, userId, fetchPosts]);

  // ── Join handlers ────────────────────────────────────────────────────────
  const handleJoinGroup = useCallback(async (groupId: string) => {
    if (!userId) return;
    setJoiningId(groupId);
    try {
      await joinGroup(groupId, userId, userName, { addToPlanner: false });
      setJoinedGroupIds((prev) => new Set([...prev, groupId]));
      const group = groups.find((g) => g.id === groupId) ?? selectedGroup;
      setSelectedGroup(null);
      if (group) {
        const allSlots = group.scheduleSlots?.length
          ? group.scheduleSlots
          : group.schedule
            ? [group.schedule]
            : [];
        setSuccessData({
          name: group.name,
          verb: GROUP_VERB[group.category] ?? 'יתאמן',
          groupId: group.id,
          scheduleSlots: allSlots,
          category: group.category,
          address: group.meetingLocation?.address,
        });
      }
    } catch (err) {
      console.error('[CommunityPage] joinGroup failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName, groups, selectedGroup]);

  const handleJoinEvent = useCallback(async (eventId: string) => {
    if (!userId) return;
    setJoiningId(eventId);
    try {
      await joinEvent(eventId, userId, userName, photoURL ?? undefined);
      setJoinedEventIds((prev) => new Set([...prev, eventId]));
      const event = events.find((e) => e.id === eventId) ?? selectedEvent;
      setSelectedEvent(null);
      if (event) {
        setSuccessData({ name: event.name, verb: EVENT_VERB[event.category] ?? 'יתאמן' });
      }
    } catch (err) {
      console.error('[CommunityPage] joinEvent failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName, photoURL, events, selectedEvent]);

  const handleLeaveGroup = useCallback(async (groupId: string) => {
    if (!userId) return;
    try {
      await leaveGroup(groupId, userId);
      setJoinedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    } catch (err) {
      console.error('[CommunityPage] leaveGroup failed:', err);
    }
  }, [userId]);

  const handlePlannerPref = useCallback(
    (addToPlanner: boolean) => {
      if (!addToPlanner || !userId || !successData?.groupId || !successData.scheduleSlots?.length) return;
      addCommunitySessionsToPlanner(
        userId,
        successData.groupId,
        successData.name,
        successData.category ?? 'other',
        successData.scheduleSlots,
      ).catch((err) => console.warn('[CommunityPage] planner sync failed:', err));
    },
    [userId, successData],
  );

  const handleGroupCreated = useCallback(
    async (groupId: string) => {
      setWizardOpen(false);
      setEditGroupId(null);
      if (!editGroupId) {
        // New group: immediately mark as joined in local state
        setJoinedGroupIds((prev) => new Set([...prev, groupId]));
      }
      try { await refreshProfile(); } catch { /* non-fatal */ }
    },
    [refreshProfile, editGroupId],
  );

  // ── Guarded "create community" entry point ────────────────────────────────
  // Intercepts the tap before the wizard mounts so the user never fills in
  // multiple steps only to be interrupted on submission.
  const handleCreatePress = useCallback(() => {
    if (!profile?.id || !profile?.core?.name) {
      router.push('/onboarding-new/profile?context=profile-only');
      return;
    }
    setWizardOpen(true);
  }, [profile?.id, profile?.core?.name, router]);

  // ── Render guards ────────────────────────────────────────────────────────
  // While feature flags haven't arrived yet, show the same loading spinner
  // used by the profile-hydration guard below. Without this, the component
  // briefly renders with enableLeagues=false (the safe default) which can
  // flash the "city not connected" state before the real flags are known.
  if (flagsLoading || !_hasHydrated || access.isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען...</p>
      </div>
    );
  }

  if (!featureFlags.enableCommunityFeed && !featureFlags.enableLeagues) return null;

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC]">
      {/* ── Shared App Header ───────────────────────────────────────────────
            Top-level tabs (פיד / ליגות) and the active sub-bar live INSIDE
            the AppHeader's children slot so they collapse together as one
            sticky unit. ─────────────────────────────────────────────────── */}
      <AppHeader zIndex={30}>
        {/* Top-level tabs — underline style (matches ExerciseReplacementModal
            + FreeRunSummary). No pill chrome, no background fill — just text
            with a 2px bottom accent on the active item and a hairline rule
            below the row. */}
        <div className="max-w-md mx-auto px-5" dir="rtl">
          <div
            className="flex border-b border-slate-100 dark:border-slate-800"
            role="tablist"
            aria-label="קהילה"
          >
            {IS_COMMUNITY_FEED_ENABLED && (
              <button
                type="button"
                role="tab"
                aria-selected={topTab === 'feed'}
                onClick={() => setTopTab('feed')}
                className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                  topTab === 'feed'
                    ? 'text-[#00ADEF] border-[#00ADEF]'
                    : 'text-slate-400 dark:text-slate-500 border-transparent'
                }`}
              >
                פיד
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={topTab === 'leagues'}
              onClick={() => setTopTab('leagues')}
              className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                topTab === 'leagues'
                  ? 'text-[#00ADEF] border-[#00ADEF]'
                  : 'text-slate-400 dark:text-slate-500 border-transparent'
              }`}
            >
              ליגות
            </button>
          </div>
        </div>

        {/* No sub-bar in the AppHeader anymore — the leagues sub-tabs were
            replaced by the LeagueCarousel rendered inline below. The feed
            tab also has no sub-tabs (discover lives at /search?tab=social). */}
      </AppHeader>

      {/* ── Drawers (mounted globally for the page so deep links work in
            either tab) ─────────────────────────────────────────────────── */}
      <GroupDetailsDrawer
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        group={selectedGroup}
        onJoin={handleJoinGroup}
        onLeave={handleLeaveGroup}
        isJoined={selectedGroup ? (joinedGroupIds.has(selectedGroup.id) || selectedGroup.createdBy === userId) : false}
        joining={selectedGroup ? joiningId === selectedGroup.id : false}
        onOpenChat={() => { setSelectedGroup(null); openChat(); }}
        onEdit={(id) => { setSelectedGroup(null); setEditGroupId(id); setWizardOpen(true); }}
      />

      <SessionDrawer
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        onJoin={handleJoinEvent}
        isJoined={selectedEvent ? joinedEventIds.has(selectedEvent.id) : false}
        joining={selectedEvent ? joiningId === selectedEvent.id : false}
      />

      <PostJoinSuccessDrawer
        isOpen={!!successData}
        onClose={() => setSuccessData(null)}
        name={successData?.name ?? ''}
        verb={successData?.verb ?? 'יתאמן'}
        onOpenChat={() => { setSuccessData(null); openChat(); }}
        scheduleSlots={successData?.scheduleSlots}
        category={successData?.category}
        address={successData?.address}
        onPlannerPref={handlePlannerPref}
      />

      <CreateGroupWizard
        isOpen={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditGroupId(null); }}
        onSuccess={handleGroupCreated}
        editGroupId={editGroupId ?? undefined}
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
              {renderFeedTab()}
            </m.div>
          ) : (
            <m.div
              key="leagues"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderLeaguesTab()}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  // ─── Feed tab ───────────────────────────────────────────────────────────

  function renderFeedTab() {
    const circles = (
      <CommunityCircles
        onGroupClick={(group) => setSelectedGroup(group)}
        onCreatePress={handleCreatePress}
      />
    );

    if (loadingPosts && posts.length === 0) {
      return (
        <div className="space-y-4 -mx-4">
          {circles}
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-gray-500 animate-pulse">טוען פיד...</p>
          </div>
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div className="space-y-4 -mx-4">
          {circles}
          <div className="flex flex-col items-center justify-center py-16 text-center px-4" dir="rtl">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-900">הפיד שלך ריק</p>
            <p className="text-xs text-gray-600 mt-1 max-w-[240px]">
              סיים אימון כדי לפרסם את הפוסט הראשון שלך, או חפש שותפים ועקוב אחריהם
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 -mx-4">
        {circles}
        <div className="px-4 space-y-3">
          <div className="flex items-center justify-between px-1 pt-2" dir="rtl">
            <span className="text-[11px] text-gray-500">
              עוקב אחרי {following.length} שותפים
            </span>
            <button
              onClick={fetchPosts}
              className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
              aria-label="רענן"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loadingPosts ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {posts.map((post) => (
            <m.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <FeedPostCard
                post={post}
                currentUid={userId}
                onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              />
            </m.div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Leagues tab (was /arena) ───────────────────────────────────────────

  function renderLeaguesTab() {
    const cards = buildLeagueCards();
    const activeCard = cards.find((c) => c.key === selectedLeague);

    // Sticky my-rank footer — shown only when:
    //   1. The user has an entry in the currently-active leaderboard, AND
    //   2. They're outside the top 3 (top 3 are already on the podium).
    // The bar floats just above the BottomNavbar by matching the same
    // `3rem + safe-area-inset-bottom` offset that ClientLayout uses for
    // the main scroll container's paddingBottom.
    const showStickyMyRank = !!activeMyEntry && activeMyEntry.rank > 3;

    const handleShareMyRank = () => {
      if (!activeMyEntry) return;
      const scopeName = activeCard?.name || 'הליגה';
      const windowHe = leaderboardTimeWindow === 'weekly' ? 'השבוע' : 'החודש';
      const text = `אני במקום #${activeMyEntry.rank} ב${scopeName} ${windowHe} על Out! 🔥`;
      if (navigator.share) {
        navigator.share({ text }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
    };

    return (
      <>
        {/* League selector — a single summary button showing the active league.
            Tapping it opens the bottom-sheet selector (replaces the old inline
            horizontal carousel). The "+" create CTA now lives inside the sheet. */}
        {arenaLoading ? (
          <div
            className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 bg-white border border-gray-200 mb-3"
            dir="rtl"
          >
            <div className="w-11 h-11 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-3.5 w-32 rounded bg-gray-200 animate-pulse" />
              <div className="h-2.5 w-24 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLeagueSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={leagueSheetOpen}
            className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 bg-white border border-gray-200 shadow-subtle active:scale-[0.98] transition-transform mb-3"
            dir="rtl"
          >
            <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {activeCard?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeCard.logoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl leading-none">
                  {activeCard?.emoji ?? '🏆'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-gray-900 text-sm truncate">
                  {activeCard?.name ?? 'בחר ליגה'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
              <div className="text-xs text-gray-500 truncate">
                {activeCard?.subtitle ? `${activeCard.subtitle} • ` : ''}
                {getFilterLabel()}
              </div>
            </div>
            {activeMyEntry?.rank != null && (
              <div className="flex flex-col items-center flex-shrink-0 leading-none">
                <span
                  className="font-black tabular-nums text-sm"
                  style={{ color: '#1D9E75' }}
                >
                  #{activeMyEntry.rank}
                </span>
                <span className="text-gray-400 mt-0.5" style={{ fontSize: 9 }}>
                  דירוג
                </span>
              </div>
            )}
          </button>
        )}

        {/* Bottom-sheet league selector */}
        <AnimatePresence>
          {leagueSheetOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] bg-black/40"
                onClick={() => setLeagueSheetOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                className="fixed bottom-0 left-0 right-0 z-[91] bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto"
                style={{ maxHeight: '85vh' }}
                dir="rtl"
              >
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-gray-200" />
                </div>
                <div
                  className="px-5 pb-8 pt-2 overflow-y-auto"
                  style={{ maxHeight: 'calc(85vh - 40px)' }}
                >
                  <h3 className="text-base font-black text-gray-900 mb-3 text-right">
                    בחר ליגה
                  </h3>
                  <LeagueCarousel
                    mode="sheet"
                    leagues={cards}
                    selectedKey={selectedLeague}
                    onSelect={(key) => {
                      setSelectedLeague(key);
                      setLeagueSheetOpen(false);
                    }}
                    activeFilterLabel={getFilterLabel()}
                    isLoading={arenaLoading}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedLeague}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {selectedLeague === 'global' && renderGlobalSegment()}
            {selectedLeague === 'city' && renderCitySegment()}
            {selectedLeague === 'org' && renderOrgSegment()}
            {selectedLeague === 'park' && renderParkSegment()}
            {selectedLeague.startsWith('league_') && renderLeagueSegment(selectedLeague.slice(7))}
          </motion.div>
        </AnimatePresence>

        {/* Sticky "my rank" footer — replaces the old per-leaderboard inline
            "you" card. Sits inside the page's max-w-md column, sticks to the
            bottom of the scroll container with a `bottom` offset that matches
            the BottomNavbar's exact rendered height:
              pt-0.5 (2px) + min-h-[44px] (44px) + safe-area-inset-bottom
              = calc(46px + env(safe-area-inset-bottom, 0px))
            so the bar sits flush on top of the nav with no visible gap.
            A 32px transparent→white gradient cap above the bar fades the
            scroll content into the white surface so the row underneath
            doesn't visually clip into the bar's top border.
            Hidden when the user is on the podium (top 3) since they're
            already visible there. */}
        {showStickyMyRank && activeMyEntry && (
          <div
            className="sticky z-10 -mx-4 px-4 pointer-events-none"
            style={{
              bottom: 'calc(46px + env(safe-area-inset-bottom, 0px))',
            }}
            dir="rtl"
          >
            {/* Gradient fade — purely decorative, pointer-events:none via
                the wrapper. Sits flush above the white bar (no margin) so
                the fade meets the bar's top edge cleanly. */}
            <div
              aria-hidden
              style={{
                height: 32,
                background:
                  'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1))',
              }}
            />

            <div
              className="pointer-events-auto flex items-center gap-3 rounded-2xl shadow-floating"
              style={{
                background: 'rgba(255,255,255,0.82)',
                backdropFilter: 'blur(14px) saturate(160%)',
                WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                border: '0.5px solid rgba(229,231,235,0.9)',
                padding: '8px 12px 8px 8px',
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white"
                style={{
                  background: 'linear-gradient(135deg, #2BB587, #147C5C)',
                  boxShadow: '0 4px 12px rgba(20,124,92,0.35)',
                }}
              >
                <span className="text-[8px] font-bold leading-none opacity-80">דירוג</span>
                <span className="text-sm font-black tabular-nums leading-tight">
                  {activeMyEntry.rank}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900 truncate leading-tight">
                  {activeMyEntry.name}
                </p>
                <p className="text-[11px] text-[#147C5C] font-bold tabular-nums leading-tight">
                  {activeMyEntry.totalCredit.toLocaleString('he-IL')} קרדיט
                </p>
              </div>
              <button
                type="button"
                onClick={handleShareMyRank}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-black active:scale-95 transition-transform flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #2BB587, #147C5C)',
                  boxShadow: '0 4px 12px rgba(20,124,92,0.3)',
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                שתף
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ─── League carousel — derived from `access` + bubbled rank ─────────────

  function buildLeagueCards(): LeagueCardData[] {
    const cards: LeagueCardData[] = [];

    // Order requested by spec: city → global → org → park.
    if (access.hasCityAccess) {
      cards.push({
        key: 'city',
        name: 'ליגת העיר',
        subtitle: access.cityName ?? undefined,
        emoji: '🏙️',
        logoUrl: authority?.logoUrl,
        // authority.userCount is denormalized on the authority doc — already
        // loaded by useArenaData, so no extra query needed.
        memberCount: authority?.userCount ?? null,
        rank: selectedLeague === 'city' ? activeMyEntry?.rank ?? null : null,
      });
    }

    cards.push({
      key: 'global',
      name: 'ליגה ארצית',
      subtitle: 'כל ישראל',
      emoji: '🌍',
      memberCount:
        selectedLeague === 'global' && activeMyEntry
          ? // Active card → use the bubbled entries.length proxy (no extra
            //  query). For inactive cards we deliberately show "—".
            null
          : null,
      rank: selectedLeague === 'global' ? activeMyEntry?.rank ?? null : null,
    });

    if (access.orgType) {
      const orgEmoji =
        access.orgType === 'work'
          ? '🏢'
          : access.orgType === 'university'
            ? '🎓'
            : access.orgType === 'youth_movement'
              ? '⛺'
              : '🏫';
      const orgName =
        access.orgType === 'work'
          ? 'ליגת העבודה'
          : access.orgType === 'university'
            ? 'ליגת הקמפוס'
            : access.orgType === 'youth_movement'
              ? 'ליגת התנועה'
              : 'ליגת בית הספר';
      cards.push({
        key: 'org',
        name: orgName,
        subtitle: access.orgName ?? undefined,
        emoji: orgEmoji,
        memberCount: null,
        rank: selectedLeague === 'org' ? activeMyEntry?.rank ?? null : null,
      });
    }

    if (access.preferredParkId) {
      cards.push({
        key: 'park',
        name: 'ליגת הפארק',
        subtitle: access.preferredParkName ?? undefined,
        emoji: '🌳',
        memberCount: null,
        rank: selectedLeague === 'park' ? activeMyEntry?.rank ?? null : null,
      });
    }

    // Social leagues — family / friends groups (always private, not city-bound)
    for (const g of socialGroups) {
      const cardKey = `league_${g.id}`;
      cards.push({
        key: cardKey,
        name: g.name,
        subtitle: g.memberCount ? `${g.memberCount} חברים` : undefined,
        emoji: g.groupType === 'family' ? '👨‍👩‍👧' : '👥',
        memberCount: g.memberCount ?? null,
        rank: selectedLeague === cardKey ? activeMyEntry?.rank ?? null : null,
      });
    }

    return cards;
  }

  function getFilterLabel(): string {
    const categoryLabel =
      leaderboardCategory === 'overall'
        ? 'כללי'
        : leaderboardCategory === 'cardio'
          ? 'ריצה'
          : 'כוח';
    const windowLabel = leaderboardTimeWindow === 'weekly' ? 'שבועי' : 'חודשי';
    return `${categoryLabel} • ${windowLabel}`;
  }

  function renderCompetitionToggle() {
    return (
      <div
        className="flex border-b border-slate-100"
        dir="rtl"
        role="tablist"
        aria-label="מצב תחרות"
      >
        {(['individual', 'group'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={competitionMode === mode}
            onClick={() => setCompetitionMode(mode)}
            className={`flex-1 py-2.5 text-sm font-bold text-center border-b-2 transition-colors ${
              competitionMode === mode
                ? 'text-[#00ADEF] border-[#00ADEF]'
                : 'text-slate-400 border-transparent'
            }`}
          >
            {mode === 'individual' ? 'יחידים' : 'קבוצות'}
          </button>
        ))}
      </div>
    );
  }

  function renderGlobalSegment() {
    return (
      <div className="space-y-4" dir="rtl">
        {/* יחידים | קבוצות toggle — mirrors city + org segments */}
        {renderCompetitionToggle()}

        {competitionMode === 'individual' ? (
          <NeighborhoodLeaderboard
            scope="global"
            scopeId={null}
            scopeLabel="ארצי"
            isLeagueActive={true}
            isGlobal={true}
            bypassSocialGate={true}
            ageGroup={access.ageGroup}
            category={leaderboardCategory}
            setCategory={setLeaderboardCategory}
            timeWindow={leaderboardTimeWindow}
            setTimeWindow={setLeaderboardTimeWindow}
            genderFilter={leaderboardGender}
            setGenderFilter={setLeaderboardGender}
            onMyEntryChange={setActiveMyEntry}
          />
        ) : (
          <GroupLeaderboard
            scope="global"
            scopeId={null}
            timeWindow={leaderboardTimeWindow}
          />
        )}
      </div>
    );
  }

  function renderCitySegment() {
    if (arenaLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-500 animate-pulse">טוען נתוני עיר...</p>
        </div>
      );
    }

    return (
      <div className="space-y-4" dir="rtl">
        {!isLeagueActive && (
          <>
            <MunicipalPressureCard
              cityName={access.cityName ?? 'העיר שלך'}
              authority={authority}
            />

            <NeighborhoodLeaderboard
              scope="city"
              scopeId={access.cityAuthorityId}
              scopeLabel={access.cityName ?? 'עיר'}
              isLeagueActive={false}
              category={leaderboardCategory}
              setCategory={setLeaderboardCategory}
              timeWindow={leaderboardTimeWindow}
              setTimeWindow={setLeaderboardTimeWindow}
              genderFilter={leaderboardGender}
              setGenderFilter={setLeaderboardGender}
              onMyEntryChange={setActiveMyEntry}
            />
          </>
        )}

        {isLeagueActive && authority && (
          <>
            {/* יחידים | קבוצות toggle */}
            {renderCompetitionToggle()}

            {competitionMode === 'individual' ? (
              <CityArenaView
                authority={authority}
                category={leaderboardCategory}
                setCategory={setLeaderboardCategory}
                timeWindow={leaderboardTimeWindow}
                setTimeWindow={setLeaderboardTimeWindow}
                genderFilter={leaderboardGender}
                setGenderFilter={setLeaderboardGender}
                onMyEntryChange={setActiveMyEntry}
              />
            ) : (
              <GroupLeaderboard
                scope="city"
                scopeId={authority.id}
                timeWindow={leaderboardTimeWindow}
              />
            )}
          </>
        )}
      </div>
    );
  }

  function renderOrgSegment() {
    const orgGroups = groups.filter(
      (g) => g.category === 'calisthenics' || g.category === 'other',
    );

    return (
      <div className="space-y-6" dir="rtl">
        {/* Org identity row removed — the active league card and the small
            label below the carousel already show the org name + emoji. */}

        {access.orgType && (
          <SchoolOutreachCard
            schoolName={
              access.orgName ??
              (access.orgType === 'work'
                ? 'הארגון שלך'
                : access.orgType === 'youth_movement'
                  ? 'התנועה שלך'
                  : 'בית הספר')
            }
            orgType={
              access.orgType === 'work'
                ? 'company'
                : access.orgType === 'youth_movement'
                  ? 'youth_movement'
                  : 'school'
            }
          />
        )}

        {/* יחידים | קבוצות toggle */}
        {renderCompetitionToggle()}

        {competitionMode === 'individual' ? (
          <NeighborhoodLeaderboard
            scope="school"
            scopeId={access.orgId}
            scopeLabel={access.orgName ?? 'הארגון שלך'}
            isLeagueActive={true}
            category={leaderboardCategory}
            setCategory={setLeaderboardCategory}
            timeWindow={leaderboardTimeWindow}
            setTimeWindow={setLeaderboardTimeWindow}
            genderFilter={leaderboardGender}
            setGenderFilter={setLeaderboardGender}
            onMyEntryChange={setActiveMyEntry}
          />
        ) : (
          <GroupLeaderboard
            scope="school"
            scopeId={access.orgId ?? ''}
            timeWindow={leaderboardTimeWindow}
          />
        )}

        {orgGroups.length > 0 && competitionMode === 'individual' && (
          <div className="space-y-2.5">
            {orgGroups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderParkSegment() {
    if (!access.preferredParkId) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center" dir="rtl">
          <span className="text-3xl mb-3">🌳</span>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            עוד לא התאמנת בפארק
          </p>
          <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
            כשתתאמנו ליד פארק, הדירוג שלו יופיע כאן אוטומטית
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4" dir="rtl">
        {/* Park identity row removed — the active league card and the small
            label below the carousel already show the park name + 🌳. */}

        <NeighborhoodLeaderboard
          scope="park"
          scopeId={access.preferredParkId}
          scopeLabel={access.preferredParkName ?? 'הפארק שלך'}
          isLeagueActive={true}
          category={leaderboardCategory}
          setCategory={setLeaderboardCategory}
          timeWindow={leaderboardTimeWindow}
          setTimeWindow={setLeaderboardTimeWindow}
          genderFilter={leaderboardGender}
          setGenderFilter={setLeaderboardGender}
          onMyEntryChange={setActiveMyEntry}
        />
      </div>
    );
  }

  function renderLeagueSegment(groupId: string) {
    return (
      <div className="space-y-4" dir="rtl">
        <NeighborhoodLeaderboard
          scope="league"
          scopeId={groupId}
          isLeagueActive={true}
          category={leaderboardCategory}
          setCategory={setLeaderboardCategory}
          timeWindow={leaderboardTimeWindow}
          setTimeWindow={setLeaderboardTimeWindow}
          genderFilter={leaderboardGender}
          setGenderFilter={setLeaderboardGender}
          onMyEntryChange={setActiveMyEntry}
        />
      </div>
    );
  }
}
