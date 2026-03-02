'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rss, CalendarHeart, Users, RefreshCw, Search, X, Heart, MessageCircle, Bell } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useSocialStore } from '@/features/social/store/useSocialStore';
import { getFeedPosts, type FeedPost } from '@/features/social/services/feed.service';
import { searchUsersByName, type UserSearchResult } from '@/features/social/services/user-search.service';
import { useArenaAccess } from '@/features/arena/hooks/useArenaAccess';
import { useArenaData } from '@/features/arena/hooks/useArenaData';
import { useActivityFeed } from '@/features/social/hooks/useActivityFeed';
import { useChatInbox } from '@/features/social/hooks/useChatInbox';
import FeedPostCard from '@/features/social/components/FeedPostCard';
import PartnerCard from '@/features/social/components/PartnerCard';
import EventCard from '@/features/arena/components/EventCard';
import ActivityPanel from '@/features/social/components/ActivityPanel';
import ChatInbox from '@/features/social/components/ChatInbox';

type FeedTab = 'social' | 'events';

export default function FeedPage() {
  const { profile, _hasHydrated } = useUserStore();
  const { following, isLoaded: socialLoaded, loadConnections } = useSocialStore();
  const access = useArenaAccess();
  const { events, isLoading: eventsLoading } = useArenaData(access.cityAuthorityId);

  const userId = profile?.id;

  const [tab, setTab] = useState<FeedTab>('social');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Pillar 5 — panels
  const [activityOpen, setActivityOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { items: activityItems, unreadCount: activityUnread } = useActivityFeed(userId ?? null);
  const { totalUnread: chatUnread } = useChatInbox(userId ?? null);

  const inviteUnread = activityItems.filter(
    (i) => !i.read && (i.type === 'group_join' || i.type === 'leaderboard_badge'),
  ).length;

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load connections on mount
  useEffect(() => {
    if (_hasHydrated && userId && !socialLoaded) {
      loadConnections(userId);
    }
  }, [_hasHydrated, userId, socialLoaded, loadConnections]);

  // Fetch feed posts when following list changes
  const fetchPosts = useCallback(async () => {
    if (!userId) return;
    const uids = [...new Set([userId, ...following])];
    setLoadingPosts(true);
    try {
      const fetched = await getFeedPosts(uids, 30);
      setPosts(fetched);
    } catch (err) {
      console.error('[FeedPage] fetchPosts failed:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [userId, following]);

  useEffect(() => {
    if (socialLoaded && userId) {
      fetchPosts();
    }
  }, [socialLoaded, userId, fetchPosts]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchUsersByName(searchTerm);
        setSearchResults(results);
      } catch (err) {
        console.error('[FeedPage] search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm]);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [searchOpen]);

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
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
              <Rss className="w-4 h-4 text-cyan-600" />
            </div>
            <h1 className="text-lg font-black text-gray-900">פיד</h1>
          </div>

          <div className="flex items-center gap-1">
            {tab === 'social' && (
              <>
                <button
                  onClick={() => setSearchOpen((o) => !o)}
                  className={`p-2 rounded-lg transition-all active:scale-90 ${
                    searchOpen ? 'bg-cyan-50 text-cyan-600' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  aria-label="חיפוש"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={fetchPosts}
                  className="p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
                  aria-label="רענן"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-500 ${loadingPosts ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}

            {/* Activity (Heart) — Red badge */}
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

            {/* Invites / System — Amber badge */}
            <button
              onClick={() => setActivityOpen(true)}
              className="relative p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
              aria-label="הזמנות"
            >
              <Bell className="w-4.5 h-4.5 text-gray-500" />
              {inviteUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center px-1 shadow-sm">
                  {inviteUnread > 99 ? '99+' : inviteUnread}
                </span>
              )}
            </button>

            {/* Messages — Cyan badge */}
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

        {/* Search bar (slides in) */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="max-w-md mx-auto px-5 pb-3" dir="rtl">
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="חיפוש לפי שם..."
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab picker */}
        {!searchOpen && (
          <div className="max-w-md mx-auto px-5 pb-3">
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setTab('social')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  tab === 'social'
                    ? 'bg-white text-cyan-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                שותפים
              </button>
              <button
                onClick={() => setTab('events')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  tab === 'events'
                    ? 'bg-white text-cyan-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <CalendarHeart className="w-3.5 h-3.5" />
                אירועים
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Pillar 5 — Activity & Chat panels */}
      <ActivityPanel isOpen={activityOpen} onClose={() => setActivityOpen(false)} />
      <ChatInbox isOpen={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Content */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Search results overlay */}
        {searchOpen ? (
          <div className="space-y-2">
            {searching && (
              <p className="text-xs text-gray-500 text-center py-4 animate-pulse">מחפש...</p>
            )}

            {!searching && searchTerm.length >= 2 && searchResults.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center" dir="rtl">
                <Search className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm font-bold text-gray-700">לא נמצאו תוצאות</p>
                <p className="text-xs text-gray-500 mt-0.5">נסה שם אחר</p>
              </div>
            )}

            {!searching && searchTerm.length < 2 && (
              <div className="flex flex-col items-center py-8 text-center" dir="rtl">
                <Search className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">הקלד לפחות 2 תווים לחיפוש</p>
              </div>
            )}

            {searchResults.length > 0 && userId && (
              <div className="space-y-2">
                <p className="text-[11px] text-gray-500 px-1" dir="rtl">
                  {searchResults.length} תוצאות
                </p>
                {searchResults.map((user) => (
                  <motion.div
                    key={user.uid}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <PartnerCard user={user} myUid={userId} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {tab === 'social' ? (
              <motion.div
                key="social"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderSocialTab()}
              </motion.div>
            ) : (
              <motion.div
                key="events"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderEventsTab()}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );

  // ── Social tab ──────────────────────────────────────────────────────────

  function renderSocialTab() {
    if (loadingPosts && posts.length === 0) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-500 animate-pulse">טוען פיד...</p>
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center" dir="rtl">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-900">הפיד שלך ריק</p>
          <p className="text-xs text-gray-600 mt-1 max-w-[240px]">
            סיים אימון כדי לפרסם את הפוסט הראשון שלך, או לחץ 🔍 כדי לחפש שותפים ולעקוב אחריהם
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1" dir="rtl">
          <span className="text-[11px] text-gray-500">
            עוקב אחרי {following.length} שותפים
          </span>
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
    );
  }

  // ── Events tab ──────────────────────────────────────────────────────────

  function renderEventsTab() {
    if (eventsLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-gray-500 animate-pulse">טוען אירועים...</p>
        </div>
      );
    }

    if (events.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center" dir="rtl">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <CalendarHeart className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-900">אין אירועים קרובים</p>
          <p className="text-xs text-gray-600 mt-1">
            {access.hasCityAccess
              ? 'אירועים חדשים יופיעו כאן כשהעיר שלך תיצור אותם'
              : 'חבר GPS כדי לראות אירועים בעיר שלך'}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 px-1 mb-1" dir="rtl">
          <CalendarHeart className="w-4 h-4 text-cyan-600" />
          <h3 className="text-sm font-bold text-gray-900">אירועים באזורך</h3>
          <span className="text-xs text-gray-500 mr-auto">{events.length}</span>
        </div>
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    );
  }
}
