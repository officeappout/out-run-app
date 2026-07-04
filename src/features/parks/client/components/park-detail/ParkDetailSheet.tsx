'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from 'framer-motion';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import { X, Star, Play, Pencil, Navigation, MapPin, Flag, ChevronLeft, Loader2, Calendar, Users, UserPlus, RefreshCw, MessageCircle, Check, Dumbbell } from 'lucide-react';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useUserStore } from '@/features/user';
import { getReviewsForPark } from '@/features/parks/core/services/contribution.service';
import type { Park } from '@/features/parks/core/types/park.types';
import { bunnyImg } from '@/lib/bunny-image';
import type { UserContribution } from '@/types/contribution.types';
import IconChip from './IconChip';
import { AMENITY_ICON_MAP, AMENITY_DISPLAY_ORDER } from './amenity-icons';
import SuggestEditSheet from '../contribution-wizard/SuggestEditSheet';
import StarRatingWidget from '../contribution-wizard/StarRatingWidget';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { XP_REWARDS } from '@/types/contribution.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { useParkEvents, matchesDayFilter, type DayFilter, type SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { useMyRegistrations } from '@/features/parks/core/hooks/useMyRegistrations';
import { joinEvent, materializeVirtualSession } from '@/features/admin/services/community.service';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import { getGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { auth } from '@/lib/firebase';
import UserProfileSheet, { type ProfileUser } from '../UserProfileSheet';
import DualRangeSlider from '@/features/partners/components/DualRangeSlider';
import EquipmentDetailDrawer from '../equipment-detail/EquipmentDetailDrawer';

const DAY_FILTER_LABELS: Record<DayFilter, string> = {
  today: 'היום',
  tomorrow: 'מחר',
  week: 'השבוע',
};

const DRAWER_HEIGHT = '92vh';
/** px the sheet is offset at initial open to show ~85 vh (92 - 85 = 7 vh). */
const PEEK_Y_PX = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.07) : 57;
const CLOSE_THRESHOLD = 120;
const EXPAND_THRESHOLD = 60;

const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'גינת כושר', court: 'מגרש ספורט', route: 'מסלול',
  zen_spot: 'פינת גוף-נפש', urban_spot: 'אורבן / אקסטרים', nature_community: 'טבע וקהילה',
};

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

/**
 * Format a "minutes from midnight" value (the unit the dual-range slider
 * operates on — see `RANGE_STEP_MIN` below) into a HH:MM string for the
 * floating slider labels and the LTR window summary line.
 */
