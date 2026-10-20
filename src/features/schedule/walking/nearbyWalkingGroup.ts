/**
 * "לא לבד" (enable_home_v2, owner 20.10.2026) — the one nearby walking group worth
 * suggesting: the soonest session in the next 7 days among public walking groups
 * within reach. Pure. Read-only suggestion; joining happens in the group drawer.
 */
import type { CommunityGroup, ScheduleSlot } from '@/types/community.types';

export const NOT_ALONE_RADIUS_KM = 8;
const DAY_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export interface WalkingGroupSuggestion {
  groupId: string;
  name: string;
  km: number;
  /** Where they meet (address / park name), when known. */
  place: string | null;
  /** "היום 18:30" / "מחר 07:00" / "ביום ג׳ 18:30" */
  whenHe: string;
  /** Minutes from now to the session (sorting). */
  inMinutes: number;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutes until a weekly slot next starts (within 7 days; a slot that started < 0′ ago is next week). */
export function minutesUntilSlot(slot: Pick<ScheduleSlot, 'dayOfWeek' | 'time'>, now: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot.time ?? '');
  if (!m || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) return null;
  const nowMin = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
  const slotMin = slot.dayOfWeek * 1440 + Number(m[1]) * 60 + Number(m[2]);
  let diff = slotMin - nowMin;
  if (diff < 0) diff += 7 * 1440;
  return diff;
}

export function whenLabelHe(slot: Pick<ScheduleSlot, 'dayOfWeek' | 'time'>, now: Date): string {
  const today = now.getDay();
  if (slot.dayOfWeek === today) return `היום ${slot.time}`;
  if (slot.dayOfWeek === (today + 1) % 7) return `מחר ${slot.time}`;
  return `ביום ${DAY_HE[slot.dayOfWeek]} ${slot.time}`;
}

type GroupLike = Pick<CommunityGroup, 'id' | 'name' | 'category' | 'isActive' | 'meetingLocation' | 'scheduleSlots' | 'schedule'> & {
  type?: unknown;
  isPublic?: boolean;
};

export function pickWalkingGroupSuggestion(
  groups: readonly GroupLike[],
  userPos: { lat: number; lng: number } | null,
  now: Date,
  radiusKm: number = NOT_ALONE_RADIUS_KM,
): WalkingGroupSuggestion | null {
  if (!userPos) return null;
  let best: WalkingGroupSuggestion | null = null;
  for (const g of groups) {
    if (g.category !== 'walking' || g.isActive === false || g.type === 'ephemeral' || g.isPublic === false) continue;
    const loc = g.meetingLocation?.location;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
    // A city-only location is not a meeting point — never claim a distance from it.
    if (g.meetingLocation?.precision === 'city') continue;
    const km = haversineKm(userPos, loc);
    if (km > radiusKm) continue;
    const slots = g.scheduleSlots?.length ? g.scheduleSlots : g.schedule ? [g.schedule] : [];
    for (const s of slots) {
      const inMinutes = minutesUntilSlot(s, now);
      if (inMinutes == null) continue;
      if (!best || inMinutes < best.inMinutes || (inMinutes === best.inMinutes && km < best.km)) {
        best = {
          groupId: g.id,
          name: g.name,
          km: Math.round(km * 10) / 10,
          place: s.location?.address ?? g.meetingLocation?.address ?? null,
          whenHe: whenLabelHe(s, now),
          inMinutes,
        };
      }
    }
  }
  return best;
}

/** "יש קבוצת הליכה ב-18:30 בפארק הירקון · להצטרף?" — the one line shown. */
export function suggestionLineHe(s: WalkingGroupSuggestion): string {
  return `יש קבוצת הליכה ${s.whenHe}${s.place ? ` · ${s.place}` : ''}`;
}

/** The group drawer on home (the app's existing deep link). */
export function walkingGroupHref(groupId: string): string {
  return `/home?openGroupDrawer=${encodeURIComponent(groupId)}`;
}
