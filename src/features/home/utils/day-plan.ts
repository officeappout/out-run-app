/**
 * The day's plan — ONE pure source of truth for "what is planned on a day, and in what
 * order", shared by home's daily carousel / the future-day preview and the map's
 * "מה עושים היום?" cards (enable_home_v2, owner 20.10.2026: carousel ↔ map in sync).
 *
 * Order rule (the same everywhere):
 *   1. a planned walk (the walker's pinned card),
 *   2. a quality run (intervals / tempo — "קודם הריצה"), or the run of a running-only user,
 *   3. the strength session,
 *   4. an easy / long run on a strength day (after strength — the weaver's double-day rule),
 *   5. group sessions.
 * A day with nothing planned and a configured schedule is a rest day ("recovery").
 *
 * No reads, no React: callers pass the day's entries (userSchedule) and the run entry
 * already resolved for that date (resolveRunningDayState).
 */
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';
import { plannedWalkTargetHe } from '@/features/schedule/walking/walkWeekView';
import { SKILL_DISPLAY } from '@/features/schedule/types/smartSchedule.types';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import { isQualityRunEntry, type HomeRunEntry } from './home-run-slot';
import { titleWithFocusHe, type DayFocus } from '@/features/workout-engine/services/split-decision/day-focus.utils';

export type DayTiming = 'past' | 'today' | 'future';

/** ISO 'YYYY-MM-DD' strings compare lexicographically. */
export function dayTimingOf(selectedISO: string, todayISO: string): DayTiming {
  if (selectedISO === todayISO) return 'today';
  return selectedISO < todayISO ? 'past' : 'future';
}

export type PlanKind = 'walk' | 'run' | 'strength' | 'group';

export interface PlannedDayItem {
  kind: PlanKind;
  title: string;
  subtitle?: string;
  /** Run only: a quality run leads a strength day. */
  quality?: boolean;
  completed?: boolean;
}

export interface PlannedDay {
  items: PlannedDayItem[];
  /** Nothing planned, and the user has a schedule → a rest / recovery day. */
  isRestDay: boolean;
}

export interface BuildPlannedDayInput {
  /** userSchedule entries of the day (personal + community), as read. */
  entries: readonly UserScheduleEntry[];
  /** recurringTemplate[dayLetter] — used only when the day has no personal entry. */
  templateDayIds?: readonly string[] | null;
  /** The day is in the strength scheduleDays (fallback when there is no template). */
  isStrengthScheduleDay?: boolean;
  /** The running program's id — its shadow entry in userSchedule is not a strength session. */
  runningProgramId?: string;
  /** The day's run, already resolved for that date (pending runs only). */
  run?: HomeRunEntry | null;
  /** The user has any schedule configured (strength days / template / run plan / walks). */
  hasSchedule: boolean;
  /**
   * The day's focus from the recommended split (planned-day-focus.ts) — shown in the
   * computed strength title ("אימון עליון"). A title the entry carries itself is kept.
   */
  strengthFocus?: DayFocus | null;
}

export function strengthTitleOf(programIds: readonly string[] | undefined): string {
  const id = programIds?.[0];
  const display = id ? SKILL_DISPLAY[id as keyof typeof SKILL_DISPLAY] : undefined;
  return display ? `אימון ${display.shortName}` : 'אימון כוח';
}

export function runTitleOf(run: HomeRunEntry): string {
  const label = run.category ? RUNNING_WORKOUT_CATEGORY_LABELS_HE[run.category as WorkoutCategory] : undefined;
  return run.workoutName || label || 'ריצה';
}

const timeLine = (e: Pick<UserScheduleEntry, 'startTime'>): string | undefined =>
  e.startTime ? `בשעה ${e.startTime}` : undefined;

const joinParts = (...parts: Array<string | null | undefined>): string | undefined => {
  const out = parts.filter((p): p is string => !!p);
  return out.length ? out.join(' · ') : undefined;
};

export function buildPlannedDay(input: BuildPlannedDayInput): PlannedDay {
  const { entries, templateDayIds, isStrengthScheduleDay, runningProgramId, run, hasSchedule, strengthFocus } = input;
  const computedTitle = (t: string) => titleWithFocusHe(t, strengthFocus);
  const items: PlannedDayItem[] = [];

  const personal = entries.filter((e) => e.source !== 'community');
  const walks = personal.filter((e) => isPlannedWalkEntry(e));
  for (const w of walks) {
    items.push({
      kind: 'walk',
      title: w.title || 'הליכה',
      subtitle: joinParts(plannedWalkTargetHe(w.plannedRun), timeLine(w)),
      completed: !!w.completed,
    });
  }

  const strengthEntries = personal.filter(
    (e) =>
      e.type === 'training' &&
      !isPlannedWalkEntry(e) &&
      !(runningProgramId && e.programIds?.[0] === runningProgramId) &&
      !(e.scheduledCategories ?? []).some((c) => c === 'cardio' || c === 'walking'),
  );
  const explicitRest = personal.some((e) => e.type === 'rest');
  let strength: PlannedDayItem | null = null;
  if (strengthEntries.length > 0) {
    const e = strengthEntries[0];
    strength = { kind: 'strength', title: e.title || computedTitle(strengthTitleOf(e.programIds)), subtitle: timeLine(e), completed: !!e.completed };
  } else if (!explicitRest && personal.filter((e) => !isPlannedWalkEntry(e)).length === 0) {
    const ids = (templateDayIds ?? []).filter((id) => id && id !== runningProgramId);
    if (ids.length > 0) strength = { kind: 'strength', title: computedTitle(strengthTitleOf(ids)) };
    else if (isStrengthScheduleDay) strength = { kind: 'strength', title: computedTitle('אימון כוח') };
  }

  const runItem: PlannedDayItem | null = run
    ? { kind: 'run', title: runTitleOf(run), quality: isQualityRunEntry(run), completed: run.status === 'completed' }
    : null;

  // Quality run (or a running-only day) before strength; an easy / long run after it.
  if (runItem && (runItem.quality || !strength)) items.push(runItem);
  if (strength) items.push(strength);
  if (runItem && !runItem.quality && strength) items.push(runItem);

  for (const g of entries.filter((e) => e.source === 'community')) {
    items.push({ kind: 'group', title: g.groupName || g.title || 'אימון קבוצתי', subtitle: timeLine(g), completed: !!g.completed });
  }

  return { items, isRestDay: items.length === 0 && hasSchedule };
}

/**
 * Today's order of the plan's lead cards — what home's carousel puts first and what the
 * map's carousel prepends. Only kinds with a card of their own (walk / run).
 */
export function leadPlanKinds(plan: { walk: boolean; run: { quality: boolean } | null; strength: boolean }): Array<'walk' | 'run'> {
  const out: Array<'walk' | 'run'> = [];
  if (plan.walk) out.push('walk');
  if (plan.run && (plan.run.quality || !plan.strength)) out.push('run');
  return out;
}
