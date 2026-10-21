/**
 * Week builder adapters — small shared pieces (empty week, card detail line, run titles). Pure.
 */
import { RUN_SLOT_MINUTES } from '../../engine-v2/config';
import { RUNNING_SLOT_NAME_HE } from '../../engine/runningRules';
import type { RunSlot, TimeWindow, TrainingLevel } from '../../engine-v2/types';
import { RUN_TIME_PRESETS } from '../../utils/runWeekRecommendation';
import type { WbDay, WbWeek } from '../types';

/** Seven days, `open` ones droppable, all with `window`. */
export function emptyWeek<P>(openDays: readonly number[], windows: Partial<Record<number, TimeWindow>>, fallback: TimeWindow): WbWeek<P> {
  const days: WbDay<P>[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    open: openDays.includes(dow),
    window: windows[dow] ?? fallback,
    sessions: [],
    whyHe: null,
  }));
  return { days, warningsHe: [] };
}

/** "45 דק׳ · ערב" (minutes first when known). */
export function detailLineHe(minutes: number | undefined, window: TimeWindow): string {
  const label = RUN_TIME_PRESETS[window].label;
  return minutes ? `${minutes} דק׳ · ${label}` : label;
}

/**
 * Run card title (owner-approved WR-7 rule): a beginner plan is titled by its week
 * ("שבוע 1 · ריצה-הליכה" — run-walk intervals from zero); every other run by its workout
 * type ("אימון איכות", "ריצה ארוכה" …, the app's one slot vocabulary).
 */
export function runTitleHe(slot: RunSlot, level: TrainingLevel | null, weekNumber = 1): string {
  if (level === 'beginner') return `שבוע ${weekNumber} · ריצה-הליכה`;
  return RUNNING_SLOT_NAME_HE[slot];
}

export const runMinutes = (slot: RunSlot): number => RUN_SLOT_MINUTES[slot];

/** Day windows changed in the builder → refresh the detail lines. */
export function refreshDetails<P>(wb: WbWeek<P>): WbWeek<P> {
  return {
    ...wb,
    days: wb.days.map((day) => ({ ...day, sessions: day.sessions.map((s) => ({ ...s, detailHe: detailLineHe(s.minutes, day.window) })) })),
  };
}
