'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Search,
  X,
  Users,
  CalendarHeart,
  Sparkles,
  ContactRound,
  QrCode,
  Upload,
} from 'lucide-react';
import { useUserStore } from '@/features/user';
import { searchUsersByName, type UserSearchResult } from '@/features/social/services/user-search.service';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import PartnerCard from '@/features/social/components/PartnerCard';
import EventCard from '@/features/arena/components/EventCard';
import GroupCard from '@/features/arena/components/GroupCard';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import { joinGroup, leaveGroup } from '@/features/arena/services/group.service';
import { joinEvent } from '@/features/admin/services/community.service';
import {
  addCommunitySessionsToPlanner,
} from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityGroup, CommunityEvent } from '@/types/community.types';

type SearchTab = 'partners' | 'clubs';

const GROUP_VERB: Record<string, string> = {
  walking: 'ילך', running: 'ירוץ', yoga: 'יתאמן',
  calisthenics: 'יתאמן', cycling: 'ירכב', other: 'יתאמן',
};
const EVENT_VERB: Record<string, string> = {
  race: 'ירוץ', fitness_day: 'יתאמן', workshop: 'ישתתף',
  community_meetup: 'ישתתף', other: 'יתאמן',
};

const QUICK_ACTIONS = [
  { id: 'suggested', label: 'מוצעים', icon: Sparkles },
  { id: 'facebook', label: 'Facebook', icon: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )},
  { id: 'contacts', label: 'אנשי קשר', icon: ContactRound },
  { id: 'qr', label: 'QR Code', icon: QrCode },
] as const;

