/**
 * Run signup week (engine v2 via runWeekRecommendation) ⇄ week builder.
 *
 * What a run week saves is its DAYS and the LONG-RUN day (buildRunScheduleWrite +
 * runningLongRunDay); the app places the slots on those days with the same engine call
 * (runWeekByType, enable_home_v2). So after a valid drop the week is re-placed by the engine
 * on the new days with the long run where the user put it — the cards always show what the
 * plan will really do. Pure.
 */
import type { RunSlot, TimeWindow, TrainingLevel } from '../../engine-v2/types';
import { DEFAULT_RUN_WINDOW, recommendRunWeek, type RunWeekRecommendation } from '../../utils/runWeekRecommendation';
import { explainWeek } from '../explain';
import type { WbRules, WbSession, WbWeek } from '../types';
import { detailLineHe, emptyWeek, runMinutes, runTitleHe } from './shared';

export interface RunWbContext {
  /** Days a run may go to (the user's free days). */
  openDays: readonly number[];
  windows: Partial<Record<number, TimeWindow>>;
  level: TrainingLevel;
  targetDistance: string;
  /** Week-1 slots of the plan (any order). */
  slots: RunSlot[];
}

/** The long-run day the user chose (null = the engine's default: the last free day). */
export type ChosenLongRunDay = number | null;

/** Stable ids by slot + occurrence, so a re-placed week keeps its keys. */
function runSessions(rec: RunWeekRecommendation, ctx: RunWbContext): Array<{ dow: number; s: WbSession }> {
  const seen = new Map<RunSlot, number>();
  return rec.days.map((d) => {
    const k = seen.get(d.slot) ?? 0;
    seen.set(d.slot, k + 1);
    const window = ctx.windows[d.dow] ?? DEFAULT_RUN_WINDOW;
    const minutes = runMinutes(d.slot);
    return {
      dow: d.dow,
      s: {
        id: `run-${d.slot}-${k}`,
        track: 'run' as const,
        slot: d.slot,
        titleHe: runTitleHe(d.slot, ctx.level),
        detailHe: detailLineHe(minutes, window),
        minutes,
        homeDow: null,
      },
    };
  });
}

export function runWeekToWb(rec: RunWeekRecommendation, ctx: RunWbContext, rules: WbRules, chosenLongRun: ChosenLongRunDay = null): WbWeek {
  const week = emptyWeek(Array.from(new Set([...ctx.openDays, ...rec.days.map((d) => d.dow)])), ctx.windows, DEFAULT_RUN_WINDOW);
  for (const { dow, s } of runSessions(rec, ctx)) week.days[dow].sessions.push(s);
  week.warningsHe = [...rec.warningsHe];
  return explainWeek(week, { ...rules, preferredLongRunDay: chosenLongRun });
}

/** The run days and the long-run day of an edited week. */
export function runDaysOf(week: WbWeek): { days: number[]; longRunDow: number | null } {
  const days = week.days.filter((d) => d.sessions.some((s) => s.track === 'run')).map((d) => d.dow);
  const longRunDow = week.days.find((d) => d.sessions.some((s) => s.slot === 'long_run'))?.dow ?? null;
  return { days, longRunDow };
}

/** The engine's week for these days and long-run day (what the plan will really run). */
export function recommendRunWbWeek(ctx: RunWbContext, days: number[], longRunDow: number | null, rules: WbRules): WbWeek {
  const rec = recommendRunWeek({
    slots: ctx.slots,
    days,
    windows: ctx.windows,
    preferredLongRunDay: longRunDow,
    level: ctx.level,
    targetDistance: ctx.targetDistance,
  });
  return runWeekToWb(rec, ctx, rules, longRunDow);
}

/** The caps a run week is validated by: one run a day, the chosen number of run days. */
export const runRules = (frequency: number, level: TrainingLevel): WbRules => ({ maxPerDay: 1, maxTrainingDays: frequency, runLevel: level });

/**
 * The long-run day after an edit: the day the user dragged the long run to, else the day
 * they had already chosen (null = the engine's default, the last free day).
 */
export function longRunAfterEdit(newLongDow: number | null, longRun: { chosen: number | null; current: number | null }): number | null {
  return newLongDow !== longRun.current ? newLongDow : longRun.chosen;
}

/**
 * moveSession options for a run week: re-place on the new days by the engine, the long run
 * where the user put it (a moved long run becomes the user's choice) — exactly the week the
 * flow will rebuild from the saved days + long-run day.
 */
export function runMoveOptions(ctx: RunWbContext, rules: WbRules, longRun: { chosen: number | null; current: number | null }) {
  return {
    normalize: (week: WbWeek): WbWeek => {
      const { days, longRunDow } = runDaysOf(week);
      return recommendRunWbWeek(ctx, days, longRunAfterEdit(longRunDow, longRun), rules);
    },
    explain: (week: WbWeek): WbWeek => week,
  };
}
