'use client';

import React from 'react';
import { Clock, MapPin, UserPlus, ImageOff, MessageCircle, Navigation, Users } from 'lucide-react';
import type { CommunityGroup, CommunityGroupCategory, EventRegistration } from '@/types/community.types';
import AttendeesPreview from './AttendeesPreview';
import { distanceLabel } from '@/features/arena/utils/distance';

const CATEGORY_CONFIG: Record<CommunityGroupCategory, { label: string; icon: string; gradient: string }> = {
  walking:     { label: 'הליכה',      icon: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:     { label: 'ריצה',       icon: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:        { label: 'יוגה',       icon: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics:{ label: 'קליסתניקס', icon: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:     { label: 'רכיבה',      icon: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:       { label: 'אחר',        icon: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

interface GroupCardProps {
  group: CommunityGroup;
  members?: EventRegistration[];
  isJoined?: boolean;
  joining?: boolean;
  distanceKm?: number;
  /** When provided, shows an 'עדכן מיקום' link. Pass only for group creator. */
  onUpdateLocation?: () => void;
  onJoin?: (groupId: string) => void;
  onLockedJoin?: () => void;
  onCardClick?: () => void;
  onOpenChat?: () => void;
}

export default function GroupCard({
  group,
  members,
  isJoined,
  joining,
  distanceKm,
  onUpdateLocation,
  onJoin,
  onLockedJoin,
  onCardClick,
  onOpenChat,
}: GroupCardProps) {
  const catConfig = CATEGORY_CONFIG[group.category];
  const coverImage = group.images?.[0];

  const scheduleLabel = (() => {
    if (group.scheduleSlots?.length) {
      return group.scheduleSlots.map(s => `יום ${DAY_LABELS[s.dayOfWeek]} ${s.time}`).join(' · ');
    }
    if (group.schedule) {
      return `יום ${DAY_LABELS[group.schedule.dayOfWeek]} ${group.schedule.time}`;
    }
    return null;
  })();

  function handleJoinClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isJoined) {
      onOpenChat?.();
      return;
    }
    onJoin?.(group.id);
  }

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl shadow-md shadow-black/5 dark:shadow-black/20 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      dir="rtl"
      onClick={onCardClick}
    >
      {/* ── Cover banner ──────────────────────────────────── */}
      <div className="relative h-32 overflow-hidden">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={group.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${catConfig.gradient} flex items-center justify-center`}>
            <span className="text-5xl drop-shadow-md select-none">{catConfig.icon}</span>
          </div>
        )}

        {/* Dark gradient overlay — always present for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Category chip — top right */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
          <span>{catConfig.icon}</span>
          <span>{catConfig.label}</span>
        </div>

        {/* Schedule chip — bottom right over scrim */}
        {scheduleLabel && (
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
            <Clock className="w-3 h-3 opacity-80" />
            <span>{scheduleLabel}</span>
          </div>
        )}

        {/* Community-created badge — top left of image */}
        {group.source === 'user' && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-emerald-500/90 backdrop-blur-sm text-white text-[9px] font-black px-2 py-0.5 rounded-full">
            <Users className="w-2.5 h-2.5" />
            <span>קהילתי</span>
          </div>
        )}

        {/* No-image indicator */}
        {!coverImage && (
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 bg-black/20 text-white/60 text-[9px] px-2 py-0.5 rounded-full">
            <ImageOff className="w-2.5 h-2.5" />
          </div>
        )}
      </div>

      {/* ── Card body ─────────────────────────────────────── */}
      <div className="relative p-4">
        {/* Subtle top-fade blending image into card body */}
        <div className="absolute -top-5 left-0 right-0 h-5 bg-gradient-to-b from-white dark:from-slate-900 to-transparent pointer-events-none" />

        <h4 className="text-[15px] font-black text-gray-900 dark:text-gray-50 leading-snug mb-1 line-clamp-1">
          {group.name}
        </h4>

        {group.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2 mb-2.5">
            {group.description}
          </p>
        )}

        {/* Address + distance row */}
        {(group.meetingLocation?.address || distanceKm != null) && (
          <div className="flex items-center justify-between gap-2 mb-3">
            {group.meetingLocation?.address ? (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="truncate font-medium">{group.meetingLocation.address}</span>
              </div>
            ) : (
              <span />
            )}
            {distanceKm != null && (
              <div className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold flex-shrink-0">
                <Navigation className="w-3 h-3" />
                <span>{distanceLabel(distanceKm)}</span>
              </div>
            )}
          </div>
        )}

        {/* Creator location fix — only shown when onUpdateLocation is provided */}
        {onUpdateLocation && (
          <button
            onClick={(e) => { e.stopPropagation(); onUpdateLocation(); }}
            className="flex items-center gap-1 text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold mb-2.5 hover:underline active:opacity-70 transition-opacity"
          >
            <Navigation className="w-2.5 h-2.5" />
            עדכן מיקום למיקומי הנוכחי
          </button>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800/60">
          <AttendeesPreview
            attendees={members ?? []}
            total={group.currentParticipants}
          />

          <button
            onClick={handleJoinClick}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
              isJoined
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/25'
                : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md hover:shadow-lg'
            }`}
          >
            {isJoined ? (
              <>
                <MessageCircle className="w-3.5 h-3.5" />
                כנס לצ&apos;אט
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                הצטרף
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
