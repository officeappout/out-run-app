/**
 * The chosen week for the v2 plan summary — the same engine-v2 placement the
 * days step showed, rebuilt from what that step saved in the onboarding store
 * (days, per-day windows, long-run day). Users who came through the silent
 * default (no windows) get the default morning time.
 */
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { recommendRunWeek, timesLine, type RunWeekDay } from '@/features/schedule/utils/runWeekRecommendation';
import { firstWeekRunSlots, runLevelFromAnswers, runTargetDistance } from '../../../utils/run-signup-slots';

interface SummaryStoreData {
  runningScheduleDayIndices?: number[];
  runningScheduleDayWindows?: Partial<Record<number, TimeWindow>>;
  runningLongRunDay?: number | null;
}

export function buildSummaryWeek(
  answers: Record<string, unknown>,
  data: SummaryStoreData,
): { days: RunWeekDay[]; timesLine: string | null } {
  const days = Array.isArray(data.runningScheduleDayIndices) ? data.runningScheduleDayIndices : [];
  if (days.length === 0) return { days: [], timesLine: null };
  const windows = data.runningScheduleDayWindows ?? {};
  try {
    const week = recommendRunWeek({
      slots: firstWeekRunSlots(answers, days.length),
      days,
      windows,
      preferredLongRunDay: data.runningLongRunDay ?? null,
      level: runLevelFromAnswers(answers),
      targetDistance: runTargetDistance(answers),
    });
    return { days: week.days, timesLine: timesLine(days, windows) };
  } catch {
    return { days: [], timesLine: null };
  }
}
