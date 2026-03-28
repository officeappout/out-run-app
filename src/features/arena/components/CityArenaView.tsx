'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CalendarHeart, Users2, Sparkles, ChevronLeft } from 'lucide-react';
import type { Authority } from '@/types/admin-types';
import type { CommunityGroup, CommunityEvent, EventRegistration } from '@/types/community.types';
import { useUserStore } from '@/features/user';
import {
  joinEvent,
  getEventRegistrations,
  isUserRegistered,
} from '@/features/admin/services/community.service';
import GroupCard from './GroupCard';
import EventCard from './EventCard';
import NeighborhoodLeaderboard from './NeighborhoodLeaderboard';

interface CityArenaViewProps {
  authority: Authority;
  groups: CommunityGroup[];
  events: CommunityEvent[];
}

export default function CityArenaView({ authority, groups, events }: CityArenaViewProps) {
  const profile = useUserStore((s) => s.profile);
  const uid = profile?.id;
  const joinedGroupIds = profile?.social?.groupIds ?? [];

  const [registrationsMap, setRegistrationsMap] = useState<Record<string, EventRegistration[]>>({});
  const [joinedMap, setJoinedMap] = useState<Record<string, boolean>>({});
  const [countOverrides, setCountOverrides] = useState<Record<string, number>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!events.length) return;

    async function loadEventData() {
      const regEntries: [string, EventRegistration[]][] = [];
      const joinEntries: [string, boolean][] = [];

      await Promise.all(
        events.map(async (ev) => {
          const [regs, joined] = await Promise.all([
            getEventRegistrations(ev.id, 5),
            uid ? isUserRegistered(ev.id, uid) : Promise.resolve(false),
          ]);
          regEntries.push([ev.id, regs]);
          joinEntries.push([ev.id, joined]);
        }),
      );

      setRegistrationsMap(Object.fromEntries(regEntries));
      setJoinedMap(Object.fromEntries(joinEntries));
    }

    loadEventData();
  }, [events, uid]);

  const handleJoinEvent = useCallback(async (eventId: string) => {
    console.log('[CityArena] Join clicked — eventId:', eventId, 'uid:', uid);

    if (!uid) {
      console.warn('[CityArena] Cannot join: no authenticated user (profile.id is missing)');
      return;
    }

    const name = profile?.core?.name || 'משתמש';
    const photo = profile?.core?.photoURL || undefined;

    setJoiningId(eventId);
    try {
      await joinEvent(eventId, uid, name, photo);

      setJoinedMap((prev) => ({ ...prev, [eventId]: true }));

      const targetEvent = events.find((e) => e.id === eventId);
      const prevCount = countOverrides[eventId] ?? targetEvent?.currentRegistrations ?? 0;
      setCountOverrides((prev) => ({ ...prev, [eventId]: prevCount + 1 }));

      const freshRegs = await getEventRegistrations(eventId, 5);
      setRegistrationsMap((prev) => ({ ...prev, [eventId]: freshRegs }));
    } catch (err) {
      console.error('[CityArena] Error joining event:', err);
    } finally {
      setJoiningId(null);
    }
  }, [uid, profile, events, countOverrides]);

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── City Identity Banner ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 p-5 shadow-xl shadow-black/10">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />

        <div className="relative flex items-center gap-4">
          {authority.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={authority.logoUrl}
              alt={authority.name}
              className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/20 shadow-lg bg-white/10 p-1"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-2xl font-black text-white shadow-lg ring-2 ring-white/20">
              {authority.name.charAt(0)}
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-black text-white leading-tight">
              {authority.name}
            </h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {authority.userCount > 0
                ? `${authority.userCount} ספורטאים פעילים`
                : 'קהילה חדשה'}
            </p>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400">LIVE</span>
          </div>
        </div>
      </div>

      {/* ── League / Leaderboard ─────────────────────────────── */}
      <NeighborhoodLeaderboard
        scope="city"
        scopeId={authority.id}
        scopeLabel={authority.name}
      />

      {/* ── Upcoming Events ──────────────────────────────────── */}
      {events.length > 0 && (
        <section>
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-sm">
              <CalendarHeart className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-black text-gray-900 dark:text-gray-100">אירועים קרובים</h4>
              <p className="text-[10px] text-gray-400 font-medium">{events.length} אירועים פתוחים להרשמה</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          </div>
          <div className="space-y-3">
            {events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                registrations={registrationsMap[e.id]}
                registrationCount={countOverrides[e.id]}
                onJoin={handleJoinEvent}
                isJoined={joinedMap[e.id] ?? false}
                joining={joiningId === e.id}
                authorityLogoUrl={authority.logoUrl}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Active Groups ────────────────────────────────────── */}
      {groups.length > 0 && (
        <section>
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Users2 className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-black text-gray-900 dark:text-gray-100">קבוצות פעילות</h4>
              <p className="text-[10px] text-gray-400 font-medium">{groups.length} קבוצות ברחבי העיר</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          </div>
          <div className="space-y-3">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} isJoined={joinedGroupIds.includes(g.id)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Empty State ──────────────────────────────────────── */}
      {events.length === 0 && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 shadow-sm">
            <Users2 className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-sm font-black text-gray-900 dark:text-gray-100">עוד אין פעילויות</p>
          <p className="text-xs text-gray-400 mt-1.5 max-w-[260px] leading-relaxed">
            קבוצות ואירועים חדשים יופיעו כאן ברגע שמנהל העיר ייצור אותם
          </p>
        </div>
      )}
    </div>
  );
}
