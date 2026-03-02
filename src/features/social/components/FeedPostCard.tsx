'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toggleReaction, hasUserReacted } from '../services/reactions.service';
import type { FeedPost } from '../services/feed.service';

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
}

export default function FeedPostCard({ post, currentUid }: FeedPostCardProps) {
  const router = useRouter();
  const emoji = CATEGORY_EMOJI[post.activityCategory] ?? '⚡';
  const label = CATEGORY_LABEL[post.activityCategory] ?? post.activityCategory;
  const isCardio = post.activityCategory === 'cardio';

  const [reacted, setReacted] = useState(false);
  const [count, setCount] = useState(post.reactionCount ?? 0);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!currentUid) return;
    hasUserReacted(post.id, currentUid)
      .then(setReacted)
      .catch(() => {});
  }, [post.id, currentUid]);

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
      <div
        className="flex items-center gap-2.5 px-4 pt-4 pb-2 cursor-pointer"
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
