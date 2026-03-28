'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Pencil,
  BarChart2,
  Users,
  Crown,
  LogOut,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { getGroupById, getGroupMembers, leaveGroup } from '@/features/arena/services/group.service';
import type { CommunityGroup, GroupMember } from '@/types/community.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; gradient: string }> = {
  walking:      { label: 'הליכה',      emoji: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:      { label: 'ריצה',       emoji: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:         { label: 'יוגה',       emoji: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics: { label: 'קליסתניקס', emoji: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:      { label: 'רכיבה',      emoji: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:        { label: 'אחר',        emoji: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreatorManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string | null;
  /** Called when the user taps "ערוך פרטי קהילה" — parent opens the Edit Wizard */
  onEditGroup: (groupId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreatorManagementDrawer({
  isOpen,
  onClose,
  groupId,
  onEditGroup,
}: CreatorManagementDrawerProps) {
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  // ── Fetch group + members when drawer opens ───────────────────────────────
  useEffect(() => {
    if (!isOpen || !groupId) {
      setGroup(null);
      setMembers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getGroupById(groupId),
      getGroupMembers(groupId),
    ]).then(([g, m]) => {
      if (cancelled) return;
      setGroup(g);
      // Sort: creator first, then alphabetically
      const sorted = [...m].sort((a, b) => {
        if (g && a.uid === g.createdBy) return -1;
        if (g && b.uid === g.createdBy) return 1;
        return a.name.localeCompare(b.name, 'he');
      });
      setMembers(sorted);
    }).catch((err) => {
      console.error('[CreatorManagementDrawer] fetch failed:', err);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [isOpen, groupId]);

  // ── Remove member ─────────────────────────────────────────────────────────
  const handleRemove = useCallback(async () => {
    if (!groupId || !confirmRemove) return;
    setRemovingUid(confirmRemove.uid);
    try {
      await leaveGroup(groupId, confirmRemove.uid);
      setMembers((prev) => prev.filter((m) => m.uid !== confirmRemove.uid));
      setConfirmRemove(null);
    } catch (err) {
      console.error('[CreatorManagementDrawer] remove member failed:', err);
    } finally {
      setRemovingUid(null);
    }
  }, [groupId, confirmRemove]);

  const cat = group ? (CATEGORY_CONFIG[group.category] ?? CATEGORY_CONFIG.other) : null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[88] bg-black/50"
              style={{ backdropFilter: 'blur(4px)' }}
              onClick={onClose}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }}
              className="fixed bottom-0 left-0 right-0 z-[89] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col"
              style={{ maxHeight: '88dvh' }}
            >
              {/* ── Drag Handle ─────────────────────────────── */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-slate-700" />
              </div>

              {/* ── Header ──────────────────────────────────── */}
              <div className="flex-shrink-0 px-5 pt-2 pb-4 border-b border-gray-100 dark:border-slate-800" dir="rtl">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {cat && (
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center text-xl shadow-sm flex-shrink-0`}>
                        {cat.emoji}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ניהול קהילה</p>
                      <h2 className="text-base font-black text-gray-900 dark:text-white leading-tight truncate">
                        {loading ? '...' : (group?.name ?? '—')}
                      </h2>
                      {!loading && group && (
                        <p className="text-[11px] text-gray-500 font-medium">
                          {cat?.label}
                          {group.memberCount != null && ` · ${group.memberCount} חברים`}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform mt-0.5"
                  >
                    <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
              </div>

              {/* ── Scrollable Body ──────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 space-y-5" dir="rtl">

                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
                  </div>
                ) : (
                  <>
                    {/* ── Quick Actions ───────────────────────── */}
                    <section>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">פעולות מהירות</p>
                      <div className="space-y-2">

                        {/* Edit Group Details */}
                        <button
                          onClick={() => {
                            if (!groupId) return;
                            onClose();
                            onEditGroup(groupId);
                          }}
                          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all"
                        >
                          <div className="w-9 h-9 rounded-xl bg-white/15 dark:bg-black/10 flex items-center justify-center flex-shrink-0">
                            <Pencil className="w-4 h-4" />
                          </div>
                          <div className="text-right flex-1">
                            <p className="text-sm font-black leading-tight">ערוך פרטי קהילה</p>
                            <p className="text-[10px] opacity-60 font-medium">שם, תיאור, מיקום, לוח זמנים</p>
                          </div>
                          <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0" />
                        </button>

                        {/* View Stats — future use */}
                        <button
                          disabled
                          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 opacity-60 cursor-not-allowed"
                        >
                          <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <BarChart2 className="w-4 h-4" />
                          </div>
                          <div className="text-right flex-1">
                            <p className="text-sm font-black leading-tight">צפה בסטטיסטיקות</p>
                            <p className="text-[10px] font-medium">בקרוב — נתוני פעילות ונוכחות</p>
                          </div>
                        </button>

                      </div>
                    </section>

                    {/* ── Member Management ───────────────────── */}
                    <section>
                      <div className="flex items-center gap-2 mb-2.5">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          חברי הקהילה
                          {members.length > 0 && (
                            <span className="normal-case tracking-normal font-semibold text-gray-400 mr-1">
                              ({members.length})
                            </span>
                          )}
                        </p>
                      </div>

                      {members.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">אין חברים רשומים עדיין</p>
                      ) : (
                        <div className="space-y-1.5">
                          {members.map((member) => {
                            const isGroupCreator = group ? member.uid === group.createdBy : false;
                            const initials = memberInitials(member.name);
                            return (
                              <div
                                key={member.uid}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/40"
                              >
                                {/* Avatar */}
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 shadow-sm ${isGroupCreator ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-cyan-400 to-blue-500'}`}>
                                  {initials}
                                </div>

                                {/* Name + badge */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                    {member.name}
                                  </p>
                                  {isGroupCreator && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5 leading-tight">
                                      <Crown className="w-2.5 h-2.5" />
                                      מנהל/ת
                                    </p>
                                  )}
                                </div>

                                {/* Remove button — not shown for creator */}
                                {!isGroupCreator && (
                                  <button
                                    onClick={() => setConfirmRemove(member)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-400 text-[11px] font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex-shrink-0 active:scale-95"
                                  >
                                    <X className="w-3 h-3" />
                                    הסר
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Remove Member Confirmation Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {confirmRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-5"
            style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(0,0,0,0.55)' }}
            onClick={() => !removingUid && setConfirmRemove(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-5"
              dir="rtl"
            >
              {/* Icon + text */}
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                  <LogOut className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">הסרת חבר/ה</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  האם להסיר את{' '}
                  <span className="font-bold text-gray-900 dark:text-white">{confirmRemove.name}</span>
                  {' '}מהקהילה?
                </p>
                <p className="text-xs text-gray-400">המשתמש יוסר מהקבוצה, מהצ׳אט ומהלוז האישי שלו</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  disabled={!!removingUid}
                  onClick={handleRemove}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  {removingUid ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogOut className="w-3.5 h-3.5" />
                      הסר
                    </>
                  )}
                </button>
                <button
                  disabled={!!removingUid}
                  onClick={() => setConfirmRemove(null)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-sm font-bold active:scale-95 transition-all"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
