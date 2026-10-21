'use client';

import React, { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Pencil,
  BarChart2,
  Users,
  Crown,
  Shield,
  LogOut,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { getGroupById, getGroupMembers, makeGroupAdmin, removeGroupAdmin, removeGroupMember } from '@/features/arena/services/group.service';
import type { CommunityGroup, GroupMember } from '@/types/community.types';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet, { SHEET_TITLE_CLASS } from '@/components/ui/v2/Sheet';
import ConfirmSheet from '@/components/ui/v2/ConfirmSheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Labels: community.json `creator.category` (select on the category id, unknown → other).
const CATEGORY_CONFIG: Record<string, { emoji: string; gradient: string }> = {
  walking:      { emoji: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:      { emoji: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:         { emoji: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics: { emoji: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:      { emoji: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:        { emoji: '⭐', gradient: 'from-gray-500 to-gray-600' },
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
  const t = useT(community);
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [activeActionUid, setActiveActionUid] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  // enable_home_v2: the shared <Sheet> + ConfirmSheet; flag off keeps the markup below untouched.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

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

  // ── Remove member (confirm → execute) ────────────────────────────────────
  const handleRemove = useCallback(async () => {
    if (!groupId || !confirmRemove) return;
    setRemovingUid(confirmRemove.uid);
    try {
      await removeGroupMember(groupId, confirmRemove.uid);
      setMembers((prev) => prev.filter((m) => m.uid !== confirmRemove.uid));
      setConfirmRemove(null);
    } catch (err) {
      console.error('[CreatorManagementDrawer] remove member failed:', err);
    } finally {
      setRemovingUid(null);
    }
  }, [groupId, confirmRemove]);

  // ── Toggle admin (promote / demote) ───────────────────────────────────────
  const handleToggleAdmin = useCallback(async (member: GroupMember) => {
    if (!groupId || actionPending) return;
    setActionPending(member.uid);
    try {
      if (member.role === 'member') {
        await makeGroupAdmin(groupId, member.uid);
        setMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, role: 'admin' } : m));
      } else {
        await removeGroupAdmin(groupId, member.uid);
        setMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, role: 'member' } : m));
      }
      setActiveActionUid(null);
    } catch (err) {
      console.error('[CreatorManagementDrawer] toggle admin failed:', err);
    } finally {
      setActionPending(null);
    }
  }, [groupId, actionPending]);

  const cat = group ? (CATEGORY_CONFIG[group.category] ?? CATEGORY_CONFIG.other) : null;
  const catLabel = group ? t('creator.category', { category: group.category ?? '' }) : null;
  const memberCountLabel = group?.memberCount != null ? t('creator.memberCount', { count: String(group.memberCount) }) : null;

  const body = (
    <>
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
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">{t('creator.quickActions')}</p>
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
                    <p className="text-sm font-black leading-tight">{t('creator.edit.title')}</p>
                    <p className="text-[10px] opacity-60 font-medium">{t('creator.edit.subtitle')}</p>
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
                    <p className="text-sm font-black leading-tight">{t('creator.stats.title')}</p>
                    <p className="text-[10px] font-medium">{t('creator.stats.subtitle')}</p>
                  </div>
                </button>

              </div>
            </section>

            {/* ── Member Management ───────────────────── */}
            <section>
              <div className="flex items-center gap-2 mb-2.5">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {t('creator.members.title')}
                  {members.length > 0 && (
                    <span className="normal-case tracking-normal font-semibold text-gray-400 mr-1">
                      ({members.length})
                    </span>
                  )}
                </p>
              </div>

              {members.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{t('creator.members.empty')}</p>
              ) : (
                <div className="space-y-1.5">
                  {members.map((member) => {
                    const isGroupCreator = group ? member.uid === group.createdBy : false;
                    const isGroupAdminMember = !isGroupCreator && member.role === 'admin';
                    const initials = memberInitials(member.name);
                    const canPromote = !isGroupCreator && member.role === 'member';
                    const canDemote  = !isGroupCreator && member.role === 'admin';
                    const canRemove  = !isGroupCreator;
                    const hasActions = canPromote || canDemote || canRemove;
                    const isExpanded = activeActionUid === member.uid;
                    return (
                      <div key={member.uid} className="rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-700/40">
                        {/* Member row */}
                        <button
                          type="button"
                          disabled={!hasActions}
                          onClick={() => hasActions && setActiveActionUid(isExpanded ? null : member.uid)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-slate-800/50 transition-colors ${hasActions ? 'active:bg-gray-100 dark:active:bg-slate-700/60 cursor-pointer' : 'cursor-default'}`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 shadow-sm ${isGroupCreator ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-cyan-400 to-blue-500'}`}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                              {member.name}
                            </p>
                            {isGroupCreator && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5 leading-tight">
                                <Crown className="w-2.5 h-2.5" />
                                {t('creator.members.owner')}
                              </p>
                            )}
                            {isGroupAdminMember && (
                              <p className="text-[10px] text-blue-500 dark:text-blue-400 font-bold flex items-center gap-0.5 leading-tight">
                                <Shield className="w-2.5 h-2.5" />
                                {t('creator.members.admin')}
                              </p>
                            )}
                          </div>
                          {hasActions && (
                            <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          )}
                        </button>

                        {/* Inline action panel */}
                        {isExpanded && (
                          <div className="bg-gray-100 dark:bg-slate-700/60 border-t border-gray-200 dark:border-slate-600/40 px-3 py-2 space-y-1" dir="rtl">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">
                              {t('creator.members.actions', { name: member.name })}
                            </p>
                            {canPromote && (
                              <button
                                disabled={actionPending === member.uid}
                                onClick={() => handleToggleAdmin(member)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                              >
                                {actionPending === member.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-blue-500" />}
                                {t('creator.members.promote')}
                                <span className="text-xs text-gray-400 font-normal mr-auto">{t('creator.members.promoteHint')}</span>
                              </button>
                            )}
                            {canDemote && (
                              <button
                                disabled={actionPending === member.uid}
                                onClick={() => handleToggleAdmin(member)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                              >
                                {actionPending === member.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-gray-400" />}
                                {t('creator.members.demote')}
                              </button>
                            )}
                            {canRemove && (
                              <button
                                onClick={() => { setConfirmRemove(member); setActiveActionUid(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <X className="w-4 h-4" />
                                {t('creator.members.remove')}
                              </button>
                            )}
                          </div>
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
    </>
  );

  if (v2) {
    return (
      <>
        <Sheet
          open={isOpen}
          onClose={onClose}
          // Backdrop z-[88] / panel z-[89] (.cursorrules), in place — unchanged.
          zIndex={SHEET_Z.creatorDrawerPanel}
          backdropZIndex={SHEET_Z.creatorDrawer}
          portal={false}
          keyboardAware={false}
          backdropClassName="bg-black/50"
          backdropStyle={{ backdropFilter: 'blur(4px)' }}
          frameClassName="max-w-md mx-auto"
          // The body below owns its scroll (flex-1 overflow-y-auto), as before.
          scroll="none"
          className="flex max-h-[88dvh] flex-col"
          safeArea={false}
          transition={{ type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }}
          ariaLabel={t('creator.title')}
          header={
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-1" dir="rtl">
              <div className="flex min-w-0 items-center gap-3">
                {cat && (
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br ${cat.gradient} text-xl shadow-v2-ring`}>
                    {cat.emoji}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{t('creator.title')}</p>
                  <h2 className={`${SHEET_TITLE_CLASS} truncate leading-tight`}>
                    {loading ? '...' : (group?.name ?? '—')}
                  </h2>
                  {!loading && group && (
                    <p className="truncate text-[12px] font-bold text-v2-muted">
                      {catLabel}
                      {memberCountLabel}
                    </p>
                  )}
                </div>
              </div>
              <IconButton aria-label={t('creator.close')} tone="surface" size={36} className="shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          }
        >
          {body}
        </Sheet>

        {/* Remove-member confirm — backdrop z-[95] / sheet z-[96] (.cursorrules z-[95] row). */}
        <ConfirmSheet
          open={!!confirmRemove}
          onClose={() => { if (!removingUid) setConfirmRemove(null); }}
          zIndex={SHEET_Z.navigatePanel}
          backdropZIndex={SHEET_Z.navigate}
          portal={false}
          title={t('creator.remove.title')}
          description={
            confirmRemove && (
              <>
                {t.rich('creator.remove.question', {
                  name: confirmRemove.name,
                  b: (chunks: ReactNode) => <span className="text-v2-ink">{chunks}</span>,
                })}
                <span className="mt-1 block text-[12.5px]">{t('creator.remove.note')}</span>
              </>
            )
          }
          actions={[
            {
              label: removingUid ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <LogOut className="h-4 w-4" />
                  {t('creator.remove.confirm')}
                </span>
              ),
              tone: 'danger',
              disabled: !!removingUid,
              onClick: handleRemove,
            },
            { label: t('creator.remove.cancel'), tone: 'ghost', disabled: !!removingUid, onClick: () => setConfirmRemove(null) },
          ]}
        />
      </>
    );
  }

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
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('creator.title')}</p>
                      <h2 className="text-base font-black text-gray-900 dark:text-white leading-tight truncate">
                        {loading ? '...' : (group?.name ?? '—')}
                      </h2>
                      {!loading && group && (
                        <p className="text-[11px] text-gray-500 font-medium">
                          {catLabel}
                          {memberCountLabel}
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

              {body}
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
                <h3 className="text-base font-black text-gray-900 dark:text-white">{t('creator.remove.title')}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t.rich('creator.remove.question', {
                    name: confirmRemove.name,
                    b: (chunks: ReactNode) => <span className="font-bold text-gray-900 dark:text-white">{chunks}</span>,
                  })}
                </p>
                <p className="text-xs text-gray-400">{t('creator.remove.note')}</p>
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
                      {t('creator.remove.confirm')}
                    </>
                  )}
                </button>
                <button
                  disabled={!!removingUid}
                  onClick={() => setConfirmRemove(null)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-sm font-bold active:scale-95 transition-all"
                >
                  {t('creator.remove.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
