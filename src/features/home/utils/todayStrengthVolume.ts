/**
 * Today's strength volume — pure aggregation over the weekly volume store's
 * session logs, bucketed to a single calendar day.
 *
 * Shared primitive (Daily Strength Ring · Layer A) — also the Phase-1
 * partial/full signal source. Kept as a pure function (no React, no store) so
 * it is unit-testable under the node/vitest environment; `useTodayStrengthVolume`
 * is the thin hook wrapper.
 *
 * Isolation law: recovery sessions (`isRecovery === true`) are excluded — they
 * never feed the strength ring or the level/volume budget.
 *
 * Caveats handled:
 *   - `completedAt` is a `Date` in-session but a string after JSON persist-
 *     rehydrate (the store has no Date reviver) → wrapped in `new Date()`.
 *   - Multiple sessions on the same day are summed (2-workouts-in-a-day case).
 */

import type { SessionLog } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';

export interface TodayStrengthVolume {
  /** Sum of completed sets across today's non-recovery sessions. */
  setsCompleted: number;
  /** Sum of planned sets across today's non-recovery sessions. */
  setsPlanned: number;
  /** Completed sets per domain (e.g. { push: 4, pull: 3 }). */
  byDomain: Record<string, number>;
  /** Number of today's non-recovery sessions. */
  sessionCount: number;
}

const EMPTY: TodayStrengthVolume = {
  setsCompleted: 0,
  setsPlanned: 0,
  byDomain: {},
  sessionCount: 0,
};

/**
 * Aggregate today's completed strength volume from raw session logs.
 *
 * @param logs     `useWeeklyVolumeStore.sessionLogs`.
 * @param dateISO  Target day (local `YYYY-MM-DD`). Defaults to today.
 */
export function summarizeTodayStrengthVolume(
  logs: readonly SessionLog[] | undefined | null,
  dateISO?: string,
): TodayStrengthVolume {
  if (!logs || logs.length === 0) return { ...EMPTY, byDomain: {} };

  const dayKey = dateISO ?? toISODate(new Date());

  let setsCompleted = 0;
  let setsPlanned = 0;
  let sessionCount = 0;
  const byDomain: Record<string, number> = {};

  for (const log of logs) {
    if (!log || log.isRecovery) continue; // isolation law: recovery excluded

    // completedAt may be a Date (in-session) or an ISO string (post-rehydrate).
    const when = new Date(log.completedAt);
    if (Number.isNaN(when.getTime())) continue;
    if (toISODate(when) !== dayKey) continue;

    setsCompleted += log.setsCompleted ?? 0;
    setsPlanned += log.setsPlanned ?? 0;
    sessionCount += 1;

    if (log.domainSets) {
      for (const [domain, sets] of Object.entries(log.domainSets)) {
        byDomain[domain] = (byDomain[domain] ?? 0) + (sets ?? 0);
      }
    }
  }

  return { setsCompleted, setsPlanned, byDomain, sessionCount };
}
