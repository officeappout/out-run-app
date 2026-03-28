'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  MapPin,
  Users,
  CalendarCheck,
  ShieldCheck,
  Dumbbell,
  Target,
  Loader2,
  DollarSign,
  ExternalLink,
  Navigation,
  Flag,
} from 'lucide-react';
import type { CommunityEvent, CommunityGroup, EventRegistration } from '@/types/community.types';
import { useUserStore } from '@/features/user';
import AttendeesPreview from './AttendeesPreview';
import NavigationSheet from './NavigationSheet';
import ReportContentSheet from './ReportContentSheet';

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; gradient: string }> = {
  race:             { label: 'מרוץ',         icon: '🏃', gradient: 'from-orange-500 to-red-500' },
  fitness_day:      { label: 'יום כושר',     icon: '💪', gradient: 'from-cyan-500 to-blue-600' },
  workshop:         { label: 'סדנה',         icon: '🎓', gradient: 'from-violet-500 to-purple-600' },
  community_meetup: { label: 'מפגש קהילתי', icon: '🤝', gradient: 'from-emerald-500 to-teal-600' },
  other:            { label: 'אחר',          icon: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

function formatEventDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface SessionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  event: CommunityEvent | null;
  parentGroup?: CommunityGroup | null;
  registrations?: EventRegistration[];
  onJoin?: (eventId: string) => void;
  isJoined?: boolean;
  joining?: boolean;
}

export default function SessionDrawer({
  isOpen,
  onClose,
  event,
  parentGroup,
  registrations,
  onJoin,
  isJoined,
  joining,
}: SessionDrawerProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const userId = useUserStore((s) => s.profile?.id ?? '');

  useEffect(() => {
    if (!isOpen || userCoords) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, [isOpen, userCoords]);

  const handleLocationClick = useCallback(
    (lat: number, lng: number) => {
      if (!userCoords) { setNavOpen(true); return; }
      const km = haversineKm(userCoords.lat, userCoords.lng, lat, lng);
      if (km <= 2) {
        onClose();
        window.location.href = `/map?lat=${lat}&lng=${lng}`;
      } else {
        setNavOpen(true);
      }
    },
    [userCoords, onClose],
  );

  if (!event) return null;

  const catConfig = CATEGORY_CONFIG[event.category] ?? CATEGORY_CONFIG.other;
  const displayCount = event.currentRegistrations;

  const effectiveDescription = event.description || parentGroup?.description || '';
  const effectiveMuscles = event.targetMuscles?.length ? event.targetMuscles : parentGroup?.targetMuscles;
  const effectiveEquipment = event.equipment?.length ? event.equipment : parentGroup?.equipment;
  const effectivePrice = event.price ?? parentGroup?.price;
  const effectiveMaxParticipants = event.maxParticipants ?? parentGroup?.maxParticipants;
  const effectiveImages = event.images?.length ? event.images : parentGroup?.images;
  const coverImage = effectiveImages?.[0];

  const groupLoc = parentGroup?.meetingLocation;
  const eventHasCoords =
    event.location?.location &&
    (event.location.location.lat !== 0 || event.location.location.lng !== 0);
  const groupHasCoords =
    groupLoc?.location && (groupLoc.location.lat !== 0 || groupLoc.location.lng !== 0);

  const effectiveAddress = event.location?.address || groupLoc?.address || '';
  const effectiveCoords = eventHasCoords
    ? event.location.location
    : groupHasCoords
      ? groupLoc!.location!
      : null;

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  const staticMapUrl =
    mapboxToken && effectiveCoords
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+F97316(${effectiveCoords.lng},${effectiveCoords.lat})/${effectiveCoords.lng},${effectiveCoords.lat},14,0/600x240@2x?access_token=${mapboxToken}&language=he`
      : null;

  const hasTargetMuscles = effectiveMuscles && effectiveMuscles.length > 0;
  const hasEquipment = effectiveEquipment && effectiveEquipment.length > 0;
  const hasPrice = effectivePrice != null && effectivePrice > 0;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/40"
              style={{ backdropFilter: 'blur(4px)' }}
              onClick={onClose}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
              className="fixed bottom-0 left-0 right-0 z-[81] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col"
              style={{ height: '85vh' }}
            >
              {/* ── Hero image ───────────────────────────────────── */}
              <div className="relative flex-shrink-0 h-56 rounded-t-3xl overflow-hidden">
                {coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverImage} alt={event.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${catConfig.gradient} flex items-center justify-center`}>
                    <span className="text-7xl drop-shadow-md select-none">{catConfig.icon}</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-900 via-black/10 to-transparent" />

                {/* Drag handle */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/60 rounded-full" />

                {/* Close */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center"
                >
                  <X size={16} className="text-white" />
                </button>

                {/* Category badge */}
                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-full" dir="rtl">
                  <span>{catConfig.icon}</span>
                  <span>{catConfig.label}</span>
                </div>

                {/* Official badge */}
                {event.isOfficial && (
                  <div className="absolute top-4 left-4 flex items-center gap-1 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm">
                    <ShieldCheck className="w-3 h-3" />
                    <span>רשמי</span>
                  </div>
                )}
              </div>

              {/* ── Scrollable content ─────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 space-y-5" dir="rtl">
                {/* Title */}
                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                  {event.name}
                </h2>

                {/* Date & Time */}
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <Clock className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                  <span className="font-semibold">
                    {formatEventDate(event.date)} · {event.startTime}
                    {event.endTime ? ` – ${event.endTime}` : ''}
                  </span>
                </div>

                {/* Special Notice */}
                {event.specialNotice && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <span className="text-lg mt-0.5">⚠️</span>
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
                      {event.specialNotice}
                    </p>
                  </div>
                )}

                {/* Location — smart nav */}
                {effectiveCoords ? (
                  <button
                    type="button"
                    onClick={() => handleLocationClick(effectiveCoords!.lat, effectiveCoords!.lng)}
                    className="group relative w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 active:scale-[0.98] transition-transform"
                  >
                    {staticMapUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={staticMapUrl} alt={effectiveAddress || 'מפה'} className="w-full h-[120px] object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-[120px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                        <MapPin className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between" dir="rtl">
                      <span className="text-xs font-bold text-white truncate max-w-[75%]">
                        {effectiveAddress || `${effectiveCoords.lat.toFixed(4)}, ${effectiveCoords.lng.toFixed(4)}`}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
                        <Navigation className="w-3.5 h-3.5 text-gray-800" />
                      </div>
                    </div>
                  </button>
                ) : effectiveAddress ? (
                  <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{effectiveAddress}</span>
                  </div>
                ) : null}

                {/* Description */}
                {effectiveDescription && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {effectiveDescription}
                  </p>
                )}

                {/* Target Muscles */}
                {hasTargetMuscles && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-cyan-500" />
                      קבוצות שרירים
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {effectiveMuscles!.map((m) => (
                        <span key={m} className="px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 text-[11px] font-bold">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Equipment */}
                {hasEquipment && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                      ציוד נדרש
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {effectiveEquipment!.map((item) => (
                        <span key={item} className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price */}
                {hasPrice && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-gray-700 dark:text-gray-300">₪{effectivePrice}</span>
                  </div>
                )}

                {/* Capacity */}
                {effectiveMaxParticipants && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span className="font-bold text-gray-700 dark:text-gray-300">
                      {displayCount} / {effectiveMaxParticipants} משתתפים
                    </span>
                    {displayCount >= effectiveMaxParticipants && (
                      <span className="text-[10px] font-black text-red-500 px-2 py-0.5 rounded-full bg-red-50">
                        מלא
                      </span>
                    )}
                  </div>
                )}

                {/* Attendees */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <AttendeesPreview attendees={registrations ?? []} total={displayCount} />
                  <span className="text-xs text-gray-500">
                    {displayCount} {displayCount === 1 ? 'משתתף' : 'משתתפים'}
                  </span>
                </div>

                {/* External Link */}
                {event.externalLink && (
                  <a
                    href={event.externalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.97] bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25"
                  >
                    <ExternalLink className="w-4 h-4" />
                    להרשמה ופרטים נוספים
                  </a>
                )}

                {/* Join Button */}
                {onJoin && (
                  <button
                    disabled={isJoined || joining}
                    onClick={() => !isJoined && !joining && onJoin(event.id)}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.97] ${
                      isJoined
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 ring-1 ring-emerald-200'
                        : event.isOfficial
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25'
                          : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg'
                    }`}
                  >
                    {joining ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isJoined ? (
                      <>
                        <CalendarCheck className="w-4 h-4" />
                        רשום/ה לאירוע
                      </>
                    ) : (
                      <>
                        <Users className="w-4 h-4" />
                        הרשמה לאירוע
                      </>
                    )}
                  </button>
                )}

                {/* Report link */}
                <button
                  onClick={() => setReportOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-500 transition-colors"
                >
                  <Flag className="w-3 h-3" />
                  דיווח על תוכן לא ראוי
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Navigation selector */}
      {effectiveCoords && (
        <NavigationSheet
          isOpen={navOpen}
          onClose={() => setNavOpen(false)}
          lat={effectiveCoords.lat}
          lng={effectiveCoords.lng}
          label={effectiveAddress}
        />
      )}

      {/* Report content sheet */}
      <ReportContentSheet
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetId={event.id}
        targetType="event"
        targetName={event.name}
        reporterId={userId}
      />
    </>
  );
}
