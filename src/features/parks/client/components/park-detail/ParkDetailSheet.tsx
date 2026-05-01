'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { X, Star, Play, Pencil, Navigation, MapPin, Flag, ChevronLeft, Loader2, Calendar, Users, UserPlus, RefreshCw, MessageCircle, Check } from 'lucide-react';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useUserStore } from '@/features/user';
import { getReviewsForPark } from '@/features/parks/core/services/contribution.service';
import type { Park } from '@/features/parks/core/types/park.types';
import type { UserContribution } from '@/types/contribution.types';
import FacilityCard, { FACILITY_TAGS } from './FacilityCard';
import SuggestEditSheet from '../contribution-wizard/SuggestEditSheet';
import StarRatingWidget from '../contribution-wizard/StarRatingWidget';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { XP_REWARDS } from '@/types/contribution.types';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { useParkEvents, matchesDayFilter, type DayFilter, type SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { useMyRegistrations } from '@/features/parks/core/hooks/useMyRegistrations';
import { joinEvent, materializeVirtualSession } from '@/features/admin/services/community.service';
import { createPlannedSession } from '@/features/admin/services/planned-sessions.service';
import { auth } from '@/lib/firebase';
import UserProfileSheet, { type ProfileUser } from '../UserProfileSheet';

const DAY_FILTER_LABELS: Record<DayFilter, string> = {
  today: 'היום',
  tomorrow: 'מחר',
  week: 'השבוע',
};

const DRAWER_HEIGHT = '92vh';
const CLOSE_THRESHOLD = 180;

const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'גינת כושר', court: 'מגרש ספורט', route: 'מסלול',
  zen_spot: 'פינת גוף-נפש', urban_spot: 'אורבן / אקסטרים', nature_community: 'טבע וקהילה',
};

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

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
  const rawOpacity = useTransform(y, [0, 300], [1, 0]);
  const opacity = useTransform(rawOpacity, (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  const [reviews, setReviews] = useState<UserContribution[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [suggestEditOpen, setSuggestEditOpen] = useState(false);

  // Inline rating
  const [ratingOpen, setRatingOpen] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  // Gallery expanded image
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<DayFilter>('week');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickedTime, setPickedTime] = useState('18:00');
  const [publishingSession, setPublishingSession] = useState(false);
  const [justPublished, setJustPublished] = useState<{ time: string; name: string; photoURL?: string } | null>(null);

  const handlePublishArrival = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !selectedPark) return;
    setPublishingSession(true);
    try {
      const today = new Date();
      const [h, m] = pickedTime.split(':').map(Number);
      today.setHours(h, m, 0, 0);
      if (today < new Date()) today.setDate(today.getDate() + 1);
      await createPlannedSession({
        userId: user.uid,
        displayName: user.displayName ?? 'משתמש',
        photoURL: user.photoURL,
        routeId: selectedPark.id,
        activityType: 'workout',
        level: 'beginner',
        startTime: today,
        privacyMode: 'squad',
        lat: selectedPark.location?.lat ?? null,
        lng: selectedPark.location?.lng ?? null,
      });
      setShowTimePicker(false);
      setJustPublished({ time: pickedTime, name: user.displayName ?? 'משתמש', photoURL: user.photoURL ?? undefined });
    } catch (err) {
      console.error('[ParkDetail] Failed to publish arrival:', err);
    } finally {
      setPublishingSession(false);
    }
  }, [pickedTime, selectedPark]);

  const park = selectedPark;

  const { events: parkEvents, loading: eventsLoading } = useParkEvents(
    isOpen ? park?.id : null,
  );

  const filteredParkEvents = useMemo(
    () => parkEvents.filter((ev) => matchesDayFilter(ev.nextStartTime, dayFilter)),
    [parkEvents, dayFilter],
  );

  const realEventIds = useMemo(
    () => parkEvents.filter((e) => !e.isRecurring).map((e) => e.eventId),
    [parkEvents],
  );
  const registeredEventIds = useMyRegistrations(realEventIds);

  useEffect(() => {
    if (isOpen && park?.id) {
      console.log('[ParkDetail] Park:', park.id, park.name, '| Events found:', parkEvents.length, parkEvents.map(e => e.eventLabel));
    }
  }, [isOpen, park?.id, park?.name, parkEvents]);

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
    if (park?.images?.length) urls.push(...park.images);
    else if (park?.image) urls.push(park.image);
    else if (park?.imageUrl) urls.push(park.imageUrl);
    reviews.filter(r => r.photoUrl).forEach(r => urls.push(r.photoUrl!));
    return urls.slice(0, 8);
  }, [park, reviews]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Track scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;
    const handler = () => setScrollY(el.scrollTop);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [isOpen]);

  const safe = (v: number, fb: number) => Number.isFinite(v) ? v : fb;
  const maxScroll = 200;
  const scrollProgress = safe(Math.min(safe(scrollY, 0) / maxScroll, 1), 0);
  const imageOpacity = safe(Math.max(1 - scrollProgress * 0.7, 0), 1);
  const imageScale = safe(Math.max(1 - scrollProgress * 0.2, 0.8), 1);
  const headerOpacity = safe(Math.min(scrollProgress * 2, 1), 0);
  const heroHeight = safe(Math.max(280 - safe(scrollY, 0) * 0.8, 60), 60);

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.y > CLOSE_THRESHOLD || info.velocity.y > 500) onClose();
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
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 40, stiffness: 260, mass: 0.8 }}
              style={{ y, opacity, height: DRAWER_HEIGHT, maxHeight: '92vh', willChange: 'transform' }}
              className="fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-slate-900 rounded-t-[32px] shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {/* Drag Handle */}
              <div className="absolute top-0 left-0 right-0 z-[60] flex justify-center pt-3 pb-1 pointer-events-none">
                <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>

              {/* Sticky Header — appears on scroll */}
              <div
                className={`absolute top-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-200 dark:border-slate-800 transition-opacity duration-300 ${
                  headerOpacity > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{ opacity: headerOpacity }}
              >
                <div className="flex items-center justify-between px-4 pt-10 pb-3">
                  <button onClick={onClose} className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                    <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                  <h1 className="text-lg font-black text-gray-900 dark:text-white flex-1 text-center px-4 truncate">
                    {park.name}
                  </h1>
                  <div className="w-10" />
                </div>
              </div>

              {/* Scrollable body */}
              <div ref={scrollRef} className="h-full overflow-y-auto pb-36">
                {/* Hero image — collapsing */}
                <div
                  className="relative w-full overflow-hidden"
                  style={{ height: `${heroHeight}px`, opacity: imageOpacity, transform: `scale(${imageScale})` }}
                >
                  {(park.image || park.imageUrl || park.images?.[0]) ? (
                    <img
                      src={park.images?.[0] || park.image || park.imageUrl || ''}
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

                  {/* Top controls — safe-area-aware padding so the X button
                      clears the iOS notch / Android status bar when the sheet
                      is fully expanded. */}
                  <div
                    className={`absolute top-0 left-0 right-0 px-4 pb-4 flex justify-between items-start z-10 transition-opacity duration-300 ${imageOpacity > 0.5 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
                  >
                    <button onClick={onClose} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform">
                      <X size={20} />
                    </button>
                  </div>

                  {/* Title + category badge */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                    {park.facilityType && (
                      <span className="inline-block mb-2 px-3 py-1 bg-cyan-500/90 backdrop-blur-sm text-white text-[10px] font-black rounded-full shadow-sm">
                        {FACILITY_LABELS[park.facilityType] || park.facilityType}
                      </span>
                    )}
                    <h1 className="text-[22px] font-black text-gray-900 dark:text-white leading-tight">
                      {park.name}
                    </h1>
                  </div>
                </div>

                {/* Content */}
                <div className="bg-white dark:bg-slate-900 -mt-10 relative z-10 px-5 pt-2 pb-8">
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

                  {/* Description */}
                  {park.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                      {park.description}
                    </p>
                  )}

                  {/* Facilities grid — Rectangle cards */}
                  <section className="mb-6">
                    <h3 className="text-[16px] font-bold mb-3">מתקנים ותכונות</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {FACILITY_TAGS.filter(tag => park.featureTags?.includes(tag.id)).map(tag => (
                        <FacilityCard key={tag.id} tag={tag} isActive variant="mobile" />
                      ))}
                      {(!park.featureTags || park.featureTags.length === 0) && (
                        <div className="col-span-2 text-center py-6 bg-gray-50 dark:bg-slate-800/30 rounded-xl">
                          <p className="text-sm text-gray-400">לא צוינו תכונות</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* ── Park Pulse: Compact Community Section ──────── */}
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

                    {eventsLoading ? (
                      <div className="space-y-1.5">
                        {[1, 2].map((i) => (
                          <div key={i} className="animate-pulse flex items-center gap-2 py-2 px-2.5 bg-emerald-50/60 rounded-lg">
                            <div className="w-6 h-6 bg-emerald-100 rounded-full" />
                            <div className="flex-1 h-3 bg-emerald-100 rounded w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : filteredParkEvents.length === 0 && !justPublished ? (
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
                          <div className="flex items-center gap-2 px-3 pb-3 pt-1 border-t border-emerald-100">
                            <Calendar size={14} className="text-emerald-500 flex-shrink-0" />
                            <input
                              type="time"
                              value={pickedTime}
                              onChange={(e) => setPickedTime(e.target.value)}
                              className="flex-1 bg-white border border-emerald-200 rounded-lg px-2 py-1.5 text-sm text-gray-800 font-bold text-center"
                              dir="ltr"
                            />
                            <button
                              onClick={handlePublishArrival}
                              disabled={publishingSession}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-[11px] font-bold transition-colors"
                            >
                              {publishingSession ? '...' : 'פרסם'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
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

                          return (
                            <div key={`park_${ev.eventId}_${idx}`} className="flex items-center gap-2 py-1.5 px-2.5 bg-emerald-50/70 rounded-lg hover:bg-emerald-50 transition-colors">
                              <span className="text-[11px] font-black text-emerald-700 min-w-[40px] text-center" dir="ltr">{timeLabel}</span>
                              <span className="flex-1 text-xs font-bold text-emerald-800 truncate">
                                {ev.isRecurring ? 'קבוצתי' : ev.eventLabel}
                              </span>
                              {ev.isRecurring && <RefreshCw size={10} className="text-emerald-400 flex-shrink-0" />}
                              <span className="text-[10px] text-emerald-600 font-bold flex-shrink-0">{count} <Users size={10} className="inline -mt-0.5" /></span>
                              <div className="flex -space-x-1 rtl:space-x-reverse flex-shrink-0">
                                {ev.avatars?.slice(0, 2).map((a, ai) => (
                                  <button key={`${ev.eventId}_av_${a.uid}_${ai}`} onClick={() => setProfileUser({ uid: a.uid, name: a.name, photoURL: a.photoURL })} className="w-5 h-5 rounded-full border border-white bg-emerald-100 flex items-center justify-center text-[7px] font-black text-emerald-700 overflow-hidden active:scale-90">
                                    {a.photoURL ? <img src={a.photoURL} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : a.name.charAt(0)}
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

                  {/* Photo gallery */}
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
    </>
  );
}
