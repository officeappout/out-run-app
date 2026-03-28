'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  MapPin,
  Users,
  UserPlus,
  Loader2,
  MessageCircle,
  Dumbbell,
  Target,
  DollarSign,
  Navigation,
  Flag,
  LogOut,
  ChevronDown,
  Calendar,
  Share2,
  Pencil,
  Crown,
} from 'lucide-react';
import type { CommunityGroup, EventRegistration, SessionAttendance, GroupMember } from '@/types/community.types';
import { useUserStore } from '@/features/user';
import AttendeesPreview from './AttendeesPreview';
import NavigationSheet from './NavigationSheet';
import ReportContentSheet from './ReportContentSheet';
import {
  bookSession,
  cancelBooking,
  leaveWaitlist,
  getSessionAttendance,
  computeNextSession as computeNextSessionBooking,
} from '@/features/arena/services/booking.service';
import { getGroupMembers, leaveGroup } from '@/features/arena/services/group.service';

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; gradient: string }> = {
  walking:      { label: 'הליכה',      icon: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:      { label: 'ריצה',       icon: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:         { label: 'יוגה',       icon: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics: { label: 'קליסתניקס', icon: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:      { label: 'רכיבה',      icon: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:        { label: 'אחר',        icon: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function formatSessionDate(dateISO: string, time: string): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const d = new Date(dateISO + 'T00:00:00');

  if (d.toDateString() === today.toDateString()) return `היום ב-${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `מחר ב-${time}`;

  const dayName = d.toLocaleDateString('he-IL', { weekday: 'long' });
  return `יום ${dayName} ב-${time}`;
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

interface GroupDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  group: CommunityGroup | null;
  members?: EventRegistration[];
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  isJoined?: boolean;
  joining?: boolean;
  socialUnlocked?: boolean;
  onOpenChat?: () => void;
  /** Called with groupId when creator taps 'ערוך קהילה'. Only shown to the creator. */
  onEdit?: (groupId: string) => void;
}

export default function GroupDetailsDrawer({
  isOpen,
  onClose,
  group,
  members,
  onJoin,
  onLeave,
  isJoined,
  joining,
  socialUnlocked = true,
  onOpenChat,
  onEdit,
}: GroupDetailsDrawerProps) {
  // ── ALL hooks MUST be at the top, before any conditional return ──
  const [navOpen, setNavOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const userName = profile?.core?.name || 'משתמש';
  const userPhoto = profile?.core?.photoURL ?? null;

  const [bookingLoading, setBookingLoading] = useState(false);
  const [attendance, setAttendance] = useState<SessionAttendance | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [isWaitlisted, setIsWaitlisted] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // ── Member list + moderation ───────────────────────────────────────────────
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  // Grab user location once when drawer opens
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

  // Pre-compute slot data (safe even when group is null)
  const allSlots = group?.scheduleSlots?.length
    ? group.scheduleSlots
    : group?.schedule
      ? [group.schedule]
      : [];
  const nextSessionData = computeNextSessionBooking(allSlots);
  const nextSlot = nextSessionData?.slot ?? null;

  // Load attendance for next session
  const groupId = group?.id ?? '';
  const nsd = nextSessionData?.date ?? '';
  const nst = nextSessionData?.time ?? '';

  useEffect(() => {
    if (!isOpen || !groupId || !nsd || !nst) {
      setAttendance(null);
      setIsBooked(false);
      setIsWaitlisted(false);
      return;
    }
    let cancelled = false;
    getSessionAttendance(groupId, nsd, nst).then((data) => {
      if (cancelled) return;
      setAttendance(data);
      setIsBooked(data?.attendees?.includes(userId) ?? false);
      setIsWaitlisted(data?.waitlist?.includes(userId) ?? false);
    });
    return () => { cancelled = true; };
  }, [isOpen, groupId, nsd, nst, userId]);

  const handleBookSession = useCallback(async () => {
    if (!userId || !groupId || !nsd || !nst || bookingLoading) return;
    setBookingLoading(true);
    try {
      if (isBooked) {
        await cancelBooking(groupId, nsd, nst, userId);
        setIsBooked(false);
        setAttendance((prev) =>
          prev ? { ...prev, currentCount: Math.max(0, prev.currentCount - 1), attendees: prev.attendees.filter((a) => a !== userId) } : null,
        );
      } else if (isWaitlisted) {
        await leaveWaitlist(groupId, nsd, nst, userId);
        setIsWaitlisted(false);
        setAttendance((prev) =>
          prev ? { ...prev, waitlist: (prev.waitlist ?? []).filter((w) => w !== userId) } : null,
        );
      } else {
        const result = await bookSession(
          groupId, nsd, nst,
          userId, userName, userPhoto,
          nextSlot?.maxParticipants,
        );
        if (result.success) {
          if (result.waitlisted) {
            setIsWaitlisted(true);
            setAttendance((prev) =>
              prev
                ? { ...prev, waitlist: [...(prev.waitlist ?? []), userId] }
                : { groupId, date: nsd, time: nst, attendees: [], currentCount: 0, waitlist: [userId] },
            );
          } else {
            setIsBooked(true);
            setAttendance((prev) =>
              prev
                ? { ...prev, currentCount: prev.currentCount + 1, attendees: [...prev.attendees, userId] }
                : { groupId, date: nsd, time: nst, attendees: [userId], currentCount: 1 },
            );
          }
        }
      }
    } catch (err) {
      console.error('[GroupDetailsDrawer] booking failed:', err);
    } finally {
      setBookingLoading(false);
    }
  }, [userId, userName, userPhoto, groupId, nsd, nst, bookingLoading, isBooked, isWaitlisted, nextSlot]);

  // ── Fetch member list when drawer opens ───────────────────────────────────
  useEffect(() => {
    if (!isOpen || !groupId) { setGroupMembers([]); return; }
    let cancelled = false;
    setMembersLoading(true);
    getGroupMembers(groupId).then((members) => {
      if (!cancelled) setGroupMembers(members);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setMembersLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen, groupId]);

  // ── Early return AFTER all hooks ──────────────────────────────
  if (!group) return null;

  const isCreator = userId === group.createdBy;

  const catConfig = CATEGORY_CONFIG[group.category] ?? CATEGORY_CONFIG.other;
  const effectiveImages = (nextSlot?.images?.length ? nextSlot.images : group.images) ?? [];
  const coverImage = effectiveImages[0] ?? null;
  const effectiveTags = (nextSlot?.tags?.length ? nextSlot.tags : []) as string[];

  // Per-slot location override → group fallback
  const slotLoc = nextSlot?.location;
  const hasSlotCoords = slotLoc && slotLoc.lat != null && slotLoc.lng != null && (slotLoc.lat !== 0 || slotLoc.lng !== 0);
  const hasGroupCoords =
    group.meetingLocation?.location &&
    (group.meetingLocation.location.lat !== 0 || group.meetingLocation.location.lng !== 0);
  const hasCoords = hasSlotCoords || hasGroupCoords;

  const destLat = hasSlotCoords ? slotLoc!.lat! : (group.meetingLocation?.location?.lat ?? 0);
  const destLng = hasSlotCoords ? slotLoc!.lng! : (group.meetingLocation?.location?.lng ?? 0);
  const destAddress = hasSlotCoords && slotLoc?.address
    ? slotLoc.address
    : group.meetingLocation?.address;

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  const staticMapUrl = mapboxToken && hasCoords
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+F97316(${destLng},${destLat})/${destLng},${destLat},14,0/600x240@2x?access_token=${mapboxToken}&language=he`
    : null;

  // Slot-level overrides → group-level defaults
  const effectiveMuscles = (nextSlot?.targetMuscles?.length ? nextSlot.targetMuscles : group.targetMuscles) ?? [];
  const effectiveEquipment = (nextSlot?.requiredEquipment?.length ? nextSlot.requiredEquipment : group.equipment) ?? [];
  const effectivePrice = nextSlot?.price != null ? nextSlot.price : group.price;
  const hasMuscles = effectiveMuscles.length > 0;
  const hasEquipment = effectiveEquipment.length > 0;
  const hasPrice = effectivePrice != null && effectivePrice > 0;

  const spotsLeft = nextSlot?.maxParticipants
    ? Math.max(0, nextSlot.maxParticipants - (attendance?.currentCount ?? 0))
    : null;
  const isFull = spotsLeft === 0;

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
              {/* ── Hero image — full-bleed top section ──────────── */}
              <div className="relative flex-shrink-0 h-56 rounded-t-3xl overflow-hidden">
                {coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverImage} alt={group.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${catConfig.gradient} flex items-center justify-center`}>
                    <span className="text-7xl drop-shadow-md select-none">{catConfig.icon}</span>
                  </div>
                )}

                {/* Gradient: image fades into content below */}
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-900 via-black/10 to-transparent" />

                {/* Drag handle — overlaid on image */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/60 rounded-full" />

                {/* Close button — overlaid top-right */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center"
                >
                  <X size={16} className="text-white" />
                </button>

                {/* Category badge — overlaid bottom-left */}
                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-full" dir="rtl">
                  <span>{catConfig.icon}</span>
                  <span>{catConfig.label}</span>
                </div>
              </div>

              {/* ── Scrollable content ─────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 space-y-5" dir="rtl">
                {/* Title */}
                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                  {group.name}
                </h2>

                {/* Tags — immediately under title so users see session type first */}
                {effectiveTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 -mt-2">
                    {effectiveTags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-[11px] font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* ── Next Session Banner (cyan) with spots integrated ── */}
                {nextSessionData && (
                  <div className="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 rounded-2xl p-4 border border-cyan-100 dark:border-cyan-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest">המפגש הבא</p>
                        <p className="text-sm font-black text-gray-900 dark:text-white leading-snug">
                          {nextSlot?.label || catConfig.label} · {formatSessionDate(nextSessionData.date, nextSessionData.time)}
                          {spotsLeft != null && (
                            <span className={`mr-1.5 text-[11px] font-black ${isFull ? 'text-red-500' : 'text-cyan-600'}`}>
                              {isFull ? ' · המפגש מלא' : ` · ${spotsLeft} מקומות נותרו`}
                            </span>
                          )}
                        </p>
                      </div>
                      {effectivePrice != null && effectivePrice > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-black flex-shrink-0">
                          ₪{effectivePrice}
                        </span>
                      )}
                    </div>

                    {/* Per-slot equipment chips */}
                    {effectiveEquipment.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {effectiveEquipment.map((eq) => (
                          <span key={eq} className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                            {eq}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Booked avatars */}
                    {attendance && attendance.currentCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-2 rtl:space-x-reverse">
                          {Object.entries(attendance.attendeeProfiles ?? {}).slice(0, 5).map(([uid, p]) => (
                            p.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={uid} src={p.photoURL} alt={p.name} className="w-6 h-6 rounded-full border-2 border-white object-cover" />
                            ) : (
                              <div key={uid} className="w-6 h-6 rounded-full border-2 border-white bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                                <span className="text-[8px] text-white font-black">{p.name?.charAt(0)}</span>
                              </div>
                            )
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-500 font-bold">
                          {attendance.currentCount} {attendance.currentCount === 1 ? 'נרשם/ה' : 'נרשמו'}
                        </span>
                      </div>
                    )}

                    {/* Waitlist counter */}
                    {(attendance?.waitlist?.length ?? 0) > 0 && (
                      <p className="text-[10px] text-amber-600 font-bold">
                        {attendance!.waitlist!.length} ברשימת המתנה
                      </p>
                    )}

                    {/* Book / Waitlist / Cancel button (only if joined) */}
                    {isJoined && (
                      <button
                        disabled={bookingLoading}
                        onClick={handleBookSession}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all active:scale-[0.97] ${
                          isBooked
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                            : isWaitlisted
                              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                              : isFull
                                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                                : 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
                        }`}
                      >
                        {bookingLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isBooked ? (
                          <>✓ רשום/ה (בטל?)</>
                        ) : isWaitlisted ? (
                          <>⏳ ברשימת המתנה (בטל?)</>
                        ) : isFull ? (
                          <>הצטרף לרשימת המתנה</>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            הירשם למפגש
                          </>
                        )}
                      </button>
                    )}

                    {/* "See full schedule" toggle */}
                    {allSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setScheduleOpen(!scheduleOpen)}
                        className="flex items-center gap-1 text-[11px] text-cyan-600 font-bold hover:text-cyan-700 transition-colors mx-auto"
                      >
                        <Calendar className="w-3 h-3" />
                        <span>{scheduleOpen ? 'הסתר מערכת שעות' : 'לכל מערכת השעות'}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                )}

                {/* ── Expandable Full Schedule ────────────────────── */}
                {scheduleOpen && allSlots.length > 1 && (
                  <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-700/40 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        מערכת שעות מלאה
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
                      {allSlots.map((slot, i) => {
                        const isNext = nextSlot === slot;
                        const slotAddr = slot.location?.address || destAddress;
                        const slotPrice = slot.price != null ? slot.price : group.price;
                        const slotEquip = slot.requiredEquipment?.length ? slot.requiredEquipment : group.equipment;
                        return (
                          <div key={i} className={`px-4 py-2.5 flex items-center gap-3 ${isNext ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                יום {DAY_LABELS[slot.dayOfWeek]} ב-{slot.time}
                                {slot.label && <span className="text-gray-400 font-medium"> — {slot.label}</span>}
                              </p>
                              {slotAddr && (
                                <p className="text-[10px] text-gray-400 truncate mt-0.5">📍 {slotAddr}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {isNext && (
                                <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-white text-[8px] font-black">הבא</span>
                              )}
                              {slotPrice != null && slotPrice > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">₪{slotPrice}</span>
                              )}
                              {slotEquip && slotEquip.length > 0 && (
                                <Dumbbell className="w-3 h-3 text-emerald-500" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Description — fully visible, no clamp */}
                {group.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {group.description}
                  </p>
                )}

                {/* ── Member List ──────────────────────────────────── */}
                {(isJoined || isCreator) && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-2.5">
                      <Users className="w-3.5 h-3.5" />
                      חברי הקהילה
                      {!membersLoading && groupMembers.length > 0 && (
                        <span className="text-gray-400 normal-case tracking-normal font-semibold">({groupMembers.length})</span>
                      )}
                    </h4>
                    {membersLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {groupMembers.map((member) => {
                          const initials = member.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
                          const isGroupCreator = member.uid === group.createdBy;
                          return (
                            <div
                              key={member.uid}
                              className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                                {initials.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                  {member.name}
                                </p>
                                {isGroupCreator && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                    <Crown className="w-2.5 h-2.5" />
                                    מנהל/ת
                                  </p>
                                )}
                              </div>
                              {isCreator && !isGroupCreator && (
                                <button
                                  onClick={() => setConfirmRemove(member)}
                                  className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 text-red-400 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex-shrink-0"
                                  title={`הסר את ${member.name}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Location — clean map card with address + navigate */}
                {hasCoords ? (
                  <button
                    type="button"
                    onClick={() => handleLocationClick(destLat, destLng)}
                    className="group relative w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 active:scale-[0.98] transition-transform"
                  >
                    {staticMapUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={staticMapUrl} alt={destAddress || 'מפה'} className="w-full h-[120px] object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-[120px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                        <MapPin className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between" dir="rtl">
                      <span className="text-xs font-bold text-white truncate max-w-[70%]">
                        {destAddress || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
                        <Navigation className="w-3.5 h-3.5 text-gray-800" />
                      </div>
                    </div>
                  </button>
                ) : destAddress ? (
                  <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{destAddress}</span>
                  </div>
                ) : null}

                {/* Target Muscles (slot override → group default) */}
                {hasMuscles && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-cyan-500" />
                      קבוצות שרירים
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {effectiveMuscles.map((m) => (
                        <span key={m} className="px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 text-[11px] font-bold">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Equipment (slot override → group default) */}
                {hasEquipment && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                      <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                      ציוד נדרש
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {effectiveEquipment.map((item) => (
                        <span key={item} className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price (slot override → group default) */}
                {hasPrice && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-gray-700 dark:text-gray-300">₪{effectivePrice}</span>
                  </div>
                )}

                {/* Community Rules — dynamic from Firestore */}
                {group.rules ? (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 border border-amber-100 dark:border-amber-800/40">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5">כללי הקהילה</p>
                    <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed whitespace-pre-line">
                      {group.rules}
                    </p>
                  </div>
                ) : null}

                {/* Attendees */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                  <AttendeesPreview attendees={members ?? []} total={group.currentParticipants} />
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {group.currentParticipants} {group.currentParticipants === 1 ? 'חבר' : 'חברים'}
                  </span>
                </div>

                {/* ── Creator-only: Edit button ───────────────────── */}
                {onEdit && userId === group.createdBy && (
                  <button
                    onClick={() => { onEdit(group.id); onClose(); }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
                  >
                    <Pencil className="w-4 h-4" />
                    ערוך קהילה
                  </button>
                )}

                {/* ── Share button ────────────────────────────────── */}
                {group.inviteCode && (() => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://out-run-app.vercel.app';
                  const deepLink = `${origin}/join/${group.inviteCode}`;
                  const shareText = `היי, מצאתי קבוצת ${catConfig.label} מעולה: \'${group.name}\'! בואו להצטרף אלינו.`;
                  const handleShare = () => {
                    if (typeof navigator !== 'undefined' && navigator.share) {
                      navigator.share({ title: group.name, text: shareText, url: deepLink }).catch(() => {});
                    } else {
                      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${deepLink}`)}`, '_blank');
                    }
                  };
                  return (
                    <button
                      onClick={handleShare}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.97]"
                    >
                      <Share2 className="w-4 h-4" />
                      שתף קבוצה
                    </button>
                  );
                })()}

                {/* Chat button (post-join) */}
                {isJoined && (
                  <button
                    onClick={onOpenChat ?? onClose}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.97]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    כנס לצ&apos;אט הקהילה
                  </button>
                )}

                {/* Leave group (post-join) */}
                {isJoined && onLeave && !confirmLeave && (
                  <button
                    onClick={() => setConfirmLeave(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold text-red-400 hover:text-red-500 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    עזוב קבוצה
                  </button>
                )}

                {/* Leave confirmation */}
                {isJoined && confirmLeave && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-100 dark:border-red-800/40 space-y-3">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400 text-center">
                      בטוח/ה? המפגשים יוסרו מלוז האימונים ומהיומן
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={!!leavingId}
                        onClick={async () => {
                          if (!onLeave) return;
                          setLeavingId(group.id);
                          try {
                            await onLeave(group.id);
                            setConfirmLeave(false);
                            onClose();
                          } catch {
                            // handled upstream
                          } finally {
                            setLeavingId(null);
                          }
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {leavingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                        כן, עזוב
                      </button>
                      <button
                        onClick={() => setConfirmLeave(false)}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-bold transition-all active:scale-95"
                      >
                        ביטול
                      </button>
                    </div>
                  </div>
                )}

                {/* Join button (pre-join) */}
                {!isJoined && onJoin && (
                  <button
                    disabled={joining}
                    onClick={() => { if (!joining) onJoin(group.id); }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black transition-all active:scale-[0.97] bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg disabled:opacity-50"
                  >
                    {joining ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        הצטרף לקבוצה
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

      {/* ── Remove Member Confirmation Modal ────────────────────────────────── */}
      <AnimatePresence>
        {confirmRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-5"
            style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => !removingUid && setConfirmRemove(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-4"
              dir="rtl"
            >
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
                  <LogOut className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  הסרת חבר/ה
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  האם להסיר את <span className="font-bold text-gray-800 dark:text-gray-200">{confirmRemove.name}</span> מהקהילה?
                </p>
                <p className="text-xs text-gray-400">המשתמש יוסר מהקבוצה ומהצ׳אט</p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!!removingUid}
                  onClick={async () => {
                    if (!groupId || !confirmRemove) return;
                    setRemovingUid(confirmRemove.uid);
                    try {
                      await leaveGroup(groupId, confirmRemove.uid);
                      setGroupMembers((prev) => prev.filter((m) => m.uid !== confirmRemove.uid));
                      setConfirmRemove(null);
                    } catch (err) {
                      console.error('[GroupDetailsDrawer] remove member failed:', err);
                    } finally {
                      setRemovingUid(null);
                    }
                  }}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                >
                  {removingUid ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הסר'}
                </button>
                <button
                  disabled={!!removingUid}
                  onClick={() => setConfirmRemove(null)}
                  className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-bold active:scale-95 transition-all"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation selector sheet */}
      <NavigationSheet
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        lat={destLat}
        lng={destLng}
        label={destAddress}
      />

      {/* Report content sheet */}
      <ReportContentSheet
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetId={group.id}
        targetType="group"
        targetName={group.name}
        reporterId={userId}
      />
    </>
  );
}
