/**
 * Phase 6a — the single, fixed reservist-league group and leaderboard scope.
 * Shared across features/arena (league tab/card), features/activity (stamps
 * the scope field), and functions/src/militaryReserveLeague.ts (join/leave,
 * a separate compilation unit — this literal must be kept in sync there
 * manually, it can't be imported across the functions/ boundary).
 *
 * Lives in src/lib/, not inside features/arena or features/activity, since
 * both domains need it and cross-domain imports between feature folders are
 * not allowed (CLAUDE.md — "No cross-domain direct imports").
 */
export const RESERVE_LEAGUE_GROUP_ID = 'military_reserve_general';

/** streaks/{uid} and dailyActivity/{uid}_{date} field name — see ranking.service.ts's scopeToField(). */
export const RESERVE_SCOPE_FIELD = 'reserveScope';
/** The only value ever written to RESERVE_SCOPE_FIELD (status-only, no org/unit — see the 6a scope decision). */
export const RESERVE_SCOPE_VALUE = 'reserve';
