/**
 * Week builder — the layout side of a move: find, move or swap a session, order a day, and
 * read the week as the engine's PlacedSession grid. Pure; validation lives in validate.ts.
 */
import { isKeySlot } from '../engine-v2/config';
import type { PlacedSession } from '../engine-v2/types';
import type { WbDay, WbMove, WbSession, WbWeek } from './types';

export function findSession<P>(week: WbWeek<P>, id: string): { dow: number; index: number; session: WbSession<P> } | null {
  for (const day of week.days) {
    const index = day.sessions.findIndex((s) => s.id === id);
    if (index >= 0) return { dow: day.dow, index, session: day.sessions[index] };
  }
  return null;
}

/**
 * In-day order, the engine's own rule (finalize.orderDay, H5): a quality / long run before
 * strength; otherwise run, then strength, then a walk. Stable within a track.
 */
export function orderDaySessions<P>(sessions: readonly WbSession<P>[]): WbSession<P>[] {
  const rank = (s: WbSession<P>) => (s.track === 'run' ? (isKeySlot(s.slot) ? 0 : 1) : s.track === 'strength' ? 2 : 3);
  return sessions.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
}

export type LayoutMoveOutcome<P> =
  | { kind: 'moved'; week: WbWeek<P>; swappedWith: string | null }
  | { kind: 'noop' }
  | { kind: 'missing' }
  | { kind: 'locked' }
  | { kind: 'closed' }
  | { kind: 'full' };

const withSessions = <P>(day: WbDay<P>, sessions: WbSession<P>[]): WbDay<P> => ({ ...day, sessions: orderDaySessions(sessions) });

/**
 * Moves one session to `toDow`. A day holds at most one session per track (the engine's grid:
 * one run + one main strength a day) and at most `maxPerDay` sessions; when the target is full
 * the move becomes a swap with the target's unlocked session of the same track (else with its
 * only unlocked session). Never validates training rules — see validate.ts.
 */
export function applyMove<P>(week: WbWeek<P>, move: WbMove, maxPerDay: number): LayoutMoveOutcome<P> {
  const from = findSession(week, move.sessionId);
  if (!from) return { kind: 'missing' };
  if (from.dow === move.toDow) return { kind: 'noop' };
  if (from.session.locked) return { kind: 'locked' };
  const target = week.days[move.toDow];
  if (!target?.open) return { kind: 'closed' };

  const s = from.session;
  const sameTrack = target.sessions.find((x) => x.track === s.track);
  const room = target.sessions.length < maxPerDay && !sameTrack;
  let swap: WbSession<P> | null = null;
  if (!room) {
    const candidates = target.sessions.filter((x) => !x.locked);
    swap = sameTrack && !sameTrack.locked ? sameTrack : candidates.length === 1 ? candidates[0] : null;
    if (!swap) return { kind: 'full' };
    // The swapped session must fit where the dragged one came from.
    const source = week.days[from.dow];
    const left = source.sessions.filter((x) => x.id !== s.id);
    if (!source.open || left.some((x) => x.track === swap!.track) || left.length + 1 > maxPerDay) return { kind: 'full' };
  }

  const days = week.days.map((day) => {
    if (day.dow === from.dow) {
      const left = day.sessions.filter((x) => x.id !== s.id);
      return withSessions(day, swap ? [...left, swap] : left);
    }
    if (day.dow === move.toDow) {
      const kept = swap ? day.sessions.filter((x) => x.id !== swap!.id) : day.sessions;
      return withSessions(day, [...kept, s]);
    }
    return day;
  });
  return { kind: 'moved', week: { ...week, days }, swappedWith: swap?.id ?? null };
}

/** The week as engine sessions per day (what validateLayout / dayReasons read). */
export function toPlacedDays<P>(week: WbWeek<P>): PlacedSession[][] {
  return week.days.map((day) =>
    day.sessions.map((s): PlacedSession => {
      if (s.track === 'run') return { kind: 'run', slot: s.slot, ...(s.minutes ? { minutes: s.minutes } : {}) };
      if (s.track === 'strength') return { kind: 'strength', slug: s.slug };
      return { kind: 'walk', ...(s.minutes ? { minutes: s.minutes } : {}) };
    }),
  );
}

export const openDaysOf = <P>(week: WbWeek<P>): boolean[] => week.days.map((d) => d.open);

/** Days that hold at least one session, Sunday first. */
export const trainingDowsOf = <P>(week: WbWeek<P>): number[] => week.days.filter((d) => d.sessions.length > 0).map((d) => d.dow);
