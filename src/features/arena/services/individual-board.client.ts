/**
 * Client side of the individual boards (19.10.2026) — replaces the
 * ranking.service.ts client scans for useLeaderboard. Group boards with a
 * weekly / monthly window come from the league aggregates
 * (getGroupLeagueBoard) when enable_league_aggregates is on; everything else
 * from /api/leagues/individual-board (server-side, bounded, cached).
 */
import { auth } from '@/lib/firebase';
import { readFeatureFlagOnce } from '@/lib/feature-flag-once';
import { getGroupLeagueBoard, type LeaderboardResult, type LeaderboardScope, type LeaderboardCategory, type LeaderboardTimeWindow, type LeaderboardGenderFilter } from './ranking.service';
import { groupBoardToResult, type BoardMode } from './individual-board';

export async function getIndividualBoard(p: {
  mode: BoardMode;
  scope: LeaderboardScope;
  scopeId: string | null;
  timeWindow: LeaderboardTimeWindow;
  category?: LeaderboardCategory;
  genderFilter?: LeaderboardGenderFilter;
  programId?: string | null;
  ageGroupHint?: 'minor' | 'adult';
  currentUid: string;
  currentName?: string;
  /** Group boards only: which aggregate number ranks the board. */
  groupMeasure?: 'points' | 'stepsPoints' | 'km';
  maxEntries?: number;
}): Promise<LeaderboardResult> {
  const max = p.maxEntries ?? 50;
  const gender = p.genderFilter ?? 'all';

  // Group league from the aggregates (workouts + steps, independent of the feed).
  if (
    p.scope === 'league' && p.scopeId && p.timeWindow !== 'daily' && gender === 'all' && p.groupMeasure
    && (await readFeatureFlagOnce('enable_league_aggregates'))
  ) {
    const board = await getGroupLeagueBoard({ groupId: p.scopeId, timeWindow: p.timeWindow });
    if (board) {
      return { ...groupBoardToResult(board, p.groupMeasure, p.currentUid, p.currentName, max), window: p.timeWindow, generatedAt: new Date() };
    }
  }

  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  if (!idToken) throw new Error('signed-out');
  const qs = new URLSearchParams({
    mode: p.mode,
    scope: p.scope,
    window: p.timeWindow,
    gender,
    category: p.category ?? 'overall',
    ageGroup: p.ageGroupHint ?? 'adult',
    max: String(max),
  });
  if (p.scopeId) qs.set('scopeId', p.scopeId);
  if (p.programId) qs.set('programId', p.programId);
  if (p.currentName) qs.set('name', p.currentName);
  const res = await fetch(`/api/leagues/individual-board?${qs}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) throw new Error(`individual-board ${res.status}`);
  const body = (await res.json()) as Omit<LeaderboardResult, 'generatedAt'>;
  return { ...body, generatedAt: new Date() };
}
