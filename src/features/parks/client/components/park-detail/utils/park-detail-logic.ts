/**
 * ParkDetailSheet — pure data logic (no React, no Firestore).
 * (Split out of ParkDetailSheet.tsx; no behaviour change.)
 */
import type { DayFilter, SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import { matchesDayFilter } from '@/features/parks/core/hooks/useCommunityEnrichment';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { Park } from '@/features/parks/core/types/park.types';
import type { UserContribution } from '@/types/contribution.types';
import { RANGE_STEP_MIN } from './park-detail-format';

export interface EquipmentSection {
  /** Rendered through map.json `parkDetail.equipment.section`. */
  key: 'aerobic' | 'functional' | 'hydraulic';
  items: GymEquipment[];
}

/**
 * 3-way categorization (David 17.09.2026): isCardio===true → aerobic; else
 * isFunctional===true → functional; else → hydraulic. No ambiguous case
 * exists in the current census (0 docs have both true), so no tiebreak is
 * applied beyond "cardio wins" — kept in that order in case one shows up
 * later. Docs missing isCardio (untyped gap, see the equipment census) fall
 * through to functional/hydraulic same as an explicit false. Empty sections
 * are dropped.
 */
export function categorizeParkEquipment(parkEquipment: GymEquipment[]): EquipmentSection[] {
  const aerobic = parkEquipment.filter((eq) => eq.isCardio === true);
  const functional = parkEquipment.filter((eq) => eq.isCardio !== true && eq.isFunctional === true);
  const hydraulic = parkEquipment.filter((eq) => eq.isCardio !== true && eq.isFunctional !== true);
  const sections: EquipmentSection[] = [
    { key: 'aerobic', items: aerobic },
    { key: 'functional', items: functional },
    { key: 'hydraulic', items: hydraulic },
  ];
  return sections.filter((section) => section.items.length > 0);
}

/**
 * Merge live snapshot results with optimistic local arrivals; drop local
 * entries once the snapshot has caught up (matched by userId + start-time)
 * so the same arrival doesn't render twice. Returns `parkEvents` itself
 * (same reference) when there is nothing optimistic left to add.
 */
export function mergeLocalArrivals(
  parkEvents: SessionEnrichment[],
  localArrivals: SessionEnrichment[],
): SessionEnrichment[] {
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
}

/**
 * Sessions shown for the selected day. Squad-only arrivals don't belong on a
 * public park page — but the publisher must still see their own, or a
 * publish would look like it silently vanished. Organized events/groups have
 * no privacy concept and are unaffected (isPersonalArrival is unset for them).
 */
export function filterVisibleParkEvents(
  events: SessionEnrichment[],
  dayFilter: DayFilter,
  currentUid: string | undefined,
): SessionEnrichment[] {
  return events.filter((ev) => {
    if (!matchesDayFilter(ev.nextStartTime, dayFilter)) return false;
    if (ev.isPersonalArrival) {
      const isOwn = ev.avatars?.[0]?.uid === currentUid;
      return ev.privacyMode === 'verified_global' || isOwn;
    }
    return true;
  });
}

/**
 * Personal arrivals don't have a `community_events/{id}/registrations`
 * sub-collection — only real (non-recurring, non-personal) events do.
 * Including them would trigger spurious snapshot listeners on non-existent
 * docs.
 */
export function selectRegistrableEventIds(events: SessionEnrichment[]): string[] {
  return events
    .filter((e) => !e.isRecurring && !e.isPersonalArrival)
    .map((e) => e.eventId);
}

/** Total head-count badge on the "מתאמנים" title (each session counts ≥ 1). */
export function totalParkAttendees(events: SessionEnrichment[]): number {
  return events.reduce((s, e) => s + Math.max(1, e.currentRegistrations ?? 0), 0);
}

/** Average of the rated reviews; falls back to the park's stored rating. */
export function averageReviewRating(reviews: UserContribution[], fallback: number | null | undefined): number | null {
  const rated = reviews.filter(r => r.rating);
  if (rated.length === 0) return fallback ?? null;
  return rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length;
}

/**
 * Up to 8 photos: the park's own image (imageUrl on Bunny CDN preferred over
 * the legacy images[]/image fields), then review snapshots.
 */
export function buildParkPhotoGallery(park: Park | null | undefined, reviews: UserContribution[]): string[] {
  const urls: string[] = [];
  if (park?.imageUrl) urls.push(park.imageUrl);
  else if (park?.images?.length) urls.push(...park.images);
  else if (park?.image) urls.push(park.image);
  reviews.filter(r => r.photoUrl).forEach(r => urls.push(r.photoUrl!));
  return urls.slice(0, 8);
}

export type ArrivalWindow =
  | { ok: true; startTime: Date; endTime: Date }
  | { ok: false; reason: 'invalid-date' };

/**
 * Resolve the arrival window from the chip + slider:
 *   - 'today'    → today
 *   - 'tomorrow' → today + 1 day
 *   - 'week'     → the explicit YYYY-MM-DD the user picked (`pickedDate`)
 * then layer the [start, end] minutes-of-day window on top. A degenerate
 * window (end ≤ start — the slider clamps during drag, but a state race
 * could still produce one) is widened to one slider step.
 */
export function resolveArrivalWindow(
  dayFilter: DayFilter,
  pickedDate: string,
  [startMinutes, endMinutes]: [number, number],
  now: Date = new Date(),
): ArrivalWindow {
  const baseDate = new Date(now);
  if (dayFilter === 'tomorrow') {
    baseDate.setDate(baseDate.getDate() + 1);
  } else if (dayFilter === 'week') {
    const parsed = new Date(`${pickedDate}T00:00:00`);
    if (isNaN(parsed.getTime())) return { ok: false, reason: 'invalid-date' };
    baseDate.setFullYear(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  baseDate.setHours(0, 0, 0, 0);

  const startTime = new Date(baseDate);
  startTime.setMinutes(startMinutes);
  const endTime = new Date(baseDate);
  endTime.setMinutes(endMinutes);

  if (endTime.getTime() <= startTime.getTime()) {
    endTime.setTime(startTime.getTime() + RANGE_STEP_MIN * 60 * 1000);
  }
  return { ok: true, startTime, endTime };
}

/** `${groupId}_${x}_${YYYY-MM-DD}` → the date part, or undefined. */
export function recurringEventDate(eventId: string): string | undefined {
  const [, , dateStr] = eventId.split('_');
  return dateStr;
}

/** "HH:MM" from an ISO start time, '18:00' when it has no time part. */
export function recurringEventTime(nextStartTime: string): string {
  return nextStartTime.includes('T')
    ? nextStartTime.split('T')[1].slice(0, 5)
    : '18:00';
}
