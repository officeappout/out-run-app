/**
 * One authority, sources in the plan's order (§3.1 / §3.4):
 *   existing → dataset → osm → park_loops → generated → neighbourhood
 * (`generated` = pipeline B's offline trail loops; `neighbourhood` =
 * GraphHopper foot_turns round trips from a few well-spread seeds — RC8.)
 * After every stage the whole pool (existing + new) is scored and the top-N
 * selection re-run (src/lib/route-score). Once the quota minimum is met with
 * selected (≥70) routes, later stages are NOT run — in particular nothing is
 * generated for a city that already has enough good routes.
 * Cross-stage dedup: a new route overlapping an earlier one ≥70% within 15 m
 * is dropped — the earlier (more official) stage wins.
 * Pure orchestration: every source is an injected provider. Each provider
 * sees the pool so far (park loops reuse it as "known" loops), and an
 * optional `enrich` hook adds per-route scoring inputs (shade, hourly shade)
 * once, as the route enters the pool — so every candidate is scored alike.
 */
import { isDuplicate } from '../dataset-import/overlap';
import { parsePath, type FromDocOptions } from '../route-score/from-route-doc';
import { scoreAuthorityRoutes, type AuthorityScoreRun } from '../route-score/score-authority';

export const STAGE_ORDER = ['existing', 'dataset', 'osm', 'park_loops', 'generated', 'neighbourhood'] as const;
export type StageKey = (typeof STAGE_ORDER)[number];

export interface CandidateRoute {
  id: string;
  data: Record<string, any>;
  stage: StageKey;
  /** False for routes already in official_routes. */
  isNew: boolean;
  opts?: FromDocOptions;
}

export interface StageProvider {
  key: StageKey;
  /** `prior` = the pool so far (read-only). */
  run(prior: readonly CandidateRoute[]): Promise<{ routes: CandidateRoute[]; note?: string }>;
}

export interface StageReport {
  key: StageKey;
  ran: boolean;
  offered: number;
  added: number;
  droppedDuplicate: number;
  note: string | null;
  selectedAfter: number;
}

export interface AuthorityRunResult {
  authorityId: string;
  stages: StageReport[];
  /** The stage after which the quota minimum was met (null = never met). */
  quotaMetAfter: StageKey | null;
  pool: CandidateRoute[];
  score: AuthorityScoreRun;
}

type Box = [number, number, number, number];
const MARGIN_DEG = 0.0003; // ≈30 m — wider than the 15 m dedup buffer

function bbox(c: [number, number][]): Box | null {
  if (!c.length) return null;
  let a = Infinity, b = Infinity, x = -Infinity, y = -Infinity;
  for (const [lng, lat] of c) { a = Math.min(a, lng); b = Math.min(b, lat); x = Math.max(x, lng); y = Math.max(y, lat); }
  return [a - MARGIN_DEG, b - MARGIN_DEG, x + MARGIN_DEG, y + MARGIN_DEG];
}
const boxesMeet = (p: Box | null, q: Box | null) => !!p && !!q && p[0] <= q[2] && q[0] <= p[2] && p[1] <= q[3] && q[1] <= p[3];

export function quotaMet(run: AuthorityScoreRun): boolean {
  return run.selection.counts.selected >= run.quota.total.min;
}

export interface RunStagesOptions {
  /** Extra scoring inputs for one route (merged over the provider's own opts). */
  enrich?: (r: CandidateRoute) => FromDocOptions | null | undefined;
}

export async function runAuthorityStages(
  authority: { id: string; type?: string | null; population?: number | null },
  providers: StageProvider[],
  now: Date = new Date(),
  options: RunStagesOptions = {},
): Promise<AuthorityRunResult> {
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const pool: CandidateRoute[] = [];
  const geo: Array<{ coords: [number, number][]; box: Box | null }> = [];
  const stages: StageReport[] = [];
  let quotaMetAfter: StageKey | null = null;
  let score = scoreAuthorityRoutes(authority, [], now);

  for (const key of STAGE_ORDER) {
    const provider = byKey.get(key);
    if (quotaMetAfter && key !== 'existing') {
      stages.push({ key, ran: false, offered: 0, added: 0, droppedDuplicate: 0, note: `skipped — quota minimum met after "${quotaMetAfter}"`, selectedAfter: score.selection.counts.selected });
      continue;
    }
    if (!provider) {
      stages.push({ key, ran: false, offered: 0, added: 0, droppedDuplicate: 0, note: 'no provider', selectedAfter: score.selection.counts.selected });
      continue;
    }
    const { routes, note } = await provider.run(pool);
    let added = 0, dropped = 0;
    for (const r of routes) {
      if (pool.some((p) => p.id === r.id)) { dropped++; continue; }
      const coords = parsePath(r.data?.path);
      const box = bbox(coords);
      if (key !== 'existing' && geo.some((g) => boxesMeet(box, g.box) && isDuplicate(coords, g.coords))) { dropped++; continue; }
      const extra = options.enrich?.(r);
      pool.push({ ...r, stage: key, ...(extra ? { opts: { ...(r.opts ?? {}), ...extra } } : {}) });
      geo.push({ coords, box });
      added++;
    }
    score = scoreAuthorityRoutes(authority, pool.map((p) => ({ id: p.id, data: p.data, opts: p.opts })), now);
    stages.push({ key, ran: true, offered: routes.length, added, droppedDuplicate: dropped, note: note ?? null, selectedAfter: score.selection.counts.selected });
    if (!quotaMetAfter && quotaMet(score)) quotaMetAfter = key;
  }
  return { authorityId: authority.id, stages, quotaMetAfter, pool, score };
}
