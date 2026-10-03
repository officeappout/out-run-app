/**
 * Shared color language for the brigade readiness dashboard — used by
 * OverallReadinessCard's legend/bar and UnitReadinessTable's per-row
 * status bar (03.10.2026, David's explicit "אותה שפה בדיוק" requirement
 * when the table's bar was added). notPerformed is a lighter,
 * distinguishable shade of the same grey family as notYetTested —
 * ReadinessStatusBadge's precedent of sharing one grey between the two
 * covers a single badge always shown next to its own text label; two
 * adjacent segments in a stacked bar in the identical color would
 * render as one indistinguishable block instead of two.
 */
export const READINESS_COLORS = {
  pass: '#0E5A42',
  fail: '#D9541F',
  notYetTested: '#9A9C98',
  notPerformed: '#C7C9C5',
} as const;
