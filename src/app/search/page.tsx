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
  QrCode,
  ContactRound,
  Share2,
  Upload,
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
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';
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

type SearchTopTab = 'exercises' | 'social' | 'events';
type SocialSubTab = 'my' | 'people' | 'groups';
type EventFilter = 'all' | 'running' | 'walking' | 'strength' | 'near';

const TOP_TABS: { value: SearchTopTab; label: string }[] = [
  { value: 'exercises', label: 'תרגילים' },
  { value: 'social', label: 'קבוצות ואנשים' },
  { value: 'events', label: 'אירועים' },
];

const SOCIAL_SUB_TABS: { value: SocialSubTab; label: string }[] = [
  { value: 'my', label: 'השותפים שלי' },
  { value: 'people', label: 'גלה אנשים' },
  { value: 'groups', label: 'גלה קבוצות' },
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

  // Following list (UIDs) — already kept in sync with Firestore by /community.
  const following = useSocialStore((s) => s.following);
  const socialLoaded = useSocialStore((s) => s.isLoaded);
  const loadConnections = useSocialStore((s) => s.loadConnections);

  // ── Top-level tab from URL ───────────────────────────────────────────────
  const tabParam = searchParams.get('tab');
  const topTab: SearchTopTab =
    tabParam === 'social' || tabParam === 'events' ? tabParam : 'exercises';

  const setTopTab = useCallback(
    (next: SearchTopTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'exercises') {
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
  const [socialSubTab, setSocialSubTab] = useState<SocialSubTab>('my');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');

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
  // The single shared input would otherwise leak (e.g. typing "yoga" on the
  // exercises tab and switching to events would silently filter events to
  // nothing). Always start each tab with a clean slate.
  useEffect(() => {
    setSearchTerm('');
    useExerciseLibraryStore.getState().setQuery('');
  }, [topTab]);

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
      topTab !== 'social' ||
      socialSubTab !== 'people' ||
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
  }, [searchTerm, topTab, socialSubTab]);

  // ── Effect: load "my partners" (followed users) when sub-tab opens ──────
  // Re-fetches whenever the `following` array length changes so newly
  // followed users surface without a manual refresh.
  useEffect(() => {
    let cancelled = false;
    if (topTab !== 'social' || socialSubTab !== 'my') return;
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
  }, [topTab, socialSubTab, socialLoaded, following]);

  // ── Group / event derived lists ─────────────────────────────────────────
  const termLower = searchTerm.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (termLower.length < 2) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(termLower) ||
        g.description?.toLowerCase().includes(termLower),
    );
  }, [groups, termLower]);

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

  // ── Native share for invite link ────────────────────────────────────────
  // Routes through the OneLink smart-link so recipients without the app are
  // sent directly to the correct App Store / Play Store.
  const handleShareInvite = useCallback(async () => {
    if (!userId) return;
    const link = `${APP_CONFIG_LINKS.GENERAL_INVITE_ONELINK}?ref=${userId}`;
    const text = `בוא להתאמן איתי ב-Out! 🤘 ${link}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Out — בוא להתאמן איתי!', text, url: link });
        return;
      } catch {
        /* user cancelled — fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* swallow */
    }
  }, [userId]);

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
              placeholder={getPlaceholder(topTab, socialSubTab)}
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

        {/* Top-level tabs — underline style (matches /community) */}
        <div className="max-w-md mx-auto px-5" dir="rtl">
          <div
            className="flex border-b border-slate-100 dark:border-slate-800"
            role="tablist"
            aria-label="חיפוש"
          >
            {TOP_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={topTab === t.value}
                onClick={() => setTopTab(t.value)}
                className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
                  topTab === t.value
                    ? 'text-[#00ADEF] border-[#00ADEF]'
                    : 'text-slate-400 dark:text-slate-500 border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
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

        {topTab === 'social' && (
          <motion.div
            key="social"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="max-w-md mx-auto px-4 pt-4 space-y-4"
          >
            {renderInviteBanner({
              onQR: () => setInviteOpen(true),
              onShare: handleShareInvite,
            })}

            {/* Sub-tabs */}
            <div dir="rtl">
              <div
                className="flex border-b border-slate-100 dark:border-slate-800"
                role="tablist"
                aria-label="קבוצות ואנשים"
              >
                {SOCIAL_SUB_TABS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="tab"
                    aria-selected={socialSubTab === s.value}
                    onClick={() => setSocialSubTab(s.value)}
                    className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-colors ${
                      socialSubTab === s.value
                        ? 'text-[#00ADEF] border-[#00ADEF]'
                        : 'text-slate-400 dark:text-slate-500 border-transparent'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {socialSubTab === 'my' && (
              <MyPartnersList
                partners={myPartners}
                isLoading={myPartnersLoading}
                myUid={userId}
                onInvite={() => setInviteOpen(true)}
              />
            )}

            {socialSubTab === 'people' && (
              <DiscoverPeopleList
                term={searchTerm}
                isSearching={peopleSearching}
                results={peopleResults}
                myUid={userId}
              />
            )}

            {socialSubTab === 'groups' && (
              <DiscoverGroupsList
                groups={filteredGroups}
                joinedGroupIds={joinedGroupIds}
                joiningId={joiningId}
                onJoin={handleJoinGroup}
                onCardClick={(g) => setSelectedGroup(g)}
                hasCityAccess={access.hasCityAccess}
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

function getPlaceholder(top: SearchTopTab, sub: SocialSubTab): string {
  if (top === 'exercises') return 'חפש תרגיל...';
  if (top === 'events') return 'חפש אירוע...';
  // social tab — depends on sub-tab
  if (sub === 'people') return 'חפש לפי שם...';
  if (sub === 'groups') return 'חפש קבוצה...';
  return 'חיפוש...';
}

// ── Invite banner (top of the social tab) ───────────────────────────────────
// Self-contained "green banner" — gradient background, three small action
// chips (QR / contacts / Facebook) and a primary CTA. The chips that aren't
// wired yet are intentionally rendered as no-ops so the layout is honest;
// they will become real CTAs as their respective integrations land.
function renderInviteBanner({
  onQR,
  onShare,
}: {
  onQR: () => void;
  onShare: () => void;
}) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden text-white shadow-lg shadow-emerald-500/20"
      style={{
        background:
          'linear-gradient(135deg, #10B981 0%, #059669 60%, #047857 100%)',
      }}
      dir="rtl"
    >
      <h3 className="text-base font-black mb-1">הזמן חברים ל-Out</h3>
      <p className="text-[12px] text-emerald-50 mb-3 leading-snug">
        ככל שתזמין יותר חברים, ייפתחו לך פיצ׳רים שותפי אימון קבוצתי בקרבתך
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onQR}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors active:scale-95"
        >
          <QrCode className="w-4 h-4" />
          <span className="text-[10px] font-bold">QR</span>
        </button>
        <button
          type="button"
          // No-op for now — wired to the contacts importer in a later step.
          onClick={() => {}}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors active:scale-95 opacity-90"
          aria-label="ייבוא אנשי קשר (בקרוב)"
        >
          <ContactRound className="w-4 h-4" />
          <span className="text-[10px] font-bold">אנשי קשר</span>
        </button>
        <button
          type="button"
          // No-op for now — Facebook share will be wired in a later step.
          onClick={() => {}}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 transition-colors active:scale-95 opacity-90"
          aria-label="שיתוף לפייסבוק (בקרוב)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          <span className="text-[10px] font-bold">Facebook</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onShare}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-emerald-700 text-sm font-black active:scale-[0.98] transition-transform shadow"
      >
        <Share2 className="w-4 h-4" />
        שתף קישור הזמנה
      </button>
    </div>
  );
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
}: {
  groups: CommunityGroup[];
  joinedGroupIds: Set<string>;
  joiningId: string | null;
  onJoin: (id: string) => void;
  onCardClick: (g: CommunityGroup) => void;
  hasCityAccess: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center" dir="rtl">
        <Search className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-bold text-gray-700">לא נמצאו קבוצות</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {hasCityAccess
            ? 'קבוצות חדשות יופיעו כאן ברגע שיתווספו לעיר שלך'
            : 'חבר GPS כדי לגלות קבוצות באזורך'}
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
