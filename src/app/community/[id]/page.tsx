'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Users2,
  Calendar,
  Clock,
  MapPin,
  Info,
  Dumbbell,
  Target,
  DollarSign,
  Share2,
} from 'lucide-react';
import { useUserStore } from '@/features/user';
import {
  getGroup,
  getGroupMembers,
  getEventsByGroup,
  getEventRegistrations,
  isUserRegistered,
  joinEvent,
} from '@/features/admin/services/community.service';
import type {
  CommunityGroup,
  CommunityEvent,
  EventRegistration,
  ScheduleSlot,
} from '@/types/community.types';
import EventCard from '@/features/arena/components/EventCard';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import MapCard from '@/features/arena/components/MapCard';

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const FREQ_LABELS: Record<string, string> = {
  weekly: 'שבועי',
  biweekly: 'דו-שבועי',
  monthly: 'חודשי',
};

const CATEGORY_LABELS: Record<string, string> = {
  walking: 'הליכה',
  running: 'ריצה',
  yoga: 'יוגה',
  calisthenics: 'קליסטניקס',
  cycling: 'אופניים',
  other: 'אחר',
};

interface MemberInfo {
  uid: string;
  name: string;
  photoURL?: string;
  joinedAt: Date;
}

export default function CommunityHubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const uid = profile?.id;
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags: featureFlags, loading: flagsLoading } = useFeatureFlags(isSuperAdmin);

  // Route guard
  useEffect(() => {
    if (!flagsLoading && !featureFlags.enableCommunityFeed) {
      router.replace('/home');
    }
  }, [flagsLoading, featureFlags.enableCommunityFeed, router]);

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Session drawer state
  const [drawerEvent, setDrawerEvent] = useState<CommunityEvent | null>(null);
  const [drawerRegs, setDrawerRegs] = useState<EventRegistration[]>([]);
  const [drawerJoined, setDrawerJoined] = useState(false);
  const [drawerJoining, setDrawerJoining] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function load() {
      setLoading(true);
      try {
        const [g, m, e] = await Promise.all([
          getGroup(id),
          getGroupMembers(id, 30),
          getEventsByGroup(id),
        ]);
        setGroup(g);
        setMembers(m);
        setEvents(e.filter((ev) => ev.isActive));
      } catch (err) {
        console.error('[CommunityHub] Load failed:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const openSessionDrawer = useCallback(
    async (event: CommunityEvent) => {
      setDrawerEvent(event);
      setDrawerJoined(false);
      setDrawerRegs([]);

      const [regs, joined] = await Promise.all([
        getEventRegistrations(event.id, 10),
        uid ? isUserRegistered(event.id, uid) : Promise.resolve(false),
      ]);
      setDrawerRegs(regs);
      setDrawerJoined(joined);
    },
    [uid],
  );

  const handleJoinFromDrawer = useCallback(
    async (eventId: string) => {
      if (!uid) return;
      const name = profile?.core?.name || 'משתמש';
      const photo = profile?.core?.photoURL || undefined;
      setDrawerJoining(true);
      try {
        await joinEvent(eventId, uid, name, photo);
        setDrawerJoined(true);
        const freshRegs = await getEventRegistrations(eventId, 10);
        setDrawerRegs(freshRegs);
      } catch (err) {
        console.error('[CommunityHub] Join failed:', err);
      } finally {
        setDrawerJoining(false);
      }
    },
    [uid, profile],
  );

  if (flagsLoading || !featureFlags.enableCommunityFeed) return null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען קהילה...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#F8FAFC] gap-4" dir="rtl">
        <Users2 className="w-12 h-12 text-gray-300" />
        <p className="text-sm font-bold text-gray-700">הקבוצה לא נמצאה</p>
        <button
          onClick={() => router.back()}
          className="text-xs font-bold text-cyan-600 hover:underline"
        >
          חזרה
        </button>
      </div>
    );
  }

  const scheduleSlots: ScheduleSlot[] =
    group.scheduleSlots && group.scheduleSlots.length > 0
      ? group.scheduleSlots
      : group.schedule
        ? [group.schedule]
        : [];

  const hasTargetMuscles = group.targetMuscles && group.targetMuscles.length > 0;
  const hasEquipment = group.equipment && group.equipment.length > 0;
  const hasPrice = group.price != null && group.price > 0;

  return (
    <div
      className="min-h-[100dvh] bg-[#F8FAFC]"
      style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between" dir="rtl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
            >
              <ArrowRight className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-base font-black text-gray-900 leading-tight">{group.name}</h1>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                {CATEGORY_LABELS[group.category] ?? group.category}
              </span>
            </div>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-gray-100 active:scale-90 transition-all"
            aria-label="שתף"
          >
            <Share2 className="w-4.5 h-4.5 text-gray-500" />
          </button>
        </div>
      </header>

      {/* ── Cover Photo ──────────────────────────────────── */}
      {group.images && group.images.length > 0 && group.images[0] && (
        <div className="max-w-md mx-auto">
          <div className="relative w-full h-[200px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={group.images[0]}
              alt={group.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#F8FAFC] via-transparent to-transparent" />
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 pt-5 space-y-6" dir="rtl">
        {/* ── About Section ────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            אודות
          </h3>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-700 leading-relaxed">{group.description}</p>

            {group.meetingLocation?.location &&
              (group.meetingLocation.location.lat !== 0 || group.meetingLocation.location.lng !== 0) ? (
              <div className="mt-3">
                <MapCard
                  lat={group.meetingLocation.location.lat}
                  lng={group.meetingLocation.location.lng}
                  label={group.meetingLocation.address}
                />
              </div>
            ) : group.meetingLocation?.address ? (
              <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">{group.meetingLocation.address}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Users2 className="w-3.5 h-3.5 text-gray-400" />
                {group.currentParticipants} חברים
              </span>
              {hasPrice && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-500" />
                  ₪{group.price}
                </span>
              )}
              {!hasPrice && (
                <span className="text-emerald-600 font-bold">חינם</span>
              )}
            </div>
          </div>
        </section>

        {/* ── Target Muscles (conditional) ──────────────────── */}
        {hasTargetMuscles && (
          <section>
            <h3 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-cyan-500" />
              קבוצות שרירים
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {group.targetMuscles!.map((muscle) => (
                <span
                  key={muscle}
                  className="px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 text-[11px] font-bold"
                >
                  {muscle}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Equipment (conditional) ──────────────────────── */}
        {hasEquipment && (
          <section>
            <h3 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
              ציוד נדרש
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {group.equipment!.map((item) => (
                <span
                  key={item}
                  className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold"
                >
                  {item}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Schedule ─────────────────────────────────────── */}
        {scheduleSlots.length > 0 && (
          <section>
            <h3 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              לוח זמנים קבוע
            </h3>
            <div className="space-y-2">
              {scheduleSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      יום {DAY_LABELS[slot.dayOfWeek]} · {slot.time}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium">
                      {FREQ_LABELS[slot.frequency] ?? slot.frequency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Members ──────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <Users2 className="w-3.5 h-3.5" />
            חברי הקבוצה ({members.length})
          </h3>
          {members.length === 0 ? (
            <p className="text-xs text-gray-400 bg-white rounded-xl p-4 text-center border border-gray-100">
              עדיין אין חברים בקבוצה
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {members.map((m) => (
                <div key={m.uid} className="flex flex-col items-center gap-1 w-16">
                  {m.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.photoURL}
                      alt={m.name}
                      className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm font-black ring-2 ring-gray-100">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <span className="text-[10px] font-bold text-gray-600 truncate w-full text-center">
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Upcoming Events / Sessions ────────────────────── */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            אירועים קרובים
          </h3>
          {events.length === 0 ? (
            <p className="text-xs text-gray-400 bg-white rounded-xl p-4 text-center border border-gray-100">
              אין אירועים קרובים בקבוצה
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="cursor-pointer"
                  onClick={() => openSessionDrawer(event)}
                >
                  <EventCard event={event} />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Session Drawer ─────────────────────────────────── */}
      <SessionDrawer
        isOpen={!!drawerEvent}
        onClose={() => setDrawerEvent(null)}
        event={drawerEvent}
        parentGroup={group}
        registrations={drawerRegs}
        onJoin={handleJoinFromDrawer}
        isJoined={drawerJoined}
        joining={drawerJoining}
      />
    </div>
  );
}
