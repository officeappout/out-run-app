/**
 * leaderboard-scope — PURE leaderboard vocabulary shared by the client (ranking.service) and the
 * server engine (feed-board.core): scope / category / window / gender types, scope → field,
 * and the window start. Moved verbatim out of ranking.service (rules-prep, 26.10).
 */
import { RESERVE_SCOPE_FIELD } from '@/lib/military-reserve-league';

export type LeaderboardScope = 'city' | 'school' | 'park' | 'neighborhood' | 'global' | 'league' | 'tenant' | 'reserve';
export type LeaderboardCategory = 'overall' | 'cardio' | 'strength';
export type LeaderboardTimeWindow = 'daily' | 'weekly' | 'monthly';
export type LeaderboardGenderFilter = 'all' | 'male' | 'female';

/**
 * Maps a leaderboard scope to the Firestore field that narrows a query to
 * it. Single source of truth for all scoped queries — adding a new scope
 * (or fixing one) only happens once.
 *
 * 'global' and 'league' span all authorities (no narrowing field); 'tenant'
 * is handled entirely by getTenantLeaderboard (leaderboard_shards, not
 * feed_posts/streaks/dailyActivity) and never reaches a query built here.
 */
export function scopeToField(scope: LeaderboardScope): string | null {
  switch (scope) {
    case 'city': return 'authorityId';
    case 'school': return 'schoolId';
    case 'park': return 'parkId';
    case 'neighborhood': return 'neighborhoodId';
    // Phase 6a reservist league — status-only ('reserve'), not org/unit
    // scoped. Stamped on streaks/dailyActivity by useActivityStore.syncToServer
    // the same way authorityId/neighborhoodId already are; not sensitive
    // (David, 6a scope decision) so no rules change accompanies this.
    case 'reserve': return RESERVE_SCOPE_FIELD;
    case 'global':
    case 'league':
    case 'tenant':
      return null;
  }
}

function getDayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // distance to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** Device-local window start (the client computes it and sends it to the server as `since`). */
export function getWindowStart(window: LeaderboardTimeWindow): Date {
  if (window === 'daily') return getDayStart();
  return window === 'weekly' ? getWeekStart() : getMonthStart();
}
