/**
 * Pure logic for the v2 league board (design-language v2, leagues PR).
 * Plain .ts, no React/Firebase imports — unit-tested in
 * __tests__/league-board-logic.test.ts.
 *
 * Everything here derives from data the board already has (the ranked
 * entries + your own entry + the selected time window). Nothing here reads or
 * implies data that doesn't exist (no rank history, no per-period snapshots).
 */
import type { LeaderboardMode } from './format-leaderboard-score';
import { formatLeaderboardScore } from './format-leaderboard-score';

/** Rows shown before the "show all" toggle. Anyone below this is outside the
 *  visible range, and your own row gets pinned to the bottom of the board. */
export const BOARD_VISIBLE_ROWS = 10;

/** Fewer participants than this → the board shows the invite/encourage card. */
export const SPARSE_THRESHOLD = 5;

export type BoardWindow = 'daily' | 'weekly' | 'monthly';

interface RankedRow {
  rank: number;
  uid: string;
  name: string;
  totalCredit: number;
  isCurrentUser: boolean;
}

// ── Score split (number + unit, so the unit can render smaller) ─────────────

/**
 * Splits formatLeaderboardScore's string into the number and its unit, so
 * the board can show "16/900 number + 12/700 unit" without re-deriving the
 * unit rules. Falls back to the whole string as the number.
 */
export function splitScore(value: number, mode: LeaderboardMode, isSegmentMode = false): { value: string; unit: string } {
  const full = formatLeaderboardScore(value, mode, isSegmentMode);
  const i = full.indexOf(' ');
  if (i <= 0) return { value: full, unit: '' };
  return { value: full.slice(0, i), unit: full.slice(i + 1) };
}

// ── Visible range + pinned "you" row ─────────────────────────────────────────

export function getVisibleRows<T>(entries: T[], expanded: boolean, limit = BOARD_VISIBLE_ROWS): T[] {
  return expanded ? entries : entries.slice(0, limit);
}

/** True when you have an entry but it isn't among the rows on screen —
 *  either below the visible cut, or outside the fetched top-N entirely
 *  (the ranking services return your entry separately in that case). */
export function shouldPinMyRow(visible: RankedRow[], myEntry: RankedRow | null): boolean {
  if (!myEntry) return false;
  return !visible.some((e) => e.isCurrentUser || e.uid === myEntry.uid);
}

export function isSparseBoard(participantCount: number): boolean {
  return participantCount > 0 && participantCount < SPARSE_THRESHOLD;
}

// ── Distance to the next rank ────────────────────────────────────────────────

export interface NextRankTarget {
  /** The participant directly above you. */
  targetName: string;
  targetRank: number;
  /** How much more you need to pass them (strictly ahead), in the metric's unit. */
  needed: number;
  /** Your score as a fraction of theirs, 0..1 — drives the small progress bar. */
  progress: number;
}

/**
 * The person one rank above you and how much you need to pass them.
 * `needed` = gap + one step of the metric (1 for whole-number metrics —
 * days/steps/points; 0.1 for km), since a tie doesn't overtake.
 * Returns null when you're #1, unranked, or the row above isn't in the
 * fetched entries (e.g. you're far outside the top-N and the next row up
 * wasn't returned) — we never guess a score we don't have.
 * Pace modes (lower is better) aren't supported: returns null.
 */
export function computeNextRankTarget(
  entries: RankedRow[],
  myEntry: RankedRow | null,
  mode: LeaderboardMode,
  isSegmentMode = false,
): NextRankTarget | null {
  if (!myEntry || myEntry.rank <= 1 || isSegmentMode) return null;
  const above = entries.find((e) => e.rank === myEntry.rank - 1 && !e.isCurrentUser);
  if (!above) return null;
  const step = mode === 'distance' ? 0.1 : 1;
  const gap = Math.max(0, above.totalCredit - myEntry.totalCredit);
  const needed = Math.round((gap + step) * 10) / 10;
  const progress = above.totalCredit > 0 ? Math.min(1, Math.max(0, myEntry.totalCredit / above.totalCredit)) : 0;
  return { targetName: above.name, targetRank: above.rank, needed, progress };
}

/** "עוד 3 ימים כדי לעקוף את נועה" — unit follows the metric. */
export function formatNextRankLine(target: NextRankTarget, mode: LeaderboardMode): string {
  if (mode === 'general' && target.needed === 1) return `עוד יום אחד כדי לעקוף את ${target.targetName}`;
  return `עוד ${formatLeaderboardScore(target.needed, mode)} כדי לעקוף את ${target.targetName}`;
}

// ── Countdown to the end of the period ───────────────────────────────────────

/**
 * Which metrics actually reset on a calendar window. getStreakLeaderboard
 * (general) ranks the live currentStreak and getStepsLeaderboard ranks a
 * rolling 7-day average — neither has a period end, so no countdown there.
 * The feed_posts-backed metrics (distance, and the credit-based running/
 * strength) filter on getWindowStart(timeWindow).
 */
export function hasPeriodEnd(mode: LeaderboardMode): boolean {
  return mode === 'distance' || mode === 'running' || mode === 'strength';
}

/**
 * End of the current window — mirrors ranking.service.ts getWindowStart:
 * daily = local midnight, weekly = the Monday-00:00 week start + 7 days,
 * monthly = the 1st of next month. Keep in sync with getWindowStart.
 */
export function getPeriodEnd(window: BoardWindow, now: Date): Date {
  if (window === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  }
  if (window === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  }
  const day = now.getDay(); // 0 = Sunday
  const sinceMonday = day === 0 ? 6 : day - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday + 7, 0, 0, 0, 0);
}

/** "נשארו 2 ימים" / "נשאר יום אחד" / "נשארו 5 שעות" / "נשארה שעה אחת" / "נשארה פחות משעה". */
export function formatTimeLeft(end: Date, now: Date): string {
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 'התקופה הסתיימה';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return days === 1 ? 'נשאר יום אחד' : `נשארו ${days} ימים`;
  }
  if (hours >= 2) return `נשארו ${hours} שעות`;
  if (hours === 1) return 'נשארה שעה אחת';
  return 'נשארה פחות משעה';
}

// ── Head-to-head split ───────────────────────────────────────────────────────

/** Your share of the two scores, in whole percent, each side floored at 4%
 *  so a zero score still shows a sliver. Even split when both are zero. */
export function battleSplit(mine: number, theirs: number): { minePct: number; theirsPct: number } {
  const total = Math.max(0, mine) + Math.max(0, theirs);
  if (total <= 0) return { minePct: 50, theirsPct: 50 };
  const raw = Math.round((Math.max(0, mine) / total) * 100);
  const minePct = Math.min(96, Math.max(4, raw));
  return { minePct, theirsPct: 100 - minePct };
}
