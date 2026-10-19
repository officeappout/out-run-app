/**
 * GroupDetailsDrawer — constants + pure logic (no React, no Firestore).
 * (Split out of GroupDetailsDrawer.tsx; no behaviour change.)
 */
import type { CommunityGroup, GroupMember, LiveSessionPhase, ScheduleSlot } from '@/types/community.types';
import { APP_ORIGIN } from '@/lib/config/domain';

export const CATEGORY_CONFIG: Record<string, { label: string; icon: string; gradient: string }> = {
  walking:      { label: 'הליכה',      icon: '🚶', gradient: 'from-emerald-500 to-teal-600' },
  running:      { label: 'ריצה',       icon: '🏃', gradient: 'from-orange-500 to-red-500' },
  yoga:         { label: 'יוגה',       icon: '🧘', gradient: 'from-violet-500 to-purple-600' },
  calisthenics: { label: 'קליסתניקס', icon: '💪', gradient: 'from-cyan-500 to-blue-600' },
  cycling:      { label: 'רכיבה',      icon: '🚴', gradient: 'from-lime-500 to-green-600' },
  other:        { label: 'אחר',        icon: '⭐', gradient: 'from-gray-500 to-gray-600' },
};

export type CategoryConfig = (typeof CATEGORY_CONFIG)[string];

/** px the sheet is offset at initial open to show ~85 vh (95 - 85 = 10 vh). */
export const PEEK_Y_PX = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.10) : 80;

export const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const APP_ORIGIN_FALLBACK = APP_ORIGIN;

export function formatSessionDate(dateISO: string, time: string): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const d = new Date(dateISO + 'T00:00:00');

  if (d.toDateString() === today.toDateString()) return `היום ב-${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `מחר ב-${time}`;

  const dayName = d.toLocaleDateString('he-IL', { weekday: 'long' });
  return `יום ${dayName} ב-${time}`;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Build a Google Calendar deep-link for a single session (1-hour default duration). */
export function buildGCalLink(title: string, dateISO: string, time: string, location: string, description: string): string {
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
export function computeWeekSessions(slots: ScheduleSlot[]): { date: string; time: string; slot: ScheduleSlot }[] {
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
export function getNextSlotDate(dayOfWeek: number, time: string): string {
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

/** The group's schedule: multi-slot `scheduleSlots`, else the legacy single `schedule`. */
export function resolveGroupSlots(group: CommunityGroup | null | undefined): ScheduleSlot[] {
  return group?.scheduleSlots?.length
    ? group.scheduleSlots
    : group?.schedule
      ? [group.schedule]
      : [];
}

/** True while a live session is approaching / in lobby / active. */
export function isLiveSessionPhase(phase: LiveSessionPhase | undefined): boolean {
  return phase === 'approaching' || phase === 'lobby' || phase === 'active';
}

/**
 * Where the group meets: a per-slot location override, else the group's
 * meeting point. 08.09.2026 — city-precision groups carry a real coordinate
 * internally (city-center, for NearbyGroupsRow's sort/filter only) but must
 * never show a map pin or "navigate" — that would claim a meeting POINT we
 * don't have — so their coords don't count and the plain-text address (the
 * city name) renders instead.
 */
export function resolveGroupDestination(group: CommunityGroup, nextSlot: ScheduleSlot | null) {
  const slotLoc = nextSlot?.location;
  const hasSlotCoords = slotLoc && slotLoc.lat != null && slotLoc.lng != null && (slotLoc.lat !== 0 || slotLoc.lng !== 0);
  const hasGroupCoords =
    group.meetingLocation?.precision !== 'city' &&
    group.meetingLocation?.location &&
    (group.meetingLocation.location.lat !== 0 || group.meetingLocation.location.lng !== 0);
  const hasCoords = hasSlotCoords || hasGroupCoords;

  const destLat = hasSlotCoords ? slotLoc!.lat! : (group.meetingLocation?.location?.lat ?? 0);
  const destLng = hasSlotCoords ? slotLoc!.lng! : (group.meetingLocation?.location?.lng ?? 0);
  const destAddress = hasSlotCoords && slotLoc?.address
    ? slotLoc.address
    : group.meetingLocation?.address;
  return { hasCoords, destLat, destLng, destAddress };
}

export function buildStaticMapUrl(mapboxToken: string, hasCoords: unknown, destLat: number, destLng: number): string | null {
  return mapboxToken && hasCoords
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+F97316(${destLng},${destLat})/${destLng},${destLat},14,0/600x240@2x?access_token=${mapboxToken}&language=he`
    : null;
}

