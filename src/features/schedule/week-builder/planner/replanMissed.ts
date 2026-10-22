/**
 * "פספסת X — לסדר מחדש את השאר?" (enable_week_builder_v1, phase 2) — the engine's suggestion
 * for the rest of the week: every missed session, oldest first, goes to the earliest day still
 * ahead where it is VALID (engine-v2 hard rules through moveSession: 48h between the same
 * muscles, nothing heavy before / on the long run, …). Free days first, then a day that holds
 * only the other track. What fits nowhere stays where it was (missed, nothing is written for
 * it) with a short reason in the week's notes. Only a suggestion: nothing saves without
 * "אישור השבוע". Pure.
 */
import { moveSession } from '../moveSession';
import type { WbRules } from '../types';
import { settleStatus, type PlannerWeek } from './plannerWeek';

export interface ReplanDrop {
  sessionId: string;
  titleHe: string;
  reasonHe: string;
}

export interface ReplanResult {
  week: PlannerWeek;
  placed: Array<{ sessionId: string; toDow: number }>;
  dropped: ReplanDrop[];
}

const NO_DAY_LEFT_HE = 'לא נשאר יום פנוי השבוע';

export const dropLineHe = (d: Pick<ReplanDrop, 'titleHe' | 'reasonHe'>): string => `אין מקום השבוע ל${d.titleHe} — ${d.reasonHe}`;

/** Days still ahead a session may go to: free ones first, then shared ones, earliest first. */
function candidateDays(week: PlannerWeek, track: string): number[] {
  const ahead = week.days.filter((d) => !d.past && d.open);
  const free = ahead.filter((d) => d.sessions.length === 0).map((d) => d.dow);
  const shared = ahead.filter((d) => d.sessions.length > 0 && !d.sessions.some((s) => s.track === track)).map((d) => d.dow);
  return [...free, ...shared];
}

export function replanMissed(week: PlannerWeek, rules: WbRules): ReplanResult {
  const missed = week.days.flatMap((d) => (d.past ? d.sessions.filter((s) => s.status === 'missed' && !s.locked) : []));
  let cur = week;
  const placed: ReplanResult['placed'] = [];
  const dropped: ReplanDrop[] = [];
  for (const s of missed) {
    let reason: string | null = null;
    let done = false;
    for (const toDow of candidateDays(cur, s.track)) {
      const r = moveSession(cur, { sessionId: s.id, toDow }, rules, { normalize: settleStatus });
      if (r.ok) {
        cur = r.week;
        placed.push({ sessionId: s.id, toDow });
        done = true;
        break;
      }
      reason = reason ?? r.reasonHe;
    }
    if (!done) dropped.push({ sessionId: s.id, titleHe: s.titleHe, reasonHe: reason ?? NO_DAY_LEFT_HE });
  }
  const notes = dropped.map(dropLineHe);
  return { week: notes.length ? { ...cur, warningsHe: [...notes, ...cur.warningsHe] } : cur, placed, dropped };
}
