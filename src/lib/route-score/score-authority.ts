/**
 * One authority end-to-end: stored route docs → inputs → scores → top-N
 * selection → route_scores docs. Pure; shared by scripts/backfill-route-score.ts
 * and the nationwide runner (W3).
 */
import { routeScoreInputFromDoc, type FromDocOptions } from './from-route-doc';
import { quotaForAuthority, type AuthorityQuota } from './quota';
import { buildRouteScoreDoc, type RouteScoreDoc } from './route-scores-doc';
import { routeScore } from './score';
import { selectTopN, type ScoredRoute, type SelectionResult } from './select';

export interface AuthorityScoreRun {
  authorityId: string | null;
  quota: AuthorityQuota;
  scored: ScoredRoute[];
  selection: SelectionResult;
  docs: RouteScoreDoc[];
  bands: { green: number; yellow: number; red: number };
  /** All scored routes per surface class (selected counts are in selection.selectedBySurface). */
  bySurface: Record<string, number>;
}

export function scoreAuthorityRoutes(
  authority: { id: string | null; type?: string | null; population?: number | null },
  routes: Array<{ id: string; data: Record<string, any>; opts?: FromDocOptions }>,
  now: Date = new Date(),
): AuthorityScoreRun {
  const nameCounts = new Map<string, number>();
  for (const r of routes) {
    const n = String(r.data?.name ?? '').trim();
    if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }
  const scored: ScoredRoute[] = routes.map((r) => {
    const n = String(r.data?.name ?? '').trim();
    const input = routeScoreInputFromDoc(r.id, r.data, { duplicateNameCount: Math.max(0, (nameCounts.get(n) ?? 1) - 1), ...r.opts });
    return { input, score: routeScore(input) };
  });
  const quota = quotaForAuthority(authority);
  const selection = selectTopN(scored, quota);
  const byId = new Map(selection.rows.map((row) => [row.id, row]));
  const docs = scored.map((s) => {
    const row = byId.get(s.input.id);
    return buildRouteScoreDoc(s.input, s.score, row ? { decision: row.decision, reason: row.reason } : null, { now });
  });
  const bands = { green: 0, yellow: 0, red: 0 };
  for (const s of scored) bands[s.score.band]++;
  const bySurface: Record<string, number> = {};
  for (const s of scored) bySurface[s.input.surfaceClass] = (bySurface[s.input.surfaceClass] ?? 0) + 1;
  return { authorityId: authority.id, quota, scored, selection, docs, bands, bySurface };
}
