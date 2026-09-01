'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  X, Play, Navigation, MapPin, ChevronLeft,
  Calendar, Users, Footprints, Activity, Bike,
  PersonStanding, Crosshair, Flag, RefreshCw, Check, Flame, Clock, Ruler,
} from 'lucide-react';
import { Route, ActivityType, ROUTE_FEATURE_TAG_LABELS } from '@/features/parks/core/types/route.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { computeRouteTurns } from '@/features/parks/core/services/geoUtils';
import {
  useCommunityEnrichment,
  matchesDayFilter,
  type DayFilter,
  type SessionEnrichment,
} from '@/features/parks/core/hooks/useCommunityEnrichment';
import { useMyRegistrations } from '@/features/parks/core/hooks/useMyRegistrations';
import { joinEvent, materializeVirtualSession } from '@/features/admin/services/community.service';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import DualRangeSlider from '@/features/partners/components/DualRangeSlider';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { DevSimulationState } from '@/features/parks/core/hooks/useDevSimulation';
import UserProfileSheet, { type ProfileUser } from '../UserProfileSheet';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import { computeQualityBadges } from '@/features/parks/core/services/route-quality-badges.service';
import ShareAsLiveToggle from '@/features/workout-engine/components/ShareAsLiveToggle';
import type { WorkoutActivityStatus } from '@/features/safecity/services/presence.service';

const DRAWER_HEIGHT = '85vh';
const CLOSE_THRESHOLD = 180;

/** Slider step for the arrival-window range, in minutes. */
const RANGE_STEP_MIN = 15;

/** Minutes-from-midnight → "HH:MM". Mirrors the same helper in ParkDetailSheet. */
function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Same pill style as WorkoutPreviewDrawer's stat row — keeps visual parity
// between the route preview and the strength workout preview.
const PILL_BORDER = '0.5px solid #E0E9FF';
const STAT_PILL_CLASS =
  'flex-shrink-0 inline-flex items-center gap-1.5 bg-white shadow-sm rounded-lg px-3 py-1.5';

const ACTIVITY_LABELS: Record<string, string> = {
  running: 'ריצה', walking: 'הליכה', cycling: 'רכיבה', workout: 'אימון',
};

// Surface / Environment translation tables. Built as Record<string, string>
// because RouteFeatures.{surface,environment} are loose `string` in the
// type — the writer (RouteEditor + GIS importers) emits a small set of
// known values, so we cover those and fall through to the raw value for
// anything legacy/unknown.
const SURFACE_LABELS: Record<string, string> = {
  paved: 'סלול',
  road: 'סלול',
  asphalt: 'סלול',
  trail: 'שבילים',
  dirt: 'שבילים',
  mixed: 'מעורב',
};

const ENVIRONMENT_LABELS: Record<string, string> = {
  urban: 'עירוני',
  nature: 'טבע',
  park: 'פארק',
  beach: 'חוף',
};

const DAY_FILTER_LABELS: Record<DayFilter, string> = {
  today: 'היום',
  tomorrow: 'מחר',
  week: 'השבוע',
};

function formatDistance(km: number): string {
  if (km >= 1) return `${km.toFixed(1)} ק"מ`;
  return `${Math.round(km * 1000)} מ'`;
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h} שעה ${m} דק'` : `${h} שעה`;
  }
  return `${Math.round(minutes)} דק'`;
}

// Route activity → presence activity adapter. The Route domain has a
// `'workout'` value that doesn't exist on PresenceActivityStatus, so we
// fold it onto `'strength'` (the closest equivalent broadcast tag).
function mapRouteActivityToPresence(act: ActivityType | undefined): WorkoutActivityStatus {
  if (act === 'workout') return 'strength';
  if (act === 'walking' || act === 'cycling' || act === 'running') return act;
  return 'running';
}

function formatEventDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 'מועד קרוב';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (isToday) return `היום ב-${time}`;
  if (isTomorrow) return `מחר ב-${time}`;
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`;
}

interface RouteDetailSheetProps {
  isOpen: boolean;
  route: Route | null;
  onClose: () => void;
  onStartWorkout?: (route: Route) => void;
  onNavigate?: (route: Route) => void;
  userLocation?: { lat: number; lng: number } | null;
  onActivityChange?: (act: ActivityType) => void;
  currentActivity?: ActivityType;
  devSim?: DevSimulationState;
}

export default function RouteDetailSheet({
  isOpen,
  route,
  onClose,
  onStartWorkout,
  onNavigate,
  userLocation,
  onActivityChange,
  currentActivity,
  devSim,
}: RouteDetailSheetProps) {
  const y = useMotionValue(0);
  const rawOpacity = useTransform(y, [0, 300], [1, 0]);
  const opacity = useTransform(rawOpacity, (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<DayFilter>('week');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Arrival-window range in minutes-from-midnight. Default 17:00-19:00
  // mirrors the ParkDetailSheet default so the UX is consistent across
  // both publish surfaces.
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<[number, number]>([17 * 60, 19 * 60]);
  const [publishingSession, setPublishingSession] = useState(false);
  const [justPublished, setJustPublished] = useState<{ time: string; name: string; photoURL?: string } | null>(null);
  // Optimistic local sessions injected immediately after "אני מגיע ב..." publish,
  // so the list updates without waiting for a Firestore snapshot round-trip.
  const [localSessions, setLocalSessions] = useState<SessionEnrichment[]>([]);

  const currentUid = auth.currentUser?.uid;

  const handlePublishArrival = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !route) return;
    setPublishingSession(true);
    try {
      // Derive startTime / endTime from the dual-range slider, same
      // pattern as ParkDetailSheet. Base date is today; if the window
      // has already ended today we shift to tomorrow.
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);
      const [startMinutes, endMinutes] = timeRangeMinutes;
      const startTime = new Date(baseDate);
      startTime.setMinutes(startMinutes);
      const endTime = new Date(baseDate);
      endTime.setMinutes(endMinutes);

      // Guard: if the window has already ended, publish for tomorrow.
      if (endTime.getTime() < Date.now()) {
        startTime.setDate(startTime.getDate() + 1);
        endTime.setDate(endTime.getDate() + 1);
      }
      // Defensive: clamp to at least one slider step.
      if (endTime.getTime() <= startTime.getTime()) {
        endTime.setTime(startTime.getTime() + RANGE_STEP_MIN * 60 * 1000);
      }

      // Capture the publisher's active strength program at write
      // time so the partner card can show the same "🎯 program ·
      // רמה N" line live cards already render.
      const liveProfile = useUserStore.getState().profile;
      const activeProgram = liveProfile?.progression?.activePrograms?.[0];
      const programName = activeProgram?.name ?? undefined;
      const programLevel = activeProgram?.templateId
        ? liveProfile?.progression?.tracks?.[activeProgram.templateId]?.currentLevel
        : undefined;
      // GeoJSON path format is [lng, lat] — extract start-point coordinates.
      const startPoint = route.path?.[0];
      await createPlannedSession({
        userId: user.uid,
        displayName: user.displayName ?? 'משתמש',
        photoURL: user.photoURL,
        routeId: route.id,
        // Denormalised label so the partner card can render the
        // route name without a per-card Firestore lookup.
        routeName: route.name,
        ...(programName ? { programName } : {}),
        ...(typeof programLevel === 'number' ? { programLevel } : {}),
        activityType: route.type ?? 'running',
        level: 'beginner',
        startTime,
        endTime,
        privacyMode: 'squad',
        lat: startPoint != null ? startPoint[1] : null,
        lng: startPoint != null ? startPoint[0] : null,
      });
      setShowTimePicker(false);
      setJustPublished({
        time: `${minutesToLabel(startMinutes)} - ${minutesToLabel(endMinutes)}`,
        name: user.displayName ?? 'משתמש',
        photoURL: user.photoURL ?? undefined,
      });
      // Inject an optimistic session immediately so it appears in filteredSessions
      // without waiting for the Firestore snapshot to propagate.
      const syntheticSession: SessionEnrichment = {
        eventId: `local-${user.uid}-${Date.now()}`,
        eventLabel: user.displayName ?? 'אני',
        nextStartTime: today.toISOString(),
        currentRegistrations: 1,
        plannedCount: 1,
        avatars: [{ uid: user.uid, name: user.displayName ?? 'אני', photoURL: user.photoURL ?? undefined }],
      };
      setLocalSessions((prev) => [...prev, syntheticSession]);
    } catch (err) {
      console.error('[RouteDetail] Failed to publish arrival:', err);
    } finally {
      setPublishingSession(false);
    }
  }, [timeRangeMinutes, route]);

  const routeIds = useMemo(() => (route ? [route.id] : []), [route?.id]);
  const routeArr = useMemo(() => (route ? [route] : []), [route]);
  const { enrichRoutes, allSessionsMap } = useCommunityEnrichment(routeIds, routeArr);

  const enrichedRoute = useMemo(() => {
    if (!route) return null;
    return enrichRoutes([route])[0] ?? null;
  }, [route, enrichRoutes]);

  const allSessions = useMemo(() => {
    if (!route) return [];
    const fromMap = allSessionsMap.get(route.id) ?? [];
    const fromProp = route.linkedSessions?.eventId
      ? [route.linkedSessions as SessionEnrichment]
      : [];
    const merged = [...fromMap];
    for (const s of fromProp) {
      if (!merged.some((m) => m.eventId === s.eventId)) merged.push(s);
    }
    // Merge optimistic locally-published sessions; skip if Firestore already returned them.
    for (const s of localSessions) {
      if (!merged.some((m) => m.eventId === s.eventId)) merged.push(s);
    }
    merged.sort((a, b) => a.nextStartTime.localeCompare(b.nextStartTime));
    return merged;
  }, [route, allSessionsMap, localSessions]);

  const filteredSessions = useMemo(
    () => allSessions.filter((s) => matchesDayFilter(s.nextStartTime, dayFilter)),
    [allSessions, dayFilter],
  );

  const realEventIds = useMemo(
    () => allSessions.filter((e) => !e.isRecurring).map((e) => e.eventId),
    [allSessions],
  );
  const registeredEventIds = useMyRegistrations(realEventIds);

  const isUserRegistered = useCallback((ev: SessionEnrichment) => {
    if (registeredEventIds.has(ev.eventId)) return true;
    return currentUid ? ev.avatars?.some((a) => a.uid === currentUid) : false;
  }, [registeredEventIds, currentUid]);

  const handleJoinEvent = useCallback(async (ev: SessionEnrichment) => {
    const user = auth.currentUser;
    if (!user) return;
    setJoiningEventId(ev.eventId);
    try {
      if (ev.isRecurring && ev.groupId) {
        const parts = ev.eventId.split('_');
        const dateStr = parts[2] ?? new Date().toISOString().split('T')[0];
        const time = ev.nextStartTime.includes('T')
          ? ev.nextStartTime.split('T')[1].slice(0, 5)
          : '18:00';
        await materializeVirtualSession(
          ev.groupId, dateStr, time,
          user.uid, user.displayName ?? 'משתמש', user.photoURL ?? undefined,
        );
      } else {
        await joinEvent(ev.eventId, user.uid, user.displayName ?? 'משתמש', user.photoURL ?? undefined);
      }
    } catch (err) {
      console.error('[RouteDetailSheet] Join event failed:', err);
    } finally {
      setJoiningEventId(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else {
      document.body.style.overflow = '';
      // Clear optimistic sessions when sheet closes so the next route opens clean.
      setLocalSessions([]);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;
    const handler = () => setScrollY(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [isOpen]);

  const safe = (v: number, fb: number) => Number.isFinite(v) ? v : fb;
  const maxScroll = 160;
  const scrollProgress = safe(Math.min(safe(scrollY, 0) / maxScroll, 1), 0);
  const heroOpacity = safe(Math.max(1 - scrollProgress * 0.7, 0), 1);
  const heroScale = safe(Math.max(1 - scrollProgress * 0.15, 0.85), 1);
  const headerOpacity = safe(Math.min(scrollProgress * 2, 1), 0);
  const heroHeight = safe(Math.max(220 - safe(scrollY, 0) * 0.8, 60), 60);

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.y > CLOSE_THRESHOLD || info.velocity.y > 500) onClose();
  };

  const distToStart = useMemo(() => {
    if (!userLocation || !route?.path?.length) return null;
    const [lng, lat] = route.path[0];
    const km = haversineKm(userLocation.lat, userLocation.lng, lat, lng);
    return distanceLabel(km);
  }, [userLocation, route?.path]);

  const walkToRouteMinutes = useMapStore((s) => s.walkToRouteMinutes);
  const walkSteps          = useMapStore((s) => s.walkSteps);

  // Pre-compute the route maneuver list once per route (cheap; pure
  // geometry math). Used by the "The route" accordion row below.
  const routeTurns = useMemo(
    () => (route?.path ? computeRouteTurns(route.path) : []),
    [route?.path],
  );

  // Accordion state — only one section open at a time. `null` = both
  // collapsed (default).
  const [openSection, setOpenSection] = useState<'walk' | 'route' | null>(null);

  const handleNavigate = useCallback(() => {
    if (!route?.path?.length) return;
    const [lng, lat] = route.path[0];
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }, [route?.path]);

  if (!route) return null;

  const activityLabel = ACTIVITY_LABELS[route.activityType || route.type] || '';
  const coverImage = route.images?.[0] || null;
  const isNavRoute = route.id?.startsWith('nav-');

  const routeAccent = (() => {
    if (route.activityType === 'cycling' || route.type === 'cycling') return '#8B5CF6';
    if (route.features?.environment === 'nature') return '#10B981';
    return '#00BAF7';
  })();

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />

            {/* Bottom Sheet */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
              style={{ y, opacity, height: DRAWER_HEIGHT, maxHeight: '85vh', willChange: 'transform' }}
              className="fixed bottom-0 left-0 right-0 z-[100] bg-white rounded-t-[32px] shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {/* Drag Handle */}
              <div className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-1 pointer-events-none">
                <div className="w-10 h-1.5 rounded-full bg-gray-300" />
              </div>

              {/* Sticky Header */}
              <div
                className={`absolute top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 transition-opacity duration-300 ${
                  headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{ opacity: headerOpacity }}
              >
                <div
                  className="flex items-center justify-between px-4 pb-3"
                  style={{ paddingTop: 'calc(max(2.5rem, env(safe-area-inset-top, 0px) + 0.5rem))' }}
                >
                  <button onClick={onClose} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                    <ChevronLeft size={20} className="text-gray-700" />
                  </button>
                  <h1 className="text-lg font-black text-gray-900 flex-1 text-center px-4 truncate">
                    {route.name || 'מסלול'}
                  </h1>
                  <div className="w-10" />
                </div>
              </div>

              {/* Scrollable body — bottom padding accounts for the fixed action bar + safe-area */}
              <div ref={scrollRef} className="h-full overflow-y-auto" style={{ paddingBottom: 'calc(max(9rem, env(safe-area-inset-bottom, 0px) + 7rem))' }}>
                {/* Hero — no title inside so the overflow-hidden clip never
                    truncates the route name as the hero collapses on scroll.
                    Mirrors the fix applied to ParkDetailSheet. */}
                <div
                  className="relative w-full overflow-hidden"
                  style={{ height: `${heroHeight}px`, opacity: heroOpacity, transform: `scale(${heroScale})` }}
                >
                  {coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverImage} alt={route.name || 'מסלול'} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${routeAccent}22 0%, ${routeAccent}08 100%)` }}
                    >
                      <Flag size={48} className="text-gray-200" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 to-transparent pointer-events-none" />
                  <div
                    className="absolute bottom-0 inset-x-0 h-[85%] pointer-events-none"
                    style={{ background: 'linear-gradient(to top, white 15%, rgba(255,255,255,0.6) 50%, transparent 100%)' }}
                  />

                  {/* Top controls */}
                  <div
                    className={`absolute top-0 left-0 right-0 px-4 pb-4 flex justify-between items-start z-10 transition-opacity duration-300 ${heroOpacity > 0.5 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
                  >
                    <button onClick={onClose} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Title + activity badge — OUTSIDE the hero so the route name
                    escapes the hero's overflow-hidden clip. The -mt-14 pulls it
                    up to visually overlap the hero's white fade-out gradient,
                    identical to the pattern used in ParkDetailSheet. */}
                <div className="relative z-20 -mt-14 px-5 pb-2">
                  {activityLabel && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-3 py-1 bg-cyan-500/90 backdrop-blur-sm text-white text-[10px] font-black rounded-full shadow-sm">
                        {activityLabel}
                      </span>
                    </div>
                  )}
                  <h1
                    className="text-[20px] font-bold text-gray-900 leading-tight"
                    style={{ wordBreak: 'break-word', paddingInlineEnd: 40 }}
                  >
                    {route.name || 'מסלול ללא שם'}
                  </h1>
                </div>

                {/* Content — no -mt-10 here; the title block's -mt-14 handles
                    the hero→content visual bridge. */}
                <div className="bg-white relative z-10 px-5 pt-2 pb-8">
                  {/* Top meta row: city + walk-to-start distance.
                      Kept intentionally small + grey so it reads as
                      contextual ("where am I going from?") rather than
                      as a stat about the route itself. */}
                  {(route.city || distToStart) && (
                    <div className="flex items-center gap-3 flex-wrap mb-3">
                      {route.city && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <MapPin size={12} />{route.city}
                        </span>
                      )}
                      {distToStart && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Navigation size={12} />{distToStart} עד תחילת המסלול
                        </span>
                      )}
                    </div>
                  )}

                  {/* Primary stat pills — same visual treatment as the
                      strength preview (white pill, 0.5px cyan border, sm
                      shadow). Kept above the secondary inline stats so
                      the user sees the three "headline" facts first. */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <div className={STAT_PILL_CLASS} style={{ border: PILL_BORDER }}>
                      {/* colorScheme="severity" held back for the dormant
                          merge (18.08.2026) — see RouteCardUnified.tsx's
                          identical note. */}
                      <DifficultyBolts difficulty={route.difficulty} size="md" />
                    </div>
                    {route.duration > 0 && (
                      <div className={STAT_PILL_CLASS} style={{ border: PILL_BORDER }}>
                        <Clock size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="text-[13px] font-normal text-gray-800">{formatDuration(route.duration)}</span>
                      </div>
                    )}
                    {route.distance > 0 && (
                      <div className={STAT_PILL_CLASS} style={{ border: PILL_BORDER }}>
                        <Ruler size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="text-[13px] font-normal text-gray-800">{formatDistance(route.distance)}</span>
                        <span className="text-[10px] text-gray-400 font-bold">אורך מסלול</span>
                      </div>
                    )}
                  </div>

                  {/* Secondary inline stats — calories + monthly popularity.
                      Smaller, no pill chrome, so the eye separates them
                      from the primary headline pills above. */}
                  {(route.calories > 0 || (route.analytics?.usageCount ?? 0) > 0) && (
                    <div className="flex items-center gap-3 flex-wrap text-[12px] font-bold text-gray-500 mb-4">
                      {route.calories > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Flame size={13} className="text-orange-500" />
                          <span>{route.calories} קק&quot;ל</span>
                        </span>
                      )}
                      {route.calories > 0 && (route.analytics?.usageCount ?? 0) > 0 && (
                        <span className="text-gray-300" aria-hidden>•</span>
                      )}
                      {(route.analytics?.usageCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} className="text-emerald-500" />
                          <span>{route.analytics?.usageCount} שימושים</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── Compact Community Section ──────── */}
                  <section className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[15px] font-bold flex items-center gap-1.5">
                        <Calendar size={14} className="text-emerald-500" />
                        <span>מתאמנים</span>
                        {allSessions.length > 0 && (
                          <span className="bg-emerald-500 text-white text-[9px] font-black rounded-full w-[18px] h-[18px] flex items-center justify-center ms-0.5">
                            {allSessions.reduce((s, e) => s + (e.currentRegistrations ?? 0), 0)}
                          </span>
                        )}
                      </h3>
                      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                        {(['today', 'tomorrow', 'week'] as DayFilter[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => setDayFilter(f)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                              dayFilter === f ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-500'
                            }`}
                          >
                            {DAY_FILTER_LABELS[f]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filteredSessions.length === 0 && !justPublished ? (
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 py-3 px-3">
                          <Users size={18} className="text-emerald-400 flex-shrink-0" />
                          <p className="text-xs text-emerald-700 font-bold flex-1">אף אחד עוד לא פרסם שהוא מגיע...</p>
                          <button
                            onClick={() => setShowTimePicker(!showTimePicker)}
                            className="flex-shrink-0 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[11px] font-bold active:scale-[0.97] transition-transform"
                          >
                            אני מגיע ב...
                          </button>
                        </div>
                        {showTimePicker && (
                          <div className="px-3 pb-3 pt-2 border-t border-emerald-100 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-emerald-700">שעת הגעה</span>
                              <span className="text-[11px] font-black text-emerald-600" dir="ltr">
                                {minutesToLabel(timeRangeMinutes[0])} - {minutesToLabel(timeRangeMinutes[1])}
                              </span>
                            </div>
                            <DualRangeSlider
                              min={6 * 60}
                              max={22 * 60}
                              step={RANGE_STEP_MIN}
                              values={timeRangeMinutes}
                              onChange={setTimeRangeMinutes}
                              ariaLabelMin="שעת הגעה מוקדמת"
                              ariaLabelMax="שעת הגעה מאוחרת"
                            />
                            <button
                              onClick={handlePublishArrival}
                              disabled={publishingSession}
                              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-[11px] font-bold transition-colors"
                            >
                              {publishingSession ? '...' : 'פרסם'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredSessions.map((ev, idx) => {
                          let timeLabel = '';
                          const d = new Date(ev.nextStartTime);
                          if (!isNaN(d.getTime())) {
                            const now = new Date();
                            const isToday = d.toDateString() === now.toDateString();
                            const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
                            const isTomorrow = d.toDateString() === tmrw.toDateString();
                            const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                            timeLabel = isToday ? hhmm : isTomorrow ? `מחר ${hhmm}` : d.toLocaleDateString('he-IL', { weekday: 'short' }) + ` ${hhmm}`;
                          }
                          const isJoining = joiningEventId === ev.eventId;
                          const count = ev.currentRegistrations ?? 0;
                          const alreadyJoined = isUserRegistered(ev);

                          return (
                            <div key={`route_${ev.eventId}_${idx}`} className="flex items-center gap-2 py-1.5 px-2.5 bg-emerald-50/70 rounded-lg hover:bg-emerald-50 transition-colors">
                              <span className="text-[11px] font-black text-emerald-700 min-w-[40px] text-center" dir="ltr">{timeLabel}</span>
                              <span className="flex-1 text-xs font-bold text-emerald-800 truncate">
                                {ev.isRecurring ? 'קבוצתי' : ev.eventLabel}
                              </span>
                              {ev.isRecurring && <RefreshCw size={10} className="text-emerald-400 flex-shrink-0" />}
                              <span className="text-[10px] text-emerald-600 font-bold flex-shrink-0">{count} <Users size={10} className="inline -mt-0.5" /></span>
                              <div className="flex -space-x-1 rtl:space-x-reverse flex-shrink-0">
                                {ev.avatars?.slice(0, 2).map((a, ai) => (
                                  <button key={`${ev.eventId}_av_${a.uid}_${ai}`} onClick={() => setProfileUser({ uid: a.uid, name: a.name, photoURL: a.photoURL })} className="w-5 h-5 rounded-full border border-white bg-emerald-100 flex items-center justify-center text-[7px] font-black text-emerald-700 overflow-hidden active:scale-90">
                                    {a.photoURL ? <img src={a.photoURL} alt="" className="w-full h-full object-cover" /> : a.name.charAt(0)}
                                  </button>
                                ))}
                              </div>
                              {alreadyJoined ? (
                                <span className="flex-shrink-0 px-2.5 py-1 border border-emerald-500 text-emerald-600 rounded-md text-[10px] font-bold flex items-center gap-0.5">
                                  <Check size={10} />
                                  נרשמת
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleJoinEvent(ev)}
                                  disabled={isJoining || ev.spotsLeft === 0}
                                  className="flex-shrink-0 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-md text-[10px] font-bold transition-colors"
                                >
                                  {isJoining ? '...' : 'הצטרף'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Visual confirmation of just-published arrival */}
                    <AnimatePresence>
                      {justPublished && (
                        <motion.div
                          key={`published_${justPublished.time}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-1.5"
                        >
                          <div className="flex items-center gap-2 py-1.5 px-2.5 bg-emerald-100 border border-emerald-200 rounded-lg">
                            <span className="text-[11px] font-black text-emerald-700 min-w-[40px] text-center" dir="ltr">{justPublished.time}</span>
                            <div className="w-5 h-5 rounded-full border border-white bg-emerald-200 flex items-center justify-center text-[7px] font-black text-emerald-700 overflow-hidden flex-shrink-0">
                              {justPublished.photoURL
                                ? <img src={justPublished.photoURL} alt="" className="w-full h-full object-cover" />
                                : justPublished.name.charAt(0)}
                            </div>
                            <span className="flex-1 text-xs font-bold text-emerald-800 truncate">{justPublished.name}</span>
                            <span className="flex-shrink-0 px-2.5 py-1 border border-emerald-500 text-emerald-600 rounded-md text-[10px] font-bold flex items-center gap-0.5">
                              <Check size={10} />
                              נרשמת
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>

                  {/* ── Vertical timeline accordion ─────────────────────
                      Two stacked rows that mirror the journey bar above:
                        Row 1 — Walk-to-route (turn list from Mapbox)
                        Row 2 — The route itself (features, facility
                                stops, pre-computed maneuvers)
                      Both collapsed by default. Tapping a header toggles
                      open/close with a smooth height animation. The dashed
                      vertical connector on the right (RTL = visual right)
                      visually links the two rows like a subway map. */}
                  {(() => {
                    const path = route.path;
                    const isRouteCircular = path && path.length >= 2
                      ? haversineKm(path[0][1], path[0][0], path[path.length - 1][1], path[path.length - 1][0]) * 1000 < 100
                      : false;
                    const distanceKm = route.distance ?? 0;
                    const distanceLabelStr = distanceKm >= 1
                      ? `${distanceKm.toFixed(1)} ק"מ`
                      : `${Math.round(distanceKm * 1000)} מ'`;
                    const facilityStops = route.facilityStops ?? [];

                    // Tiny formatter — keeps the timeline rows compact.
                    const fmtMeters = (m: number) =>
                      m >= 1000 ? `${(m / 1000).toFixed(1)} ק"מ` : `${Math.round(m)}מ'`;

                    // Map a Hebrew turn label → unicode arrow icon.
                    const turnIconFor = (instr: string): string => {
                      if (instr.includes('שמאלה')) return '↰';
                      if (instr.includes('ימינה')) return '↱';
                      return '↑';
                    };

                    const showWalkRow = walkToRouteMinutes != null;

                    return (
                      <section dir="rtl" className="mb-6 relative">
                        {/* Dashed vertical connector — sits on the visual
                            right (RTL = right edge), spans both rows so
                            the headers feel linked even when collapsed.
                            Hidden when only the route row is rendered. */}
                        {showWalkRow && (
                          <div
                            className="absolute top-6 bottom-6 w-px pointer-events-none"
                            style={{
                              right: '14px',
                              borderRight: '2px dashed #D1D5DB',
                            }}
                            aria-hidden
                          />
                        )}

                        {/* ── Row 1 — Walk to route (optional) ── */}
                        {showWalkRow && (
                          <div className="mb-2 relative z-10">
                            <button
                              type="button"
                              onClick={() => setOpenSection((s) => s === 'walk' ? null : 'walk')}
                              className="w-full bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-2 active:scale-[0.99] transition-transform"
                            >
                              <span className="text-lg leading-none">🚶</span>
                              <span className="text-[13px] font-bold text-gray-700 flex-1 text-right">
                                הליכה למסלול
                              </span>
                              <span className="text-[12px] font-semibold text-gray-500 whitespace-nowrap">
                                {walkToRouteMinutes} דק&apos;
                              </span>
                              <span
                                className="text-gray-400 text-base transition-transform duration-200"
                                style={{
                                  transform: openSection === 'walk' ? 'rotate(90deg)' : 'rotate(0deg)',
                                }}
                                aria-hidden
                              >
                                ›
                              </span>
                            </button>

                            <AnimatePresence initial={false}>
                              {openSection === 'walk' && (
                                <motion.div
                                  key="walk-content"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: 'easeOut' }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-3 pt-2 text-sm text-gray-600 space-y-1.5">
                                    {walkSteps && walkSteps.length > 0 ? (
                                      <>
                                        {walkSteps.map((step, i) => (
                                          <div key={`walk_step_${i}`} className="flex items-center gap-2">
                                            <span className="text-base leading-none w-5 text-center text-gray-500">
                                              {turnIconFor(step.instruction)}
                                            </span>
                                            <span className="flex-1 text-[13px] text-gray-700 truncate">
                                              {step.instruction}
                                            </span>
                                            <span className="text-[12px] text-gray-500 font-semibold whitespace-nowrap">
                                              {fmtMeters(step.distanceMeters)}
                                            </span>
                                          </div>
                                        ))}
                                        <div className="flex items-center gap-2 pt-0.5">
                                          <span className="text-base leading-none w-5 text-center">📍</span>
                                          <span className="flex-1 text-[13px] text-emerald-600 font-bold">
                                            הגעת למסלול
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-[12px] text-gray-400 italic">
                                        מחשב הוראות...
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* ── Row 2 — The route itself ── */}
                        <div className="relative z-10">
                          <button
                            type="button"
                            onClick={() => setOpenSection((s) => s === 'route' ? null : 'route')}
                            className="w-full bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-2 active:scale-[0.99] transition-transform"
                          >
                            <span className="text-lg leading-none">🗺️</span>
                            <span className="text-[13px] font-bold text-gray-700 flex-1 text-right truncate">
                              {route.name || 'המסלול'}
                            </span>
                            <span className="text-[12px] font-semibold text-gray-500 whitespace-nowrap">
                              {formatDuration(route.duration)} • {distanceLabelStr}
                            </span>
                            <span
                              className="text-gray-400 text-base transition-transform duration-200"
                              style={{
                                transform: openSection === 'route' ? 'rotate(90deg)' : 'rotate(0deg)',
                              }}
                              aria-hidden
                            >
                              ›
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {openSection === 'route' && (
                              <motion.div
                                key="route-content"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: 'easeOut' }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-3 pt-2 text-sm text-gray-600 space-y-3">
                                  {/* Feature chips — mirror the existing
                                      "תכונות מסלול" chip style further down,
                                      restricted to the three core attributes
                                      surface / environment / lit. */}
                                  {route.features && (
                                    route.features.surface ||
                                    route.features.environment ||
                                    route.features.lit === true
                                  ) && (
                                    <div className="flex flex-wrap gap-2">
                                      {route.features.environment && (
                                        <span className="px-3 py-1 bg-gray-100 rounded-full text-[11px] font-bold text-gray-600">
                                          {ENVIRONMENT_LABELS[route.features.environment] ?? route.features.environment}
                                        </span>
                                      )}
                                      {route.features.surface && (
                                        <span className="px-3 py-1 bg-gray-100 rounded-full text-[11px] font-bold text-gray-600">
                                          {SURFACE_LABELS[route.features.surface] ?? route.features.surface}
                                        </span>
                                      )}
                                      {route.features.lit === true && (
                                        <span className="px-3 py-1 bg-gray-100 rounded-full text-[11px] font-bold text-gray-600">
                                          מואר
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Facility stops along the route */}
                                  {facilityStops.length > 0 && (
                                    <div className="space-y-1.5">
                                      {facilityStops.map((stop, i) => (
                                        <div key={`stop_${stop.id}_${i}`} className="flex items-center gap-2">
                                          <span className="text-base leading-none w-5 text-center">🏋️</span>
                                          <span className="flex-1 text-[13px] text-gray-700 truncate">
                                            {stop.name || 'גינת כושר'}
                                          </span>
                                          <span className="text-[12px] text-gray-500 font-semibold whitespace-nowrap">
                                            {fmtMeters((stop as any).distanceFromStart ?? 0)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Pre-computed maneuvers */}
                                  {routeTurns.length > 0 && (
                                    <div className="space-y-1.5">
                                      {routeTurns.map((turn, i) => (
                                        <div key={`turn_${i}`} className="flex items-center gap-2">
                                          <span className="text-base leading-none w-5 text-center text-gray-500">
                                            {turnIconFor(turn.instruction)}
                                          </span>
                                          <span className="flex-1 text-[13px] text-gray-700 truncate">
                                            {turn.instruction}
                                          </span>
                                          <span className="text-[12px] text-gray-500 font-semibold whitespace-nowrap">
                                            {fmtMeters(turn.distanceMeters)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Finish marker — only for non-circular
                                      routes (matches the journey bar above). */}
                                  {!isRouteCircular && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-base leading-none w-5 text-center">🏁</span>
                                      <span className="flex-1 text-[13px] text-emerald-600 font-bold">
                                        סיום המסלול
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </section>
                    );
                  })()}

                  {/* Activity mode toggle (nav routes) */}
                  {isNavRoute && onActivityChange && (
                    <section className="mb-6">
                      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                        {(['walking', 'running', 'cycling'] as ActivityType[]).map(act => (
                          <button
                            key={act}
                            onClick={() => onActivityChange(act)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              currentActivity === act ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                            }`}
                          >
                            {act === 'walking' ? <Footprints size={14} /> : act === 'running' ? <Activity size={14} /> : <Bike size={14} />}
                            {act === 'walking' ? 'הליכה' : act === 'running' ? 'ריצה' : 'רכיבה'}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Description */}
                  {route.description && (
                    <p className="text-sm text-gray-600 leading-relaxed mb-6">
                      {route.description}
                    </p>
                  )}

                  {/* Features + amenity tags — merged into one section.
                      surface/environment/lit come from route.features;
                      extended tags come from route.featureTags. Both
                      surfaces appear in a single chip row so the user
                      never sees two separate "תכונות" headings. */}
                  {(() => {
                    const hasFeatures = route.features && (
                      route.features.surface ||
                      route.features.environment ||
                      route.features.lit === true
                    );
                    const hasTags = route.featureTags && route.featureTags.length > 0;
                    // qualitySignals-derived badges are a separate data source
                    // (OSM-computed) from route.features (manually curated) —
                    // dedupe the lighting badge against features.lit === true
                    // so a route with both never shows "מואר" twice.
                    const qualityBadges = computeQualityBadges(route.qualitySignals).filter(
                      (b) => !(b.key === 'lighting' && route.features?.lit === true),
                    );
                    if (!hasFeatures && !hasTags && qualityBadges.length === 0) return null;
                    return (
                      <section className="mb-6">
                        <h3 className="text-[16px] font-bold mb-3">תכונות ומתקנים</h3>
                        <div className="flex flex-wrap gap-2">
                          {route.features?.environment && (
                            <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
                              {ENVIRONMENT_LABELS[route.features.environment] ?? route.features.environment}
                            </span>
                          )}
                          {route.features?.surface && (
                            <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
                              {SURFACE_LABELS[route.features.surface] ?? route.features.surface}
                            </span>
                          )}
                          {route.features?.lit === true && (
                            <span className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
                              מואר
                            </span>
                          )}
                          {route.featureTags?.map((tag) => (
                            <span
                              key={tag}
                              className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600"
                            >
                              {ROUTE_FEATURE_TAG_LABELS[tag] ?? tag}
                            </span>
                          ))}
                          {qualityBadges.map((b) => (
                            <span
                              key={b.key}
                              className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600"
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </section>
                    );
                  })()}

                  {/* Dev simulation controls — hidden in production builds */}
                  {process.env.NODE_ENV !== 'production' && devSim && (
                    <section className="mb-6">
                      <h3 className="text-[13px] font-bold mb-2 text-orange-600 flex items-center gap-1.5">
                        <Crosshair size={14} />
                        Dev: סימולציה
                      </h3>
                      {devSim.isSimulating ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all duration-150"
                              style={{ width: `${Math.round(devSim.simulationProgress * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-orange-500 min-w-[32px] text-center">
                            {Math.round(devSim.simulationProgress * 100)}%
                          </span>
                          <button
                            onClick={devSim.stopSimulation}
                            className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-[11px] font-bold transition-colors"
                          >
                            עצור
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => devSim.startSimulation(route, 1)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[11px] font-bold transition-colors border border-orange-200"
                          >
                            <PersonStanding size={14} />
                            דמה הליכה
                          </button>
                          <button
                            onClick={() => devSim.startSimulation(route, 5)}
                            className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[11px] font-bold transition-colors border border-orange-200"
                          >
                            x5
                          </button>
                          <button
                            onClick={() => devSim.startSimulation(route, 20)}
                            className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl text-[11px] font-bold transition-colors border border-orange-200"
                          >
                            x20
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </div>

              {/* Fixed bottom action bar */}
              <div
                className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200/50 px-4 pt-3"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
              >
                {/* Share-as-live toggle — same primitive used by strength + running previews.
                    contextRoute: this sheet already knows its own route, so the Phase-2
                    compose flow (SOCIAL_COMPOSE_UI_ENABLED) pre-selects it instead of
                    opening an empty route picker. */}
                <ShareAsLiveToggle
                  activityType={mapRouteActivityToPresence(route.activityType ?? route.type)}
                  workoutTitle={route.name || 'מסלול'}
                  userLocation={userLocation ?? null}
                  contextRoute={{
                    id: route.id,
                    name: route.name || 'מסלול',
                    lat: route.path?.[0]?.[1] ?? null,
                    lng: route.path?.[0]?.[0] ?? null,
                  }}
                  className="pb-2"
                />

                <div className="flex items-center gap-2" dir="rtl">
                  <button
                    onClick={() => { onClose(); onStartWorkout?.(route); }}
                    className="flex-1 text-white font-extrabold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-[15px]"
                    style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 44 }}
                  >
                    <Play size={18} fill="currentColor" />
                    <span>התחל אימון</span>
                  </button>
                  <button
                    onClick={() => onNavigate ? onNavigate(route) : handleNavigate()}
                    className="flex-shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center bg-white shadow-sm active:scale-90 transition-transform"
                    style={{ border: '0.5px solid #E0E9FF' }}
                    title="ניווט"
                  >
                    <Navigation size={18} className="text-emerald-500" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* User Profile Sheet */}
      <UserProfileSheet
        isOpen={!!profileUser}
        onClose={() => setProfileUser(null)}
        user={profileUser}
      />
    </>
  );
}