/** Slot-level overrides → group-level defaults. */
export function resolveSessionDetails(group: CommunityGroup, nextSlot: ScheduleSlot | null) {
  const effectiveImages = (nextSlot?.images?.length ? nextSlot.images : group.images) ?? [];
  const effectiveTags = (nextSlot?.tags?.length ? nextSlot.tags : []) as string[];
  const effectiveMuscles = (nextSlot?.targetMuscles?.length ? nextSlot.targetMuscles : group.targetMuscles) ?? [];
  const effectiveEquipment = (nextSlot?.requiredEquipment?.length ? nextSlot.requiredEquipment : group.equipment) ?? [];
  const effectivePrice = nextSlot?.price != null ? nextSlot.price : group.price;
  return {
    coverImage: effectiveImages[0] ?? null,
    effectiveTags,
    effectiveMuscles,
    effectiveEquipment,
    effectivePrice,
  };
}

/** Spots left in the next session (null when it has no cap). */
export function spotsLeftFor(maxParticipants: number | undefined, currentCount: number | undefined): number | null {
  return maxParticipants
    ? Math.max(0, maxParticipants - (currentCount ?? 0))
    : null;
}

/** "דנה כהן" → "דכ" (first letters of the first two words). */
export function memberInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
}

/** What the viewer may do to `member` (owner/admin moderation rules). */
export function memberPermissions(
  member: GroupMember,
  ctx: { createdBy: string; userId: string; isCreator: boolean; isCurrentUserAdmin: boolean },
) {
  const isGroupCreator = member.uid === ctx.createdBy;
  const isGroupAdminMember = !isGroupCreator && member.role === 'admin';
  const isSelf = member.uid === ctx.userId;
  const canPromote = !isGroupCreator && member.role === 'member' && ctx.isCurrentUserAdmin;
  const canDemote  = !isGroupCreator && member.role === 'admin'  && ctx.isCreator;
  const canRemove  = !isGroupCreator && !isSelf && (ctx.isCreator || (ctx.isCurrentUserAdmin && member.role === 'member'));
  return { isGroupCreator, isGroupAdminMember, canPromote, canDemote, canRemove, hasActions: canPromote || canDemote || canRemove };
}

/**
 * Drop-in to a live session is open to non-members only on an unlocked,
 * public group — and, for city-only groups, to residents of that city.
 */
export function canDropInTo(group: CommunityGroup, userAuthorityId: string | null): boolean {
  return (
    !group.isLocked &&
    group.isPublic !== false &&
    (!group.isCityOnly || userAuthorityId === group.authorityId)
  );
}

/**
 * v2: a scheduled solo run ("ריצה/הליכה מתוזמנת" — the ephemeral group
 * /api/invite/run-session creates) → its activity, else null.
 */
export function scheduledRunActivityOf(group: CommunityGroup & { type?: string }): 'running' | 'walking' | null {
  return group.type === 'ephemeral' && (group.category === 'running' || group.category === 'walking')
    ? group.category
    : null;
}

/** Share target for the group: the invite link when a code is known, else the community deep link. */
export function groupShareLink(origin: string, groupId: string, inviteCode: string | null): string {
  return inviteCode
    ? `${origin}/join/${inviteCode}`
    : `${origin}/community?groupId=${groupId}`;
}
