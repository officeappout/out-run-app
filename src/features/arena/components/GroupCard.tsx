'use client';

import React from 'react';
import { Users, Clock, MapPin, Lock } from 'lucide-react';
import { useUserStore } from '@/features/user';
import type { CommunityGroup, CommunityGroupCategory } from '@/types/community.types';

const CATEGORY_LABELS: Record<CommunityGroupCategory, string> = {
  walking: 'הליכה',
  running: 'ריצה',
  yoga: 'יוגה',
  calisthenics: 'קליסתניקס',
  cycling: 'רכיבה',
  other: 'אחר',
};

const CATEGORY_EMOJI: Record<CommunityGroupCategory, string> = {
  walking: '🚶',
  running: '🏃',
  yoga: '🧘',
  calisthenics: '💪',
  cycling: '🚴',
  other: '⭐',
};

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

interface GroupCardProps {
  group: CommunityGroup;
  onJoin?: (groupId: string) => void;
  onLockedJoin?: () => void;
}

export default function GroupCard({ group, onJoin, onLockedJoin }: GroupCardProps) {
  const socialUnlocked = useUserStore((s) => s.getSocialUnlocked());

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 active:scale-[0.98] transition-transform"
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center text-lg flex-shrink-0">
          {CATEGORY_EMOJI[group.category]}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {group.name}
          </h4>
          <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
            {CATEGORY_LABELS[group.category]}
          </span>

          {group.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              {group.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600 dark:text-gray-400">
            {group.schedule && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                יום {DAY_LABELS[group.schedule.dayOfWeek]} {group.schedule.time}
              </span>
            )}
            {group.meetingLocation?.address && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3" />
                {group.meetingLocation.address}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Users className="w-3.5 h-3.5" />
            <span className="font-bold tabular-nums">{group.currentParticipants}</span>
          </div>

          <button
            disabled={!socialUnlocked}
            onClick={() => {
              if (!socialUnlocked) {
                onLockedJoin?.();
                return;
              }
              onJoin?.(group.id);
            }}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
              socialUnlocked
                ? 'bg-[#00BAF7] text-white shadow-sm hover:bg-[#00a8e0]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {socialUnlocked ? (
              'הצטרף'
            ) : (
              <span className="flex items-center gap-1">
                <Lock size={10} />
                הצטרף
              </span>
            )}
          </button>
        </div>
      </div>

      {!socialUnlocked && (
        <p className="text-[10px] text-gray-400 text-center mt-2">
          הזמן שותף אחד כדי להצטרף לקבוצות ודירוגים
        </p>
      )}
    </div>
  );
}
