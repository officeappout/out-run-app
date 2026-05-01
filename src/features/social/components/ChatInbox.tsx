'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
// `m` is the tree-shakeable variant; the root <LazyMotion features={domAnimation}>
// in ClientLayout supplies animation features at runtime, so we don't bundle
// the full motion runtime per ChatInbox import.
import { m, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, ChevronLeft, Search, Users } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useChatInbox } from '../hooks/useChatInbox';
import ChatThread from './ChatThread';
import type { ChatThread as ChatThreadType } from '../types/chat.types';
import { getGroupById } from '@/features/arena/services/group.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} שע׳`;
  return `${Math.floor(diff / 86400)} ימים`;
}

type InboxFilter = 'all' | 'unread' | 'groups';

// ─── Component ────────────────────────────────────────────────────────────────

interface ChatInboxProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Optional pre-selected thread. When this prop transitions from null
   * to a value, the inbox opens directly on that thread (skipping the
   * list). Driven by `useChatStore` for cross-app DM entry points.
   */
  initialThread?: ChatThreadType | null;
}

export default function ChatInbox({ isOpen, onClose, initialThread = null }: ChatInboxProps) {
  const { profile } = useUserStore();
  const myUid = profile?.id ?? null;
  const myName = profile?.core?.name ?? 'אווטיר';
  const { threads, isLoading } = useChatInbox(myUid);

  const [openThread, setOpenThread] = useState<ChatThreadType | null>(null);

  // Sync external thread selection (e.g. from useChatStore.openDM) into the
  // local view state. We only react to non-null values so closing the sheet
  // (which sets activeThread back to null in the store) doesn't immediately
  // pop the user back to the list mid-exit-animation.
  useEffect(() => {
    if (initialThread) setOpenThread(initialThread);
  }, [initialThread]);
  const [groupCreatorUid, setGroupCreatorUid] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 100);
    else setSearchTerm('');
  }, [searchOpen]);

  // Lookup group creator when a group thread is opened
  useEffect(() => {
    if (!openThread || openThread.type !== 'group' || !openThread.groupId) {
      setGroupCreatorUid(undefined);
      return;
    }
    let cancelled = false;
    getGroupById(openThread.groupId).then((group) => {
      if (!cancelled && group) setGroupCreatorUid(group.createdBy);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [openThread?.id, openThread?.type, openThread?.groupId]);

  function getThreadDisplayName(thread: ChatThreadType): string {
    if (thread.type === 'group') {
      return thread.groupName || 'קבוצה';
    }
    if (!myUid) return 'אווטיר';
    const partnerUid = thread.participants.find((uid) => uid !== myUid) ?? '';
    return thread.participantNames?.[partnerUid] || 'אווטיר';
  }

  function getUnread(thread: ChatThreadType): number {
    return thread.unreadCount?.[myUid ?? ''] ?? 0;
  }

  function getLastMessagePreview(thread: ChatThreadType): string {
    if (!thread.lastMessage) return 'התחל שיחה...';
    if (thread.type === 'group' && thread.lastSenderId) {
      const senderName = thread.participantNames?.[thread.lastSenderId];
      if (senderName && thread.lastSenderId !== myUid) {
        return `${senderName}: ${thread.lastMessage}`;
      }
    }
    return thread.lastMessage;
  }

  const filteredThreads = useMemo(() => {
    let list = threads;

    if (filter === 'unread') {
      list = list.filter((t) => getUnread(t) > 0);
    } else if (filter === 'groups') {
      list = list.filter((t) => t.type === 'group');
    }

    if (searchTerm.trim().length >= 2) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((t) => getThreadDisplayName(t).toLowerCase().includes(q));
    }

    return list;
  }, [threads, filter, searchTerm, myUid]);

  const unreadTotal = threads.reduce((sum, t) => sum + getUnread(t), 0);
  const groupCount = threads.filter((t) => t.type === 'group').length;

  const FILTERS: { key: InboxFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'unread', label: 'לא נקראו', count: unreadTotal },
    { key: 'groups', label: 'קבוצות', count: groupCount },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <m.div
            className="fixed inset-0 z-[70] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (openThread) setOpenThread(null);
              else onClose();
            }}
          />

          <m.div
            className="fixed bottom-0 left-0 right-0 z-[71] bg-white rounded-t-3xl h-[90dvh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-2" dir="rtl">
              <div className="flex items-center gap-2">
                {openThread && (
                  <button
                    onClick={() => setOpenThread(null)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center ml-1"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                )}
                <h2 className="text-base font-black text-gray-900">
                  {openThread ? getThreadDisplayName(openThread) : 'הודעות'}
                </h2>
                {openThread?.type === 'group' && (
                  <span className="text-[10px] bg-purple-100 text-purple-600 font-bold rounded-full px-2 py-0.5">
                    קבוצה
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {!openThread && (
                  <button
                    onClick={() => setSearchOpen((o) => !o)}
                    className={`p-2 rounded-lg transition-all ${searchOpen ? 'bg-cyan-50 text-cyan-600' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    <Search className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Search bar */}
            <AnimatePresence>
              {searchOpen && !openThread && (
                <m.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-5"
                  dir="rtl"
                >
                  <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 mb-2">
                    <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="חיפוש שיחות..."
                      className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="p-0.5 rounded-full hover:bg-gray-200">
                        <X className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                    )}
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            {/* Category filters */}
            {!openThread && (
              <div className="px-5 pb-2" dir="rtl">
                <div className="flex gap-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        filter === f.key
                          ? 'bg-cyan-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                      {f.count !== undefined && f.count > 0 && (
                        <span className={`mr-1 ${filter === f.key ? 'text-cyan-100' : 'text-gray-400'}`}>
                          ({f.count})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                {openThread ? (
                  <m.div
                    key="thread"
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 30, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <ChatThread thread={openThread} myUid={myUid ?? ''} myName={myName} createdByUid={groupCreatorUid} />
                  </m.div>
                ) : (
                  <m.div
                    key="list"
                    initial={{ x: 30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -30, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-y-auto h-full px-4 pb-8"
                    dir="rtl"
                  >
                    {isLoading && (
                      <p className="text-sm text-gray-400 text-center py-12 animate-pulse">
                        טוען שיחות...
                      </p>
                    )}

                    {!isLoading && filteredThreads.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 rounded-full bg-cyan-50 flex items-center justify-center mb-3">
                          <MessageCircle className="w-8 h-8 text-cyan-400" />
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                          {filter === 'unread'
                            ? 'אין הודעות שלא נקראו'
                            : filter === 'groups'
                              ? 'אין שיחות קבוצתיות'
                              : 'עדיין אין הודעות...'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 max-w-[220px]">
                          {filter === 'all'
                            ? 'לחץ על אווטיר במפה כדי לפתוח שיחה'
                            : 'נסה לסנן לפי "הכל"'}
                        </p>
                      </div>
                    )}

                    <div className="divide-y divide-gray-50">
                      {filteredThreads.map((thread) => {
                        const unread = getUnread(thread);
                        const displayName = getThreadDisplayName(thread);
                        const isGroup = thread.type === 'group';
                        const preview = getLastMessagePreview(thread);

                        return (
                          <button
                            key={thread.id}
                            onClick={() => setOpenThread(thread)}
                            className="w-full flex items-center gap-3 py-3.5 px-1 hover:bg-gray-50 rounded-xl transition-colors text-right"
                          >
                            {/* Avatar: User initial vs Group icon */}
                            {isGroup ? (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <Users className="w-5 h-5 text-white" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                                <span className="text-white font-black text-sm">
                                  {displayName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`text-sm truncate ${unread > 0 ? 'font-black text-gray-900' : 'font-bold text-gray-700'}`}>
                                    {displayName}
                                  </span>
                                  {isGroup && (
                                    <span className="flex-shrink-0 text-[9px] bg-purple-100 text-purple-600 font-bold rounded px-1.5 py-0.5">
                                      קבוצה
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-gray-400 flex-shrink-0 mr-2">
                                  {timeAgo(thread.lastMessageAt)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-0.5">
                                <p className={`text-xs truncate max-w-[200px] ${unread > 0 ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
                                  {preview}
                                </p>
                                {unread > 0 && (
                                  <span className={`flex-shrink-0 w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center mr-2 ${isGroup ? 'bg-purple-500' : 'bg-cyan-500'}`}>
                                    {unread > 9 ? '9+' : unread}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
