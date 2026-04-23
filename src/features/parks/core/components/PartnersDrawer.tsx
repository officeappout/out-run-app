"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { motion, useDragControls } from 'framer-motion';
import {
  X, Users, UserPlus, Activity, Footprints, Bike, Dumbbell,
  MapPin, Clock, Ghost, Radio, RefreshCw, Calendar, Check,
} from 'lucide-react';
import { usePartnerData, type ScheduledPartner, type LivePartner } from '../hooks/usePartnerData';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { useMapStore } from '../store/useMapStore';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import { materializeVirtualSession } from '@/features/admin/services/community.service';
import { auth } from '@/lib/firebase';
import UserProfileSheet, { type ProfileUser } from '@/features/parks/client/components/UserProfileSheet';

interface PartnersDrawerProps {
  onClose: () => void;
  userLocation?: { lat: number; lng: number } | null;
}

type Tab = 'scheduled' | 'live';
type DayFilter = 'today' | 'tomorrow' | 'week';

const DAY_FILTER_LABELS: Record<DayFilter, string> = {
  today: 'היום',
  tomorrow: 'מחר',
  week: 'השבוע',
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  running:  <Activity size={12} className="text-blue-500" />,
  walking:  <Footprints size={12} className="text-emerald-500" />,
  cycling:  <Bike size={12} className="text-purple-500" />,
  strength: <Dumbbell size={12} className="text-orange-500" />,
  workout:  <Dumbbell size={12} className="text-orange-500" />,
};

const ACTIVITY_LABELS: Record<string, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
  strength: 'כוח',
  workout: 'אימון',
};

function formatDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} מ'`;
  return `${km.toFixed(1)} ק"מ`;
}

