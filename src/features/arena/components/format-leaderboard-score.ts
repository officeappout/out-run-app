/**
 * Pure score-formatting logic, split out of NeighborhoodLeaderboard.tsx so
 * it's unit-testable without jsx (this repo's vitest config is pure-logic/
 * node only — see vitest.config.ts, and derive-arena-access.ts for the same
 * pattern applied to useArenaAccess).
 */
import { formatPaceSecPerKm } from '@/features/arena/services/ranking.service';
import { leagueHeT, type LeagueT } from './league-t';

export type LeaderboardMode = 'general' | 'running' | 'strength' | 'steps' | 'distance';

/**
 * The displayed unit always follows the selected metric — never a bare
 * number, never a generic "נקודות" fallback (Stage A requirement).
 * 'strength' and non-segment 'running' rank by activityCredit
 * (durationMinutes × per-category multiplier — see CREDIT_MULTIPLIER in
 * feed.service.ts), which has no natural real-world unit, so it's labeled
 * per-metric ("נק' כוח" / "נק' ריצה") rather than left bare or mislabeled
 * as minutes (the multiplier means credit != duration).
 *
 * `isSegmentMode` is true when the running sub-filter is a specific segment
 * (not 'all') — value is then paceSecPerKm, not activityCredit.
 *
 * 'distance' is real summed distanceKm (getDistanceLeaderboard, pre-launch
 * backend task) — an actual real-world unit, unlike 'strength'/'running'
 * credit, so it's displayed as km rather than a "נק' X" points label.
 */
export function formatLeaderboardScore(
  value: number,
  mode: LeaderboardMode,
  isSegmentMode?: boolean,
  /** i18n (`leagues.score.*`): the caller's `t`; default = the Hebrew catalog (callers not migrated yet). */
  t: LeagueT = leagueHeT(),
): string {
  if (mode === 'general') return t('leagues.score.general', { value: String(value) });
  if (mode === 'steps')   return t('leagues.score.steps', { value: value.toLocaleString('he-IL') });
  if (mode === 'distance') return t('leagues.score.distance', { value: value.toLocaleString('he-IL', { maximumFractionDigits: 1 }) });
  if (mode === 'running' && isSegmentMode) {
    // value is paceSecPerKm — display as "MM:SS /ק״מ"
    return value > 0 ? t('leagues.score.pace', { pace: formatPaceSecPerKm(value) }) : '—';
  }
  if (mode === 'strength') return t('leagues.score.strength', { value: value.toLocaleString('he-IL') });
  if (mode === 'running')  return t('leagues.score.running', { value: value.toLocaleString('he-IL') });
  return value.toLocaleString('he-IL');
}
