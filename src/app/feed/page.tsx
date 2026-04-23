'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Heart,
  MessageCircle,
  Users,
  Compass,
  Trophy,
  Users2,
  Handshake,
  Dumbbell,
  RefreshCw,
} from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { getFeedPosts, type FeedPost } from '@/features/social/services/feed.service';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import { useActivityFeed } from '@/features/social/hooks/useActivityFeed';
import { useChatInbox } from '@/features/social/hooks/useChatInbox';
import FeedPostCard from '@/features/social/components/FeedPostCard';
import EventCard from '@/features/arena/components/EventCard';
import GroupCard from '@/features/arena/components/GroupCard';
import ActivityPanel from '@/features/social/components/ActivityPanel';
import ChatInbox from '@/features/social/components/ChatInbox';
import DiscoverSection from '@/features/social/components/DiscoverSection';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import CommunityCircles from '@/features/arena/components/CommunityCircles';
import CreateGroupWizard from '@/features/arena/components/CreateGroupWizard';
import { useUserLocation } from '@/features/arena/hooks/useUserLocation';
import { haversineKm } from '@/features/arena/utils/distance';
import { joinGroup, leaveGroup, updateGroupLocation } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import {
  addCommunitySessionsToPlanner,
} from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityGroup, CommunityEvent } from '@/types/community.types';

type CommunityTab = 'activity' | 'discover';

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

