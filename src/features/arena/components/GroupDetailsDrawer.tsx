'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from 'framer-motion';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import {
  X,
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
  Shield,
  Lock,
  Copy,
  Check,
  CalendarPlus,
  Settings,
  Trash2,
  ChevronLeft,
  Plus,
} from 'lucide-react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import CommunityAddressSearch from './CommunityAddressSearch';
import MiniLocationPicker from '@/features/admin/components/MiniLocationPicker';
import type { CommunityGroup, EventRegistration, SessionAttendance, GroupMember, ScheduleSlot, LiveSessionPhase } from '@/types/community.types';
import type { UpcomingSession } from '@/features/arena/hooks/useCommunitySessionBanner';
import CommunitySessionBanner from '@/features/arena/components/CommunitySessionBanner';
import { useGroupLiveSession } from '@/features/arena/hooks/useGroupLiveSession';
import { setMyAttendeeStatus } from '@/features/arena/services/session-phase.service';
import { useUserStore } from '@/features/user';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import NavigationSheet from './NavigationSheet';
import ReportContentSheet from './ReportContentSheet';
import {
  bookSession,
  cancelBooking,
  leaveWaitlist,
  getSessionAttendance,
  computeNextSession as computeNextSessionBooking,
} from '@/features/arena/services/booking.service';
import { getGroupMembers, joinGroup, leaveGroup, makeGroupAdmin, removeGroupAdmin, removeGroupMember, updateGroup } from '@/features/arena/services/group.service';
import AccessCodeGate from '@/components/ui/AccessCodeGate';
import { useToast } from '@/components/ui/Toast';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; gradient: string }> = {
  walking:      { label: 'הליכה',      icon: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:      { label: 'ריצה',       icon: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:         { label: 'יוגה',       icon: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics: { label: 'קליסתניקס', icon: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:      { label: 'רכיבה',      icon: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:        { label: 'אחר',        icon: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

/** px the sheet is offset at initial open to show ~85 vh (95 - 85 = 10 vh). */
const PEEK_Y_PX = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.10) : 80;
const CLOSE_THRESHOLD = 100;
const EXPAND_THRESHOLD = 50;

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

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Build a Google Calendar deep-link for a single session (1-hour default duration). */
function buildGCalLink(title: string, dateISO: string, time: string, location: string, description: string): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const [hour, min] = time.split(':').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dtStart = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(min)}00`;
  const endHour = (hour + 1) % 24;
  const dtEnd = `${year}${pad(month)}${pad(day)}T${pad(endHour)}${pad(min)}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${dtStart}/${dtEnd}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Compute all slot occurrences within the next 7 days (excluding passed times today). */
function computeWeekSessions(slots: ScheduleSlot[]): { date: string; time: string; slot: ScheduleSlot }[] {
  if (!slots?.length) return [];
  const now = new Date();
  const results: { date: string; time: string; slot: ScheduleSlot }[] = [];

  for (const slot of slots) {
    const [hour, minute] = slot.time.split(':').map(Number);
    for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + daysAhead);
      if (candidate.getDay() === slot.dayOfWeek) {
        candidate.setHours(hour, minute, 0, 0);
        if (candidate > now) {
          results.push({ date: toISODate(candidate), time: slot.time, slot });
        }
        break;
      }
    }
  }

  return results.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

/** Returns the next *future* date (YYYY-MM-DD) for a recurring weekly slot.
 *  If today is the correct weekday but the slot time has already passed, rolls to next week. */
function getNextSlotDate(dayOfWeek: number, time: string): string {
  const now = new Date();
  const [h, m] = time.split(':').map(Number);
  const slotToday = new Date(now);
  slotToday.setHours(h, m, 0, 0);

  let diff = (dayOfWeek - now.getDay() + 7) % 7;
  if (diff === 0 && slotToday.getTime() <= now.getTime()) diff = 7;

  const result = new Date(now);
  result.setDate(now.getDate() + diff);
  return toISODate(result);
}

interface SlotStatus {
  /** true only within the 80-min lobby window — the sole hard block on editing */
  locked: boolean;
  /** existing RSVP count for the next occurrence (informational, not a lock) */
  attendeeCount: number;
}

/** Returns lock status + RSVP count for the next occurrence of a slot.
 *  Lock = within 80-min lobby window only.
 *  Existing attendance docs outside that window are shown as a count but don't block editing. */
async function getSlotStatus(groupId: string, slot: ScheduleSlot): Promise<SlotStatus> {
  const nextDate    = getNextSlotDate(slot.dayOfWeek, slot.time);
  const nextMs      = new Date(`${nextDate}T${slot.time}:00`).getTime();
  const minutesUntil = (nextMs - Date.now()) / 60_000;
  const locked      = minutesUntil >= 0 && minutesUntil <= 80;

  const attId  = `${nextDate}_${slot.time.replace(':', '-')}`;
  const attRef = doc(db, `community_groups/${groupId}/attendance/${attId}`);
  try {
    const snap = await getDoc(attRef);
    const data = snap.exists() ? snap.data() : null;
    const attendeeCount = data
      ? (typeof data.currentCount === 'number' ? data.currentCount : (data.attendees?.length ?? 0))
      : 0;
    return { locked, attendeeCount };
  } catch {
    return { locked, attendeeCount: 0 };
  }
}

interface GroupDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  group: CommunityGroup | null;
  members?: EventRegistration[];
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void | Promise<void>;
  isJoined?: boolean;
  joining?: boolean;
  socialUnlocked?: boolean;
  onOpenChat?: () => void;
  /** Called with groupId when creator taps 'ערוך קהילה'. Only shown to the creator. */
  onEdit?: (groupId: string) => void;
  /** Live session from useCommunitySessionBanner — shows a phase banner at the top of the drawer */
  liveSession?: UpcomingSession;
  /** DEV only — fires when the dev phase override changes in the banner, so parent card badge updates too */
  onLivePhaseChange?: (groupId: string, phase: LiveSessionPhase | null) => void;
}

export default function GroupDetailsDrawer({
  isOpen,
  onClose,
  group,
  members: _members,
  onJoin,
  onLeave,
  isJoined,
  joining,
  socialUnlocked: _socialUnlocked = true,
  onOpenChat,
  onEdit,
  liveSession,
  onLivePhaseChange,
}: GroupDetailsDrawerProps) {
  // ── ALL hooks MUST be at the top, before any conditional return ──
  const [navOpen, setNavOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  // GPS comes from the shared store (driven by useGPS); no local watcher here.
  const userCoords = useGPSStore((s) => s.coords);
  const [codeUnlocked, setCodeUnlocked] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState(false);
  const [inviteCodeMode, setInviteCodeMode] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Sheet gesture state
  const y = useMotionValue(0);
  // Opacity fades only as the user drags past the resting (85vh) anchor.
  const opacity = useTransform(y, [PEEK_Y_PX, PEEK_Y_PX + 220], [1, 0]);
  const dragControls = useDragControls();
  const { scrollRef } = useSheetScrollChain({ isOpen, y, onClose, snapBackY: PEEK_Y_PX });
  const { showToast } = useToast();
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? '';
  const userName = profile?.core?.name || 'משתמש';
  const userPhoto = profile?.core?.photoURL ?? null;

  const [bookingLoading, setBookingLoading] = useState(false);
  const [attendance, setAttendance] = useState<SessionAttendance | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [isWaitlisted, setIsWaitlisted] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleMgrOpen, setScheduleMgrOpen] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [dropInLoading,  setDropInLoading]  = useState(false);
  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [joiningGroup,   setJoiningGroup]   = useState(false);

  // "מי מגיע" — who's coming tabs
  const [whoTab, setWhoTab] = useState<'next' | 'week'>('next');
  const [weekSessions, setWeekSessions] = useState<{ date: string; time: string; slot: ScheduleSlot; attendance: SessionAttendance | null }[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekLoaded, setWeekLoaded] = useState(false);

  // ── Member list + moderation ───────────────────────────────────────────────
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<GroupMember | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [activeActionUid, setActiveActionUid] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null); // uid with in-flight action

  // Premium UX: when the drawer opens without a fix, courtesy-prompt for GPS
  // so the user can see nearby sessions — but only if they haven't denied us.
  useEffect(() => {
    if (!isOpen) return;
    useGPSStore.getState().requestPermissionIfAllowed();
  }, [isOpen]);

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

  // Reset "מי מגיע" week state when the group changes
  useEffect(() => {
    setWhoTab('next');
    setWeekSessions([]);
    setWeekLoaded(false);
  }, [groupId]);

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
          nextSlot?.workoutGoal,
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

  const handleDropIn = async () => {
    if (!userId || !effectiveLiveSession || dropInLoading) return;
    setDropInLoading(true);
    try {
      await bookSession(
        group!.id, effectiveLiveSession.date, effectiveLiveSession.time,
        userId, userName, userPhoto,
        effectiveLiveSession.slot.maxParticipants,
        effectiveLiveSession.slot.workoutGoal,
      );
      await setMyAttendeeStatus(
        userId, group!.id,
        effectiveLiveSession.date, effectiveLiveSession.time,
        'here',
      );
      setShowJoinPrompt(true);
    } catch (err) {
      console.error('[GroupDetailsDrawer] handleDropIn:', err);
    } finally {
      setDropInLoading(false);
    }
  };

  const handleJoinFromPrompt = async () => {
    if (!userId || !group || joiningGroup) return;
    setJoiningGroup(true);
    try {
      await joinGroup(group.id, userId, userName);
      setShowJoinPrompt(false);
      onJoin?.(group.id);
    } catch (err) {
      console.error('[GroupDetailsDrawer] handleJoinFromPrompt:', err);
    } finally {
      setJoiningGroup(false);
    }
  };

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

  // ── Lazy-load week attendance when "השבוע" tab is selected ───────────────
  const loadWeekSessions = useCallback(async () => {
    if (!groupId || weekLoaded || weekLoading) return;
    const slots = group?.scheduleSlots?.length
      ? group.scheduleSlots
      : group?.schedule ? [group.schedule] : [];
    const sessions = computeWeekSessions(slots);
    setWeekLoading(true);
    try {
      const withAttendance = await Promise.all(
        sessions.map(async (s) => ({
          ...s,
          attendance: await getSessionAttendance(groupId, s.date, s.time).catch(() => null),
        })),
      );
      setWeekSessions(withAttendance);
    } finally {
      setWeekLoaded(true);
      setWeekLoading(false);
    }
  }, [groupId, group, weekLoaded, weekLoading]);

  // ── Moderation handlers — must be before early return (Rules of Hooks) ──────
  const handleToggleAdmin = useCallback(async (member: GroupMember) => {
    if (!groupId || actionPending) return;
    setActionPending(member.uid);
    try {
      if (member.role === 'member') {
        await makeGroupAdmin(groupId, member.uid);
        setGroupMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, role: 'admin' } : m));
      } else {
        await removeGroupAdmin(groupId, member.uid);
        setGroupMembers((prev) => prev.map((m) => m.uid === member.uid ? { ...m, role: 'member' } : m));
      }
      setActiveActionUid(null);
    } catch (err) {
      console.error('[GroupDetailsDrawer] toggle admin failed:', err);
    } finally {
      setActionPending(null);
    }
  }, [groupId, actionPending]);

  const handleRemoveMember = useCallback(async (member: GroupMember) => {
    if (!groupId || actionPending) return;
    setConfirmRemove(member);
    setActiveActionUid(null);
  }, [groupId, actionPending]);

  // ── Non-member live session — fires when drawer is open and no parent liveSession ──
  const fallbackLiveSession = useGroupLiveSession(group, isOpen && !liveSession);
  const effectiveLiveSession = liveSession ?? fallbackLiveSession;

  // ── Early return AFTER all hooks ──────────────────────────────
  if (!group) return null;

  const isCreator = userId === group.createdBy;
  const isCurrentUserAdmin = isCreator || groupMembers.some((m) => m.uid === userId && m.role === 'admin');

  const userAuthorityId = (profile as any)?.core?.authorityId ?? null;
  const canDropIn = (
    !group.isLocked &&
    group.isPublic !== false &&
    (!group.isCityOnly || userAuthorityId === group.authorityId)
  );

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

  // "הוסף ליומן" — Google Calendar deep-link for the next session
  const calendarUrl = nextSessionData
    ? buildGCalLink(
        group.name,
        nextSessionData.date,
        nextSessionData.time,
        destAddress ?? '',
        `קבוצת ${catConfig.label} — ${group.name}`,
      )
    : null;

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
              animate={{ y: PEEK_Y_PX }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 500 }}
              dragElastic={{ top: 0.08, bottom: 0 }}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                const offset = info.offset.y;
                const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;
                if (offset > CLOSE_THRESHOLD || info.velocity.y > 500) {
                  onClose();
                } else if (offset < -EXPAND_THRESHOLD) {
                  animate(y, 0, SPRING);
                } else {
                  animate(y, PEEK_Y_PX, SPRING);
                }
              }}
              className="fixed bottom-0 left-0 right-0 z-[81] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col"
              style={{ height: '95vh', y, opacity }}
            >
              {/* ── Hero image — drag target + bounding box ───────── */}
              <div
                className="relative flex-shrink-0 h-56 rounded-t-3xl overflow-hidden cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none' }}
              >
                {coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverImage} alt={group.name} className="w-full h-full object-cover" decoding="async" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${catConfig.gradient} flex items-center justify-center`}>
                    <span className="text-7xl drop-shadow-md select-none">{catConfig.icon}</span>
                  </div>
                )}

                {/* Gradient: image fades into content below */}
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-900 via-black/10 to-transparent" />

                {/* Drag handle — overlaid on image */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/60 rounded-full" />

                {/* Close button — ≥44px tap target */}
                <button
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="סגור מגירה"
                  className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center"
                >
                  <X size={18} className="text-white" />
                </button>

                {/* Category badge — overlaid bottom-right */}
                <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full" dir="rtl">
                  <span>{catConfig.icon}</span>
                  <span>{catConfig.label}</span>
                </div>
              </div>

              {/* ── Scrollable content ─────────────────────────── */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-8 space-y-5" dir="rtl">
                {/* Live session banner — shown when a session is approaching / in lobby / active.
                    Members always see the banner (private group members included).
                    Non-members see it only when canDropIn (public, unlocked, city-match). */}
                {effectiveLiveSession && (
                  effectiveLiveSession.phase === 'approaching' ||
                  effectiveLiveSession.phase === 'lobby' ||
                  effectiveLiveSession.phase === 'active'
                ) && (isJoined ? (
                  <CommunitySessionBanner
                    session={effectiveLiveSession}
                    onDismiss={onClose}
                    compact
                    isJoined
                    onDevPhaseChange={(phase) => onLivePhaseChange?.(effectiveLiveSession.groupId, phase)}
                  />
                ) : canDropIn ? (
                  <CommunitySessionBanner
                    session={effectiveLiveSession}
                    onDismiss={onClose}
                    compact
                    isJoined={false}
                    onDropIn={handleDropIn}
                    onDevPhaseChange={(phase) => onLivePhaseChange?.(effectiveLiveSession.groupId, phase)}
                  />
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-bold" dir="rtl">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                    <span>
                      מפגש פעיל ·{' '}
                      {group.isCityOnly
                        ? `לתושבי ${destAddress?.split(',')[0] ?? 'העיר'} בלבד`
                        : 'לחברים בלבד'}
                    </span>
                  </div>
                ))}

                {/* Title */}
                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                  {group.name}
                </h2>

                {/* Tags — immediately under title so users see session type first */}
                {effectiveTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 -mt-2">
                    {effectiveTags.map((tag) => (
                      <span key={tag} className="px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* ── Next Session Banner (cyan) with spots integrated ── */}
                {nextSessionData && !(liveSession && (liveSession.phase === 'approaching' || liveSession.phase === 'lobby' || liveSession.phase === 'active')) && (
                  <div className="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20 rounded-2xl p-4 border border-cyan-100 dark:border-cyan-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-cyan-600 uppercase tracking-widest">המפגש הבא</p>
                        <p className="text-sm font-black text-gray-900 dark:text-white leading-snug">
                          {nextSlot?.label || catConfig.label} · {formatSessionDate(nextSessionData.date, nextSessionData.time)}
                          {spotsLeft != null && (
                            <span className={`mr-1.5 text-xs font-black ${isFull ? 'text-red-500' : 'text-cyan-600'}`}>
                              {isFull ? ' · המפגש מלא' : ` · ${spotsLeft} מקומות נותרו`}
                            </span>
                          )}
                        </p>
                      </div>
                      {effectivePrice != null && effectivePrice > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex-shrink-0">
                          ₪{effectivePrice}
                        </span>
                      )}
                    </div>



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
                        className="flex items-center gap-1 text-xs text-cyan-600 font-bold hover:text-cyan-700 transition-colors mx-auto"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{scheduleOpen ? 'הסתר מערכת שעות' : 'לכל מערכת השעות'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${scheduleOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                )}

                {/* ── Expandable Full Schedule ────────────────────── */}
                {scheduleOpen && allSlots.length > 1 && (
                  <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-700/40 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
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
                                <p className="text-xs text-gray-400 truncate mt-0.5">📍 {slotAddr}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {isNext && (
                                <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-white text-xs font-black">הבא</span>
                              )}
                              {slotPrice != null && slotPrice > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-bold">₪{slotPrice}</span>
                              )}
                              {slotEquip && slotEquip.length > 0 && (
                                <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Drop-in recruitment prompt — shown after non-member joins a live session */}
                {showJoinPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-4 space-y-3"
                    dir="rtl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏃</span>
                      <div>
                        <p className="text-sm font-black text-gray-900 dark:text-gray-100">כל הכבוד, הצטרפת לאימון!</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">רוצה לקבל תזכורות למפגשים הבאים?</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleJoinFromPrompt}
                        disabled={joiningGroup}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {joiningGroup
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : 'כן, הצטרפי לקבוצה'}
                      </button>
                      <button
                        onClick={() => setShowJoinPrompt(false)}
                        className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-bold transition-all active:scale-[0.97]"
                      >
                        אולי אחר כך
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── "מי מגיע" — who's coming (tabs: המפגש הבא / השבוע) ── */}
                {allSlots.length > 0 && (
                  <div>
                    {/* Header + tab pills */}
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        מי מגיע
                      </h4>
                      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                        <button
                          onClick={() => setWhoTab('next')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            whoTab === 'next'
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          המפגש הבא
                        </button>
                        <button
                          onClick={() => { setWhoTab('week'); loadWeekSessions(); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            whoTab === 'week'
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          השבוע
                        </button>
                      </div>
                    </div>

                    {/* Tab: המפגש הבא */}
                    {whoTab === 'next' && (
                      <div>
                        {nextSessionData ? (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-500 font-semibold">
                              {formatSessionDate(nextSessionData.date, nextSessionData.time)}
                            </p>
                            {attendance && attendance.currentCount > 0 ? (
                              <div className="flex items-center gap-2.5">
                                <div className="flex -space-x-2 rtl:space-x-reverse">
                                  {Object.entries(attendance.attendeeProfiles ?? {}).slice(0, 7).map(([uid, p]) => (
                                    p.photoURL ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img key={uid} src={p.photoURL} alt={p.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" loading="lazy" decoding="async" />
                                    ) : (
                                      <div key={uid} className="w-8 h-8 rounded-full border-2 border-white bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                                        <span className="text-xs text-white font-black">{p.name?.charAt(0)}</span>
                                      </div>
                                    )
                                  ))}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-gray-800 dark:text-gray-200" aria-live="polite">
                                    {attendance.currentCount} {attendance.currentCount === 1 ? 'נרשם/ה' : 'נרשמו'}
                                  </p>
                                  {(attendance?.waitlist?.length ?? 0) > 0 && (
                                    <p className="text-xs text-amber-600 font-semibold" aria-live="polite">
                                      {attendance.waitlist!.length} ברשימת המתנה
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 font-medium">
                                אין רשומים עדיין — היה/י הראשון/ה!
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">אין מפגש מתוכנן</p>
                        )}
                      </div>
                    )}

                    {/* Tab: השבוע */}
                    {whoTab === 'week' && (
                      <div>
                        {weekLoading ? (
                          <div className="space-y-2">
                            {[1, 2].map((i) => (
                              <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                            ))}
                          </div>
                        ) : weekSessions.length === 0 ? (
                          <p className="text-xs text-gray-400">אין מפגשים נוספים השבוע</p>
                        ) : (
                          <div className="space-y-2">
                            {weekSessions.map((ws) => (
                              <div
                                key={`${ws.date}_${ws.time}`}
                                className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                    {formatSessionDate(ws.date, ws.time)}
                                  </p>
                                  {ws.attendance && ws.attendance.currentCount > 0 ? (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <div className="flex -space-x-1.5 rtl:space-x-reverse">
                                        {Object.entries(ws.attendance.attendeeProfiles ?? {}).slice(0, 4).map(([uid, p]) => (
                                          p.photoURL ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img key={uid} src={p.photoURL} alt={p.name} className="w-6 h-6 rounded-full border-2 border-white object-cover" loading="lazy" />
                                          ) : (
                                            <div key={uid} className="w-6 h-6 rounded-full border-2 border-white bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                                              <span className="text-[10px] text-white font-black">{p.name?.charAt(0)}</span>
                                            </div>
                                          )
                                        ))}
                                      </div>
                                      <span className="text-xs text-gray-500 font-semibold">
                                        {ws.attendance.currentCount} נרשמו
                                      </span>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 mt-0.5">אין רשומים עדיין</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {groupMembers.map((member) => {
                          const initials = member.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
                          const isGroupCreator = member.uid === group.createdBy;
                          const isGroupAdminMember = !isGroupCreator && member.role === 'admin';
                          const isSelf = member.uid === userId;
                          // actions owner can do on this member
                          const canPromote = !isGroupCreator && member.role === 'member' && isCurrentUserAdmin;
                          const canDemote  = !isGroupCreator && member.role === 'admin'  && isCreator;
                          const canRemove  = !isGroupCreator && !isSelf && (isCreator || (isCurrentUserAdmin && member.role === 'member'));
                          const hasActions = canPromote || canDemote || canRemove;
                          const isExpanded = activeActionUid === member.uid;
                          return (
                            <div key={member.uid} className="rounded-xl overflow-hidden">
                              {/* Member row */}
                              <button
                                type="button"
                                disabled={!hasActions}
                                onClick={() => hasActions && setActiveActionUid(isExpanded ? null : member.uid)}
                                className={`w-full flex items-center gap-3 py-2 px-3 bg-gray-50 dark:bg-gray-800/50 transition-colors ${hasActions ? 'active:bg-gray-100 dark:active:bg-gray-700/60 cursor-pointer' : 'cursor-default'}`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${isGroupCreator ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-cyan-400 to-blue-500'}`}>
                                  {initials.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0 text-right">
                                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                    {member.name}
                                  </p>
                                  {isGroupCreator && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5">
                                      <Crown className="w-3 h-3" />
                                      בעלים
                                    </p>
                                  )}
                                  {isGroupAdminMember && (
                                    <p className="text-xs text-blue-500 dark:text-blue-400 font-bold flex items-center gap-0.5">
                                      <Shield className="w-3 h-3" />
                                      מנהל/ת
                                    </p>
                                  )}
                                </div>
                                {hasActions && (
                                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                )}
                              </button>

                              {/* Inline action panel */}
                              {isExpanded && (
                                <div className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 py-2 space-y-1" dir="rtl">
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">
                                    {member.name} · פעולות מנהל
                                  </p>
                                  {canPromote && (
                                    <button
                                      disabled={actionPending === member.uid}
                                      onClick={() => handleToggleAdmin(member)}
                                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                    >
                                      {actionPending === member.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-blue-500" />}
                                      הפוך למנהל
                                      <span className="text-xs text-gray-400 font-normal mr-auto">אותן סמכויות כמו שלך</span>
                                    </button>
                                  )}
                                  {canDemote && (
                                    <button
                                      disabled={actionPending === member.uid}
                                      onClick={() => handleToggleAdmin(member)}
                                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                    >
                                      {actionPending === member.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4 text-gray-400" />}
                                      הסר ניהול
                                    </button>
                                  )}
                                  {canRemove && (
                                    <button
                                      onClick={() => handleRemoveMember(member)}
                                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                      הסר מהקבוצה
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Location — map thumbnail + prominent nav CTA */}
                {hasCoords ? (
                  <div className="space-y-2">
                    {/* Map thumbnail — tap to preview on in-app map */}
                    <button
                      type="button"
                      onClick={() => handleLocationClick(destLat, destLng)}
                      aria-label={`פתח מפה ל-${destAddress || 'מיקום הקבוצה'}`}
                      className="group relative w-full rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 active:scale-[0.98] transition-transform"
                    >
                      {staticMapUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={staticMapUrl} alt={destAddress || 'מפה'} className="w-full h-[110px] object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-[110px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                          <MapPin className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-3" dir="rtl">
                        <span className="text-xs font-bold text-white truncate block max-w-[80%]">
                          {destAddress || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`}
                        </span>
                      </div>
                    </button>
                    {/* Prominent navigate CTA */}
                    <button
                      type="button"
                      onClick={() => setNavOpen(true)}
                      aria-label="נווט למיקום הקבוצה"
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-[#00ADEF] text-white shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.97]"
                    >
                      <Navigation className="w-4 h-4" />
                      נווט למיקום
                    </button>
                  </div>
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
                        <span key={m} className="px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 text-xs font-bold">
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
                        <span key={item} className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
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

                {/* ── Owner / admin: Manage schedule ──────────────── */}
                {isCurrentUserAdmin && group.hasMeetups !== false && (group.scheduleSlots?.length ?? 0) > 0 && (
                  <button
                    onClick={() => { setScheduleMgrOpen(true); setEditingSlotIndex(null); }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
                  >
                    <Settings className="w-4 h-4" />
                    ניהול מפגשים
                  </button>
                )}

                {/* Schedule manager panel — inline overlay inside the drawer */}
                {scheduleMgrOpen && group.scheduleSlots && (
                  <ScheduleManagerPanel
                    group={group}
                    editingSlotIndex={editingSlotIndex}
                    onEdit={(i) => setEditingSlotIndex(i as number | null)}
                    onClose={() => { setScheduleMgrOpen(false); setEditingSlotIndex(null); }}
                    onSaved={() => { setScheduleMgrOpen(false); setEditingSlotIndex(null); }}
                    showToast={showToast}
                  />
                )}

                {/* ── Share button — always visible ───────────────── */}
                {(() => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://out-run-app.vercel.app';
                  const deepLink = group.inviteCode
                    ? `${origin}/join/${group.inviteCode}`
                    : `${origin}/community?groupId=${group.id}`;
                  const shareText = `מצאתי קבוצת ${catConfig.label} מעולה: \'${group.name}\'! בואו להצטרף אלינו.`;
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
                      aria-label="שתף קבוצה"
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.97]"
                    >
                      <Share2 className="w-4 h-4" />
                      שתף קבוצה
                    </button>
                  );
                })()}

                {/* ── הוסף ליומן — Google Calendar deep-link for next session ── */}
                {calendarUrl && (
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 transition-all active:scale-[0.97]"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    הוסף ליומן
                  </a>
                )}

                {/* ── Invite code panel — private group members / creator ── */}
                {!group.isPublic && (isJoined || isCreator) && group.inviteCode && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/40 space-y-3" dir="rtl">
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">קוד הזמנה</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-center font-mono text-2xl font-black tracking-[0.25em] text-gray-900 dark:text-white bg-white dark:bg-gray-700 rounded-xl py-3 border border-gray-200 dark:border-gray-600 select-all">
                        {group.inviteCode}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(group.inviteCode ?? '').catch(() => {});
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 2000);
                        }}
                        aria-label={inviteCopied ? 'הקוד הועתק' : 'העתק קוד הזמנה'}
                        className="w-12 h-12 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
                      >
                        {inviteCopied
                          ? <Check className="w-4 h-4 text-emerald-500" />
                          : <Copy className="w-4 h-4 text-gray-500" />
                        }
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://out-run-app.vercel.app';
                        const link = `${origin}/join/${group.inviteCode}`;
                        const text = `הוזמנת להצטרף לקהילה "${group.name}"! השתמש בקוד: ${group.inviteCode}\nאו לחץ על הקישור: ${link}`;
                        if (typeof navigator !== 'undefined' && navigator.share) {
                          navigator.share({ title: group.name, text, url: link }).catch(() => {});
                        } else {
                          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white text-sm font-black transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20"
                    >
                      <Share2 className="w-4 h-4" />
                      הזמן חברים בוואטסאפ
                    </button>
                  </div>
                )}

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

                {/* Join button (pre-join) — three cases: tenant-locked / private / public */}
                {!isJoined && onJoin && (
                  group.isLocked && !codeUnlocked ? (
                    /* Case 1: tenant / unit access-code gate */
                    <AccessCodeGate
                      orgName={group.name}
                      groupType={group.groupType}
                      tenantType={group.requiredAccessCodeType}
                      contactPhone={null}
                      hideSkip
                      compact
                      onSuccess={(_result: AccessCodeResult) => {
                        setCodeUnlocked(true);
                        showToast('success', `ברוכים הבאים ל${group.name}!`);
                        onJoin(group.id);
                      }}
                    />
                  ) : !group.isPublic ? (
                    /* Case 2: private group — invite code required */
                    <div className="space-y-3" dir="rtl">
                      {!inviteCodeMode ? (
                        <button
                          onClick={() => setInviteCodeMode(true)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gray-900 text-white shadow-lg transition-all active:scale-[0.97]"
                        >
                          <Lock className="w-4 h-4" />
                          הזן קוד הצטרפות
                        </button>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-xs text-gray-500 text-center font-semibold">
                            זו קהילה פרטית — הזינו את קוד ההצטרפות:
                          </p>
                          <div className="flex gap-2">
                            <input
                              dir="ltr"
                              type="text"
                              value={inviteInput}
                              onChange={(e) => { setInviteInput(e.target.value.toUpperCase()); setInviteError(false); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !joining && inviteInput.trim()) {
                                  const expected = (group.inviteCode ?? '').toUpperCase();
                                  if (inviteInput.toUpperCase() === expected) {
                                    setInviteError(false);
                                    onJoin(group.id);
                                  } else {
                                    setInviteError(true);
                                  }
                                }
                              }}
                              maxLength={6}
                              placeholder="XXXXXX"
                              autoFocus
                              aria-label="קוד הצטרפות לקהילה"
                              className={`flex-1 text-center text-lg font-mono font-black tracking-widest border-2 rounded-2xl px-3 py-3 focus:outline-none transition-colors ${
                                inviteError
                                  ? 'border-red-400 bg-red-50 text-red-600'
                                  : 'border-gray-200 focus:border-cyan-400'
                              }`}
                            />
                            <button
                              disabled={joining || !inviteInput.trim()}
                              onClick={() => {
                                const expected = (group.inviteCode ?? '').toUpperCase();
                                if (inviteInput.toUpperCase() === expected) {
                                  setInviteError(false);
                                  onJoin(group.id);
                                } else {
                                  setInviteError(true);
                                }
                              }}
                              className="px-4 py-3 rounded-2xl bg-gray-900 text-white text-sm font-black disabled:opacity-40 transition-all active:scale-95 flex-shrink-0"
                            >
                              {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : 'אישור'}
                            </button>
                          </div>
                          {inviteError && (
                            <p role="alert" className="text-sm text-red-500 font-bold text-center">
                              קוד שגוי, אנא נסה שנית
                            </p>
                          )}
                          <button
                            onClick={() => { setInviteCodeMode(false); setInviteInput(''); setInviteError(false); }}
                            className="w-full text-xs text-gray-400 font-semibold py-1 hover:text-gray-600 transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Case 3: public group — join directly */
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
                  )
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
                      await removeGroupMember(groupId, confirmRemove.uid);
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

// ── Schedule Manager Panel ────────────────────────────────────────────────────

interface ScheduleManagerPanelProps {
  group: CommunityGroup;
  editingSlotIndex: number | null;
  onEdit: (index: number | null) => void;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

function ScheduleManagerPanel({ group, editingSlotIndex, onEdit, onClose, onSaved, showToast }: ScheduleManagerPanelProps) {
  const slots = group.scheduleSlots ?? [];
  const [statusMap, setStatusMap] = React.useState<Record<number, SlotStatus>>({});
  const [checking, setChecking] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Fetch lock status + RSVP count for every slot on mount
  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    Promise.all(
      slots.map((slot, i) => getSlotStatus(group.id, slot).then((status) => ({ i, status })))
    ).then((results) => {
      if (cancelled) return;
      const map: Record<number, SlotStatus> = {};
      results.forEach(({ i, status }) => { map[i] = status; });
      setStatusMap(map);
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [group.id, slots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveSlot = async (index: number) => {
    const newSlots = slots.filter((_, i) => i !== index);
    setSaving(true);
    try {
      await updateGroup(group.id, { scheduleSlots: newSlots });
      showToast('success', 'מפגש הוסר');
      onSaved();
    } catch {
      showToast('error', 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  if (editingSlotIndex !== null) {
    return (
      <SlotEditorSheet
        group={group}
        slotIndex={editingSlotIndex >= 0 ? editingSlotIndex : null}
        onBack={() => onEdit(null)}
        onSaved={onSaved}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-black text-gray-900">ניהול מפגשים</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 active:scale-90 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Slot list */}
      <div className="divide-y divide-gray-50">
        {slots.map((slot, i) => {
          const status = statusMap[i];
          const locked = status?.locked ?? false;
          const attendeeCount = status?.attendeeCount ?? 0;
          const isOnly = slots.length === 1;
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              {/* Day + time */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {DAY_LABELS[slot.dayOfWeek]}{'  '}
                  <span className="font-mono">{slot.time}</span>
                </p>
                {(slot.location?.address ?? group.meetingLocation?.address) && (
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {slot.location?.address ?? group.meetingLocation?.address}
                  </p>
                )}
              </div>

              {/* RSVP count (informational) or lock badge */}
              {checking ? (
                <span className="text-[10px] text-gray-400 flex-shrink-0">...</span>
              ) : locked ? (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex-shrink-0">
                  פעיל
                </span>
              ) : attendeeCount > 0 ? (
                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  {attendeeCount} נרשמו
                </span>
              ) : null}

              {/* Edit */}
              <button
                onClick={() => !locked && !checking && onEdit(i)}
                disabled={locked || checking || saving}
                title={locked ? 'מפגש פעיל כרגע — לא ניתן לערוך' : 'ערוך'}
                className={`p-2 rounded-xl transition-all active:scale-90 ${
                  locked || checking ? 'text-gray-300 cursor-not-allowed' : 'text-cyan-600 hover:bg-cyan-50'
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>

              {/* Remove */}
              <button
                onClick={() => !locked && !isOnly && !checking && handleRemoveSlot(i)}
                disabled={locked || isOnly || checking || saving}
                title={isOnly ? 'להפסיק מפגשים לגמרי — בקרוב' : locked ? 'מפגש פעיל כרגע' : 'הסר מפגש'}
                className={`p-2 rounded-xl transition-all active:scale-90 ${
                  locked || isOnly || checking ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add slot */}
      <div className="px-4 pb-4 pt-2">
        <button
          onClick={() => onEdit(-1)}
          disabled={saving || checking}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-cyan-600 bg-cyan-50 hover:bg-cyan-100 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          הוסף מפגש
        </button>
      </div>
    </div>
  );
}

// ── Slot Editor Sheet ─────────────────────────────────────────────────────────

interface SlotEditorSheetProps {
  group: CommunityGroup;
  slotIndex: number | null; // null = add new slot
  onBack: () => void;
  onSaved: () => void;
  showToast: (type: 'success' | 'error', text: string) => void;
}

function SlotEditorSheet({ group, slotIndex, onBack, onSaved, showToast }: SlotEditorSheetProps) {
  const slot    = slotIndex !== null ? group.scheduleSlots![slotIndex] : null;
  const initLoc = slot?.location
    ? { address: slot.location.address ?? '', lat: slot.location.lat ?? 31.7683, lng: slot.location.lng ?? 35.2137 }
    : group.meetingLocation
    ? { address: group.meetingLocation.address, lat: group.meetingLocation.location?.lat ?? 31.7683, lng: group.meetingLocation.location?.lng ?? 35.2137 }
    : { address: '', lat: 31.7683, lng: 35.2137 };

  const [dayOfWeek,   setDayOfWeek]   = React.useState(slot?.dayOfWeek ?? 1);
  const [time,        setTime]        = React.useState(slot?.time ?? '08:00');
  const [address,     setAddress]     = React.useState(initLoc.address ?? '');
  const [coords,      setCoords]      = React.useState({ lat: initLoc.lat ?? 31.7683, lng: initLoc.lng ?? 35.2137 });
  const [goalType,    setGoalType]    = React.useState<'distance' | 'time' | null>(slot?.workoutGoal?.type ?? null);
  const [goalValue,   setGoalValue]   = React.useState<number>(
    slot?.workoutGoal?.value ?? (slot?.workoutGoal?.type === 'time' ? 30 * 60 : 5)
  );
  const [saving,    setSaving]    = React.useState(false);

  const handleAddressSelect = ({ address: addr, coords: c }: { address: string; coords: { lat: number; lng: number } }) => {
    setAddress(addr);
    setCoords(c);
  };

  const handleSave = async () => {
    if (!time.match(/^\d{1,2}:\d{2}$/)) {
      showToast('error', 'שעה לא תקינה');
      return;
    }
    const newSlotData: ScheduleSlot = {
      ...(slot ?? { frequency: 'weekly' as const, durationMinutes: 60 }),
      dayOfWeek,
      time,
      location: { address, lat: coords.lat, lng: coords.lng },
      workoutGoal: goalType ? { kind: 'goal', type: goalType, value: goalValue } : undefined,
    };
    const newSlots = slotIndex !== null
      ? group.scheduleSlots!.map((s, i) => (i === slotIndex ? newSlotData : s))
      : [...(group.scheduleSlots ?? []), newSlotData];
    setSaving(true);
    try {
      await updateGroup(group.id, { scheduleSlots: newSlots });
      showToast('success', slotIndex !== null ? 'המפגש עודכן' : 'מפגש נוסף');
      onSaved();
    } catch {
      showToast('error', 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden space-y-0" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 active:scale-90 transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-black text-gray-900 flex-1">{slotIndex !== null ? 'עריכת מפגש' : 'הוספת מפגש'}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Day picker */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">יום בשבוע</p>
          <div className="flex gap-1.5 flex-wrap">
            {DAY_LABELS.map((label, d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOfWeek(d)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  dayOfWeek === d
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Time input */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">שעה</p>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        {/* Address search */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">מיקום</p>
          <CommunityAddressSearch
            value={address}
            onChange={handleAddressSelect}
            proximity={coords}
          />
        </div>

        {/* Map pin */}
        <MiniLocationPicker
          value={coords}
          onChange={(c) => setCoords(c)}
        />

        {/* Workout Goal */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">יעד אימון <span className="font-normal text-gray-400">(ברירת מחדל לכל משתתף)</span></p>
          <div className="flex gap-2 mb-3">
            {([null, 'distance', 'time'] as const).map((type) => {
              const label = type === null ? 'ללא יעד' : type === 'distance' ? '📍 מרחק' : '⏱ זמן';
              const isSel = goalType === type;
              return (
                <button
                  key={String(type)}
                  type="button"
                  onClick={() => {
                    setGoalType(type);
                    if (type === 'distance' && goalType !== 'distance') setGoalValue(5);
                    if (type === 'time'     && goalType !== 'time')     setGoalValue(30 * 60);
                  }}
                  className={`flex-1 py-2.5 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                    isSel
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {goalType && (
            <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  {goalType === 'distance' ? 'מרחק' : 'משך זמן'}
                </span>
                <span className="text-base font-black text-emerald-600 tabular-nums">
                  {goalType === 'distance'
                    ? `${goalValue.toFixed(1)} ק״מ`
                    : `${Math.round(goalValue / 60)} דק׳`}
                </span>
              </div>
              <input
                type="range"
                min={goalType === 'distance' ? 1 : 15 * 60}
                max={goalType === 'distance' ? 20 : 120 * 60}
                step={goalType === 'distance' ? 0.5 : 5 * 60}
                value={goalValue}
                onChange={(e) => setGoalValue(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-cyan-500 active:scale-[0.97] transition-all disabled:opacity-50"
        >
          {saving ? 'שומר...' : slotIndex !== null ? 'שמור שינויים' : 'הוסף מפגש'}
        </button>
      </div>
    </div>
  );
}