export default function SearchPage() {
  const router = useRouter();
  const { profile } = useUserStore();
  const userId = profile?.id;
  const userName = profile?.core?.name ?? 'משתמש';
  const photoURL = profile?.core?.photoURL;
  const access = useArenaAccess();
  const { events, groups } = useArenaData(access.cityAuthorityId);

  const [tab, setTab] = useState<SearchTab>('partners');
  const [searchTerm, setSearchTerm] = useState('');
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Drawer state ─────────────────────────────────────────────────────
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

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

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

  // Debounced user search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (tab !== 'partners' || searchTerm.trim().length < 2) {
      setUserResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchUsersByName(searchTerm, profile?.core?.authorityId);
        setUserResults(results);
      } catch (err) {
        console.error('[SearchPage] user search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, tab]);

  // ── Join handlers ─────────────────────────────────────────────────────
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
          : group.schedule ? [group.schedule] : [];
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
  }, [userId, userName, groups, selectedGroup]);

  const handleJoinEvent = useCallback(async (eventId: string) => {
    if (!userId) return;
    setJoiningId(eventId);
    try {
      await joinEvent(eventId, userId, userName, photoURL ?? undefined);
      setJoinedEventIds((prev) => new Set([...prev, eventId]));
      const event = events.find((e) => e.id === eventId) ?? selectedEvent;
      setSelectedEvent(null);
      if (event) setSuccessData({ name: event.name, verb: EVENT_VERB[event.category] ?? 'יתאמן' });
    } catch (err) {
      console.error('[SearchPage] joinEvent failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [userId, userName, photoURL, events, selectedEvent]);

  const handleLeaveGroup = useCallback(async (groupId: string) => {
    if (!userId) return;
    try {
      await leaveGroup(groupId, userId);
      setJoinedGroupIds((prev) => { const next = new Set(prev); next.delete(groupId); return next; });
    } catch (err) {
      console.error('[SearchPage] leaveGroup failed:', err);
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
      ).catch((err) => console.warn('[SearchPage] planner sync failed:', err));
    },
    [userId, successData],
  );

  // Client-side filter for clubs/events
  const termLower = searchTerm.trim().toLowerCase();
  const filteredGroups = termLower.length >= 2
    ? groups.filter((g) => g.name.toLowerCase().includes(termLower) || g.description?.toLowerCase().includes(termLower))
    : groups;
  const filteredEvents = termLower.length >= 2
    ? events.filter((e) => e.name.toLowerCase().includes(termLower) || e.description?.toLowerCase().includes(termLower))
    : events;

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ── Sticky Header — pad below status bar. ─────────────── */}
      <header
        className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-md mx-auto px-4 py-1.5 flex items-center gap-3" dir="rtl">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-90 transition-all flex-shrink-0"
            aria-label="חזרה"
          >
            <ArrowRight className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-black text-gray-900">חיפוש</h1>
        </div>

        {/* Search input */}
        <div className="max-w-md mx-auto px-5 pb-3" dir="rtl">
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={tab === 'partners' ? 'חיפוש לפי שם...' : 'חיפוש קבוצות ואירועים...'}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="p-0.5 rounded-full hover:bg-gray-200 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Tab picker */}
        <div className="max-w-md mx-auto px-5 pb-3">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setTab('partners'); setSearchTerm(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                tab === 'partners' ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              שותפים
            </button>
            <button
              onClick={() => { setTab('clubs'); setSearchTerm(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                tab === 'clubs' ? 'bg-white text-cyan-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <CalendarHeart className="w-3.5 h-3.5" />
              קבוצות ואירועים
            </button>
          </div>
        </div>

        {/* Quick action icons — partners tab only */}
        {tab === 'partners' && (
          <div className="max-w-md mx-auto px-5 pb-3">
            <div className="flex justify-around" dir="rtl">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => { if (action.id === 'qr') setInviteOpen(true); }}
                    className="flex flex-col items-center gap-1.5 px-2 py-1 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-600">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-600">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        <AnimatePresence mode="wait">
          {tab === 'partners' ? (
            <motion.div key="partners" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {renderPartnersTab()}
            </motion.div>
          ) : (
            <motion.div key="clubs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {renderClubsTab()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sticky Invite Footer — partners tab only ─────────── */}
      {tab === 'partners' && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-gray-100"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="max-w-md mx-auto px-5 py-3 space-y-2">
            <p className="text-xs text-gray-500 text-center font-medium" dir="rtl">
              הזמן חברים שעדיין לא באפליקציה
            </p>
            <button
              onClick={() => setInviteOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-white font-extrabold text-sm transition-all active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)', boxShadow: '0 4px 20px rgba(249,115,22,0.35)' }}
            >
              <Upload className="w-4.5 h-4.5" />
              הזמן חברים
            </button>
          </div>
        </div>
      )}

      {/* ── Drawers ─────────────────────────────────────────────── */}
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

      {/* ── Viral Unlock Sheet ─────────────────────────────────── */}
      <ViralUnlockSheet isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );

  // ── Partners tab ──────────────────────────────────────────────────────

  function renderPartnersTab() {
    if (searching) return <p className="text-xs text-gray-500 text-center py-8 animate-pulse">מחפש...</p>;

    if (searchTerm.trim().length < 2) {
      return (
        <div className="flex flex-col items-center py-10 text-center" dir="rtl">
          <Search className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">הקלד לפחות 2 תווים לחיפוש</p>
          <p className="text-xs text-gray-400 mt-1 max-w-[220px]">או הזמן חברים שעדיין לא באפליקציה</p>
          <button onClick={() => setInviteOpen(true)} className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-xs transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)', boxShadow: '0 3px 14px rgba(249,115,22,0.3)' }}>
            <Upload className="w-3.5 h-3.5" />
            הזמן חברים
          </button>
        </div>
      );
    }

    if (userResults.length === 0) {
      return (
        <div className="flex flex-col items-center py-10 text-center" dir="rtl">
          <Search className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm font-bold text-gray-700">לא נמצאו תוצאות</p>
          <p className="text-xs text-gray-500 mt-0.5">נסה שם אחר, או הזמן חברים לאפליקציה</p>
          <button onClick={() => setInviteOpen(true)} className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-xs transition-all active:scale-95" style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)', boxShadow: '0 3px 14px rgba(249,115,22,0.3)' }}>
            <Upload className="w-3.5 h-3.5" />
            הזמן חברים
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2 pb-28">
        <p className="text-[11px] text-gray-500 px-1" dir="rtl">{userResults.length} תוצאות</p>
        {userResults.map((user) => (
          <motion.div key={user.uid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <PartnerCard user={user} myUid={userId!} />
          </motion.div>
        ))}
      </div>
    );
  }

  // ── Clubs & Events tab ────────────────────────────────────────────────

  function renderClubsTab() {
    const hasGroups = filteredGroups.length > 0;
    const hasEvents = filteredEvents.length > 0;

    if (!hasGroups && !hasEvents) {
      const isFiltered = termLower.length >= 2;
      return (
        <div className="flex flex-col items-center py-12 text-center" dir="rtl">
          <CalendarHeart className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm font-bold text-gray-700">
            {isFiltered ? 'לא נמצאו תוצאות' : 'אין קבוצות ואירועים באזורך'}
          </p>
          {!isFiltered && (
            <p className="text-xs text-gray-500 mt-0.5">
              {access.hasCityAccess
                ? 'קבוצות ואירועים יופיעו כאן כשיתווספו'
                : 'חבר GPS כדי לגלות פעילויות באזורך'}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-6">
        {hasGroups && (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 font-bold px-1" dir="rtl">
              קבוצות ({filteredGroups.length})
            </p>
            {filteredGroups.map((group) => (
              <motion.div key={group.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <GroupCard
                  group={group}
                  isJoined={joinedGroupIds.has(group.id)}
                  joining={joiningId === group.id}
                  onJoin={handleJoinGroup}
                  onCardClick={() => setSelectedGroup(group)}
                />
              </motion.div>
            ))}
          </div>
        )}

        {hasEvents && (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 font-bold px-1" dir="rtl">
              אירועים ({filteredEvents.length})
            </p>
            {filteredEvents.map((event) => (
              <motion.div key={event.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <EventCard
                  event={event}
                  isJoined={joinedEventIds.has(event.id)}
                  joining={joiningId === event.id}
                  onJoin={handleJoinEvent}
                  onCardClick={() => setSelectedEvent(event)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
