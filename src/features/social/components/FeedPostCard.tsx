'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Trash2, Flag, Loader2 } from 'lucide-react';
import { toggleReaction, hasUserReacted } from '../services/reactions.service';
import { deleteFeedPost, type FeedPost } from '../services/feed.service';
import ReportContentSheet from '@/features/arena/components/ReportContentSheet';

const CATEGORY_EMOJI: Record<string, string> = {
  strength: '💪',
  cardio: '🏃',
  maintenance: '⚡',
};

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'כוח / קליסטניקס',
  cardio: 'ריצה / קרדיו',
  maintenance: 'תחזוקה',
};

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

function formatPace(pace: number): string {
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface FeedPostCardProps {
  post: FeedPost;
  currentUid?: string;
  /**
   * Called after the post is successfully deleted from Firestore so the
   * parent list can drop it from local state without a re-fetch.
   * (Phase 7.1 — author erasure on the feed.)
   */
  onDeleted?: (postId: string) => void;
}

export default function FeedPostCard({ post, currentUid, onDeleted }: FeedPostCardProps) {
  const router = useRouter();
  const emoji = CATEGORY_EMOJI[post.activityCategory] ?? '⚡';
  const label = CATEGORY_LABEL[post.activityCategory] ?? post.activityCategory;
  const isCardio = post.activityCategory === 'cardio';

  const [reacted, setReacted] = useState(false);
  const [count, setCount] = useState(post.reactionCount ?? 0);
  const [toggling, setToggling] = useState(false);

  // Phase 7.1 / 7.2 — context menu (delete for author, report for others)
  const isAuthor = !!currentUid && currentUid === post.authorUid;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss for the menu / confirm popover.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    // pointerdown rather than click so the dismiss happens before the
    // child receives the click and we don't accidentally trigger
    // navigateToProfile.
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [menuOpen]);

  useEffect(() => {
    if (!currentUid) return;
    hasUserReacted(post.id, currentUid)
      .then(setReacted)
      .catch(() => {});
  }, [post.id, currentUid]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteFeedPost(post.id);
      onDeleted?.(post.id);
    } catch (err) {
      console.error('[FeedPostCard] delete failed:', err);
      alert('מחיקת הפוסט נכשלה. אנא נסה/י שוב.');
      setDeleting(false);
      setConfirmDelete(false);
      setMenuOpen(false);
    }
    // On success the card is unmounted by the parent via onDeleted, so
    // we deliberately do not reset the spinner.
  }, [deleting, post.id, onDeleted]);

  const handleKudos = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!currentUid || toggling) return;
      setToggling(true);

      const wasReacted = reacted;
      setReacted(!wasReacted);
      setCount((c) => c + (wasReacted ? -1 : 1));

      try {
        await toggleReaction(post.id, currentUid);
      } catch {
        setReacted(wasReacted);
        setCount((c) => c + (wasReacted ? 1 : -1));
      } finally {
        setToggling(false);
      }
    },
    [currentUid, toggling, reacted, post.id],
  );

  const navigateToProfile = useCallback(() => {
    router.push(`/profile/${post.authorUid}`);
  }, [router, post.authorUid]);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
      dir="rtl"
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <div
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
          onClick={navigateToProfile}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-black shrink-0">
            {post.authorName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
              {post.authorName}
            </h4>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {timeAgo(post.createdAt)}
            </span>
          </div>
          <span className="text-xl">{emoji}</span>
        </div>

        {/* Kebab menu — Phase 7.1 (delete for author) / 7.2 (report for others).
            Hidden when there is no signed-in user (no actions to offer). */}
        {currentUid && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
                setConfirmDelete(false);
              }}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-90 transition-all"
              aria-label="פעולות נוספות"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={18} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="absolute end-0 top-full mt-1 z-20 min-w-[180px] rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-gray-700 shadow-lg overflow-hidden"
              >
                {confirmDelete ? (
                  <div className="p-3" dir="rtl">
                    <p className="text-xs text-gray-700 dark:text-gray-200 font-medium mb-2">
                      למחוק את הפוסט?
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 leading-snug">
                      הפעולה הזו אינה ניתנת לביטול.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setConfirmDelete(false); setMenuOpen(false); }}
                        disabled={deleting}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold active:scale-95 disabled:opacity-50"
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold active:scale-95 disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        מחק
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="py-1" dir="rtl">
                    {isAuthor && (
                      <li>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setConfirmDelete(true)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={16} />
                          מחק פוסט
                        </button>
                      </li>
                    )}
                    {!isAuthor && (
                      <li>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setShowReport(true); setMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                        >
                          <Flag size={16} />
                          דווח על פוסט
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phase 7.2 — Report sheet for non-author readers */}
      {currentUid && !isAuthor && (
        <ReportContentSheet
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          targetId={post.id}
          targetType="post"
          targetName={post.title || `פוסט של ${post.authorName}`}
          reporterId={currentUid}
        />
      )}

      {/* Workout summary card */}
      <div className="mx-3 mb-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50">
        {/* Title bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100 dark:border-gray-700/50">
          <span className="text-[13px] font-black text-gray-900 dark:text-gray-100">
            סיכום אימון
          </span>
          <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 px-2 py-0.5 rounded-full">
            {label}
          </span>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-gray-100 dark:divide-gray-700/50">
          {/* Duration — always shown */}
          <div className="flex flex-col items-center py-3 px-2">
            <span className="text-base leading-none mb-1">⏱️</span>
            <span className="text-[15px] font-black text-gray-900 dark:text-gray-100 tabular-nums">
              {post.durationMinutes}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
              דקות
            </span>
          </div>

          {isCardio ? (
            <>
              {/* Distance */}
              <div className="flex flex-col items-center py-3 px-2">
                <span className="text-base leading-none mb-1">📏</span>
                <span className="text-[15px] font-black text-gray-900 dark:text-gray-100 tabular-nums">
                  {post.distanceKm != null ? post.distanceKm.toFixed(1) : '—'}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                  ק״מ
                </span>
              </div>
              {/* Pace */}
              <div className="flex flex-col items-center py-3 px-2">
                <span className="text-base leading-none mb-1">🏃</span>
                <span className="text-[15px] font-black text-gray-900 dark:text-gray-100 tabular-nums">
                  {post.paceMinPerKm != null ? formatPace(post.paceMinPerKm) : '—'}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                  דק׳/ק״מ
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Intensity */}
              <div className="flex flex-col items-center py-3 px-2">
                <span className="text-base leading-none mb-1">🔥</span>
                <span className="text-[15px] font-black text-gray-900 dark:text-gray-100">
                  {post.intensityLevel ?? '—'}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                  עצימות
                </span>
              </div>
              {/* Activity Credit */}
              <div className="flex flex-col items-center py-3 px-2">
                <span className="text-base leading-none mb-1">⭐</span>
                <span className="text-[15px] font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  {post.activityCredit}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                  קרדיט פעילות
                </span>
              </div>
            </>
          )}
        </div>

        {/* Activity credit footer for cardio */}
        {isCardio && (
          <div className="flex items-center justify-center gap-1.5 py-2 border-t border-gray-100 dark:border-gray-700/50">
            <span className="text-xs">⭐</span>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {post.activityCredit} קרדיט פעילות
            </span>
          </div>
        )}
      </div>

      {/* Kudos bar */}
      {currentUid && (
        <div className="flex items-center px-4 pb-3">
          <button
            onClick={handleKudos}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
              reacted
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-500'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100'
            }`}
          >
            <span className={`text-base ${reacted ? 'animate-bounce' : ''}`}>🔥</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        </div>
      )}
    </div>
  );
}
