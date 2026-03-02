'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, UserMinus } from 'lucide-react';
import { useSocialStore } from '../store/useSocialStore';
import type { UserSearchResult } from '../services/user-search.service';

interface PartnerCardProps {
  user: UserSearchResult;
  myUid: string;
}

export default function PartnerCard({ user, myUid }: PartnerCardProps) {
  const router = useRouter();
  const { isFollowing, followUser, unfollowUser } = useSocialStore();
  const isSelf = user.uid === myUid;
  const followed = isFollowing(user.uid);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isSelf) return;
      if (followed) {
        unfollowUser(myUid, user.uid);
      } else {
        followUser(myUid, user.uid);
      }
    },
    [followed, isSelf, myUid, user.uid, followUser, unfollowUser],
  );

  return (
    <div
      onClick={() => router.push(`/profile/${user.uid}`)}
      className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 cursor-pointer active:scale-[0.98] transition-transform"
      dir="rtl"
    >
      {/* Avatar */}
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoURL}
          alt={user.name}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
          {user.name.charAt(0)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
          {user.name}
        </h4>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {user.currentLevel ?? user.fitnessLevel ?? ''}
        </span>
      </div>

      {/* Follow / Unfollow button */}
      {!isSelf && (
        <button
          onClick={handleToggle}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
            followed
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              : 'bg-cyan-500 text-white shadow-sm'
          }`}
        >
          {followed ? (
            <>
              <UserMinus className="w-3.5 h-3.5" />
              עוקב
            </>
          ) : (
            <>
              <UserPlus className="w-3.5 h-3.5" />
              עקוב
            </>
          )}
        </button>
      )}

      {isSelf && (
        <span className="text-[10px] font-bold text-gray-400 px-2">אני</span>
      )}
    </div>
  );
}
