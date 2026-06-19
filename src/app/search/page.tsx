'use client';

/**
 * /search — Unified Global Search.
 *
 * Three top-level tabs driven by `?tab=` URL param:
 *   ?tab=exercises (default)  — embeds the Exercise Library
 *   ?tab=social               — invite banner + 3 sub-tabs (my partners /
 *                                 discover people / discover groups)
 *   ?tab=events               — events list with category-style filter pills
 *
 * Single search input at the top drives the active tab:
 *   • exercises → writes to `useExerciseLibraryStore.setQuery`
 *   • social    → debounced `searchUsersByName` (in 'discover people'
 *                 sub-tab) and client-side filter for 'discover groups'
 *   • events    → client-side filter on event name + description
 *
 * The search term is local to this page (cleared on tab switch). The
 * exercise store is mirrored from local state so the embedded list stays
 * in sync — and reset to an empty query whenever the user leaves the
 * exercises tab so a stale filter doesn't carry over.
 */

import nextDynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Share2,
  Upload,
  SlidersHorizontal,
} from 'lucide-react';
import AppHeader from '@/components/ui/AppHeader';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import { useUserLocation } from '@/features/arena/hooks/useUserLocation';
import { haversineKm } from '@/features/arena/utils/distance';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import {
  searchUsersByName,
  getUsersByUids,
  type UserSearchResult,
} from '@/features/social/services/user-search.service';
import PartnerCard from '@/features/social/components/PartnerCard';
import EventCard from '@/features/arena/components/EventCard';
import GroupCard from '@/features/arena/components/GroupCard';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import { useCommunitySessionBanner } from '@/features/arena/hooks/useCommunitySessionBanner';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import { joinGroup, leaveGroup } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import { addCommunitySessionsToPlanner } from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityGroup, CommunityEvent } from '@/types/community.types';

// Heavy embedded library — lazy-loaded so the social/events tabs aren't
// punished with the exercise corpus parser on first paint.
const ExerciseLibraryContent = nextDynamic(
  () =>
    import('@/features/content/exercises/client/ExerciseLibraryPage').then(
      (m) => m.ExerciseLibraryContent,
    ),
  { ssr: false },
);

// ── Verb mappings (mirrors /community for consistent success drawer copy) ────
const GROUP_VERB: Record<string, string> = {
  walking: 'ילך',
  running: 'ירוץ',
  yoga: 'יתאמן',
  calisthenics: 'יתאמן',
  cycling: 'ירכב',
  other: 'יתאמן',
};

const EVENT_VERB: Record<string, string> = {
  race: 'ירוץ',
  fitness_day: 'יתאמן',
  workshop: 'ישתתף',
  community_meetup: 'ישתתף',
  other: 'יתאמן',
};

type SearchTopTab = 'groups' | 'people' | 'exercises' | 'events';
type DiscoverMode = 'my' | 'discover';
type EventFilter = 'all' | 'running' | 'walking' | 'strength' | 'near';

const TOP_TABS: { value: SearchTopTab; label: string }[] = [
  { value: 'groups',    label: 'קבוצות' },
  { value: 'people',   label: 'אנשים' },
  { value: 'exercises', label: 'תרגילים' },
  { value: 'events',   label: 'אירועים' },
];

const GROUP_CATEGORY_CHIPS = [
  { key: 'all',          label: 'הכל' },
  { key: 'walking',      label: 'הליכה' },
  { key: 'running',      label: 'ריצה' },
  { key: 'calisthenics', label: 'קליסתניקס' },
  { key: 'cycling',      label: 'רכיבה' },
  { key: 'community',    label: 'קהילתי' },
];

const EVENT_FILTERS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'running', label: 'ריצה' },
  { value: 'walking', label: 'הליכה' },
  { value: 'strength', label: 'כוח' },
  { value: 'near', label: 'קרוב אלי' },
];