function minutesToLabel(minutes: number): string {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = Math.floor(minutes) % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}`;
}

/**
 * Convert a `Date` into the local-date `<input type="date">` value
 * ("YYYY-MM-DD"). Used for the explicit date picker that shows up
 * in `dayFilter === 'week'` mode (paired with the time-range slider).
 */
function toLocalDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Dual-range slider domain: 0..1440 minutes, in 15-minute steps. */
const RANGE_MIN = 0;
const RANGE_MAX = 24 * 60;
const RANGE_STEP_MIN = 15;

interface ParkDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onStartWorkout?: () => void;
  userLocation?: { lat: number; lng: number } | null;
}

export default function ParkDetailSheet({ isOpen, onClose, onStartWorkout, userLocation }: ParkDetailSheetProps) {
  const { selectedPark } = useMapStore();
  const { profile } = useUserStore();
  const y = useMotionValue(0);
  // Opacity fades only as the user drags past the resting (85vh) anchor.
  const opacity = useTransform(y, [PEEK_Y_PX, PEEK_Y_PX + 220], [1, 0]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // ── GPU-threaded scroll animation (no React re-renders) ──────────────────
  const scrollYMV = useMotionValue(0);
  const maxScroll = 200;

  const imageOpacity = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / maxScroll, 1);
    return Math.max(1 - progress * 0.7, 0.3);
  });
  const imageScale = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / maxScroll, 1);
    return Math.max(1 - progress * 0.2, 0.8);
  });
  const headerOpacity = useTransform(scrollYMV, (v) => {
    const progress = Math.min(v / maxScroll, 1);
    return Math.min(progress * 2, 1);
  });
  const heroHeight = useTransform(scrollYMV, (v) => `${Math.max(280 - v * 0.8, 60)}px`);
  const headerPointerEvents = useTransform(
    headerOpacity,
    (v) => (v < 0.05 ? 'none' : 'auto') as 'none' | 'auto',
  );
  const heroControlsPointerEvents = useTransform(
    imageOpacity,
    (v) => (v < 0.1 ? 'none' : 'auto') as 'none' | 'auto',
  );

  // Instagram-style scroll chain: intercepts down-swipe at scrollTop=0
  useSheetScrollChain({ isOpen, y, onClose, scrollRef, snapBackY: PEEK_Y_PX });

  const [reviews, setReviews] = useState<UserContribution[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [suggestEditOpen, setSuggestEditOpen] = useState(false);
  // Resolved equipment metadata for `park.gymEquipment` ids — needed to
  // render the "מתקנים" grid with proper SVG icons + Hebrew names. The
  // stored `ParkGymEquipment` only carries equipmentId + brandName, so
  // we fan out one Firestore read per id (typically <10 per park).
  const [parkEquipment, setParkEquipment] = useState<GymEquipment[]>([]);

  // Inline rating
  const [ratingOpen, setRatingOpen] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  // Gallery expanded image
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  // Equipment-detail drawer state. Stored as `{ id, brand }` so we
  // can preserve the brand context the park advertised when the user
  // re-opens the same equipment from a different card. `null` keeps
  // the drawer closed (and is what the close handler resets to).
  const [selectedEquipment, setSelectedEquipment] = useState<
    { id: string; brand: string | null } | null
  >(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Time-window state for the dual-range slider. Stored as
  // `[startMinutes, endMinutes]` in MINUTES from midnight (0..1440)
  // because that's the unit the slider's underlying numeric domain
  // operates on. Defaults to a 17:00–19:00 window — the same example
  // copy used in the spec — which in 15-minute steps is [1020, 1140].
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<[number, number]>([
    17 * 60,
    19 * 60,
  ]);
  // Date the user is targeting in `week` mode (a YYYY-MM-DD string
  // bound to a native `<input type="date">`). Defaults to tomorrow so
  // the user has somewhere to start picking from when they tap the
  // השבוע chip. `today`/`tomorrow` modes don't use this — the date
  // there is implied directly by the chip selection.
  const [pickedDate, setPickedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateInputValue(d);
  });
  const [publishingSession, setPublishingSession] = useState(false);
  // Optimistic local arrivals injected immediately after the
  // `createPlannedSession` write resolves, so the row appears in the
  // sessions list without waiting for the Firestore snapshot round-trip.
  // Cleared when the sheet closes (see body-overflow effect below).
  const [localArrivals, setLocalArrivals] = useState<SessionEnrichment[]>([]);

  const handlePublishArrival = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !selectedPark) return;
    setPublishingSession(true);
    try {
      // Resolve the BASE date (no time component yet) from the active
      // `dayFilter`:
      //   - 'today'    → today
      //   - 'tomorrow' → today + 1 day
      //   - 'week'     → the explicit YYYY-MM-DD the user picked via
      //                  the date input (`pickedDate`)
      // The slider then layers a [start, end] minutes-of-day window
      // on top, producing two concrete Date instances we persist as
      // `startTime` / `endTime` on the planned_session doc.
      const baseDate = new Date();
      if (dayFilter === 'tomorrow') {
        baseDate.setDate(baseDate.getDate() + 1);
      } else if (dayFilter === 'week') {
        const parsed = new Date(`${pickedDate}T00:00:00`);
        if (isNaN(parsed.getTime())) {
          console.warn('[ParkDetail] Invalid date input value:', pickedDate);
          return;
        }
        baseDate.setFullYear(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
      baseDate.setHours(0, 0, 0, 0);

      const [startMinutes, endMinutes] = timeRangeMinutes;
      const startTime = new Date(baseDate);
      startTime.setMinutes(startMinutes);
      const endTime = new Date(baseDate);
      endTime.setMinutes(endMinutes);

      // Defensive: the slider clamps end ≥ start during drag, but a
      // race (e.g. controlled state out of sync) could still produce
      // a degenerate window. Force at least the slider step so
      // downstream consumers always see a non-zero range.
      if (endTime.getTime() <= startTime.getTime()) {
        endTime.setTime(startTime.getTime() + RANGE_STEP_MIN * 60 * 1000);
      }

      // Reject windows that have already ended — there's no point
      // announcing an arrival for a slot that's already past.
      if (endTime.getTime() < Date.now()) {
        console.warn(
          '[ParkDetail] Rejecting publish — window ends in the past:',
          endTime.toISOString(),
        );
        return;
      }

      // Resolve the publisher's active strength program at write time
      // so the partner card can render the same "🎯 program · רמה N"
      // line that live cards already show. We mirror the field shape
      // used by `useWorkoutPresence` (the heartbeat that powers live
      // cards) so the consumer code path is identical.
      const liveProfile = useUserStore.getState().profile;
      const activeProgram = liveProfile?.progression?.activePrograms?.[0];
      const programName = activeProgram?.name ?? undefined;
      const programLevel = activeProgram?.templateId
        ? liveProfile?.progression?.tracks?.[activeProgram.templateId]?.currentLevel
        : undefined;

      // parkId (NOT routeId) so `useParkEvents` can read this back via its
      // `where('parkId', '==', parkId)` planned_sessions subscription.
      // Using the routeId field for parkIds was a bug — it cross-polluted
      // the partner-finder route stream and prevented this very screen
      // from re-rendering its own arrival on refresh.
      await createPlannedSession({
        userId: user.uid,
        displayName: user.displayName ?? 'משתמש',
        photoURL: user.photoURL,
        parkId: selectedPark.id,
        // Denormalised label so PartnerCard can render
        // "📍 פארק הלל" without an extra Firestore round-trip.
        parkName: selectedPark.name,
        ...(programName ? { programName } : {}),
        ...(typeof programLevel === 'number' ? { programLevel } : {}),
        activityType: 'workout',
        level: 'beginner',
        startTime,
        endTime,
        // 'verified_global' (public tier) so the partner-finder
        // listeners — which gate on `where('mode', '==',
        // 'verified_global')` to stay within Firestore rules — can
        // surface this arrival to non-followers. The previous 'squad'
        // value silently restricted visibility to the publisher's
        // followers only, which defeated the point of an open
        // "I'm coming" announcement at a public park.
        privacyMode: 'verified_global',
        lat: selectedPark.location?.lat ?? null,
        lng: selectedPark.location?.lng ?? null,
      });
      setShowTimePicker(false);
      const displayName = user.displayName ?? 'משתמש';
      setLocalArrivals((prev) => [
        ...prev,
        {
          eventId: `local-arrival-${user.uid}-${Date.now()}`,
          eventLabel: displayName,
          nextStartTime: startTime.toISOString(),
          currentRegistrations: 1,
          plannedCount: 1,
          avatars: [{
            uid: user.uid,
            name: displayName,
            photoURL: user.photoURL ?? undefined,
          }],
          isPersonalArrival: true,
        },
      ]);
    } catch (err) {
      console.error('[ParkDetail] Failed to publish arrival:', err);
    } finally {
      setPublishingSession(false);
    }
  }, [timeRangeMinutes, pickedDate, dayFilter, selectedPark]);

  const park = selectedPark;

  const { events: parkEvents, loading: eventsLoading } = useParkEvents(
    isOpen ? park?.id : null,
  );

  // Merge live snapshot results with optimistic local arrivals; drop
  // local entries once the snapshot has caught up (matched by userId +
  // start-time) so the same arrival doesn't render twice.
  const mergedParkEvents = useMemo(() => {
    if (localArrivals.length === 0) return parkEvents;

    const liveKey = (ev: SessionEnrichment) => {
      const uid = ev.avatars?.[0]?.uid ?? '';
      return `${uid}_${ev.nextStartTime}`;
    };
    const liveKeys = new Set(
      parkEvents
        .filter((e) => e.isPersonalArrival)
        .map(liveKey),
    );
    const stillOptimistic = localArrivals.filter((l) => !liveKeys.has(liveKey(l)));
    if (stillOptimistic.length === 0) return parkEvents;

    return [...parkEvents, ...stillOptimistic].sort((a, b) =>
      a.nextStartTime.localeCompare(b.nextStartTime),
    );
  }, [parkEvents, localArrivals]);

  const filteredParkEvents = useMemo(
    () => mergedParkEvents.filter((ev) => matchesDayFilter(ev.nextStartTime, dayFilter)),
    [mergedParkEvents, dayFilter],
  );

  // Personal arrivals don't have a `community_events/{id}/registrations`
  // sub-collection — only real (non-recurring, non-personal) events do.
  // Including them in `realEventIds` would trigger spurious snapshot
  // listeners on non-existent docs.
  const realEventIds = useMemo(
    () => mergedParkEvents
      .filter((e) => !e.isRecurring && !e.isPersonalArrival)
      .map((e) => e.eventId),
    [mergedParkEvents],
  );
  const registeredEventIds = useMyRegistrations(realEventIds);

  useEffect(() => {
    if (isOpen && park?.id) {
      console.log('[ParkDetail] Park:', park.id, park.name, '| Events found:', mergedParkEvents.length, mergedParkEvents.map(e => e.eventLabel));
    }
  }, [isOpen, park?.id, park?.name, mergedParkEvents]);

  const currentUid = auth.currentUser?.uid;

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
        const [, , dateStr] = ev.eventId.split('_');
        const time = ev.nextStartTime.includes('T')
          ? ev.nextStartTime.split('T')[1].slice(0, 5)
          : '18:00';
        await materializeVirtualSession(
          ev.groupId, dateStr ?? new Date().toISOString().split('T')[0], time,
          user.uid, user.displayName ?? 'משתמש', user.photoURL ?? undefined,
        );
      } else {
        await joinEvent(ev.eventId, user.uid, user.displayName ?? 'משתמש', user.photoURL ?? undefined);
      }
    } catch (err) {
      console.error('[ParkDetailSheet] Join event failed:', err);
    } finally {
      setJoiningEventId(null);
    }
  }, []);

  // Load reviews for this park
  useEffect(() => {
    if (!isOpen || !park?.id) { setReviews([]); return; }
    setReviewsLoading(true);
    getReviewsForPark(park.id)
      .then(setReviews)
      .catch(err => console.error('[ParkDetailSheet] Reviews load failed:', err))
      .finally(() => setReviewsLoading(false));
  }, [isOpen, park?.id]);

  // Resolve equipment ids → full GymEquipment docs so the "מתקנים"
  // grid can render the SVG icon (iconKey) + Hebrew name. Cancellable
  // via `cancelled` flag in case the user opens a different park
  // before the previous fetch resolves.
  useEffect(() => {
    if (!isOpen || !park?.gymEquipment?.length) {
      setParkEquipment([]);
      return;
    }
    let cancelled = false;
    const ids = park.gymEquipment.map((e) => e.equipmentId).filter(Boolean);
    Promise.all(ids.map((id) => getGymEquipment(id).catch(() => null)))
      .then((items) => {
        if (cancelled) return;
        setParkEquipment(items.filter((x): x is GymEquipment => x !== null));
      })
      .catch((err) => {
        if (!cancelled) console.error('[ParkDetailSheet] Equipment load failed:', err);
      });
    return () => { cancelled = true; };
  }, [isOpen, park?.id, park?.gymEquipment]);

  const avgRating = useMemo(() => {
    const rated = reviews.filter(r => r.rating);
    if (rated.length === 0) return park?.rating ?? null;
    return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
  }, [reviews, park?.rating]);

  const distText = useMemo(() => {
    if (!userLocation || !park?.location) return null;
    const km = haversineKm(userLocation.lat, userLocation.lng, park.location.lat, park.location.lng);
    return distanceLabel(km);
  }, [userLocation, park?.location]);

  const photoGallery = useMemo(() => {
    const urls: string[] = [];
    // Prefer imageUrl (Bunny CDN) over legacy image fields
    if (park?.imageUrl) urls.push(park.imageUrl);
    else if (park?.images?.length) urls.push(...park.images);
    else if (park?.image) urls.push(park.image);
    reviews.filter(r => r.photoUrl).forEach(r => urls.push(r.photoUrl!));
    return urls.slice(0, 8);
  }, [park, reviews]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else {
      document.body.style.overflow = '';
      setLocalArrivals([]);
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Keep scrollYMV in sync with the scroll container (no React re-renders)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;
    scrollYMV.set(0);
    const handler = () => scrollYMV.set(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [isOpen, scrollYMV]);

  const handleDragEnd = (_: any, info: any) => {
    const offset = info.offset.y;
    const velocity = info.velocity.y;
    const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;

    if (offset > CLOSE_THRESHOLD || velocity > 500) {
      onClose();
    } else if (offset < -EXPAND_THRESHOLD) {
      animate(y, 0, SPRING);
    } else {
      animate(y, PEEK_Y_PX, SPRING);
    }
  };

  const handleNavigate = useCallback(() => {
    if (!park?.location) return;
    const { lat, lng } = park.location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  }, [park?.location]);

  const handleRatingSubmit = useCallback(async () => {
    if (!userRating || !park || !profile?.id) return;
    setSubmittingRating(true);
    try {
      await createContribution({
        userId: profile.id,
        type: 'review',
        status: 'pending',
        location: park.location ?? { lat: 0, lng: 0 },
        linkedParkId: park.id,
        rating: userRating,
        comment: ratingComment.trim() || undefined,
      });
      setRatingDone(true);
      setTimeout(() => { setRatingOpen(false); setRatingDone(false); setUserRating(0); setRatingComment(''); }, 1500);
    } catch (err) {
      console.error('[ParkDetailSheet] Rating submit failed:', err);
    } finally {
      setSubmittingRating(false);
    }
  }, [userRating, ratingComment, park, profile?.id]);

  if (!park) return null;

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
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 500 }}
              dragElastic={{ top: 0.08, bottom: 0 }}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              initial={{ y: '100%' }}
              animate={{ y: PEEK_Y_PX }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
              style={{ y, opacity, height: DRAWER_HEIGHT, maxHeight: '92vh', willChange: 'transform' }}
              className="fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {/* Drag handle — full-width touch target */}
              <div
                className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-4 cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none' }}
              >
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>

              {/* Sticky Header — compositor-threaded opacity */}
              <motion.div
                className="absolute top-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-200 dark:border-slate-800"
                style={{ opacity: headerOpacity, pointerEvents: headerPointerEvents }}
              >
                <div className="flex items-center justify-between px-4 pt-10 pb-3">
                  <button onClick={onClose} className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                    <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                  <h1 className="text-lg font-black text-gray-900 dark:text-white flex-1 text-center px-4 leading-tight line-clamp-2">
                    {park.name}
                  </h1>
                  <div className="w-10" />
                </div>
              </motion.div>

              {/* Scrollable body */}
              <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain pb-36">
                {/* Hero image — overflow-hidden prevents bleed on overscroll */}
                <motion.div
                  className="relative w-full overflow-hidden"
                  style={{ height: heroHeight, opacity: imageOpacity, scale: imageScale }}
                >
                  {(park.imageUrl || park.image || park.images?.[0]) ? (
                    <img
                      src={bunnyImg(park.imageUrl || park.images?.[0] || park.image, 800)}
                      alt={park.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                      <MapPin size={48} className="text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />
                  <div
                    className="absolute bottom-0 inset-x-0 h-[85%] pointer-events-none"
                    style={{ background: 'linear-gradient(to top, white 15%, rgba(255,255,255,0.6) 50%, transparent 100%)' }}
                  />

                  {/* Top controls — fade with hero, pointer-events gated */}
                  <motion.div
                    className="absolute top-0 left-0 right-0 px-4 pb-4 flex justify-between items-start z-10"
                    style={{
                      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
                      opacity: imageOpacity,
                      pointerEvents: heroControlsPointerEvents,
                    }}
                  >
                    <button onClick={onClose} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform">
                      <X size={20} />
                    </button>
                  </motion.div>
                </motion.div>

                {/* Title + category badge — pulled OUTSIDE the hero so they
                    escape the hero's `overflow-hidden` (and its scroll-driven
                    height collapse + scale transform). When kept inside, long
                    Hebrew park names wrapping to 2–3 lines were getting their
                    top edge clipped because the absolute `bottom-0` block grew
                    upward past the collapsing hero's top edge.
                    Mirrors the structure used in WorkoutPreviewDrawer.tsx
                    (~line 932) where the title is the first sibling AFTER the
                    hero, with `-mt-14` to overlap the hero gradient visually. */}
                <div className="relative z-20 -mt-14 px-5 pb-2">
                  {park.facilityType && (
                    <span className="inline-block mb-2 px-3 py-1 bg-cyan-500/90 backdrop-blur-sm text-white text-[10px] font-black rounded-full shadow-sm">
                      {FACILITY_LABELS[park.facilityType] || park.facilityType}
                    </span>
                  )}
                  <h1 className="text-[22px] font-black text-gray-900 dark:text-white leading-tight whitespace-normal">
                    {park.name}
                  </h1>
                </div>

                {/* Content. The previous `-mt-10` overlap is gone now that the
                    title block above provides the hero→content transition; the
                    title's own `-mt-14` is what bridges the hero gradient. */}
                <div className="bg-white dark:bg-slate-900 relative z-10 px-5 pt-2 pb-8">
                  {/* Rating + location + distance row */}
                  <div className="flex items-center gap-4 mb-4 flex-wrap">
                    {avgRating && (
                      <div className="flex items-center gap-1.5">
                        <Star size={16} className="text-amber-400" fill="#FBBF24" />
                        <span className="font-black text-gray-900 dark:text-white">{avgRating.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({reviews.filter(r => r.rating).length})</span>
                      </div>
                    )}
                    {distText && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Navigation size={12} />{distText}
                      </span>
                    )}
                    {park.city && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <MapPin size={12} />{park.city}
                      </span>
                    )}
                    {park.status && park.status !== 'open' && (
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        park.status === 'under_repair' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {park.status === 'under_repair' ? 'בתיקון' : 'סגור'}
                      </span>
                    )}
                  </div>

                  {/* ── (2) WHO'S COMING — Park Pulse / מתאמנים ──────
                      Moved to the top of the body so the community
                      pulse + arrival CTA are the first thing the user
                      sees after the hero/metadata row. */}
                  <section className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[15px] font-bold flex items-center gap-1.5">
                        <Calendar size={14} className="text-emerald-500" />
                        <span>מתאמנים</span>
                        {parkEvents.length > 0 && (
                          <span className="bg-emerald-500 text-white text-[9px] font-black rounded-full w-[18px] h-[18px] flex items-center justify-center ms-0.5">
                            {parkEvents.reduce((s, e) => s + Math.max(1, e.currentRegistrations ?? 0), 0)}
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

                    {/* Always-visible publish row — pulled out of the
                        empty-state branch so the user can announce an
                        arrival regardless of whether other arrivals
                        already exist for the selected day.
                        Time-window picker:
                          • today/tomorrow → dual-range slider only
                            (date is implied by the chip selection)
                          • week           → date input + dual-range
                            slider so the user can pick any day +
                            window this week. */}
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl overflow-hidden mb-2">
                      <div className="flex items-center gap-3 py-2.5 px-3">
                        <Users size={16} className="text-emerald-500 flex-shrink-0" />
                        <span className="text-xs text-emerald-700 font-bold flex-1">
                          {filteredParkEvents.length === 0
                            ? 'אף אחד עוד לא פרסם שהוא מגיע...'
                            : 'גם אתה מתכנן להגיע?'}
                        </span>
                        <button
                          onClick={() => setShowTimePicker((v) => !v)}
                          className="flex-shrink-0 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[11px] font-bold active:scale-[0.97] transition-transform"
                        >
                          אני מגיע ב...
                        </button>
                      </div>
                      {showTimePicker && (
                        <div className="px-3 pb-3 pt-2 border-t border-emerald-100 space-y-3">
                          {/* Optional date input — only relevant when the
                              user picked the השבוע chip; today/tomorrow
                              implicitly fix the date already. */}
                          {dayFilter === 'week' && (
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-emerald-500 flex-shrink-0" />
                              <input
                                type="date"
                                value={pickedDate}
                                onChange={(e) => setPickedDate(e.target.value)}
                                className="flex-1 bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-sm text-gray-800 font-bold text-center"
                                dir="ltr"
                              />
                            </div>
                          )}

                          {/* Dual-handle time-range slider. The slider
                              domain is minutes-of-day (0..1440, step 15)
                              so the underlying values are easy to
                              convert into concrete Dates in the publish
                              handler. The window summary below the
                              slider stays LTR ("17:00 - 19:00") so
                              the dash in the middle reads correctly
                              under the page-level RTL direction. */}
                          <div className="px-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-emerald-700">
                                חלון הגעה
                              </span>
                              <span
                                className="text-[12px] font-black text-emerald-600"
                                dir="ltr"
                              >
                                {minutesToLabel(timeRangeMinutes[0])} - {minutesToLabel(timeRangeMinutes[1])}
                              </span>
                            </div>
                            <DualRangeSlider
                              min={RANGE_MIN}
                              max={RANGE_MAX}
                              step={RANGE_STEP_MIN}
                              values={timeRangeMinutes}
                              onChange={setTimeRangeMinutes}
                              formatLabel={minutesToLabel}
                              ariaLabelMin="שעת התחלה"
                              ariaLabelMax="שעת סיום"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={handlePublishArrival}
                              disabled={publishingSession}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-[11px] font-bold transition-colors"
                            >
                              {publishingSession ? '...' : 'פרסם'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {eventsLoading ? (
                      <div className="space-y-1.5">
                        {[1, 2].map((i) => (
                          <div key={i} className="animate-pulse flex items-center gap-2 py-2 px-2.5 bg-emerald-50/60 rounded-lg">
                            <div className="w-6 h-6 bg-emerald-100 rounded-full" />
                            <div className="flex-1 h-3 bg-emerald-100 rounded w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : filteredParkEvents.length === 0 ? null : (
                      <div className="space-y-1">
                        {filteredParkEvents.map((ev, idx) => {
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
                          const count = Math.max(1, ev.currentRegistrations ?? 0);
                          const alreadyJoined = isUserRegistered(ev);
                          // Personal arrivals are individual "I'm heading here"
                          // announcements — not joinable group sessions. We
                          // render them with no Join CTA; the publisher gets
                          // a "פרסמת" badge so they can see their own arrival
                          // confirmed in the live list (this is also the
                          // read-on-mount confirmation that survives refresh).
                          const isOwnArrival =
                            ev.isPersonalArrival && ev.avatars?.[0]?.uid === currentUid;

                          return (
                            <div key={`park_${ev.eventId}_${idx}`} className="flex items-center gap-2 py-1.5 px-2.5 bg-emerald-50/70 rounded-lg hover:bg-emerald-50 transition-colors">
                              <span className="text-[11px] font-black text-emerald-700 min-w-[40px] text-center" dir="ltr">{timeLabel}</span>
                              <span className="flex-1 text-xs font-bold text-emerald-800 truncate">
                                {ev.isRecurring ? 'קבוצתי' : ev.eventLabel}
                              </span>
                              {ev.isRecurring && <RefreshCw size={10} className="text-emerald-400 flex-shrink-0" />}
                              {!ev.isPersonalArrival && (
                                <span className="text-[10px] text-emerald-600 font-bold flex-shrink-0">{count} <Users size={10} className="inline -mt-0.5" /></span>
                              )}
                              <div className="flex -space-x-1 rtl:space-x-reverse flex-shrink-0">
                                {ev.avatars?.slice(0, 2).map((a, ai) => (
                                  <button key={`${ev.eventId}_av_${a.uid}_${ai}`} onClick={() => setProfileUser({ uid: a.uid, name: a.name, photoURL: a.photoURL })} className="w-5 h-5 rounded-full border border-white bg-emerald-100 flex items-center justify-center text-[7px] font-black text-emerald-700 overflow-hidden active:scale-90">
                                    {a.photoURL ? <img src={a.photoURL} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : a.name.charAt(0)}
                                  </button>
                                ))}
                              </div>
                              {ev.isPersonalArrival ? (
                                isOwnArrival ? (
                                  <span className="flex-shrink-0 px-2.5 py-1 border border-emerald-500 text-emerald-600 rounded-md text-[10px] font-bold flex items-center gap-0.5">
                                    <Check size={10} />
                                    פרסמת
                                  </span>
                                ) : null
                              ) : alreadyJoined ? (
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
                  </section>

                  {/* ── (3) AMENITIES — "פירוט על הפארק" ────────────────
                      Renamed from "נוחויות" to make clearer that this
                      is the wider park-context info (shade, lighting,
                      benches, accessibility, etc.) — comfort features
                      that frame the experience without being fitness
                      gear. We render them as compact chips using the
                      same `IconChip` style as the strength-workout
                      equipment tags so the visual language stays
                      consistent across screens. Each tag falls back
                      through three icon strategies: dedicated SVG
                      asset → lucide vector → emoji placeholder
                      (see `amenity-icons.ts`). */}
                  <section className="mb-6">
                    <h3 className="text-[16px] font-bold mb-3">פירוט על הפארק</h3>
                    {park.featureTags && park.featureTags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {AMENITY_DISPLAY_ORDER
                          .filter((tag) => park.featureTags?.includes(tag))
                          .map((tag) => {
                            const cfg = AMENITY_ICON_MAP[tag];
                            if (!cfg) return null;
                            return (
                              <IconChip
                                key={tag}
                                label={cfg.label}
                                iconSrc={cfg.iconSrc}
                                IconComponent={cfg.IconComponent}
                              />
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-gray-50 dark:bg-slate-800/30 rounded-xl">
                        <p className="text-sm text-gray-400">לא צוינו תכונות</p>
                      </div>
                    )}
                  </section>

                  {/* ── (4) DESCRIPTION — free-text paragraph ────────── */}
                  {park.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                      {park.description}
                    </p>
                  )}

                  {/* ── (5) EQUIPMENT — fitness gear installed at the
                      park (pullup bar, parallel bars, rings, etc.).
                      Source: `park.gymEquipment` resolved against the
                      `gym_equipment` collection. Each item is a
                      tappable card that opens the
                      `EquipmentDetailDrawer` (a bottom sheet matching
                      the in-library exercise-drawer pattern) without
                      tearing the user out of the park context.
                      The card carries forward the specific
                      `ParkGymEquipment.brandName` so the drawer
                      lands on the right brand variant out of the gate. */}
                  {parkEquipment.length > 0 && (
                    <section className="mb-6">
                      <h3 className="text-[16px] font-bold mb-3">מתקנים</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {parkEquipment.map((eq) => {
                          // Resolve the brand the park advertises for
                          // this equipment id so we can preview its
                          // image/icon directly on the card and pass
                          // the brand name through to the drawer.
                          const parkRef = park.gymEquipment?.find(
                            (g) => g.equipmentId === eq.id,
                          );
                          // Resolution: per-equipment override → park-level primaryBrand → ''
                          const brandName = parkRef?.brandName || park.primaryBrand || '';
                          const brandImage = brandName
                            ? eq.brands?.find((b) => b.brandName === brandName)?.imageUrl
                            : eq.brands?.[0]?.imageUrl;
                          // hasVideo reflects the drawer's fallback: if any brand of this
                          // equipment has a video, the drawer will surface it (QW1 fallback).
                          const hasVideo = !!eq.brands?.some((b) => !!b.videoUrl);

                          return (
                            <button
                              key={eq.id}
                              type="button"
                              onClick={() =>
                                setSelectedEquipment({
                                  id: eq.id,
                                  brand: brandName || null,
                                })
                              }
                              className="group flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-800/90 shadow-sm active:scale-[0.98] transition-transform text-start w-full"
                              style={{ border: '0.5px solid #E0E9FF' }}
                              aria-label={`${eq.name}${brandName ? ` (${brandName})` : ''}`}
                            >
                              {/* Media thumbnail — prefers the brand's
                                  product photo, falls back to the
                                  equipment SVG icon, then to a generic
                                  Dumbbell glyph as a last resort. */}
                              <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                                {brandImage ? (
                                  <img
                                    src={bunnyImg(brandImage, 200)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                    onError={(e) => {
                                      const img = e.currentTarget as HTMLImageElement;
                                      img.style.display = 'none';
                                      img.parentElement?.querySelector('[data-fallback]')?.classList.remove('hidden');
                                    }}
                                  />
                                ) : null}
                                <div
                                  data-fallback
                                  className={brandImage ? 'hidden' : ''}
                                >
                                  {eq.iconKey ? (
                                    <img
                                      src={`/assets/icons/equipment/${eq.iconKey}.svg`}
                                      alt=""
                                      className="w-8 h-8 object-contain"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : (
                                    <Dumbbell size={22} className="text-cyan-500" />
                                  )}
                                </div>
                              </div>

                              {/* Text + chevron column */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight line-clamp-2">
                                  {eq.name}
                                </p>
                                {brandName && (
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {brandName}
                                  </p>
                                )}
                                {hasVideo && (
                                  <span className="inline-block mt-1 text-[9px] font-bold text-cyan-600">
                                    סרטון זמין
                                  </span>
                                )}
                              </div>
                              {/* In RTL the visual "forward" arrow points
                                  left — `ChevronLeft` is the correct
                                  glyph here, matching the back-button
                                  convention used elsewhere in the sheet. */}
                              <ChevronLeft
                                size={16}
                                className="flex-shrink-0 text-gray-400 group-hover:text-cyan-500 transition-colors"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* ── (6) PHOTOS — actual photo gallery (park images
                      + review snapshots). Stays at the bottom. */}
                  {photoGallery.length > 1 && (
                    <section className="mb-6">
                      <h3 className="text-[16px] font-bold mb-3">תמונות</h3>
                      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-hide">
                        {photoGallery.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setExpandedPhoto(url)}
                            className="flex-shrink-0 w-[140px] h-[100px] rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800 active:scale-95 transition-transform"
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Rate this place */}
                  <section className="mb-6">
                    <button
                      onClick={() => setRatingOpen(!ratingOpen)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-600 text-sm font-bold active:scale-[0.98] transition-transform"
                    >
                      <Star size={16} />
                      דרג את המקום
                    </button>
                    {ratingOpen && (
                      <div className="mt-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                        {ratingDone ? (
                          <div className="flex items-center justify-center gap-2 py-2">
                            <span className="text-emerald-500 text-sm font-bold">תודה! +{XP_REWARDS.review} XP</span>
                          </div>
                        ) : (
                          <>
                            <StarRatingWidget value={userRating} onChange={setUserRating} size={28} />
                            {userRating > 0 && (
                              <div className="mt-3 flex gap-2 items-end">
                                <input
                                  type="text"
                                  value={ratingComment}
                                  onChange={e => setRatingComment(e.target.value)}
                                  placeholder="תגובה (לא חובה)..."
                                  className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 outline-none"
                                />
                                <button
                                  onClick={handleRatingSubmit}
                                  disabled={submittingRating}
                                  className="px-5 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
                                >
                                  {submittingRating ? <Loader2 size={16} className="animate-spin" /> : 'שלח'}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Reviews list */}
                  {reviews.filter(r => r.rating).length > 0 && (
                    <section className="mb-4">
                      <h3 className="text-[16px] font-bold mb-3">ביקורות</h3>
                      <div className="space-y-3">
                        {reviews.filter(r => r.rating).slice(0, 6).map(review => (
                          <div key={review.id} className="bg-gray-50 dark:bg-slate-800/40 rounded-xl p-3.5" style={{ border: '0.5px solid #E0E9FF' }}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                                  <span className="text-[10px] text-white font-black">{review.userId?.charAt(0)?.toUpperCase() ?? '?'}</span>
                                </div>
                                <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">{review.userId?.slice(0, 8)}...</span>
                              </div>
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map(s => (
                                  <Star key={s} size={12} className={s <= (review.rating ?? 0) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-600'} fill={s <= (review.rating ?? 0) ? '#FBBF24' : 'none'} />
                                ))}
                              </div>
                            </div>
                            {review.comment && <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed pr-9">{review.comment}</p>}
                            <p className="text-[10px] text-gray-400 mt-1 pr-9">{formatDate(review.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>

              {/* Fixed bottom action bar */}
              <div
                className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-800/50 px-4 pt-3"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
              >
                <div className="flex items-center gap-2" dir="rtl">
                  {/* Start Workout — primary CTA */}
                  <button
                    onClick={() => { onClose(); onStartWorkout?.(); }}
                    className="flex-1 text-white font-extrabold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-[15px]"
                    style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 44 }}
                  >
                    <Play size={18} fill="currentColor" />
                    <span>התחל אימון</span>
                  </button>

                  {/* Suggest Edit */}
                  <button
                    onClick={() => setSuggestEditOpen(true)}
                    className="flex-shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm active:scale-90 transition-transform"
                    style={{ border: '0.5px solid #E0E9FF' }}
                    title="עדכן פרטים"
                  >
                    <Pencil size={18} className="text-cyan-500" />
                  </button>

                  {/* Navigate */}
                  <button
                    onClick={handleNavigate}
                    className="flex-shrink-0 w-[44px] h-[44px] rounded-full flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm active:scale-90 transition-transform"
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

      {/* Suggest Edit sheet */}
      {suggestEditOpen && park && (
        <SuggestEditSheet
          isOpen={suggestEditOpen}
          onClose={() => setSuggestEditOpen(false)}
          park={park as any}
        />
      )}

      {/* Photo lightbox */}
      <AnimatePresence>
        {expandedPhoto && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm"
              onClick={() => setExpandedPhoto(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-4 z-[121] flex items-center justify-center"
              onClick={() => setExpandedPhoto(null)}
            >
              <img src={expandedPhoto} alt="" className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" />
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

      {/* Equipment-detail drawer — opens above the park sheet
          (z-[200]) when the user taps an equipment card in the
          "מתקנים" section. Stays mounted with `isOpen` driven by
          local state so the slide-out animation can play on close. */}
      <EquipmentDetailDrawer
        isOpen={!!selectedEquipment}
        onClose={() => setSelectedEquipment(null)}
        equipmentId={selectedEquipment?.id ?? null}
        brandName={selectedEquipment?.brand ?? null}
        pinnedToPark
      />
    </>
  );
}
