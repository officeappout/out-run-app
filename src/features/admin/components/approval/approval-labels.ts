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

/** meters → "1.2 ק״מ" / "450מ׳" */
export function formatDistance(distance: unknown): string {
  if (typeof distance !== 'number' || !isFinite(distance)) return '';
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} ק״מ` : `${Math.round(distance)}מ׳`;
}
