'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HandMetal, Users, Trophy } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { sendKudo } from '@/features/safecity/services/kudos.service';
import type { ActivityFeedItem, ActivityEventType } from '@/types/community.types';

// ─── Time formatting ─────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שעות`;
  return `לפני ${Math.floor(diff / 86400)} ימים`;
}

function activityIcon(type: ActivityEventType): React.ReactNode {
  switch (type) {
    case 'high_five':
      return <HandMetal className="w-4 h-4 text-cyan-500" />;
    case 'group_join':
      return <Users className="w-4 h-4 text-purple-500" />;
    case 'leaderboard_badge':
      return <Trophy className="w-4 h-4 text-amber-500" />;
  }
}

function renderDynamicMessage(item: ActivityFeedItem): string {
  if (item.type === 'high_five') {
    const name = item.fromName || item.message;
    if (item.fromName) return `${name} הרים/ה לך ידיים 🤘`;
    return item.message;
  }
  if (item.type === 'group_join') {
    const name = item.fromName;
    const group = item.groupName;
    if (name && group) return `${name} הצטרף/ה ל-${group}`;
    if (group) return `אווטיר חדש הצטרף ל-${group}`;
    return item.message;
  }
  if (item.type === 'leaderboard_badge') {
    return item.message;
  }
  return item.message;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ActivityPanel({ isOpen, onClose }: ActivityPanelProps) {
  const { profile } = useUserStore();
  const myUid = profile?.id ?? null;
  const myName = profile?.core?.name ?? 'אווטיר';
  const { items, isLoading } = useActivityFeed(myUid);

  async function handleHighFiveBack(item: ActivityFeedItem) {
    if (!myUid || !item.fromUid) return;
    await sendKudo(item.fromUid, myUid, myName, 'high_five');
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[71] bg-white rounded-t-3xl max-h-[80dvh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 py-3" dir="rtl">
              <h2 className="text-base font-black text-gray-900">פעילות</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-8" dir="rtl">
              {isLoading && (
                <p className="text-sm text-gray-400 text-center py-12 animate-pulse">טוען פעילות...</p>
              )}

              {!isLoading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="text-4xl mb-3">🐒</span>
                  <p className="text-sm font-bold text-gray-900">עדיין אין פעילות...</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-[220px]">
                    כשאווטירים יעלו לך ידיים או יצטרפו לקבוצה, זה יופיע כאן
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {items.map((item) => {
                  const displayMessage = renderDynamicMessage(item);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-2xl transition-colors ${
                        item.read ? 'bg-gray-50' : 'bg-cyan-50 border border-cyan-100'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                        {activityIcon(item.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-900 leading-snug">
                          {displayMessage}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(item.createdAt)}</p>
                      </div>

                      {item.type === 'high_five' && item.fromUid && item.fromUid !== myUid && (
                        <button
                          onClick={() => handleHighFiveBack(item)}
                          className="flex-shrink-0 text-[11px] font-bold text-cyan-600 bg-cyan-50 border border-cyan-200 rounded-full px-3 py-1.5 hover:bg-cyan-100 transition-colors"
                        >
                          🤘 בחזרה
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
