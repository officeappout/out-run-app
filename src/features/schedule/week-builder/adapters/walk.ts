/**
 * Walking signup week (walk plan, WR-3c) ⇄ week builder.
 *
 * Walks are the draggable track; a strength / run week the user already has is shown with
 * them, locked (context only — this flow never writes the other track). What a walk week
 * saves is its DAYS (saveWalkPlan over recommendWalkPlan(days)), and the plan decides which
 * walk is the long one, so after a move the host re-plans on the new days. Pure.
 */
import type { TimeWindow } from '../../engine-v2/types';
import { slugNameHe } from '../../engine-v2/programProfiles';
import { RUNNING_SLOT_NAME_HE } from '../../engine/runningRules';
import { DEFAULT_RUN_WINDOW } from '../../utils/runWeekRecommendation';
import type { ExistingRunDay, ExistingStrengthDay } from '../../add-track/addTrackProfile';
import type { WalkWeek } from '../../walking/walkPlan.types';
import { walkPieceTitle } from '../../walking/walkWeekView';
import { explainWeek } from '../explain';
import type { WbRules, WbWeek } from '../types';
import { detailLineHe, emptyWeek, runMinutes } from './shared';

export interface WalkWbContext {
  /** Days a walk may go to (the user's free days). */
  openDays: readonly number[];
  windows: Partial<Record<number, TimeWindow>>;
  /** The user's saved strength / run week (shown locked). */
  otherStrength?: readonly ExistingStrengthDay[];
  otherRuns?: readonly ExistingRunDay[];
}

/**
 * Walk weeks: a walk may share a day with the user's (locked) strength / run session, never
 * with another walk (one session per track a day, the layout rule).
 */
export const walkRules = (ctx: WalkWbContext): WbRules => ({
  maxPerDay: (ctx.otherStrength?.length ?? 0) + (ctx.otherRuns?.length ?? 0) > 0 ? 2 : 1,
  runLevel: null,
});

export function walkWeekToWb(walks: WalkWeek, ctx: WalkWbContext, rules: WbRules): WbWeek {
  const week = emptyWeek(Array.from(new Set([...ctx.openDays, ...walks.walks.map((w) => w.dow)])), ctx.windows, DEFAULT_RUN_WINDOW);
  for (const r of ctx.otherRuns ?? []) {
    week.days[r.dow].sessions.push({
      id: `other-run-${r.dow}`,
      track: 'run',
      slot: r.slot,
      titleHe: RUNNING_SLOT_NAME_HE[r.slot],
      detailHe: null,
      minutes: runMinutes(r.slot),
      locked: true,
      homeDow: r.dow,
    });
  }
  for (const s of ctx.otherStrength ?? []) {
    week.days[s.dow].sessions.push({
      id: `other-strength-${s.dow}`,
      track: 'strength',
      slug: s.slug,
      titleHe: slugNameHe(s.slug),
      detailHe: null,
      locked: true,
      homeDow: s.dow,
    });
  }
  walks.walks.forEach((w, n) => {
    const window = ctx.windows[w.dow] ?? DEFAULT_RUN_WINDOW;
    week.days[w.dow].sessions.push({
      id: `walk-${n}`,
      track: 'walk',
      long: w.isLong,
      titleHe: walkPieceTitle(w),
      detailHe: detailLineHe(w.minutes, window),
      minutes: w.minutes,
      homeDow: null,
    });
  });
  return explainWeek(week, rules);
}

/** The walk days of an edited week (what saveWalkPlan re-plans on). */
export const walkDaysOf = (week: WbWeek): number[] =>
  week.days.filter((d) => d.sessions.some((s) => s.track === 'walk')).map((d) => d.dow);
