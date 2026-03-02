'use client';

import React from 'react';
import { CalendarHeart, Users2 } from 'lucide-react';
import type { Authority } from '@/types/admin-types';
import type { CommunityGroup, CommunityEvent } from '@/types/community.types';
import GroupCard from './GroupCard';
import EventCard from './EventCard';
import NeighborhoodLeaderboard from './NeighborhoodLeaderboard';

interface CityArenaViewProps {
  authority: Authority;
  groups: CommunityGroup[];
  events: CommunityEvent[];
}

export default function CityArenaView({ authority, groups, events }: CityArenaViewProps) {
  return (
    <div className="space-y-6" dir="rtl">
      {/* Authority banner */}
      <div className="flex items-center gap-3 px-1">
        {authority.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={authority.logoUrl}
            alt={authority.name}
            className="w-10 h-10 rounded-xl object-cover border border-gray-200 dark:border-gray-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-lg font-black text-cyan-700 dark:text-cyan-300">
            {authority.name.charAt(0)}
          </div>
        )}
        <div>
          <h3 className="text-base font-black text-gray-900 dark:text-gray-100">
            {authority.name}
          </h3>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {authority.userCount > 0 ? `${authority.userCount} משתמשים` : 'קהילה חדשה'}
          </span>
        </div>
      </div>

      {/* Real leaderboard — scoped to this authority (city) */}
      <NeighborhoodLeaderboard
        scope="city"
        scopeId={authority.id}
        scopeLabel={authority.name}
      />

      {/* Upcoming events */}
      {events.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-1 mb-3">
            <CalendarHeart className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">אירועים קרובים</h4>
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-auto">{events.length}</span>
          </div>
          <div className="space-y-2.5">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {/* Active groups */}
      {groups.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-1 mb-3">
            <Users2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">קבוצות פעילות</h4>
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-auto">{groups.length}</span>
          </div>
          <div className="space-y-2.5">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {events.length === 0 && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <Users2 className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">עוד אין פעילויות</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            קבוצות ואירועים חדשים יופיעו כאן ברגע שמנהל העיר ייצור אותם
          </p>
        </div>
      )}
    </div>
  );
}
