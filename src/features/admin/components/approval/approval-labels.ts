/**
 * Shared Hebrew label maps for the Approval Center (queue rows + detail modal).
 * Single source of truth — imported by both the page and ApprovalDetailModal.
 */
export const CLIMB_TYPE_LABELS: Record<string, string> = {
  'short-sharp': 'קצר-חד',
  repeats: 'חזרות',
  'long-gentle': 'ארוך-מתון',
  'structure-ramp': 'רמפה בנויה',
  stairs: 'מדרגות',
};

export const CONTRIB_TYPE_LABELS: Record<string, string> = {
  new_location: 'מיקום חדש',
  suggest_edit: 'הצעת עריכה',
  report: 'דיווח',
  review: 'ביקורת',
};

export const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'פארק כושר',
  court: 'מגרש ספורט',
  nature_community: 'טבע וקהילה',
  urban_spot: 'תשתית עירונית',
  route: 'מסלול טיול',
  zen_spot: 'אזור מנוחה',
};

export const ACTIVITY_LABELS: Record<string, string> = {
  running: 'ריצה',
  walking: 'הליכה',
  cycling: 'רכיבה',
};

export const AMENITY_CATEGORY_LABELS: Record<string, string> = {
  court: 'מגרש ספורט',
  bench: 'ספסל',
  drinking_water: 'ברזיית שתייה',
  fitness_station: 'עמדת כושר',
};

export const COURT_SPORT_LABELS: Record<string, string> = {
  basketball: 'כדורסל',
  football: 'כדורגל',
  tennis: 'טניס',
  padel: 'פאדל',
  multi: 'מגוון',
  unknown: 'לא ידוע',
};

/** meters → "1.2 ק״מ" / "450מ׳" */
export function formatDistance(distance: unknown): string {
  if (typeof distance !== 'number' || !isFinite(distance)) return '';
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} ק״מ` : `${Math.round(distance)}מ׳`;
}

/** A real place label: not a raw "way/160415171" ref and not a bare house number. */
export const isRealStreetName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length > 1 && !/^\d+$/.test(name.trim()) && !/^way\/\d+$/i.test(name.trim());

/**
 * Climb display title. Stairs read "מדרגות [מקום]"; every other climb reads
 * "עליית [רחוב]". Uses the real place name when known, else the type label
 * (never the raw "way/1234" OSM ref).
 */
export function climbDisplayName(x: any): string {
  const isStairs = x?.type === 'stairs' || x?.climbType === 'stairs';
  const prefix = isStairs ? 'מדרגות' : 'עליית';
  const raw = typeof x?.wayName === 'string' ? x.wayName.trim() : '';
  if (isRealStreetName(raw)) return `${prefix} ${raw}`;
  return CLIMB_TYPE_LABELS[x?.climbType] || (isStairs ? 'מדרגות' : 'עלייה');
}
