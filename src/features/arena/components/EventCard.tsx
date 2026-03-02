'use client';

import React from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import type { CommunityEvent, EventCategory } from '@/types/community.types';

const CATEGORY_LABELS: Record<EventCategory, string> = {
  race: 'מרוץ',
  fitness_day: 'יום כושר',
  workshop: 'סדנה',
  community_meetup: 'מפגש קהילתי',
  other: 'אחר',
};

function formatEventDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export default function EventCard({ event }: { event: CommunityEvent }) {
  const dateStr = formatEventDate(event.date);

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 active:scale-[0.98] transition-transform"
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex flex-col items-center justify-center flex-shrink-0 text-white">
          <span className="text-[10px] font-bold leading-none opacity-80">
            {dateStr.split(' ')[1]}
          </span>
          <span className="text-base font-black leading-none">
            {dateStr.split(' ')[0]}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {event.name}
          </h4>
          <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
            {CATEGORY_LABELS[event.category]}
          </span>

          {event.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              {event.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {event.startTime}
              {event.endTime ? `–${event.endTime}` : ''}
            </span>
            {event.location?.address && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3" />
                {event.location.address}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
