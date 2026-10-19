/**
 * The three big numbers on a home-v2 cardio feed post.
 *
 *   run / walk: distance · pace (min/km) · minutes   (today's card)
 *   ride:       distance · average speed (km/h) · minutes
 *
 * A ride is a post stamped `activityType: 'cycling'` (useRunningPlayer,
 * enable_home_v2). Rides posted before that field existed (#492, same day)
 * carry the 'רכיבה' title and no pace — recognised too, so they don't show
 * an empty pace tile.
 *
 * Pure — no Firebase, unit-tested.
 */

export interface CardioPostLike {
  distanceKm?: number | null;
  paceMinPerKm?: number | null;
  paceSecPerKm?: number | null;
  durationMinutes: number;
  title?: string | null;
  activityType?: string | null;
}

export interface CardioStat {
  value: string;
  unit: string;
}

const RIDE_TITLE = 'רכיבה';
const EMPTY = '—';

export function isRidePost(post: CardioPostLike): boolean {
  if (post.activityType === 'cycling') return true;
  return post.title === RIDE_TITLE && post.paceMinPerKm == null && post.paceSecPerKm == null;
}

/** Average speed (km/h) from distance and whole minutes; null when unknown. */
export function rideSpeedKmh(distanceKm: number | null | undefined, durationMinutes: number): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return distanceKm / (durationMinutes / 60);
}

export function formatPaceMin(pace: number): string {
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return secs === 60 ? `${mins + 1}:00` : `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function cardioPostStats(post: CardioPostLike): [CardioStat, CardioStat, CardioStat] {
  const distance: CardioStat = {
    value: post.distanceKm != null ? post.distanceKm.toFixed(1) : EMPTY,
    unit: 'ק״מ',
  };
  const time: CardioStat = { value: String(post.durationMinutes), unit: 'דקות' };
  if (isRidePost(post)) {
    const kmh = rideSpeedKmh(post.distanceKm, post.durationMinutes);
    return [distance, { value: kmh != null ? kmh.toFixed(1) : EMPTY, unit: 'קמ״ש' }, time];
  }
  return [
    distance,
    { value: post.paceMinPerKm != null ? formatPaceMin(post.paceMinPerKm) : EMPTY, unit: 'דק׳ לק״מ' },
    time,
  ];
}
