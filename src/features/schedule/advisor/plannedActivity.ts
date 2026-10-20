/**
 * What kind of aerobic session a userSchedule doc entry plans: a walk, a run, or neither.
 * Pure. The one place materializePlanned decides "is this entry a run?" — before this, every
 * entry with a `plannedRun` counted as a run, so a planned walk (enable_home_v2's walking
 * signup writes `plannedRun.goal` too) set runFromDoc and never showed up as a walk.
 */
import { isPlannedWalkEntry } from '../walking/walkEntry';
import type { AdvisorScheduleDay, WalkGoal } from './types';

export type AdvisorScheduleEntry = AdvisorScheduleDay['entries'][number];

/** TODO(ride): add 'ride' once planned rides are written to userSchedule (cycling track). */
export type PlannedActivity = 'walk' | 'run';

const RUN_CATEGORIES = new Set(['cardio']);

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function plannedActivityOf(e: AdvisorScheduleEntry): PlannedActivity | null {
  const cats = strList(e.scheduledCategories);
  const asScheduleEntry = {
    type: e.type,
    source: e.source,
    programIds: strList(e.programIds),
    scheduledCategories: cats,
    plannedRun: e.plannedRun,
  } as Parameters<typeof isPlannedWalkEntry>[0];
  if (isPlannedWalkEntry(asScheduleEntry)) return 'walk';
  if (!!e.plannedRun || cats.some((c) => RUN_CATEGORIES.has(c))) return 'run';
  return null;
}

/** plannedRun.goal of a walk entry ({ type: 'time' | 'distance', value }), or null. */
export function walkGoalOf(plannedRun: unknown): WalkGoal | null {
  const goal = (plannedRun as { goal?: { type?: unknown; value?: unknown } } | null | undefined)?.goal;
  const value = goal?.value;
  if ((goal?.type !== 'time' && goal?.type !== 'distance') || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return { type: goal.type, value };
}

/** The walk's Hebrew name for Kelly / the advisor ("הליכה של 30 דקות"). */
export function walkNameHe(goal: WalkGoal | null): string {
  if (!goal) return 'הליכה';
  return goal.type === 'time' ? `הליכה של ${goal.value} דקות` : `הליכה של ${goal.value} ק״מ`;
}
