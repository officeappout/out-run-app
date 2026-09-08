/**
 * Pure current-week module — no Firebase, no network, safe to import from
 * anywhere, including modules that must stay import-graph-pure
 * (crossDomainRules.ts's precedent for WHO_STRENGTH_TARGET_DAYS;
 * weaverInput.ts, which needs exactly this).
 *
 * `calculateCurrentWeek` moved here verbatim from
 * `workout-completion.service.ts` (which imports `firebase/firestore` at
 * the top level for its OTHER exports — the write-side, `markSessionComplete`/
 * `rollBackOneWeek`). Pure relocation, zero behavior change — that file now
 * imports this function and re-exports it, so its own 9 existing callers
 * are unaffected.
 */
import { isDateWithinRunningPlan } from './running-plan-date-range';

/**
 * Calculate the current program week from the start date.
 * Week 1 = days 0-6, Week 2 = days 7-13, etc.
 *
 * `asOfDate` — optional. Defaults to today (`new Date()`), preserving exact
 * existing behavior for callers that omit it (markSessionComplete,
 * rollBackOneWeek — both unchanged by this parameter). Pass an explicit
 * date to ask "what week does THIS calendar day fall in" instead of "what
 * week is it right now" — e.g. resolving the week for an arbitrary rendered
 * agenda day rather than for today.
 *
 * ⚠️ This function actually answers two different questions with one
 * number: "which week" AND "is asOfDate even inside the plan at all."
 * `Math.max(1, ...)` below folds them together — any asOfDate before
 * `startDate` reports week 1, indistinguishable from the real week 1
 * (found 02.09.2026: a user registering mid-week saw days from BEFORE
 * registration rendered as real, missed week-1 workouts, because the
 * calendar view trusted this return value alone). Deliberately NOT fixed
 * here — every write-site (markSessionComplete/rollBackOneWeek,
 * workout-completion.service.ts) and resolveBuildStartDate
 * (plan-generator.service.ts, the schedule-builder drawer's own
 * foundation) rely on this never returning below 1.
 *
 * ⚠️ For "today" callers ONLY (no explicit `asOfDate`, or one already known
 * to be `>= startDate`). A caller that can be asked about an ARBITRARY
 * date — one that might precede `startDate` — MUST call
 * `resolveWeekForDate` below instead of this function directly. The old
 * convention ("check `isDateWithinRunningPlan` yourself before calling
 * this") was tried once (2647b7f0, fixed 3 real call sites) and forgotten
 * once since (`weaverInput.ts`'s own now-fixed copy of this exact formula,
 * missing the guard). A function that makes the unsafe path unreachable
 * beats a convention that has to be remembered at every call site — that's
 * what `resolveWeekForDate` is for.
 */
export function calculateCurrentWeek(startDate: Date | string | number, asOfDate?: Date): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const now = asOfDate ? new Date(asOfDate) : new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/**
 * The safe API for any caller passing an explicit, arbitrary `asOfDate` —
 * the only entry point such a caller should use, instead of calling
 * `calculateCurrentWeek` directly. Returns `null` when `asOfDate` is before
 * `startDate` (not week 1 — no week at all; the date isn't in the plan),
 * otherwise the real week number from `calculateCurrentWeek`.
 */
export function resolveWeekForDate(
  startDate: Date | string | number,
  asOfDate: Date,
): number | null {
  if (!isDateWithinRunningPlan(startDate, asOfDate)) return null;
  return calculateCurrentWeek(startDate, asOfDate);
}
