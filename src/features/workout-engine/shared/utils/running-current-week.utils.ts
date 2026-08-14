import { RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED } from '@/config/feature-flags';
import { calculateCurrentWeek } from '@/features/workout-engine/core/services/workout-completion.service';

/**
 * resolveRunningCurrentWeek — single choke point for every DISPLAY (read)
 * site that needs "which week of the running program is this," gated by
 * RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED (see feature-flags.ts for the full
 * writeup of the staleness bug this fixes). The two WRITE sites
 * (markSessionComplete, rollBackOneWeek in workout-completion.service.ts)
 * do NOT call this — they already call calculateCurrentWeek directly and
 * are unaffected by this flag.
 *
 * FALSE (default): returns `storedWeek` completely untouched (same value,
 * same nullish-ness) — byte-identical to reading `activeProgram.currentWeek`
 * directly.
 *
 * TRUE: recomputes fresh from `startDate` via the canonical
 * calculateCurrentWeek, so a user who opens the app before that week's
 * first stored-field-updating event (completing a run / "back one week")
 * still sees the calendar-correct week. Falls back to `storedWeek` if
 * `startDate` itself is missing.
 *
 * `asOfDate` — forwarded to calculateCurrentWeek for "what week does THIS
 * calendar day fall in" (e.g. RollingAgenda/TrainingPlannerOverlay resolving
 * the week for a specific rendered week-group, not necessarily today). Omit
 * for "what week is it today," which is what every other call site wants.
 *
 * `storedWeek` accepts `null` as well as `undefined` so callers that have no
 * meaningful stored fallback (RollingAgenda/TrainingPlannerOverlay's
 * `weekNumber: number | null` badge, which today is always `null`) can pass
 * `null` and get it back unchanged while the flag is off.
 */
export function resolveRunningCurrentWeek(
  startDate: Date | string | number | null | undefined,
  storedWeek: number | null | undefined,
  asOfDate?: Date,
): number | null | undefined {
  if (!RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED || !startDate) return storedWeek;
  return calculateCurrentWeek(startDate, asOfDate);
}
