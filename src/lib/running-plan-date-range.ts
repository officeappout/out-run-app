/**
 * "Is this date within the running plan's range" — the question
 * `calculateCurrentWeek` (workout-completion.service.ts) answers folded
 * into the same number as "which week," via `Math.max(1, ...)`. That
 * clamp means every date before `startDate` silently reports week 1 —
 * identical to the real week 1 — instead of "not in the plan yet."
 *
 * `calculateCurrentWeek` itself is intentionally untouched (David,
 * 02.09.2026 round-2 review): it's the calendar-layer function, staying
 * exactly as-is per the rolling-engine/calendar-view split decision
 * (adaptive-schedule-map.md) — a rolling engine (phase 2, not built yet)
 * will own its own "what week is this" logic internally, and this
 * calendar function is display-layer only. Changing its contract would
 * also change it for every write-site (workout-completion.service.ts's
 * markSessionComplete/rollBackOneWeek) and resolveBuildStartDate
 * (plan-generator.service.ts) — the schedule-builder drawer's own
 * foundation — for the sake of fixing 3 display sites. Not worth it:
 * this file exists so those 3 sites ask the "in range" question BEFORE
 * calling calculateCurrentWeek at all, instead of trusting its clamped
 * answer.
 *
 * Named for the concept, not the bug — the rolling engine (adaptive-
 * schedule-map.md, phase 2) will need exactly this same question and
 * should import this rather than re-deriving it.
 */
export function isDateWithinRunningPlan(
  startDate: Date | string | number,
  asOfDate: Date,
): boolean {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(asOfDate);
  target.setHours(0, 0, 0, 0);
  return target.getTime() >= start.getTime();
}
