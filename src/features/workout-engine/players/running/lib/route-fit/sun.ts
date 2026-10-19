/**
 * Solar altitude (degrees above the horizon) — the standard low-precision
 * almanac formula (≈0.5° accuracy), enough to tell "after dark" for a run.
 * Pure, no deps.
 */

const RAD = Math.PI / 180;

/** Below this the street needs lights (a little after sunset). */
export const DARK_SUN_ALTITUDE_DEG = -2;

export function solarAltitudeDeg(date: Date, lat: number, lng: number): number {
  const d = date.getTime() / 86_400_000 - 10_957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmstH = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const h = (gmstH * 15 + lng) * RAD - ra;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(h));
  return alt / RAD;
}

export function isDarkAt(date: Date, lat: number, lng: number): boolean {
  return solarAltitudeDeg(date, lat, lng) < DARK_SUN_ALTITUDE_DEG;
}

/** True when the run's start or end falls after dark. */
export function isRunAfterDark(
  startAt: Date,
  durationMin: number | null,
  pos: { lat: number; lng: number },
): boolean {
  if (!Number.isFinite(startAt.getTime())) return false;
  if (isDarkAt(startAt, pos.lat, pos.lng)) return true;
  const end = new Date(startAt.getTime() + Math.max(0, durationMin ?? 0) * 60_000);
  return isDarkAt(end, pos.lat, pos.lng);
}
