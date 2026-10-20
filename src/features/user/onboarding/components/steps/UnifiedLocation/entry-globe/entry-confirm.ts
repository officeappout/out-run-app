/**
 * Entry flow v2 — pure helpers for the "גרים ב…?" drawer (no React).
 */
import type { NearbyFacility } from '../location-types';

type ParkFacility = Extract<NearbyFacility, { kind: 'park' }>;

/** The place in the title: neighbourhood, else city, else the display name. */
export function confirmPlaceName(
  neighborhood: string | null | undefined,
  city: string | null | undefined,
  displayName?: string | null,
): string {
  const pick = [neighborhood, city, displayName].find((s) => typeof s === 'string' && s.trim().length > 0);
  return pick ? pick.trim() : '';
}

/** The closest PARK among the loaded facilities (routes are ignored). */
export function pickNearestPark(facilities: readonly NearbyFacility[] | null | undefined): ParkFacility | null {
  let best: ParkFacility | null = null;
  for (const f of facilities ?? []) {
    if (f?.kind !== 'park') continue;
    const d = Number.isFinite(f.distanceMeters) ? f.distanceMeters : Infinity;
    const bd = best && Number.isFinite(best.distanceMeters) ? best.distanceMeters : Infinity;
    if (!best || d < bd) best = f;
  }
  return best;
}

/** "400 מ׳ · ⭐ 4.7 · 6 מתקנים" — only the parts the data actually has. */
export function nearestParkMetaParts(park: {
  formattedDistance?: string | null;
  rating?: number | null;
  gymEquipment?: readonly unknown[] | null;
}): string[] {
  const parts: string[] = [];
  if (park.formattedDistance) parts.push(park.formattedDistance);
  if (typeof park.rating === 'number' && Number.isFinite(park.rating) && park.rating > 0) {
    parts.push(`⭐ ${park.rating.toFixed(1)}`);
  }
  const n = Array.isArray(park.gymEquipment) ? park.gymEquipment.length : 0;
  if (n === 1) parts.push('מתקן אחד');
  else if (n > 1) parts.push(`${n} מתקנים`);
  return parts;
}