function formatElapsed(startedAt: number): string {
  const mins = Math.round((Date.now() - startedAt) / 60_000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} שע׳ ${mins % 60} דק׳`;
}

function matchesDayFilter(date: Date, filter: DayFilter): boolean {
  if (filter === 'week') return true;
  const now = new Date();
  if (filter === 'today') return date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
}

function Avatar({ name, photoURL, size = 24, onClick }: { name: string; photoURL?: string | null; size?: number; onClick?: () => void }) {
  const el = (
    <div
      className="rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 font-black overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoURL} alt="" className="w-full h-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
  if (!onClick) return el;
  return (
    <button onClick={onClick} className="active:scale-90 transition-transform flex-shrink-0">
      {el}
    </button>
  );
}

// ─── Hourly time-slot grouping ──────────────────────────────────────────

interface HourGroup {
  hourKey: string;
  label: string;
  partners: ScheduledPartner[];
  totalCount: number;
}

function groupByHour(partners: ScheduledPartner[]): HourGroup[] {
  const map = new Map<string, ScheduledPartner[]>();
  for (const p of partners) {
    const h = p.startTime.getHours();
    const key = `${String(h).padStart(2, '0')}:00`;
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hourKey, list]) => {
      const now = new Date();
      const isToday = list[0]?.startTime.toDateString() === now.toDateString();
      const tmrw = new Date(now);
      tmrw.setDate(tmrw.getDate() + 1);
      const isTomorrow = list[0]?.startTime.toDateString() === tmrw.toDateString();
      const dayPart = isToday ? 'היום' : isTomorrow ? 'מחר' : list[0]?.startTime.toLocaleDateString('he-IL', { weekday: 'short' }) ?? '';

      return {
        hourKey,
        label: `${dayPart} ב-${hourKey}`,
        partners: list,
        totalCount: list.length,
      };
    });
}

// ─── Main Component ─────────────────────────────────────────────────────

type LiveActivityFilter = 'all' | 'running' | 'strength';
type LiveLevelFilter = 'all' | 'beginner' | 'intermediate' | 'advanced';
type GenderFilter = 'all' | 'male' | 'female';

const LIVE_ACTIVITY_LABELS: Record<LiveActivityFilter, string> = {
  all: 'הכל', running: 'ריצה', strength: 'כוח',
};
const LIVE_LEVEL_LABELS: Record<LiveLevelFilter, string> = {
  all: 'הכל', beginner: 'מתחיל', intermediate: 'בינוני', advanced: 'מתקדם',
};
const GENDER_LABELS: Record<GenderFilter, string> = {
  all: 'הכל', male: 'גברים', female: 'נשים',
};

const PACE_PRESETS: { label: string; min: number; max: number }[] = [
  { label: '4-5', min: 4, max: 5 },
  { label: '5-6', min: 5, max: 6 },
  { label: '6-7', min: 6, max: 7 },
  { label: '7+', min: 7, max: 15 },
];

export default function PartnersDrawer({ onClose, userLocation }: PartnersDrawerProps) {
  const dragControls = useDragControls();
  const [tab, setTab] = useState<Tab>('scheduled');
  const [radiusKm, setRadiusKm] = useState(2);
  const [dayFilter, setDayFilter] = useState<DayFilter>('week');
  const privacyMode = usePrivacyStore((s) => s.mode);
  const setPrivacyMode = usePrivacyStore((s) => s.setMode);

  const { scheduled, live, isLoading } = usePartnerData(userLocation ?? null, radiusKm);
  const openGlobalParkSheet = useMapStore((s) => s.openGlobalParkSheet);
  const openGlobalRouteSheet = useMapStore((s) => s.openGlobalRouteSheet);
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [optimisticJoined, setOptimisticJoined] = useState<Set<string>>(new Set());
  const [liveActivityFilter, setLiveActivityFilter] = useState<LiveActivityFilter>('all');
  const [liveLevelFilter, setLiveLevelFilter] = useState<LiveLevelFilter>('all');
  const [livePacePreset, setLivePacePreset] = useState<number | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 99]);

  const filteredLive = useMemo(() => {
    let result = live;
    if (liveActivityFilter !== 'all') {
      const isStrength = liveActivityFilter === 'strength';
      result = result.filter((p) =>
        isStrength
          ? ['strength', 'workout'].includes(p.activityStatus)
          : p.activityStatus === 'running' || p.activityStatus === 'walking' || p.activityStatus === 'cycling',
      );
    }
    return result;
  }, [live, liveActivityFilter]);

  const filteredScheduled = useMemo(
    () => scheduled.filter((p) => matchesDayFilter(p.startTime, dayFilter)),
    [scheduled, dayFilter],
  );

  const hourGroups = useMemo(() => groupByHour(filteredScheduled), [filteredScheduled]);

  const totalParticipants = useMemo(
    () => filteredScheduled.length,
    [filteredScheduled],
  );

  const handleOpenLocation = useCallback((partner: ScheduledPartner) => {
    if (!partner.routeId) return;
    const isPark = partner.activityType === 'workout';
    if (isPark) {
      openGlobalParkSheet({
        id: partner.routeId,
        name: partner.sessionLabel ?? partner.displayName,
        location: { lat: partner.lat, lng: partner.lng },
      } as any);
    } else {
      openGlobalRouteSheet({
        id: partner.routeId,
        name: partner.sessionLabel ?? partner.displayName,
        path: [[partner.lng, partner.lat]],
      } as any);
    }
    onClose();
  }, [openGlobalParkSheet, openGlobalRouteSheet, onClose]);

  const handleJoinSession = useCallback(async (partner: ScheduledPartner) => {
    const user = auth.currentUser;
    if (!user) return;
    setJoiningId(partner.id);
    try {
      if (partner.source === 'group' && partner.groupId) {
        const dateStr = partner.startTime.toISOString().split('T')[0];
        const timeStr = `${String(partner.startTime.getHours()).padStart(2, '0')}:${String(partner.startTime.getMinutes()).padStart(2, '0')}`;
        await materializeVirtualSession(
          partner.groupId,
          dateStr,
          timeStr,
          user.uid,
          user.displayName ?? 'משתמש',
          user.photoURL ?? undefined,
        );
      } else {
        await createPlannedSession({
          userId: user.uid,
          displayName: user.displayName ?? 'משתמש',
          photoURL: user.photoURL,
          routeId: partner.routeId,
          activityType: partner.activityType,
          level: partner.level as 'beginner' | 'intermediate' | 'advanced',
          startTime: partner.startTime,
          privacyMode,
        });
      }
      setOptimisticJoined((prev) => new Set(prev).add(partner.id));
    } catch (err) {
      console.error('[PartnersDrawer] Join failed:', err);
    } finally {
      setJoiningId(null);
    }
  }, [privacyMode]);

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 300) onClose();
        }}
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 pointer-events-auto"
      >
        <div className="bg-white rounded-t-3xl shadow-2xl overflow-hidden pb-[90px]">
          {/* Drag handle */}
          <div
            className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none' }}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex justify-between items-center px-5 mb-2" dir="rtl">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black text-gray-900">שותפים לאימון</span>
              {totalParticipants > 0 && tab === 'scheduled' && (
                <span className="bg-cyan-500 text-white text-[9px] font-black rounded-full w-[18px] h-[18px] flex items-center justify-center">
                  {totalParticipants}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Ghost mode warning */}
          {privacyMode === 'ghost' && (
            <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2.5 bg-gray-100 rounded-xl" dir="rtl">
              <Ghost size={16} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-bold">מצב רוח פעיל — אחרים לא רואים אותך</p>
              </div>
              <button
                onClick={() => setPrivacyMode('squad')}
                className="px-2.5 py-1 bg-cyan-500 text-white rounded-lg text-[10px] font-black flex-shrink-0 hover:bg-cyan-600 transition-colors"
              >
                הפעל נראות
              </button>
            </div>
          )}

          {/* Radius slider */}
          {privacyMode !== 'ghost' && (
            <div className="px-5 mb-3" dir="rtl">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-gray-500">טווח חיפוש</span>
                <span className="text-[11px] font-black text-cyan-600">
                  {radiusKm < 1 ? `${Math.round(radiusKm * 1000)} מ'` : `${radiusKm} ק"מ`}
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.5}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          )}

          {/* Tabs + Day filter */}
          {privacyMode !== 'ghost' && (
            <>
              <div className="flex items-center gap-2 mx-5 mb-3" dir="rtl">
                {/* Scheduled / Live toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
                  <button
                    onClick={() => setTab('scheduled')}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                      tab === 'scheduled' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    <Clock size={12} />
                    מתוכננים
                    {scheduled.length > 0 && (
                      <span className="bg-cyan-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                        {scheduled.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setTab('live')}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                      tab === 'live' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    <Radio size={12} />
                    לייב
                    {live.length > 0 && (
                      <span className="bg-green-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                        {live.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Day filter — only for scheduled tab */}
                {tab === 'scheduled' && (
                  <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                    {(['today', 'tomorrow', 'week'] as DayFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setDayFilter(f)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                          dayFilter === f ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-500'
                        }`}
                      >
                        {DAY_FILTER_LABELS[f]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="px-5 max-h-[50vh] overflow-y-auto pb-4" dir="rtl">
                {isLoading ? (
                  <div className="flex flex-col items-center py-8">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-xs text-gray-400 font-bold">מחפש שותפים...</p>
                  </div>
                ) : tab === 'scheduled' ? (
                  filteredScheduled.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                        <Users size={24} className="text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400 font-bold max-w-[220px]">
                        אין אימונים מתוכננים באזור שלך. הגדל את הטווח או בדוק מחר.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {hourGroups.map((group, gi) => (
                        <div key={`hg_${group.hourKey}_${gi}`}>
                          {/* Time slot header */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <Calendar size={12} className="text-cyan-500" />
                            <span className="text-[12px] font-black text-gray-800">{group.label}:</span>
                            <span className="text-[11px] font-bold text-cyan-600">{group.totalCount} מתאמנים</span>
                          </div>

                          {/* Compact partner rows */}
                          <div className="space-y-0.5">
                            {group.partners.map((p, pi) => {
                              const isGroup = p.source === 'group';
                              const isJoining = joiningId === p.id;
                              const hhmm = `${String(p.startTime.getHours()).padStart(2, '0')}:${String(p.startTime.getMinutes()).padStart(2, '0')}`;

                              return (
                                <div
                                  key={`sp_${p.id}_${gi}_${pi}`}
                                  className="flex items-center gap-2 py-1.5 px-2.5 bg-gray-50 rounded-lg hover:bg-cyan-50/50 transition-colors"
                                >
                                  {/* Avatar */}
                                  <Avatar
                                    name={p.displayName}
                                    photoURL={p.photoURL}
                                    size={24}
                                    onClick={() => setProfileUser({
                                      uid: p.userId,
                                      name: p.displayName,
                                      photoURL: p.photoURL ?? undefined,
                                    })}
                                  />

                                  {/* Time */}
                                  <span className="text-[10px] font-black text-gray-500 min-w-[28px]" dir="ltr">{hhmm}</span>

                                  {/* Name / session label — tap to open location */}
                                  <button
                                    onClick={() => handleOpenLocation(p)}
                                    className="flex-1 text-xs font-bold text-gray-800 truncate text-start active:text-cyan-600 transition-colors"
                                  >
                                    {isGroup ? (p.sessionLabel ?? p.displayName) : p.displayName}
                                  </button>

                                  {/* Source indicator */}
                                  {isGroup && <RefreshCw size={10} className="text-cyan-400 flex-shrink-0" />}

                                  {/* Activity + distance */}
                                  <span className="flex items-center gap-0.5 flex-shrink-0">
                                    {ACTIVITY_ICONS[p.activityType] ?? ACTIVITY_ICONS.running}
                                  </span>
                                  <span className="text-[9px] text-gray-400 font-bold flex-shrink-0">{formatDist(p.distanceKm)}</span>

                                  {/* Join button */}
                                  {optimisticJoined.has(p.id) || (auth.currentUser && p.userId === auth.currentUser.uid) ? (
                                    <span className="flex-shrink-0 px-2 py-0.5 border border-cyan-500 text-cyan-600 rounded-md text-[9px] font-bold flex items-center gap-0.5">
                                      <Check size={9} />
                                      נרשמת
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleJoinSession(p)}
                                      disabled={isJoining}
                                      className="flex-shrink-0 px-2 py-0.5 bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-300 text-white rounded-md text-[9px] font-bold transition-colors flex items-center gap-0.5"
                                    >
                                      <UserPlus size={9} />
                                      {isJoining ? '...' : 'הצטרף'}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* Live tab */
                  <div>
                    {/* Filter chip bar */}
                    <div className="space-y-2 mb-3">
                      {/* Row 1: Activity type */}
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(LIVE_ACTIVITY_LABELS) as LiveActivityFilter[]).map((f) => (
                          <button
                            key={`laf_${f}`}
                            onClick={() => { setLiveActivityFilter(f); setLivePacePreset(null); setLiveLevelFilter('all'); }}
                            className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                              liveActivityFilter === f
                                ? 'bg-green-500 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {LIVE_ACTIVITY_LABELS[f]}
                          </button>
                        ))}
                      </div>

                      {/* Row 2: Contextual sub-filters */}
                      {liveActivityFilter === 'strength' && (
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(LIVE_LEVEL_LABELS) as LiveLevelFilter[]).map((lv) => (
                            <button
                              key={`llf_${lv}`}
                              onClick={() => setLiveLevelFilter(lv)}
                              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                                liveLevelFilter === lv
                                  ? 'bg-orange-500 text-white shadow-sm'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {LIVE_LEVEL_LABELS[lv]}
                            </button>
                          ))}
                        </div>
                      )}

                      {liveActivityFilter === 'running' && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] text-gray-400 font-bold self-center ps-0.5">קצב (דק/ק&quot;מ):</span>
                          {PACE_PRESETS.map((preset, pi) => (
                            <button
                              key={`pace_${pi}`}
                              onClick={() => setLivePacePreset(livePacePreset === pi ? null : pi)}
                              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                                livePacePreset === pi
                                  ? 'bg-blue-500 text-white shadow-sm'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                              dir="ltr"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Row 3: Demographics — always visible */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(Object.keys(GENDER_LABELS) as GenderFilter[]).map((g) => (
                          <button
                            key={`gf_${g}`}
                            onClick={() => setGenderFilter(g)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                              genderFilter === g
                                ? 'bg-purple-500 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {GENDER_LABELS[g]}
                          </button>
                        ))}
                        <span className="text-[9px] text-gray-300 font-bold px-0.5">|</span>
                        <span className="text-[10px] text-gray-400 font-bold">גיל:</span>
                        <input
                          type="range"
                          min={18}
                          max={99}
                          value={ageRange[0]}
                          onChange={(e) => setAgeRange([Number(e.target.value), ageRange[1]])}
                          className="w-[50px] h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-purple-500"
                        />
                        <span className="text-[10px] font-bold text-gray-600 min-w-[32px] text-center" dir="ltr">{ageRange[0]}-{ageRange[1]}</span>
                        <input
                          type="range"
                          min={18}
                          max={99}
                          value={ageRange[1]}
                          onChange={(e) => setAgeRange([ageRange[0], Number(e.target.value)])}
                          className="w-[50px] h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>
                    </div>

                    {filteredLive.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-center">
                        <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                          <Radio size={24} className="text-gray-300" />
                        </div>
                        <p className="text-sm text-gray-400 font-bold max-w-[200px]">
                          {live.length === 0
                            ? 'אין מתאמנים בלייב באזור שלך כרגע.'
                            : 'אין תוצאות עבור הפילטרים שנבחרו.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredLive.map((p, li) => (
                          <div
                            key={`live_${p.uid}_${li}`}
                            className="flex items-center gap-2 py-1.5 px-2.5 bg-gray-50 rounded-lg hover:bg-emerald-50/50 transition-colors"
                          >
                            <div className="relative">
                              <Avatar
                                name={p.name}
                                size={24}
                                onClick={() => setProfileUser({ uid: p.uid, name: p.name })}
                              />
                              <div className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-[1.5px] border-white" />
                            </div>
                            <span className="flex-1 text-xs font-bold text-gray-800 truncate">{p.name}</span>
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              {ACTIVITY_ICONS[p.activityStatus] ?? <Activity size={12} className="text-gray-400" />}
                              <span className="text-[10px] text-gray-500 font-bold">
                                {ACTIVITY_LABELS[p.activityStatus] ?? p.activityStatus}
                              </span>
                            </span>
                            <span className="text-[9px] text-gray-400 font-bold flex-shrink-0">
                              <MapPin size={9} className="inline -mt-0.5" /> {formatDist(p.distanceKm)}
                            </span>
                            {p.startedAt > 0 && (
                              <span className="text-[9px] text-emerald-600 font-bold flex-shrink-0">
                                {formatElapsed(p.startedAt)}
                              </span>
                            )}
                            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 rounded-full flex-shrink-0">
                              <Radio size={8} className="text-green-500 animate-pulse" />
                              <span className="text-[8px] font-bold text-green-600">לייב</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Waze-style profile popover */}
      <UserProfileSheet
        isOpen={!!profileUser}
        onClose={() => setProfileUser(null)}
        user={profileUser}
      />
    </div>
  );
}
