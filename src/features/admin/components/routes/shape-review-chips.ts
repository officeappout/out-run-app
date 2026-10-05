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

export const SHAPE_TYPE_LABEL: Record<string, string> = {
  loop: 'לולאה',
  linear_corridor: 'פרוזדור לינארי',
  unclassified: 'לא מסווג',
};

export const SHAPE_TYPE_ICON: Record<string, string> = {
  loop: '🔵',
  linear_corridor: '🟢',
  unclassified: '⚪',
};
