/**
 * Individual leaderboards — pure logic (no Firebase), shared by the
 * /api/leagues/individual-board route and useLeaderboard (architecture audit,
 * 19.10.2026).
 *
 * Why: the steps / distance / points / group boards summed raw docs on the
 * CLIENT — feed_posts for a whole period (getLeaderboard,
 * getDistanceLeaderboard, getLeagueLeaderboard) or up to 5,000
 * dailyActivityPublic docs (getStepsLeaderboard) — on every board open, per
 * user. The route now does that same aggregation on the server, with a hard
 * read cap and a short shared cache, and returns only the top rows + "me".
 * The math below is the client's, moved verbatim, so the numbers don't change.
 * Group boards with an aggregate (league_scope_stats, weekly / monthly) are
 * read from it instead — groupBoardToResult.
 */
import type { GroupBoard } from './league-scope-keys';
import { postCreditForCategory } from '@/features/social/services/feed-hybrid';

export type BoardScope = 'city' | 'school' | 'park' | 'neighborhood' | 'global' | 'league' | 'reserve';
export type BoardMode = 'credit' | 'distance' | 'steps';
export type BoardWindow = 'daily' | 'weekly' | 'monthly';
export type BoardGender = 'all' | 'male' | 'female';
export type BoardCategory = 'overall' | 'cardio' | 'strength';

export interface BoardEntry {
  rank: number;
  uid: string;
  name: string;
  totalCredit: number;
  workoutCount: number;
  isCurrentUser: boolean;
}

/** One user's summed total, before ranking. */
export interface BoardRow {
  uid: string;
  name: string;
  total: number;
  count: number;
}

export const RESERVE_FIELD = 'reserveScope';

/** Same mapping as ranking.service.ts scopeToField. */
export function boardScopeField(scope: BoardScope): string | null {
  switch (scope) {
    case 'city': return 'authorityId';
    case 'school': return 'schoolId';
    case 'park': return 'parkId';
    case 'neighborhood': return 'neighborhoodId';
    case 'reserve': return RESERVE_FIELD;
    default: return null;
  }
}

/** Israel calendar parts of a moment. */
function israelParts(d: Date): { y: number; m: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { y: Number(get('year')), m: Number(get('month')), day: Number(get('day')), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) };
}

/** The UTC instant of 00:00 Israel time on a given Israel calendar day. */
function israelMidnight(y: number, m: number, day: number): Date {
  const guess = Date.UTC(y, m - 1, day, 0, 0, 0);
  // Israel is UTC+2 / +3 — find the offset at that day and correct.
  for (const off of [2, 3]) {
    const t = new Date(guess - off * 3600_000);
    const p = israelParts(t);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(t));
    if (p.y === y && p.m === m && p.day === day && hour === 0) return t;
  }
  return new Date(guess - 2 * 3600_000);
}

/**
 * Start of the window in Israel time — the client's getWindowStart (device
 * local time, the week from MONDAY), computed for Asia/Jerusalem so the
 * server (UTC) gives the same answer.
 */
export function boardWindowStart(window: BoardWindow, now: Date = new Date()): Date {
  const p = israelParts(now);
  if (window === 'monthly') return israelMidnight(p.y, p.m, 1);
  if (window === 'daily') return israelMidnight(p.y, p.m, p.day);
  const back = p.weekday === 0 ? 6 : p.weekday - 1;
  const monday = new Date(Date.UTC(p.y, p.m - 1, p.day - back));
  return israelMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

/** The steps board's 7 UTC date strings range — same as getStepsLeaderboard. */
export function stepsDateRange(now: Date = new Date()): { from: string; to: string } {
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(now.getUTCDate() - 6);
  return { from: weekAgo.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

type Doc = Record<string, unknown>;

/** feed_posts → per-user rows. credit = activityCredit; distance = distanceKm (posts without one skipped, rounded to 0.1). */
export function feedRows(docs: Doc[], mode: 'credit' | 'distance', category: string | null = null): BoardRow[] {
  const m = new Map<string, BoardRow>();
  for (const d of docs) {
    const uid = typeof d.authorUid === 'string' ? d.authorUid : '';
    if (!uid) continue;
    // A combined workout's post counts only its own part on a category board
    // (feed-hybrid.ts); every other post is its activityCredit, as before.
    const v = mode === 'credit' ? postCreditForCategory(d, category) : (Number(d.distanceKm) || 0);
    if (mode === 'distance' && v <= 0) continue;
    const name = (typeof d.authorName === 'string' && d.authorName) || '???';
    const r = m.get(uid);
    if (r) {
      r.total += v;
      r.count += 1;
    } else {
      m.set(uid, { uid, name, total: v, count: 1 });
    }
  }
  const rows = Array.from(m.values());
  if (mode === 'distance') for (const r of rows) r.total = Math.round(r.total * 10) / 10;
  return rows;
}

/** dailyActivityPublic → per-user 7-day average steps (total ÷ 7), like getStepsLeaderboard. */
export function stepsRows(docs: Doc[]): BoardRow[] {
  const m = new Map<string, { name: string; total: number }>();
  for (const d of docs) {
    const uid = typeof d.uid === 'string' ? d.uid : '';
    const steps = Number(d.steps) || 0;
    if (!uid || steps <= 0) continue;
    const r = m.get(uid);
    if (r) r.total += steps;
    else m.set(uid, { name: (typeof d.displayName === 'string' && d.displayName) || '???', total: steps });
  }
  return Array.from(m, ([uid, r]) => {
    const avg = Math.round(r.total / 7);
    return { uid, name: r.name, total: avg, count: avg };
  });
}

/**
 * Rank rows (highest total first, ties keep input order) → top N + "me".
 * "me" outside the top N keeps its real rank; with no row at all, rank =
 * participants + 1 and 0 — exactly the client's previous behaviour.
 */
export function rankBoard(
  rows: BoardRow[],
  myUid: string,
  myName: string | undefined,
  maxEntries: number,
): { entries: BoardEntry[]; myEntry: BoardEntry | null; totalParticipants: number } {
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.total - a.r.total || a.i - b.i).map(({ r }) => r);
  const toEntry = (r: BoardRow, idx: number): BoardEntry => ({
    rank: idx + 1, uid: r.uid, name: r.name, totalCredit: r.total, workoutCount: r.count, isCurrentUser: r.uid === myUid,
  });
  const entries = sorted.slice(0, maxEntries).map(toEntry);
  let myEntry = entries.find((e) => e.isCurrentUser) ?? null;
  if (!myEntry && myUid) {
    const idx = sorted.findIndex((r) => r.uid === myUid);
    myEntry = idx >= 0
      ? toEntry(sorted[idx], idx)
      : { rank: sorted.length + 1, uid: myUid, name: myName ?? 'אני', totalCredit: 0, workoutCount: 0, isCurrentUser: true };
  }
  return { entries, myEntry, totalParticipants: sorted.length };
}

/**
 * A group board from the server aggregate (league_scope_stats via
 * /api/leagues/group-board) in the leaderboard's shape. general → all league
 * points (workouts + steps); steps → the steps points; distance → km.
 */
export function groupBoardToResult(
  board: GroupBoard,
  measure: 'points' | 'stepsPoints' | 'km',
  myUid: string,
  myName: string | undefined,
  maxEntries: number,
) {
  const rows: BoardRow[] = board.members
    .map((m) => ({ uid: m.uid, name: m.name, total: m[measure], count: m[measure] }))
    .filter((r) => r.total > 0);
  return rankBoard(rows, myUid, myName, maxEntries);
}
