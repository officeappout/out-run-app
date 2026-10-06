/**
 * shape-review-chips.ts — the fixed chip vocabulary for the shape-review
 * screen. Chips, not free text, because a chip is countable — this is
 * training data for a future classifier, not a comment thread. Free text
 * stays available as an optional supplement, never the only input.
 */
export const REJECTION_CHIPS = [
  'לא לולאה',
  'צמוד לכביש ראשי',
  'לא באמת מסלול',
  'כפול',
  'קצר מדי',
  'ארוך מדי',
  'שם שגוי',
  'לא בעיר',
] as const;

export const APPROVAL_CHIPS = [
  'לולאה נקייה',
  'בתוך פארק',
  'מוכר/רשמי',
  'מחובר לגינת כושר',
  'טיילת טובה',
] as const;

// 'unclassified' is a REAL, measured outcome (backfill-route-shape-classification.ts
// ran, computed real geometry, and the route genuinely doesn't fit loop or
// linear_corridor) — distinct from a route whose shapeType field is entirely
// ABSENT (never backfilled at all, no geometry computed). Before 06.10.2026
// both rendered identically (⚪ "לא מסווג"), making "no info" indistinguishable
// from "info exists, doesn't fit any category" — a real problem for a reviewer
// deciding what to do next. SHAPE_TYPE_MISSING_LABEL/ICON below are the
// caller's responsibility to use for the absent-field case; this map is only
// ever keyed by a real, present shapeType value.
export const SHAPE_TYPE_LABEL: Record<string, string> = {
  loop: 'לולאה',
  linear_corridor: 'פרוזדור לינארי',
  unclassified: 'לא לולאה ולא פרוזדור',
};

export const SHAPE_TYPE_ICON: Record<string, string> = {
  loop: '🔵',
  linear_corridor: '🟢',
  unclassified: '⚪',
};

// Field entirely absent (route never went through the shape-classification
// backfill) — not a 4th shapeType value, so deliberately not a 4th key in
// the maps above (every existing `SHAPE_TYPE_*[x] ?? fallback` call site
// would silently treat a new key as "yet another unclassified-like value"
// without the caller ever having to branch — a bug class this constant sidesteps
// by requiring the caller to check `!shapeType` explicitly instead).
export const SHAPE_TYPE_MISSING_LABEL = 'טרם נמדד';
export const SHAPE_TYPE_MISSING_ICON = '⏳';
