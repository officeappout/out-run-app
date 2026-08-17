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
import { Users, RefreshCw, Share2, ChevronDown, UserPlus, SlidersHorizontal } from 'lucide-react';
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
import ScopeCompetitionLeaderboard from '@/features/arena/components/ScopeCompetitionLeaderboard';
import ScopeBattleCard from '@/features/arena/components/ScopeBattleCard';
import LeagueFilterSheet from '@/features/arena/components/LeagueFilterSheet';
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
  ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';
import { formatLeaderboardScore, type LeaderboardMode } from '@/features/arena/components/format-leaderboard-score';
import { CATEGORY_UNIT_LABEL } from '@/features/arena/components/scope-category-unit-label';
import { joinGroup, leaveGroup, getMyGroups } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import { addCommunitySessionsToPlanner } from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityGroup, CommunityEvent, CommunityGroupType } from '@/types/community.types';
import AppHeader from '@/components/ui/AppHeader';

// Types that have a dedicated institutional scope card (city/org) — excluded from
// per-group league cards so the sheet doesn't double-count them.
const INSTITUTIONAL_GROUP_TYPES = new Set<CommunityGroupType>([
  'work', 'university', 'school', 'military', 'youth_movement',
]);

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

// 16.08.2026 design review: hide "ליגת הפארק" from the league selector for
// now — the scope='park' data path (renderParkSegment, useLeaderboard,
// getStreakLeaderboard/getStepsLeaderboard park-scope handling) is untouched.
const SHOW_PARK_LEAGUE = false;

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
  // Feed requires BOTH the compile-time MVP pause to be lifted (IS_COMMUNITY_FEED_ENABLED)
  // AND the live admin toggle (enableCommunityFeed) — the compile flag is a hard
  // ceiling that live-flipping the admin toggle must never bypass. Leagues has no
  // compile-time gate, so it resolves on the live flag alone. Neither a stale
  // ?tab= deep link nor the default (no ?tab=) can ever land on a tab that isn't
  // actually enabled — falls through to whichever surface is live, or to 'feed'
  // as an inert default when neither is (the page-level guard below redirects
  // home in that case before this matters for render).
  const tabParam = searchParams.get('tab');
  const isFeedTabAvailable = IS_COMMUNITY_FEED_ENABLED && featureFlags.enableCommunityFeed;
  const topTab: CommunityTopTab =
    tabParam === 'leagues' && featureFlags.enableLeagues ? 'leagues'
    : tabParam === 'feed' && isFeedTabAvailable ? 'feed'
    : isFeedTabAvailable ? 'feed'
    : featureFlags.enableLeagues ? 'leagues'
    : 'feed';

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
  // Bubbled alongside activeMyEntry (Stage B) — the currently-selected
  // metric mode, so the sticky "your rank" hero can format the score with
  // formatLeaderboardScore instead of a hardcoded generic label.
  const [activeMyMode, setActiveMyMode] = useState<LeaderboardMode>('general');
  const [activeMyIsSegment, setActiveMyIsSegment] = useState(false);
  const handleMyModeChange = (mode: LeaderboardMode, isSegmentMode: boolean) => {
    setActiveMyMode(mode);
    setActiveMyIsSegment(isSegmentMode);
  };
  // Bubbled from the active ScopeBattleCard's own getScopeCompetitionLeaderboard
  // fetch — the current user's SCOPE's own rank/name/totalScore (e.g. "your
  // city, rank #1"), for the Groups-tab "your contribution" hero card. No
  // duplicate fetch — ScopeBattleCard already computes this internally.
  const [activeScopeEntry, setActiveScopeEntry] = useState<ScopeCompetitionEntry | null>(null);

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
      setSocialGroups(all.filter((g) => !g.groupType || !INSTITUTIONAL_GROUP_TYPES.has(g.groupType)));
    }).catch(() => {});
  }, [profile?.social?.groupIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Individual vs group competition toggle ────────────────────────────────
  const [competitionMode, setCompetitionMode] = useState<'individual' | 'group'>('individual');

  // ── Groups-tab axis chooser. 'פלוגות' stays out (Stage G — needs the
  // leaderboard_shards data source, not feed_posts).
  //
  // 16.08.2026 IA fix: "ערים" (city-vs-city) moved from City→Groups to
  // Global→Groups. It was never actually city-scoped —
  // getScopeCompetitionLeaderboard({granularity:'city'}) has no scope
  // filter, it's a nationwide ranking — so nesting it three taps under "my
  // city" was misleading. City→Groups now offers only שכונות + קבוצות,
  // both genuinely scoped to the selected city. Global→Groups gained an
  // axis chooser of its own (ערים / קבוצות) where it didn't have one before.
  // Two separate state variables (not one shared axis) because the two
  // segments now offer different option sets — a stale 'city' value left
  // over from Global shouldn't be silently reinterpreted when the user
  // switches to City.
  type GroupAxis = 'city' | 'neighborhood' | 'group';
  const [cityGroupAxis, setCityGroupAxis] = useState<GroupAxis>('group');
  const [globalGroupAxis, setGlobalGroupAxis] = useState<GroupAxis>('city');
  const [axisMenuOpen, setAxisMenuOpen] = useState(false);
  const [leagueFilterSheetOpen, setLeagueFilterSheetOpen] = useState(false);
  const AXIS_LABEL: Record<GroupAxis, string> = { city: 'ערים', neighborhood: 'שכונות', group: 'קבוצות' };
  // מדד/טווח chips shown read-only next to the scope chooser (Groups mode
  // has no metric/time dropdown of its own — these reflect the shared
  // leaderboardCategory/leaderboardTimeWindow state that Individuals mode
  // and getScopeCompetitionLeaderboard's category filter already drive, per
  // the mockup's .chip pattern. Not a new interactive control.
  // NOTE: must be declared before the component's return statement (like
  // AXIS_LABEL above) — declaring it later, after the return, is a genuine
  // TDZ bug: the return synchronously calls renderLeaguesTab() →
  // renderCitySegment() → renderGroupAxisChooser(), which reads this
  // constant before a later-positioned `const` would have initialized.
  const GROUP_CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
    overall: 'כל הפעילות',
    cardio: 'ריצה',
    strength: 'כוח',
  };

  // Reset to individual whenever the active league card changes.
  useEffect(() => {
    setCompetitionMode('individual');
    setCityGroupAxis('group');
    setGlobalGroupAxis('city');
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
    setLeagueSheetOpen(false); // close league sheet so wizard is not buried beneath it
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
            {isFeedTabAvailable && (
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
            {featureFlags.enableLeagues && (
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
            )}
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
      const windowHe = leaderboardTimeWindow === 'daily' ? 'היום' : leaderboardTimeWindow === 'weekly' ? 'השבוע' : 'החודש';
      const text = `אני במקום #${activeMyEntry.rank} ב${scopeName} ${windowHe} על Out! 🔥`;
      if (navigator.share) {
        navigator.share({ text }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
    };

    // Stage B: "הזמן חברים" alongside "שתף" on the hero — same lightweight
    // native-share/clipboard mechanism as handleShareMyRank, invite-oriented
    // copy instead of a rank announcement. Reuses the existing pattern
    // rather than pulling in a heavier sheet component for a compact bar.
    const handleInviteFromMyRank = () => {
      const scopeName = activeCard?.name || 'הליגה';
      const text = `בוא תצטרף אליי ב${scopeName} על Out! 🔥`;
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
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
              style={activeCard?.logoUrl ? undefined : { background: 'linear-gradient(135deg, #00ADEF, #00dcd0)' }}
            >
              {activeCard?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeCard.logoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl leading-none text-white">
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
                  style={{ color: '#10B981' }}
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
                    createHref="/community?openCreate=true"
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
                  background: 'linear-gradient(135deg, #00ADEF, #00dcd0)',
                  boxShadow: '0 4px 12px rgba(0,173,239,0.35)',
                }}
              >
                <span className="text-[8px] font-bold leading-none opacity-80">דירוג</span>
                <span className="text-sm font-black tabular-nums leading-tight">
                  {activeMyEntry.rank}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-900 truncate leading-tight flex items-center gap-1">
                  {activeMyEntry.name}
                  {/* Streak badge — secondary to the metric-first score below
                      (Stage B). profile.progression.currentStreak is already
                      loaded client-side (no new fetch) and reflects the
                      current user regardless of which metric is selected. */}
                  {!!profile?.progression?.currentStreak && (
                    <span className="text-[10px] font-bold flex-shrink-0" style={{ color: '#f4b400' }} aria-hidden>
                      {profile.progression.currentStreak}🔥
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-[#00ADEF] font-bold tabular-nums leading-tight">
                  {formatLeaderboardScore(activeMyEntry.totalCredit, activeMyMode, activeMyIsSegment)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleInviteFromMyRank}
                aria-label="הזמן חברים"
                className="flex items-center justify-center w-9 h-9 rounded-xl text-[#00ADEF] active:scale-95 transition-transform flex-shrink-0"
                style={{
                  background: 'rgba(0,173,239,0.1)',
                }}
              >
                <UserPlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleShareMyRank}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-black active:scale-95 transition-transform flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #00ADEF, #00dcd0)',
                  boxShadow: '0 4px 12px rgba(0,173,239,0.3)',
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

    // 16.08.2026 design review: park league hidden from the selector for
    // now — code/data path untouched (renderParkSegment, scope='park'
    // queries all still work), flip SHOW_PARK_LEAGUE back to re-surface it.
    if (SHOW_PARK_LEAGUE && access.preferredParkId) {
      cards.push({
        key: 'park',
        name: 'ליגת הפארק',
        subtitle: access.preferredParkName ?? undefined,
        emoji: '🌳',
        memberCount: null,
        rank: selectedLeague === 'park' ? activeMyEntry?.rank ?? null : null,
      });
    }

    // Per-group league cards — all non-institutional groups the user belongs to
    for (const g of socialGroups) {
      const cardKey = `league_${g.id}`;
      const emoji =
        g.groupType === 'family'       ? '👨‍👩‍👧' :
        g.groupType === 'friends'      ? '👥' :
        g.groupType === 'neighborhood' ? '🏘️' :
        g.groupType === 'park'         ? '🌳' :
        '🏃';
      cards.push({
        key: cardKey,
        name: g.name,
        subtitle: g.memberCount ? `${g.memberCount} חברים` : undefined,
        emoji,
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
    const windowLabel = leaderboardTimeWindow === 'daily' ? 'יומי' : leaderboardTimeWindow === 'weekly' ? 'שבועי' : 'חודשי';
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

  // ── Axis chooser for the Groups tab. Reused by both City (שכונות/קבוצות)
  // and Global (ערים/קבוצות) — each passes its own state + option set, since
  // the two segments now offer different axes (see the 16.08.2026 IA-fix
  // note above cityGroupAxis/globalGroupAxis).
  function renderGroupAxisChooser(axis: GroupAxis, setAxis: (a: GroupAxis) => void, options: GroupAxis[]) {
    return (
      <div className="flex items-center gap-2 mb-3" dir="rtl">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setAxisMenuOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={axisMenuOpen}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(90deg, rgba(0,173,239,0.10), rgba(16,185,129,0.10))',
              border: '1px solid #cdeafe',
            }}
          >
            <div className="text-right">
              <span className="text-sm font-black text-gray-900">
                בין {AXIS_LABEL[axis]}
              </span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {axis === 'neighborhood' && access.cityName ? `ב${access.cityName} · ` : ''}
                לחץ להחלפת ציר
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform text-gray-500 ${axisMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {axisMenuOpen && (
            <div
              role="listbox"
              className="absolute z-20 top-full mt-1 w-full rounded-2xl bg-white border border-gray-100 shadow-lg overflow-hidden"
            >
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={axis === opt}
                  onClick={() => { setAxis(opt); setAxisMenuOpen(false); }}
                  className={`w-full text-right px-4 py-3 text-sm font-bold transition-colors ${
                    axis === opt ? 'text-[#10B981] bg-[#EAF9F3]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {AXIS_LABEL[opt]}
                </button>
              ))}
            </div>
          )}
        </div>

        <span
          className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-bold text-gray-500"
          style={{ background: '#f1f4f8', border: '1px solid #e3e8ef' }}
        >
          מדד: <b className="text-gray-900">{GROUP_CATEGORY_LABEL[leaderboardCategory]}</b>
        </span>
        <span
          className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-bold text-gray-900"
          style={{ background: '#f1f4f8', border: '1px solid #e3e8ef' }}
        >
          {leaderboardTimeWindow === 'daily' ? 'יומי' : leaderboardTimeWindow === 'weekly' ? 'שבועי' : 'חודשי'}
        </span>

        {/* פילטרים — same LeagueFilterSheet as the Individuals tab, driving
            the same shared leaderboardGender state; layers on top of the
            מדד/טווח already chosen. */}
        <button
          type="button"
          onClick={() => setLeagueFilterSheetOpen(true)}
          aria-label="פילטרים"
          className="flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            width: 32,
            height: 32,
            borderRadius: 20,
            border: leaderboardGender !== 'all' ? '1px solid #10B981' : '0.5px solid #D1D5DB',
            backgroundColor: leaderboardGender !== 'all' ? '#E1F5EE' : '#FFFFFF',
            color: leaderboardGender !== 'all' ? '#10B981' : '#374151',
          }}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // "התרומה שלך" dark contribution card (mockup, Screens 2/3). Left side =
  // your own real activity total, reusing activeMyEntry/activeMyMode
  // already bubbled from the Individuals tab (zero extra fetch) — note this
  // reflects whichever metric was last selected there, which can lag behind
  // Groups mode's own `leaderboardCategory` filter since nothing here fetches
  // your personal total pre-filtered to it; a fully metric-synced version
  // would need a small new fetch, parked alongside the other per-metric
  // follow-ups. Right side = your scope's real rank, bubbled from
  // ScopeBattleCard's existing getScopeCompetitionLeaderboard fetch.
  function renderScopeContribution(scopeTypeLabel: string) {
    if (!activeScopeEntry) return null;
    const windowPhrase = leaderboardTimeWindow === 'daily' ? 'היום' : leaderboardTimeWindow === 'weekly' ? 'השבוע' : 'החודש';
    return (
      <div
        className="rounded-2xl p-4 text-white relative overflow-hidden mb-3"
        style={{ background: '#0f172a' }}
        dir="rtl"
      >
        <div
          aria-hidden
          className="absolute -top-8 -left-8 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.45), transparent 70%)' }}
        />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px]" style={{ color: '#9fb3c8' }}>
              התרומה שלך {windowPhrase} · {activeScopeEntry.scopeName}
            </p>
            <p className="text-lg font-black mt-0.5 truncate" style={{ color: '#10B981' }}>
              {activeMyEntry
                ? formatLeaderboardScore(activeMyEntry.totalCredit, activeMyMode, activeMyIsSegment)
                : CATEGORY_UNIT_LABEL[leaderboardCategory]}
            </p>
          </div>
          <div
            className="text-center rounded-xl px-3 py-1.5 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
          >
            <p className="text-lg font-black leading-none" style={{ color: '#00ADEF' }}>#{activeScopeEntry.rank}</p>
            <p className="text-[9px] mt-0.5" style={{ color: '#9fb3c8' }}>{scopeTypeLabel}</p>
          </div>
        </div>
      </div>
    );
  }

  // Neighborhood-axis-only invite CTA (mockup Screen 3, Frame A). Uses the
  // real neighborhood name from activeScopeEntry (already bubbled by
  // ScopeBattleCard) — no new fetch. Same native-share/clipboard mechanism
  // as the other invite buttons on this page. Copy is deliberately metric-
  // agnostic ("יותר פעילות") rather than the mockup's "יותר צעדים" — the
  // selected metric might not be steps, and claiming it always is would be
  // dishonest given getScopeCompetitionLeaderboard still sums activityCredit,
  // not a literal step count.
  function renderNeighborhoodInviteCTA() {
    if (!activeScopeEntry) return null;
    const handleInviteNeighbors = () => {
      const text = `בוא תצטרף אליי ב${activeScopeEntry.scopeName} על Out! 🔥`;
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text);
    };
    return (
      <button
        type="button"
        onClick={handleInviteNeighbors}
        className="w-full flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-white text-right active:scale-[0.98] transition-transform"
        style={{ background: 'linear-gradient(90deg, #00ADEF, #00dcd0)' }}
        dir="rtl"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <Users className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black">הזמן שכנים ל{activeScopeEntry.scopeName}</p>
          <p className="text-[11px] opacity-90">יותר חברים = יותר פעילות = יותר סיכוי לנצח</p>
        </div>
      </button>
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
            onMyModeChange={handleMyModeChange}
          />
        ) : (
          <>
            {/* 16.08.2026 IA fix: ערים (city-vs-city, always nationwide —
                see the note above cityGroupAxis) now lives here instead of
                nested under "ליגת העיר", where it was misleading. */}
            {renderGroupAxisChooser(globalGroupAxis, setGlobalGroupAxis, ['city', 'group'])}
            {globalGroupAxis === 'city' && (
              <>
                {renderScopeContribution('העיר שלך')}
                <ScopeBattleCard
                  granularity="city"
                  timeWindow={leaderboardTimeWindow}
                  myScopeId={authority?.id ?? null}
                  category={leaderboardCategory}
                  genderFilter={leaderboardGender}
                  onMyScopeEntryChange={setActiveScopeEntry}
                />
                <ScopeCompetitionLeaderboard
                  granularity="city"
                  timeWindow={leaderboardTimeWindow}
                  category={leaderboardCategory}
                  genderFilter={leaderboardGender}
                />
              </>
            )}
            {globalGroupAxis === 'group' && (
              <GroupLeaderboard
                scope="global"
                scopeId={null}
                timeWindow={leaderboardTimeWindow}
                genderFilter={leaderboardGender}
              />
            )}
          </>
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
            onMyModeChange={handleMyModeChange}
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
            onMyModeChange={handleMyModeChange}
              />
            ) : (
              <>
                {renderGroupAxisChooser(cityGroupAxis, setCityGroupAxis, ['neighborhood', 'group'])}
                {cityGroupAxis === 'neighborhood' && (
                  <>
                    {renderScopeContribution('השכונה שלך')}
                    <ScopeBattleCard
                      granularity="neighborhood"
                      timeWindow={leaderboardTimeWindow}
                      myScopeId={access.neighborhoodAuthorityId}
                      cityAuthorityId={authority.id}
                      category={leaderboardCategory}
                      genderFilter={leaderboardGender}
                      onMyScopeEntryChange={setActiveScopeEntry}
                    />
                    <ScopeCompetitionLeaderboard
                      granularity="neighborhood"
                      timeWindow={leaderboardTimeWindow}
                      cityAuthorityId={authority.id}
                      category={leaderboardCategory}
                      genderFilter={leaderboardGender}
                    />
                    {renderNeighborhoodInviteCTA()}
                  </>
                )}
                {cityGroupAxis === 'group' && (
                  <GroupLeaderboard
                    scope="city"
                    scopeId={authority.id}
                    timeWindow={leaderboardTimeWindow}
                    genderFilter={leaderboardGender}
                  />
                )}
              </>
            )}
          </>
        )}
        <LeagueFilterSheet
          isOpen={leagueFilterSheetOpen}
          onClose={() => setLeagueFilterSheetOpen(false)}
          genderFilter={leaderboardGender}
          onGenderFilterChange={setLeaderboardGender}
        />
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
            scope={access.orgType === 'work' ? 'tenant' : 'school'}
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
            onMyModeChange={handleMyModeChange}
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
          onMyModeChange={handleMyModeChange}
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
          onMyModeChange={handleMyModeChange}
        />
      </div>
    );
  }
}
