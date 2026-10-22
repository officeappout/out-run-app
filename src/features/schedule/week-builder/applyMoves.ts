/**
 * Week builder — apply a list of moves (Kelly's builder proposal, enable_week_builder_v1) to the
 * week on screen, one by one, through the host's own engine (engine.move: the same validation
 * and normalize a drag gets). A move the engine refuses is skipped with its reason; the rest
 * still land. Returns the days whose sessions changed (to highlight). Pure.
 */
import { dropReasonHe } from './dropReasons';
import { findSession } from './layout';
import type { WbWeek, WeekBuilderEngine } from './types';

export interface WbPlannedMove {
  sessionId: string;
  to: number;
}

export interface WbApplyResult<P> {
  week: WbWeek<P>;
  /** Days (0 = Sunday) whose sessions differ from the week before. */
  changedDows: number[];
  /** Hebrew reasons of the moves that were skipped, in order. */
  skippedHe: string[];
}

const dayIds = <P>(week: WbWeek<P>, dow: number) => week.days[dow].sessions.map((s) => s.id).join('|');

export function applyPlannedMoves<P>(week: WbWeek<P>, moves: readonly WbPlannedMove[], engine: WeekBuilderEngine<P>): WbApplyResult<P> {
  let next = week;
  const skippedHe: string[] = [];
  for (const m of moves) {
    if (!findSession(next, m.sessionId)) {
      skippedHe.push(dropReasonHe('missing'));
      continue;
    }
    const r = engine.move(next, { sessionId: m.sessionId, toDow: m.to });
    if (r.ok) next = r.week;
    else skippedHe.push(r.reasonHe);
  }
  const changedDows = week.days.map((d) => d.dow).filter((dow) => dayIds(week, dow) !== dayIds(next, dow));
  return { week: next, changedDows, skippedHe };
}
