/**
 * Demo world on the individual boards (demo-users-design.md PR 2, L3).
 *
 * Demo users' public rows (feed_posts, dailyActivityPublic, streaks) are
 * written with ageGroup:'demo', so no real cohort query ever returns them.
 * A demo scope (city / neighborhood / park / school id with the `demo-`
 * prefix) is ranked on the 'demo' cohort instead — and only for someone in
 * the demo world (a demo user or a registered viewer); anyone else gets an
 * empty board. League (group) boards are members-only already, so a demo
 * group's board needs no extra gate.
 *
 * Real scopes resolve exactly as before (server age doc, else the hint).
 */
import { isDemoTenantId } from '@/lib/demo';

export type BoardCohort = 'adult' | 'minor' | 'demo';

export interface BoardCohortInput {
  scope: string;
  scopeId: string;
  mode: 'credit' | 'distance' | 'steps';
  /** userAge/{uid}.ageGroup when it is 'adult' | 'minor'. */
  known: 'adult' | 'minor' | null;
  /** The client's hint (?ageGroup=). */
  hint: 'adult' | 'minor';
}

/** The board is a demo scope's own board (needs the demo-world check). */
export function isDemoBoardScope(scope: string, scopeId: string): boolean {
  return scope !== 'global' && isDemoTenantId(scopeId);
}

export function resolveBoardCohort(
  input: BoardCohortInput,
  inDemoWorld: boolean,
): { ageGroup: BoardCohort; keepDemoRows: boolean; denied: boolean } {
  const realCohort: 'adult' | 'minor' = input.known ?? (input.mode === 'steps' ? 'minor' : input.hint);
  if (!isDemoBoardScope(input.scope, input.scopeId)) {
    return { ageGroup: realCohort, keepDemoRows: false, denied: false };
  }
  if (input.scope === 'league') return { ageGroup: realCohort, keepDemoRows: true, denied: false };
  if (!inDemoWorld) return { ageGroup: realCohort, keepDemoRows: false, denied: true };
  return { ageGroup: 'demo', keepDemoRows: true, denied: false };
}
