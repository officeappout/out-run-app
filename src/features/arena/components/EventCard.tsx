'use client';

import React from 'react';
import { Clock, MapPin, ShieldCheck, Loader2, CalendarCheck, Users } from 'lucide-react';
import type { CommunityEvent, EventCategory, EventRegistration } from '@/types/community.types';
import AttendeesPreview from './AttendeesPreview';

const CATEGORY_CONFIG: Record<EventCategory, { label: string; icon: string; gradient: string }> = {
  race:             { label: 'מרוץ',         icon: '🏃', gradient: 'from-orange-500 to-red-500'     },
  fitness_day:      { label: 'יום כושר',     icon: '💪', gradient: 'from-cyan-500 to-blue-600'      },
  workshop:         { label: 'סדנה',         icon: '🎓', gradient: 'from-violet-500 to-purple-600'  },
  community_meetup: { label: 'מפגש קהילתי', icon: '🤝', gradient: 'from-emerald-500 to-teal-600'   },
  other:            { label: 'אחר',          icon: '⭐', gradient: 'from-gray-500 to-gray-700'      },
};

function formatEventDate(date: Date | string): { day: string; month: string; weekday: string } {
  const d = date instanceof Date ? date : new Date(date);
  return {
    day:     d.toLocaleDateString('he-IL', { day: 'numeric' }),
    month:   d.toLocaleDateString('he-IL', { month: 'short' }),
    weekday: d.toLocaleDateString('he-IL', { weekday: 'short' }),
  };
}

interface EventCardProps {
  event: CommunityEvent;
  registrations?: EventRegistration[];
  registrationCount?: number;
  onJoin?: (eventId: string) => void;
  isJoined?: boolean;
  joining?: boolean;
  authorityLogoUrl?: string;
  onCardClick?: () => void;
}

export default function EventCard({
  event,
  registrations,
  registrationCount,
  onJoin,
  isJoined,
  joining,
  authorityLogoUrl,
  onCardClick,
}: EventCardProps) {
  const { day, month, weekday } = formatEventDate(event.date);
  const logoUrl = authorityLogoUrl || event.authorityLogoUrl;
  const displayCount = registrationCount ?? event.currentRegistrations;
  const catConfig = CATEGORY_CONFIG[event.category];
  const isOfficial = event.isOfficial;
  const coverImage = event.images?.[0];

  function handleJoinClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isJoined && !joining) onJoin?.(event.id);
  }

  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all cursor-pointer active:scale-[0.98] ${
        isOfficial
          ? 'shadow-lg shadow-cyan-500/10 dark:shadow-cyan-400/5'
          : 'shadow-md shadow-black/5 dark:shadow-black/20'
      }`}
      dir="rtl"
      onClick={onCardClick}
    >
      {/* Official gradient accent border */}
      {isOfficial && (
        <div
          className="absolute inset-0 rounded-2xl p-[1.5px] pointer-events-none z-10"
          style={{
            background: 'linear-gradient(135deg, #06B6D4, #3B82F6, #8B5CF6)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
      )}

      {/* ── Cover banner ─────────────────────────────────── */}
      <div className="relative h-32 overflow-hidden">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={event.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${catConfig.gradient} flex items-center justify-center`}>
            <span className="text-5xl drop-shadow-md select-none">{catConfig.icon}</span>
          </div>
        )}

        {/* Dark gradient overlay — always present for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

        {/* Date tile — overlaid bottom-right */}
        <div className={`absolute bottom-2.5 right-2.5 w-12 h-14 rounded-xl flex flex-col items-center justify-center text-white shadow-md ${
          isOfficial
            ? 'bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-600'
            : 'bg-black/60 backdrop-blur-sm'
        }`}>
          <span className="text-[8px] font-bold leading-none opacity-75 uppercase tracking-wide">{weekday}</span>
          <span className="text-lg font-black leading-none mt-0.5">{day}</span>
          <span className="text-[8px] font-bold leading-none opacity-75 mt-0.5">{month}</span>
        </div>

        {/* Category chip — top right */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
          <span>{catConfig.icon}</span>
          <span>{catConfig.label}</span>
        </div>

        {/* Official badge — top left */}
        {isOfficial && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="w-3.5 h-3.5 rounded object-contain bg-white p-0.5 flex-shrink-0" />
            )}
            <ShieldCheck className="w-3 h-3" />
            <span>רשמי</span>
          </div>
        )}
      </div>

      {/* ── Card body ─────────────────────────────────────── */}
      <div className={`relative p-4 ${
        isOfficial
          ? 'bg-gradient-to-br from-white via-white to-cyan-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-cyan-950/30'
          : 'bg-white dark:bg-slate-900'
      }`}>
        {/* Top-fade blending banner into card body */}
        <div className={`absolute -top-5 left-0 right-0 h-5 bg-gradient-to-b ${
          isOfficial ? 'from-white' : 'from-white dark:from-slate-900'
        } to-transparent pointer-events-none`} />

        <h4 className="text-[15px] font-black text-gray-900 dark:text-gray-50 leading-snug mb-1 line-clamp-1">
          {event.name}
        </h4>

        {event.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2 mb-2.5">
            {event.description}
          </p>
        )}

        {/* Time + location row */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] mb-3">
          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <span className="font-semibold">
              {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
            </span>
          </span>
          {event.location?.address && (
            <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="truncate font-medium">{event.location.address}</span>
            </span>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800/60">
          <AttendeesPreview
            attendees={registrations ?? []}
            total={displayCount}
          />

          {onJoin && (
            <button
              disabled={isJoined || joining}
              onClick={handleJoinClick}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                isJoined
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800'
                  : isOfficial
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/25 hover:shadow-lg'
                    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md hover:shadow-lg'
              }`}
            >
              {joining ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isJoined ? (
                <>
                  <CalendarCheck className="w-3.5 h-3.5" />
                  רשום/ה
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  הרשמה
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
