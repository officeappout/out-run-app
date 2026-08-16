/**
 * Pure logic split out of ScopeBattleCard.tsx so it's unit-testable without
 * jsx (this repo's vitest config is pure-logic/node only — same pattern as
 * derive-arena-access.ts and format-leaderboard-score.ts).
 */
import type { ScopeCompetitionEntry } from '@/features/arena/services/ranking.service';

/**
 * Default opponent for the "קרב השבוע" battle card: whoever's one rank
 * above you (the natural "who am I chasing" framing). If you're already
 * #1, defaults to whoever's one rank below (defend-the-lead framing)
 * instead. Returns null when there's nobody to battle (you're the only
 * entry).
 */
export function pickDefaultOpponent(entries: ScopeCompetitionEntry[], myIndex: number): ScopeCompetitionEntry | null {
  if (myIndex > 0) return entries[myIndex - 1];
  if (entries.length > 1) return entries[1];
  return null;
}
