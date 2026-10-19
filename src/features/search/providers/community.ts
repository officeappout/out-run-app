/**
 * Groups + events providers — over the same lists today's search tabs show (useArenaData for the
 * user's city, useMyGroups for "my" groups), matched on name / description / address. Pure.
 */
import type { CommunityEvent, CommunityGroup } from '@/types/community.types';
import { scoreFields } from '../core/text';
import type { EventHit, GroupHit, LatLng } from '../core/types';
import { haversineKm } from './places';

export const GROUP_CATEGORY_LABEL: Record<string, string> = {
  walking: 'הליכה',
  running: 'ריצה',
  yoga: 'יוגה',
  calisthenics: 'קליסטניקס',
  cycling: 'רכיבה',
  other: 'אימון',
};

export const EVENT_CATEGORY_LABEL: Record<string, string> = {
  race: 'מרוץ',
  fitness_day: 'יום כושר',
  workshop: 'סדנה',
  community_meetup: 'מפגש קהילה',
  other: 'אירוע',
};

const DAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** "ג׳ ו־ה׳ · 19:30" from the group's slots (deduped days, first slot's time). */
export function groupScheduleLabel(g: Pick<CommunityGroup, 'scheduleSlots' | 'schedule'>): string | null {
  const slots = g.scheduleSlots?.length ? g.scheduleSlots : g.schedule ? [g.schedule] : [];
  if (!slots.length) return null;
  const days = Array.from(new Set(slots.map((s) => s.dayOfWeek).filter((d) => d >= 0 && d <= 6))).sort();
  const dayText = days.map((d) => DAY[d]).join(' ו־');
  return [dayText || null, slots[0]?.time || null].filter(Boolean).join(' · ');
}

function groupDistance(g: CommunityGroup, pos: LatLng | null): number | null {
  const loc = g.meetingLocation?.location;
  return pos && loc && Number.isFinite(loc.lat) && (loc.lat !== 0 || loc.lng !== 0) ? haversineKm(pos, loc) : null;
}

function eventDistance(e: CommunityEvent, pos: LatLng | null): number | null {
  const loc = e.location?.location;
  return pos && loc && Number.isFinite(loc.lat) && (loc.lat !== 0 || loc.lng !== 0) ? haversineKm(pos, loc) : null;
}

export function groupToHit(g: CommunityGroup, score: number, pos: LatLng | null): GroupHit {
  return {
    kind: 'group', key: `group:${g.id}`, title: g.name, score, group: g, distanceKm: groupDistance(g, pos),
    subtitle: [GROUP_CATEGORY_LABEL[g.category] ?? null, g.meetingLocation?.address ?? null].filter(Boolean).join(' · ') || undefined,
  };
}

export function eventToHit(e: CommunityEvent, score: number, pos: LatLng | null): EventHit {
  return {
    kind: 'event', key: `event:${e.id}`, title: e.name, score, event: e, distanceKm: eventDistance(e, pos),
    subtitle: [EVENT_CATEGORY_LABEL[e.category] ?? null, e.location?.address ?? null].filter(Boolean).join(' · ') || undefined,
  };
}

export function rankGroups(groups: readonly CommunityGroup[], query: string, pos: LatLng | null): GroupHit[] {
  const seen = new Set<string>();
  const out: GroupHit[] = [];
  for (const g of groups) {
    if (!g?.id || seen.has(g.id)) continue;
    seen.add(g.id);
    const s = scoreFields([[g.name, 1], [g.meetingLocation?.address, 0.6], [GROUP_CATEGORY_LABEL[g.category], 0.5], [g.description, 0.4]], query);
    if (s > 0) out.push(groupToHit(g, s, pos));
  }
  return out.sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
}

const eventTime = (e: CommunityEvent) => {
  const t = e.date instanceof Date ? e.date.getTime() : new Date(e.date as unknown as string).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Past events (ended more than a day ago) are not search results. */
export function rankEvents(events: readonly CommunityEvent[], query: string, pos: LatLng | null, now = Date.now()): EventHit[] {
  return events
    .filter((e) => e?.id && e.isActive !== false && eventTime(e) >= now - 24 * 3600_000)
    .map((e) => ({ e, s: scoreFields([[e.name, 1], [e.location?.address, 0.6], [EVENT_CATEGORY_LABEL[e.category], 0.5], [e.description, 0.4]], query) }))
    .filter((x) => x.s > 0)
    .map(({ e, s }) => eventToHit(e, s, pos))
    .sort((a, b) => b.score - a.score || eventTime(a.event) - eventTime(b.event));
}

/** Upcoming first (yesterday onwards), then by date. */
export function upcomingEvents(events: readonly CommunityEvent[], now = Date.now()): CommunityEvent[] {
  return events
    .filter((e) => e?.id && e.isActive !== false && eventTime(e) >= now - 24 * 3600_000)
    .sort((a, b) => eventTime(a) - eventTime(b));
}
