/**
 * Planner save scope (enable_week_builder_v1, phase 2) → what to write. Pure.
 *
 *   'week'    (רק השבוע)      — date overrides for this week only: every session that changed
 *                                day moves its userSchedule entries from its date to the new one
 *                                (the agenda drag's "move only this workout", moveScheduleEntry).
 *   'forward' (מעכשיו והלאה)  — the same date moves, plus the recurring template: the strength
 *                                ids of every moved day go to the new weekday (mergeDayItems —
 *                                running ids on a day stay put) and lifestyle.scheduleDays swaps
 *                                the letters, like the agenda's "move the whole schedule".
 *                                A missed session moved from a past day is a this-week fix,
 *                                never a new weekly rule — it moves by date only.
 *   runs (both scopes)          — a run moved inside the current week is a per-date run move
 *                                (running.runMoves, utils/runWeekMoves.ts) for THIS week only;
 *                                runs never change the weekly rule from here.
 */
import { mergeDayItems } from '../../services/mergeDayItems';
import { DAY_LETTERS } from '../../types/smartSchedule.types';
import type { RunDateMove } from '../../utils/runWeekMoves';
import type { PlannerWbData, PlannerWeek } from './plannerWeek';

export type PlannerSaveScope = 'week' | 'forward';

export interface PlannerMove {
  sessionId: string;
  kind: PlannerWbData['kind'];
  fromDate: string;
  toDate: string;
  entryIds: string[];
  programIds: string[];
  /** Moved off a day that has passed (a missed session). */
  fromPast: boolean;
}

export interface PlannerSavePlan {
  moves: PlannerMove[];
  /** 'forward' only, and only when a weekday really changed. */
  template: { recurringTemplate: Record<string, string[]>; scheduleDays: string[] } | null;
}

export function plannerMoves(edited: PlannerWeek, keys: readonly string[], todayKey: string): PlannerMove[] {
  const out: PlannerMove[] = [];
  for (const day of edited.days) {
    for (const s of day.sessions) {
      if (!s.data || s.locked) continue;
      const toDate = keys[day.dow];
      if (!toDate || toDate === s.data.date) continue;
      out.push({
        sessionId: s.id,
        kind: s.data.kind,
        fromDate: s.data.date,
        toDate,
        entryIds: [...s.data.entryIds],
        programIds: [...s.data.programIds],
        fromPast: s.data.date < todayKey,
      });
    }
  }
  return out;
}

/** Run moves → the per-date run moves to store (this week only). */
export const runDateMoves = (moves: readonly PlannerMove[]): RunDateMove[] =>
  moves.filter((m) => m.kind === 'run').map((m) => ({ from: m.fromDate, to: m.toDate }));

/** Moves of userSchedule entries (strength + walks). */
export const entryMoves = (moves: readonly PlannerMove[]): PlannerMove[] => moves.filter((m) => m.kind !== 'run');

/** Moves that may change the weekly rule: strength, from a day still ahead. */
export const recurringMoves = (moves: readonly PlannerMove[]): PlannerMove[] => moves.filter((m) => m.kind === 'strength' && !m.fromPast);

const letterOf = (key: string): string => DAY_LETTERS[new Date(`${key}T12:00:00Z`).getUTCDay()];

export interface TemplateNow {
  recurringTemplate: Record<string, string[]>;
  scheduleDays: string[];
  isStrengthId: (id: string) => boolean;
}

/** The weekday permutation of the moved strength days, applied to the template + scheduleDays; null = no change. */
export function templateAfterMoves(moves: readonly PlannerMove[], now: TemplateNow): PlannerSavePlan['template'] {
  const pairs = recurringMoves(moves).map((m) => ({ from: letterOf(m.fromDate), to: letterOf(m.toDate) }));
  const strengthOf = (letter: string) => (now.recurringTemplate[letter] ?? []).filter(now.isStrengthId);
  const moving = pairs.filter((p) => strengthOf(p.from).length > 0);
  if (moving.length === 0) return null;

  const next: Record<string, string[]> = { ...now.recurringTemplate };
  const incoming = new Map(moving.map((p) => [p.to, strengthOf(p.from)]));
  const touched = new Set(moving.flatMap((p) => [p.from, p.to]));
  touched.forEach((letter) => {
    const ids = mergeDayItems(now.recurringTemplate[letter] ?? [], incoming.get(letter) ?? [], 'strength', now.isStrengthId);
    if (ids.length) next[letter] = ids;
    else delete next[letter];
  });

  const days = new Set(now.scheduleDays);
  const vacated = moving.filter((p) => days.has(p.from)).map((p) => p.from);
  const filled = moving.filter((p) => days.has(p.from)).map((p) => p.to);
  vacated.forEach((l) => days.delete(l));
  filled.forEach((l) => days.add(l));
  const scheduleDays = DAY_LETTERS.filter((l) => days.has(l));
  return { recurringTemplate: next, scheduleDays };
}

export function planPlannerSave(
  edited: PlannerWeek,
  keys: readonly string[],
  todayKey: string,
  scope: PlannerSaveScope,
  now: TemplateNow,
): PlannerSavePlan {
  const moves = plannerMoves(edited, keys, todayKey);
  return { moves, template: scope === 'forward' ? templateAfterMoves(moves, now) : null };
}