export default function FeedPage() {
  const { profile, _hasHydrated, refreshProfile } = useUserStore();
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags: featureFlags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);
  const { following, isLoaded: socialLoaded, loadConnections, isPartner } = useSocialStore();
  const access = useArenaAccess();
  const { events, groups, isLoading: arenaLoading } = useArenaData(access.cityAuthorityId);
  const { userCoords } = useUserLocation();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Route guard — redirect when community feed is disabled
  useEffect(() => {
    if (!flagsLoading && !featureFlags.enableCommunityFeed) {
      router.replace('/home');
    }
  }, [flagsLoading, featureFlags.enableCommunityFeed, router]);

  const userId = profile?.id;
  const photoURL = profile?.core?.photoURL;
  const userName = profile?.core?.name ?? 'משתמש';

  const [tab, setTab] = useState<CommunityTab>('activity');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [activityOpen, setActivityOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { unreadCount: activityUnread } = useActivityFeed(userId ?? null);
  const { totalUnread: chatUnread } = useChatInbox(userId ?? null);

  // ── Drawers state ──────────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);

  // ── Deep-link: auto-open group from /join/[code] ───────────────────────────
  // When the page loads with ?groupId=xxx (redirected from the join landing page),
  // switch to the Discover tab, find the group, and open the details drawer.
  useEffect(() => {
    const targetId = searchParams.get('groupId');
    if (!targetId || !groups.length || arenaLoading) return;
    const target = groups.find((g) => g.id === targetId);
    if (target) {
      setTab('discover');
      setSelectedGroup(target);
      router.replace('/feed', { scroll: false });
    }
  }, [searchParams, groups, arenaLoading, router]);

  // ── Deep-link: auto-open edit wizard from profile 'ניהול' button ───────────
  // Handles ?editGroup=xxx from the Creator Hub in the profile page.
  useEffect(() => {
    const editId = searchParams.get('editGroup');
    if (!editId) return;
    setEditGroupId(editId);
    setWizardOpen(true);
    router.replace('/feed', { scroll: false });
  }, [searchParams, router]);

  // ── Join state ─────────────────────────────────────────────────────────────
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // ── Success drawer state ───────────────────────────────────────────────────
  const [successData, setSuccessData] = useState<{
    name: string;
    verb: string;
    groupId?: string;
    scheduleSlots?: import('@/types/community.types').ScheduleSlot[];
    category?: string;
    address?: string;
  } | null>(null);

  useEffect(() => {
    if (_hasHydrated && userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [_hasHydrated, userId, socialLoaded, loadConnections]);

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
      console.error('[FeedPage] fetchPosts failed:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [userId, following, isPartner]);

  useEffect(() => {
    if (socialLoaded && userId) {
      fetchPosts();
    }
  }, [socialLoaded, userId, fetchPosts]);

  // ── Join handlers ──────────────────────────────────────────────────────────

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
      console.error('[FeedPage] joinGroup failed:', err);
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
      console.error('[FeedPage] joinEvent failed:', err);
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
      console.error('[FeedPage] leaveGroup failed:', err);
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
      ).catch((err) => console.warn('[FeedPage] planner sync failed:', err));
    },
    [userId, successData],
  );

  // ── Wizard: group creation success ────────────────────────────────────────

  const handleGroupCreated = useCallback(
    async (groupId: string) => {
      setWizardOpen(false);
      setEditGroupId(null);
      if (!editGroupId) {
        // New group: immediately mark as joined in local state
        setJoinedGroupIds((prev) => new Set([...prev, groupId]));
      }
      // Refresh the profile/arena data to reflect changes
      try { await refreshProfile(); } catch { /* non-fatal */ }
    },
    [refreshProfile, editGroupId],
  );

  // ── Audience + geo filtering helpers ──────────────────────────────────────
  const userGender = profile?.core?.gender;
  const userAuthorityId = access.cityAuthorityId;
  const userAffiliations = profile?.core?.affiliations ?? [];
  const userAge = (() => {
    const bd = profile?.core?.birthDate;
    if (!bd) return undefined;
    const d = bd instanceof Date ? bd : new Date(bd);
    if (isNaN(d.getTime())) return undefined;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  })();

  const matchesAudience = useCallback(
    (item: {
      name?: string;
      targetGender?: string;
      targetAgeRange?: { min?: number; max?: number };
      isCityOnly?: boolean;
      restrictedNeighborhoodId?: string;
      authorityId?: string;
    }) => {
      if (item.targetGender && item.targetGender !== 'all' && userGender && item.targetGender !== userGender) {
        return false;
      }
      if (item.targetAgeRange && userAge != null) {
        if (item.targetAgeRange.min != null && userAge < item.targetAgeRange.min) return false;
        if (item.targetAgeRange.max != null && userAge > item.targetAgeRange.max) return false;
      }
      if (item.isCityOnly && item.authorityId && userAuthorityId && item.authorityId !== userAuthorityId) {
        return false;
      }
      if (item.restrictedNeighborhoodId) {
        const userNeighborhoods = userAffiliations
          .filter((a: { type?: string }) => a.type === 'city' || a.type === 'neighborhood')
          .map((a: { id?: string }) => a.id);
        if (!userNeighborhoods.includes(item.restrictedNeighborhoodId)) return false;
      }
      return true;
    },
    [userGender, userAge, userAuthorityId, userAffiliations],
  );

  // Discover tab — events
  const races = events.filter((e) => e.category === 'race' && matchesAudience(e));
  const meetups = events.filter((e) => e.category === 'community_meetup' && matchesAudience(e));

  // Discover tab — 3-tier groups, memoized, sorted by distance (closest first)
  const tierGroups = useMemo(() => {
    const active = groups.filter((g) => g.isActive && matchesAudience(g));

    const distOf = (g: CommunityGroup): number | undefined => {
      if (!userCoords) return undefined;
      const loc = g.meetingLocation?.location;
      if (!loc || (loc.lat === 0 && loc.lng === 0)) return undefined;
      return haversineKm(userCoords.lat, userCoords.lng, loc.lat, loc.lng);
    };

    const withDist = active.map((g) => ({ group: g, distanceKm: distOf(g) }));

    const byDist = (arr: typeof withDist) =>
      [...arr].sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });

    return {
      // Tier 1 — Official: ONLY explicit authority source OR isOfficial flag.
      // Negative checks are intentionally avoided so that groups without a
      // source field do NOT bleed into the official section.
      official: byDist(
        withDist.filter(
          ({ group: g }) => g.source === 'authority' || g.isOfficial === true,
        ),
      ),

      // Tier 2 — Professional / paid.
      // Strictly source === 'professional', or legacy groups with a price that
      // are neither user-created nor officially flagged.
      professional: byDist(
        withDist.filter(
          ({ group: g }) =>
            g.source === 'professional' ||
            ((g.price ?? 0) > 0 && g.source !== 'user' && !g.isOfficial),
        ),
      ),

      // Tier 3 — Community groups: strictly source === 'user' only.
      // The broad fallback (!source && !isOfficial) has been removed now that:
      //   1. normalizeGroup correctly reads source from Firestore
      //   2. admin createGroup/updateGroup always writes source: 'authority'
      //   3. migrateLegacyGroupsToAuthority() stamps all pre-existing docs
      community: byDist(withDist.filter(({ group: g }) => g.source === 'user')),
    };
  }, [groups, userCoords, matchesAudience]);

  // While flag is loading or disabled, render nothing (redirect fires from useEffect above)
  if (flagsLoading || !featureFlags.enableCommunityFeed) return null;

  if (!_hasHydrated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between" dir="rtl">
          {/* Right zone (RTL = visually left): Profile + Plus */}
          <div className="flex items-center gap-2">
            <Link href="/profile" className="block">
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoURL}
                  alt="פרופיל"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-cyan-200/60"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
              )}
            </Link>
            <Link
              href="/arena/create"
              className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
              aria-label="יצירת פעילות"
            >
              <Plus className="w-5 h-5 text-gray-700" />
            </Link>
          </div>

          {/* Center: Logo */}
          <h1 className="text-lg font-black text-gray-900 tracking-tight select-none">
            OutRun
          </h1>

          {/* Left zone (RTL = visually right): Search + Heart + Chat */}
          <div className="flex items-center gap-0.5">
            <Link
              href="/search"
              className="p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
              aria-label="חיפוש"
            >
              <Search className="w-4.5 h-4.5 text-gray-500" />
            </Link>

            <button
              onClick={() => setActivityOpen(true)}
              className="relative p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
              aria-label="פעילות"
            >
              <Heart className="w-4.5 h-4.5 text-gray-500" />
              {activityUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center px-1 shadow-sm">
                  {activityUnread > 99 ? '99+' : activityUnread}
                </span>
              )}
            </button>

            <button
              onClick={() => setChatOpen(true)}
              className="relative p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
              aria-label="הודעות"
            >
              <MessageCircle className="w-4.5 h-4.5 text-gray-500" />
              {chatUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-cyan-500 text-white text-[9px] font-black flex items-center justify-center px-1 shadow-sm">
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Segmented Control ──────────────────────────────────── */}
        <div className="max-w-md mx-auto px-5 pb-3">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setTab('activity')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                tab === 'activity'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              פעילות
            </button>
            <button
              onClick={() => setTab('discover')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                tab === 'discover'
                  ? 'bg-white text-cyan-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              גלה
            </button>
          </div>
        </div>
      </header>

      {/* ── Overlay Panels ──────────────────────────────────────── */}
      <ActivityPanel isOpen={activityOpen} onClose={() => setActivityOpen(false)} />
      <ChatInbox isOpen={chatOpen} onClose={() => setChatOpen(false)} />

      {/* ── Group Details Drawer ─────────────────────────────────── */}
      <GroupDetailsDrawer
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        group={selectedGroup}
        onJoin={handleJoinGroup}
        onLeave={handleLeaveGroup}
        isJoined={selectedGroup ? joinedGroupIds.has(selectedGroup.id) : false}
        joining={selectedGroup ? joiningId === selectedGroup.id : false}
        onOpenChat={() => { setSelectedGroup(null); setChatOpen(true); }}
        onEdit={(id) => { setSelectedGroup(null); setEditGroupId(id); setWizardOpen(true); }}
      />

      {/* ── Event Details Drawer (SessionDrawer) ─────────────────── */}
      <SessionDrawer
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        event={selectedEvent}
        onJoin={handleJoinEvent}
        isJoined={selectedEvent ? joinedEventIds.has(selectedEvent.id) : false}
        joining={selectedEvent ? joiningId === selectedEvent.id : false}
      />

      {/* ── Post-Join Success Drawer ─────────────────────────────── */}
      <PostJoinSuccessDrawer
        isOpen={!!successData}
        onClose={() => setSuccessData(null)}
        name={successData?.name ?? ''}
        verb={successData?.verb ?? 'יתאמן'}
        onOpenChat={() => { setSuccessData(null); setChatOpen(true); }}
        scheduleSlots={successData?.scheduleSlots}
        category={successData?.category}
        address={successData?.address}
        onPlannerPref={handlePlannerPref}
      />

      {/* ── Create Group Wizard ──────────────────────────────────── */}
      <CreateGroupWizard
        isOpen={wizardOpen}
        onClose={() => { setWizardOpen(false); setEditGroupId(null); }}
        onSuccess={handleGroupCreated}
        editGroupId={editGroupId ?? undefined}
      />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <AnimatePresence mode="wait">
          {tab === 'activity' ? (
            <motion.div
              key="activity"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderActivityTab()}
            </motion.div>
          ) : (
            <motion.div
              key="discover"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderDiscoverTab()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  // ── Activity tab (feed posts) ──────────────────────────────────────────────

  function renderActivityTab() {
    const circles = (
      <CommunityCircles
        onGroupClick={(group) => setSelectedGroup(group)}
        onDiscoverPress={() => setTab('discover')}
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
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <FeedPostCard post={post} currentUid={userId} />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ── Discover tab (horizontal sliders) ──────────────────────────────────────

  function renderDiscoverTab() {
    if (arenaLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-500 animate-pulse">טוען אירועים וקבוצות...</p>
        </div>
      );
    }

    const hasContent =
      races.length > 0 ||
      meetups.length > 0 ||
      tierGroups.official.length > 0 ||
      tierGroups.professional.length > 0 ||
      tierGroups.community.length > 0;

    if (!hasContent) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center" dir="rtl">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Compass className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-900">אין פעילויות באזורך</p>
          <p className="text-xs text-gray-600 mt-1 max-w-[260px]">
            {access.hasCityAccess
              ? 'אירועים וקבוצות חדשים יופיעו כאן ברגע שהעיר שלך תיצור אותם'
              : 'חבר GPS כדי לגלות פעילויות ואירועים באזורך'}
          </p>
          <button
            onClick={() => setWizardOpen(true)}
            className="mt-5 flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black shadow-lg shadow-cyan-500/30 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            צור קהילה ראשונה
          </button>
        </div>
      );
    }

    return (
      <div className="relative space-y-6">
        {/* 1. Races — only rendered when data exists */}
        {races.length > 0 && (
          <DiscoverSection
            title="מרוצים ותחרויות"
            icon={<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-sm"><Trophy className="w-4 h-4 text-white" /></div>}
            isEmpty={false}
          >
            {races.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onJoin={handleJoinEvent}
                isJoined={joinedEventIds.has(event.id)}
                joining={joiningId === event.id}
                onCardClick={() => setSelectedEvent(event)}
              />
            ))}
          </DiscoverSection>
        )}

        {/* 2. Tier 1 — Official city groups */}
        {tierGroups.official.length > 0 && (
          <DiscoverSection
            title="קהילות עירוניות"
            icon={<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm"><Users2 className="w-4 h-4 text-white" /></div>}
            isEmpty={false}
          >
            {tierGroups.official.map(({ group, distanceKm }) => (
              <GroupCard
                key={group.id}
                group={group}
                distanceKm={distanceKm}
                isJoined={joinedGroupIds.has(group.id)}
                joining={joiningId === group.id}
                onJoin={handleJoinGroup}
                onCardClick={() => setSelectedGroup(group)}
                onOpenChat={() => setChatOpen(true)}
              />
            ))}
          </DiscoverSection>
        )}

        {/* 3. Tier 2 — Professional / paid groups */}
        {tierGroups.professional.length > 0 && (
          <DiscoverSection
            title="מאמנים ומקצוענים"
            icon={<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-sm"><Dumbbell className="w-4 h-4 text-white" /></div>}
            isEmpty={false}
          >
            {tierGroups.professional.map(({ group, distanceKm }) => (
              <GroupCard
                key={group.id}
                group={group}
                distanceKm={distanceKm}
                isJoined={joinedGroupIds.has(group.id)}
                joining={joiningId === group.id}
                onJoin={handleJoinGroup}
                onCardClick={() => setSelectedGroup(group)}
                onOpenChat={() => setChatOpen(true)}
              />
            ))}
          </DiscoverSection>
        )}

        {/* 4. Tier 3 — Community / user-created groups */}
        {tierGroups.community.length > 0 && (
          <DiscoverSection
            title="קבוצות חברים"
            icon={<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm"><Handshake className="w-4 h-4 text-white" /></div>}
            isEmpty={false}
          >
            {tierGroups.community.map(({ group, distanceKm }) => {
              // Only the group creator + a known user location can trigger the fix.
              const canFixLocation = userId === group.createdBy && !!userCoords;
              return (
                <GroupCard
                  key={group.id}
                  group={group}
                  distanceKm={distanceKm}
                  isJoined={joinedGroupIds.has(group.id)}
                  joining={joiningId === group.id}
                  onJoin={handleJoinGroup}
                  onCardClick={() => setSelectedGroup(group)}
                  onOpenChat={() => setChatOpen(true)}
                  onUpdateLocation={
                    canFixLocation
                      ? () => {
                          updateGroupLocation(group.id, userCoords!).then(() => {
                            window.location.reload();
                          });
                        }
                      : undefined
                  }
                />
              );
            })}
          </DiscoverSection>
        )}

        {/* 5. Community Meetup events */}
        {meetups.length > 0 && (
          <DiscoverSection
            title="מפגשים"
            icon={<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm"><Handshake className="w-4 h-4 text-white" /></div>}
            isEmpty={false}
          >
            {meetups.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onJoin={handleJoinEvent}
                isJoined={joinedEventIds.has(event.id)}
                joining={joiningId === event.id}
                onCardClick={() => setSelectedEvent(event)}
              />
            ))}
          </DiscoverSection>
        )}

        {/* ── FAB: Create Community ───────────────────────────── */}
        <div className="flex justify-center pt-2 pb-4">
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black shadow-lg shadow-cyan-500/30 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            צור קהילה חדשה
          </button>
        </div>
      </div>
    );
  }
}