const ACCENT = '#00ADEF';

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { profile } = useUserStore();
  const userId = profile?.id ?? null;
  const userName = profile?.core?.name ?? 'משתמש';
  const photoURL = profile?.core?.photoURL;

  const access = useArenaAccess();
  const { events, groups } = useArenaData(access.cityAuthorityId);
  const { userCoords } = useUserLocation();
  const exerciseCount = useExerciseLibraryStore((s) => s.allExercises.length);

  // Live session phase map for group cards (joined groups only)
  const { sessions: bannerSessions } = useCommunitySessionBanner();
  const livePhaseMap = useMemo(() => {
    const map: Record<string, 'approaching' | 'lobby' | 'active'> = {};
    bannerSessions.forEach((s) => {
      if (s.phase === 'approaching' || s.phase === 'lobby' || s.phase === 'active') {
        map[s.groupId] = s.phase;
      }
    });
    return map;
  }, [bannerSessions]);

  // Following list (UIDs) — already kept in sync with Firestore by /community.
  const following = useSocialStore((s) => s.following);
  const socialLoaded = useSocialStore((s) => s.isLoaded);
  const loadConnections = useSocialStore((s) => s.loadConnections);

  // ── Top-level tab from URL ───────────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  const topTab: SearchTopTab =
    tabParam === 'people' || tabParam === 'exercises' || tabParam === 'events'
      ? tabParam
      : 'groups'; // default; 'social' (legacy) also falls here

  const setTopTab = useCallback(
    (next: SearchTopTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'groups') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      const qs = params.toString();
      router.replace(`/search${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );

  // ── Sub-state ────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [discoverMode, setDiscoverMode] = useState<DiscoverMode>('discover');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [groupCategoryFilter, setGroupCategoryFilter] = useState('all');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // ── People discovery (debounced server query, NATIONWIDE) ───────────────
  const [peopleResults, setPeopleResults] = useState<UserSearchResult[]>([]);
  const [peopleSearching, setPeopleSearching] = useState(false);
  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── My partners list (one-shot fetch keyed on `following`) ──────────────
  const [myPartners, setMyPartners] = useState<UserSearchResult[]>([]);
  const [myPartnersLoading, setMyPartnersLoading] = useState(false);

  // ── Drawers ─────────────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(null);
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set());
  const [joinedEventIds, setJoinedEventIds] = useState<Set<string>>(new Set());
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    name: string;
    verb: string;
    groupId?: string;
    scheduleSlots?: import('@/types/community.types').ScheduleSlot[];
    category?: string;
    address?: string;
  } | null>(null);

  // ── Effect: load connections on mount (mirrors /community bootstrap) ─────
  useEffect(() => {
    if (userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [userId, socialLoaded, loadConnections]);

  // ── Effect: hydrate joinedGroupIds from profile ──────────────────────────
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

  // ── Effect: clear search term + reset exercise store on tab switch ───────
  useEffect(() => {
    setSearchTerm('');
    setFilterPanelOpen(false);
    useExerciseLibraryStore.getState().setQuery('');
  }, [topTab]);

  // ── Effect: deep-link from ?groupId= (e.g. from NearbyGroupsRow card tap) ─
  useEffect(() => {
    const groupId = searchParams.get('groupId');
    if (!groupId || !groups.length) return;
    const target = groups.find((g) => g.id === groupId);
    if (!target) return;
    setSelectedGroup(target);
    // Clean the param without triggering a re-render loop
    const params = new URLSearchParams(searchParams.toString());
    params.delete('groupId');
    const qs = params.toString();
    router.replace(`/search${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, groups, router]);

  // ── Effect: mirror searchTerm → exercise store when on exercises tab ────
  useEffect(() => {
    if (topTab === 'exercises') {
      useExerciseLibraryStore.getState().setQuery(searchTerm);
    }
  }, [searchTerm, topTab]);

  // ── Effect: debounced nationwide people search ──────────────────────────
  useEffect(() => {
    if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    if (
      topTab !== 'people' ||
      discoverMode !== 'discover' ||
      searchTerm.trim().length < 2
    ) {
      setPeopleResults([]);
      setPeopleSearching(false);
      return;
    }
    setPeopleSearching(true);
    peopleDebounceRef.current = setTimeout(async () => {
      try {
        // NO authorityId argument → searches all users globally.
        const results = await searchUsersByName(searchTerm);
        setPeopleResults(results);
      } catch (err) {
        console.error('[SearchPage] people search failed:', err);
      } finally {
        setPeopleSearching(false);
      }
    }, 350);
    return () => {
      if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    };
  }, [searchTerm, topTab, discoverMode]);

  // ── Effect: load "my partners" (followed users) when sub-tab opens ──────
  // Re-fetches whenever the `following` array length changes so newly
  // followed users surface without a manual refresh.
  useEffect(() => {
    let cancelled = false;
    if (topTab !== 'people' || discoverMode !== 'my') return;
    if (!socialLoaded) return;
    if (following.length === 0) {
      setMyPartners([]);
      return;
    }
    setMyPartnersLoading(true);
    getUsersByUids(following)
      .then((users) => {
        if (!cancelled) setMyPartners(users);
      })
      .catch((err) => {
        console.error('[SearchPage] getUsersByUids failed:', err);
      })
      .finally(() => {
        if (!cancelled) setMyPartnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topTab, discoverMode, socialLoaded, following]);

  // ── Group / event derived lists ─────────────────────────────────────────
  const termLower = searchTerm.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    let base = discoverMode === 'my'
      ? groups.filter((g) => joinedGroupIds.has(g.id))
      : groups;

    if (groupCategoryFilter !== 'all') {
      base = groupCategoryFilter === 'community'
        ? base.filter((g) => g.source === 'user')
        : base.filter((g) => g.category === groupCategoryFilter);
    }

    if (termLower.length >= 2) {
      base = base.filter(
        (g) =>
          g.name.toLowerCase().includes(termLower) ||
          g.description?.toLowerCase().includes(termLower),
      );
    }

    return base;
  }, [groups, joinedGroupIds, discoverMode, groupCategoryFilter, termLower]);

  // Distance map for groups — used to show travel time on discover cards
  const groupDistances = useMemo<Record<string, number>>(() => {
    if (!userCoords) return {};
    const out: Record<string, number> = {};
    for (const g of groups) {
      const loc = g.meetingLocation?.location;
      if (loc?.lat && loc?.lng && (loc.lat !== 0 || loc.lng !== 0)) {
        out[g.id] = haversineKm(userCoords.lat, userCoords.lng, loc.lat, loc.lng);
      }
    }
    return out;
  }, [groups, userCoords]);

  // Distance-keyed events for the "קרוב אלי" filter — we compute distance
  // up front so we can both filter (drop events with no coords) and sort.
  const eventsWithDistance = useMemo(() => {
    return events.map((e) => {
      const loc = e.location?.location;
      const distanceKm =
        userCoords && loc && (loc.lat !== 0 || loc.lng !== 0)
          ? haversineKm(userCoords.lat, userCoords.lng, loc.lat, loc.lng)
          : undefined;
      return { event: e, distanceKm };
    });
  }, [events, userCoords]);

  const filteredEvents = useMemo(() => {
    let list = eventsWithDistance;

    // Category filter pills. The data model only carries `category`
    // (race/fitness_day/workshop/community_meetup/other), so the
    // running/walking/strength pills additionally fall back to a name+
    // description keyword match — matches the way /community renders the
    // discover sections today.
    if (eventFilter === 'running') {
      list = list.filter(
        ({ event: e }) =>
          e.category === 'race' ||
          /ריצ|מרוץ|run/i.test(e.name) ||
          /ריצ|מרוץ|run/i.test(e.description ?? ''),
      );
    } else if (eventFilter === 'walking') {
      list = list.filter(
        ({ event: e }) =>
          /הליכה|walk/i.test(e.name) ||
          /הליכה|walk/i.test(e.description ?? ''),
      );
    } else if (eventFilter === 'strength') {
      list = list.filter(
        ({ event: e }) =>
          e.category === 'fitness_day' ||
          /כוח|strength|כושר/i.test(e.name) ||
          /כוח|strength|כושר/i.test(e.description ?? ''),
      );
    } else if (eventFilter === 'near') {
      list = list
        .filter(({ distanceKm }) => distanceKm != null)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    if (termLower.length >= 2) {
      list = list.filter(
        ({ event: e }) =>
          e.name.toLowerCase().includes(termLower) ||
          e.description?.toLowerCase().includes(termLower),
      );
    }

    return list;
  }, [eventsWithDistance, eventFilter, termLower]);

  // ── Join handlers (mirror /community) ───────────────────────────────────
  const handleJoinGroup = useCallback(
    async (groupId: string) => {
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
        console.error('[SearchPage] joinGroup failed:', err);
      } finally {
        setJoiningId(null);
      }
    },
    [userId, userName, groups, selectedGroup],
  );

  const handleJoinEvent = useCallback(
    async (eventId: string) => {
      if (!userId) return;
      setJoiningId(eventId);
      try {
        await joinEvent(eventId, userId, userName, photoURL ?? undefined);
        setJoinedEventIds((prev) => new Set([...prev, eventId]));
        const event = events.find((e) => e.id === eventId) ?? selectedEvent;
        setSelectedEvent(null);
        if (event) {
          setSuccessData({
            name: event.name,
            verb: EVENT_VERB[event.category] ?? 'יתאמן',
          });
        }
      } catch (err) {
        console.error('[SearchPage] joinEvent failed:', err);
      } finally {
        setJoiningId(null);
      }
    },
    [userId, userName, photoURL, events, selectedEvent],
  );

  const handleLeaveGroup = useCallback(
    async (groupId: string) => {
      if (!userId) return;
      try {
        await leaveGroup(groupId, userId);
        setJoinedGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      } catch (err) {
        console.error('[SearchPage] leaveGroup failed:', err);
      }
    },
    [userId],
  );

  const handlePlannerPref = useCallback(
    (addToPlanner: boolean) => {
      if (
        !addToPlanner ||
        !userId ||
        !successData?.groupId ||
        !successData.scheduleSlots?.length
      )
        return;
      addCommunitySessionsToPlanner(
        userId,
        successData.groupId,
        successData.name,
        successData.category ?? 'other',
        successData.scheduleSlots,
      ).catch((err) =>
        console.warn('[SearchPage] planner sync failed:', err),
      );
    },
    [userId, successData],
  );


  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: '5rem' }}
    >
      {/* ── Shared App Header — search input + 3 main tabs collapse together
            with the global header so the entire chrome moves as a unit. ── */}
      <AppHeader zIndex={30}>
        <div className="max-w-md mx-auto px-5 pb-3" dir="rtl">
          {/* Search input */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={getPlaceholder(topTab, discoverMode)}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
              aria-label="חיפוש"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-0.5 rounded-full hover:bg-gray-200 transition-colors"
                aria-label="נקה חיפוש"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Four-tab bar with counts */}
        <div className="max-w-md mx-auto px-5" dir="rtl">
          <div
            className="flex border-b border-slate-100 dark:border-slate-800"
            role="tablist"
            aria-label="חיפוש"
          >
            {TOP_TABS.map((t) => {
              const count =
                t.value === 'groups'    ? groups.length :
                t.value === 'people'    ? following.length :
                t.value === 'exercises' ? exerciseCount :
                t.value === 'events'    ? events.length : 0;
              const active = topTab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTopTab(t.value)}
                  className={`flex-1 py-3 text-center text-xs font-bold border-b-2 transition-colors min-h-[44px] ${
                    active
                      ? 'text-[#00ADEF] border-[#00ADEF]'
                      : 'text-slate-400 dark:text-slate-500 border-transparent'
                  }`}
                >
                  <span className="inline-flex items-center gap-1 justify-center">
                    {t.label}
                    {count > 0 && (
                      <span
                        className={`inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold leading-none ${
                          active
                            ? 'bg-[#00ADEF] text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Control bar — groups & people tabs only */}
        {(topTab === 'groups' || topTab === 'people') && (
          <div className="max-w-md mx-auto px-5 pt-2 pb-1 flex items-center gap-2" dir="rtl">
            {/* שלי / גלה segmented toggle */}
            <div
              className="flex rounded-full bg-gray-100 dark:bg-gray-800 p-0.5"
              role="group"
              aria-label="מצב תצוגה"
            >
              {(['discover', 'my'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDiscoverMode(mode)}
                  aria-pressed={discoverMode === mode}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all min-h-[32px] ${
                    discoverMode === mode
                      ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {mode === 'discover' ? 'גלה' : 'שלי'}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Invite chip */}
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              aria-label="הזמן חברים"
              className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold transition-colors active:scale-95 min-h-[32px]"
            >
              <Share2 className="w-3.5 h-3.5 flex-shrink-0" />
              הזמן חברים
            </button>

            {/* Filter icon — groups tab only */}
            {topTab === 'groups' && (
              <button
                type="button"
                onClick={() => setFilterPanelOpen((v) => !v)}
                aria-label="סנן קבוצות"
                aria-expanded={filterPanelOpen}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                  filterPanelOpen || groupCategoryFilter !== 'all'
                    ? 'bg-[#00ADEF] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Category filter panel — groups tab */}
        {topTab === 'groups' && filterPanelOpen && (
          <div className="max-w-md mx-auto px-5 pb-2" dir="rtl">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5">
              {GROUP_CATEGORY_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setGroupCategoryFilter(chip.key);
                    if (chip.key !== 'all') setFilterPanelOpen(false);
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors min-h-[36px] ${
                    groupCategoryFilter === chip.key
                      ? 'bg-[#00ADEF] text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </AppHeader>

      {/* ── Drawers (mounted at root so they survive tab switches) ────────── */}
      <GroupDetailsDrawer
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroup(null)}
        group={selectedGroup}
        onJoin={handleJoinGroup}
        onLeave={handleLeaveGroup}
        isJoined={selectedGroup ? joinedGroupIds.has(selectedGroup.id) : false}
        joining={selectedGroup ? joiningId === selectedGroup.id : false}
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
        scheduleSlots={successData?.scheduleSlots}
        category={successData?.category}
        address={successData?.address}
        onPlannerPref={handlePlannerPref}
      />

      <ViralUnlockSheet isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {topTab === 'exercises' && (
          <motion.div
            key="exercises"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Embedded library — no header, no search input. The shared
                input above writes straight to the exercise store. */}
            <ExerciseLibraryContent />
          </motion.div>
        )}

        {topTab === 'groups' && (
          <motion.div
            key="groups"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="max-w-md mx-auto px-4 pt-4"
          >
            <DiscoverGroupsList
              groups={filteredGroups}
              joinedGroupIds={joinedGroupIds}
              joiningId={joiningId}
              onJoin={handleJoinGroup}
              onCardClick={(g) => setSelectedGroup(g)}
              hasCityAccess={access.hasCityAccess}
              distanceMap={groupDistances}
              livePhaseMap={livePhaseMap}
              emptyMessage={
                discoverMode === 'my'
                  ? 'עוד לא הצטרפת לקבוצות — עבור ל"גלה" כדי למצוא קבוצות'
                  : undefined
              }
            />
          </motion.div>
        )}

        {topTab === 'people' && (
          <motion.div
            key="people"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="max-w-md mx-auto px-4 pt-4 space-y-4"
          >
            {discoverMode === 'my' ? (
              <MyPartnersList
                partners={myPartners}
                isLoading={myPartnersLoading}
                myUid={userId}
                onInvite={() => setInviteOpen(true)}
              />
            ) : (
              <DiscoverPeopleList
                term={searchTerm}
                isSearching={peopleSearching}
                results={peopleResults}
                myUid={userId}
              />
            )}
          </motion.div>
        )}

        {topTab === 'events' && (
          <motion.div
            key="events"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="max-w-md mx-auto px-4 pt-4 space-y-3"
          >
            {/* Category filter pills (PartnerFilterBar style — same as
                /community gender pills). Horizontally scrollable for
                small screens. */}
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
              dir="rtl"
              style={{ scrollbarWidth: 'none' }}
            >
              {EVENT_FILTERS.map((f) => {
                const active = eventFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setEventFilter(f.value)}
                    className="flex-shrink-0 rounded-full px-3.5 text-[13px] font-bold transition-colors active:scale-95"
                    style={{
                      height: 32,
                      backgroundColor: active ? ACCENT : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#4B5563',
                      border: active ? 'none' : '0.5px solid rgba(0,0,0,0.12)',
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <EventsList
              events={filteredEvents}
              joinedEventIds={joinedEventIds}
              joiningId={joiningId}
              onJoin={handleJoinEvent}
              onCardClick={(e) => setSelectedEvent(e)}
              hasCityAccess={access.hasCityAccess}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers / small render functions
// ────────────────────────────────────────────────────────────────────────────

function getPlaceholder(top: SearchTopTab, mode: DiscoverMode): string {
  if (top === 'exercises') return 'חפש תרגיל...';
  if (top === 'events') return 'חפש אירוע...';
  if (top === 'groups') return 'חפש קבוצה...';
  if (top === 'people' && mode === 'discover') return 'חפש לפי שם...';
  return 'חיפוש...';
}

function MyPartnersList({
  partners,
  isLoading,
  myUid,
  onInvite,
}: {
  partners: UserSearchResult[];
  isLoading: boolean;
  myUid: string | null;
  onInvite: () => void;
}) {
  if (isLoading && partners.length === 0) {
    return (
      <p className="text-xs text-gray-500 text-center py-8 animate-pulse">
        טוען...
      </p>
    );
  }
  if (partners.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center" dir="rtl">
        <Search className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-bold text-gray-700">עדיין אין לך שותפים</p>
        <p className="text-xs text-gray-500 mt-0.5 max-w-[260px]">
          עקוב אחרי משתמשים בלשונית "גלה אנשים" או הזמן חברים שעדיין לא
          באפליקציה
        </p>
        <button
          type="button"
          onClick={onInvite}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-xs transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #F97316, #EA580C)',
            boxShadow: '0 3px 14px rgba(249,115,22,0.3)',
          }}
        >
          <Upload className="w-3.5 h-3.5" />
          הזמן חברים
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2 pb-6" dir="rtl">
      <p className="text-[11px] text-gray-500 px-1">{partners.length} שותפים</p>
      {partners.map((u) => (
        <motion.div key={u.uid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <PartnerCard user={u} myUid={myUid ?? ''} />
        </motion.div>
      ))}
    </div>
  );
}

function DiscoverPeopleList({
  term,
  isSearching,
  results,
  myUid,
}: {
  term: string;
  isSearching: boolean;
  results: UserSearchResult[];
  myUid: string | null;
}) {
  if (isSearching) {
    return (
      <p className="text-xs text-gray-500 text-center py-8 animate-pulse">
        מחפש...
      </p>
    );
  }
  if (term.trim().length < 2) {
    return (
      <div className="flex flex-col items-center py-10 text-center" dir="rtl">
        <Search className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">הקלד לפחות 2 תווים לחיפוש</p>
        <p className="text-xs text-gray-400 mt-1 max-w-[240px]">
          חיפוש משתמשים מכל הארץ — לא מוגבל לעיר שלך
        </p>
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-center" dir="rtl">
        <Search className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-bold text-gray-700">לא נמצאו תוצאות</p>
        <p className="text-xs text-gray-500 mt-0.5">נסה שם אחר</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 pb-6" dir="rtl">
      <p className="text-[11px] text-gray-500 px-1">{results.length} תוצאות</p>
      {results.map((u) => (
        <motion.div key={u.uid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <PartnerCard user={u} myUid={myUid ?? ''} />
        </motion.div>
      ))}
    </div>
  );
}

function DiscoverGroupsList({
  groups,
  joinedGroupIds,
  joiningId,
  onJoin,
  onCardClick,
  hasCityAccess,
  distanceMap = {},
  livePhaseMap = {},
  emptyMessage,
}: {
  groups: CommunityGroup[];
  joinedGroupIds: Set<string>;
  joiningId: string | null;
  onJoin: (id: string) => void;
  onCardClick: (g: CommunityGroup) => void;
  hasCityAccess: boolean;
  distanceMap?: Record<string, number>;
  livePhaseMap?: Record<string, 'approaching' | 'lobby' | 'active'>;
  emptyMessage?: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center" dir="rtl">
        <Search className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-bold text-gray-700">לא נמצאו קבוצות</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {emptyMessage ?? (hasCityAccess
            ? 'קבוצות חדשות יופיעו כאן ברגע שיתווספו לעיר שלך'
            : 'חבר GPS כדי לגלות קבוצות באזורך')}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 pb-6" dir="rtl">
      <p className="text-[11px] text-gray-500 px-1">{groups.length} קבוצות</p>
      {groups.map((g) => (
        <motion.div key={g.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GroupCard
            group={g}
            isJoined={joinedGroupIds.has(g.id)}
            joining={joiningId === g.id}
            distanceKm={distanceMap[g.id]}
            livePhase={livePhaseMap[g.id]}
            onJoin={onJoin}
            onCardClick={() => onCardClick(g)}
          />
        </motion.div>
      ))}
    </div>
  );
}

function EventsList({
  events,
  joinedEventIds,
  joiningId,
  onJoin,
  onCardClick,
  hasCityAccess,
}: {
  events: { event: CommunityEvent; distanceKm?: number }[];
  joinedEventIds: Set<string>;
  joiningId: string | null;
  onJoin: (id: string) => void;
  onCardClick: (e: CommunityEvent) => void;
  hasCityAccess: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center" dir="rtl">
        <Search className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-bold text-gray-700">לא נמצאו אירועים</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {hasCityAccess
            ? 'אירועים חדשים יופיעו כאן ברגע שיתווספו'
            : 'חבר GPS כדי לגלות אירועים באזורך'}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 pb-6" dir="rtl">
      <p className="text-[11px] text-gray-500 px-1">{events.length} אירועים</p>
      {events.map(({ event }) => (
        <motion.div key={event.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <EventCard
            event={event}
            isJoined={joinedEventIds.has(event.id)}
            joining={joiningId === event.id}
            onJoin={onJoin}
            onCardClick={() => onCardClick(event)}
          />
        </motion.div>
      ))}
    </div>
  );
}
