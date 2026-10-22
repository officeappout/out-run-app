/**
 * One authority, sources in the plan's order (§3.1 / §3.4):
 *   existing → known_routes → dataset → osm → named_ways → bike_adjacent_walk → park_loops → generated → neighbourhood → settlement_loops
 * (`known_routes` = names from web research matched to OSM geometry — first, so a
 *  matched relation / park loop keeps its citation and the later copy is the duplicate;
 *  `named_ways` = same-name OSM paths/promenades stitched into named corridors;
 *  `bike_adjacent_walk` = walking/running corridors beside bike paths (RC9 — MoT layer + OSM);
 *  `generated` = pipeline B's offline trail loops; `neighbourhood` =
 * GraphHopper foot_turns round trips from a few well-spread seeds — RC8;
 *  `settlement_loops` = regional councils only: 2–3 short GraphHopper loops
 *  (3–8 km) from the council's settlements — currently OFF (SETTLEMENT_LOOPS_ENABLED).
 *  Regional councils run real sources only: generated / neighbourhood /
 *  settlement_loops are skipped for them (REGIONAL_SKIPPED_STAGES, owner 22.10.2026).)
 * After every stage the whole pool (existing + new) is scored and the top-N
 * selection re-run (src/lib/route-score). Every FINDING source (datasets, OSM
 * relations, named corridors, park loops — real, named routes) always runs
 * (owner 22.10.2026: the goal is to find every real route in the city, not to
 * stop at a count). Only the GENERATING stages (QUOTA_GATED_STAGES) are
 * skipped once the quota minimum is met with selected (≥70) routes — nothing
 * is generated for a city that already has enough good routes.
 * Cross-stage dedup: a new route overlapping an earlier one ≥70% within 15 m
 * is dropped — the earlier (more official) stage wins.
 * Pure orchestration: every source is an injected provider. Each provider
 * sees the pool so far (park loops reuse it as "known" loops), and an
 * optional `enrich` hook adds per-route scoring inputs (shade, hourly shade;
 * RC9: urban composition / lighting / amenities / crossings) once, as the
 * route enters the pool — so every candidate is scored alike.
 */
import { isDuplicate } from '../dataset-import/overlap';
import { parsePath, type FromDocOptions } from '../route-score/from-route-doc';
import { scoreAuthorityRoutes, type AuthorityScoreRun } from '../route-score/score-authority';

export const STAGE_ORDER = ['existing', 'known_routes', 'dataset', 'osm', 'named_ways', 'bike_adjacent_walk', 'park_loops', 'generated', 'neighbourhood', 'settlement_loops'] as const;
export type StageKey = (typeof STAGE_ORDER)[number];
/** Stages that invent geometry — run only while the quota minimum is unmet. */
export const QUOTA_GATED_STAGES: ReadonlySet<StageKey> = new Set<StageKey>(['generated', 'neighbourhood']);
/**
 * Regional councils — real trails only (owner, 22.10.2026, on PR #720): the
 * synthetic stages never run for a regional council, whether or not its quota
 * is met. The quota (20–40) is a ceiling: a council with fewer real trails just
 * gets fewer, it is never padded with generated loops.
 */
export const REGIONAL_SKIPPED_STAGES: ReadonlySet<StageKey> = new Set<StageKey>(['generated', 'neighbourhood', 'settlement_loops']);
export const REGIONAL_SKIP_NOTE = 'skipped — regional: real trails only';
/**
 * Settlement loops (settlement-loops.ts) are kept in the code but OFF (owner,
 * 22.10.2026). Only regional councils ever had the stage; with it off, regional
 * councils report it as skipped and other authorities never list it.
 */
export const SETTLEMENT_LOOPS_ENABLED = false;
const isRegional = (a: { type?: string | null }) => a?.type === 'regional_council';

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
  // Only ≥70 selections count: routes the urban floor let in (RC9) never stop the generating stages,
  // and neither do settlement loops (always-added extras, owner 22.10.2026).
  const c = run.selection.counts;
  return c.selected - (c.urbanFloor ?? 0) - (c.settlementLoops ?? 0) >= run.quota.total.min;
}

export interface RunStagesOptions {
  /** Extra scoring inputs for one route (merged over the provider's own opts). May be async (RC9 urban measurement loads the OSM slice). */
  enrich?: (r: CandidateRoute) => FromDocOptions | null | undefined | Promise<FromDocOptions | null | undefined>;
  /**
   * Regional-council overrides (tests / a future owner decision): which stages
   * are skipped (default REGIONAL_SKIPPED_STAGES) and whether settlement loops
   * may run at all (default SETTLEMENT_LOOPS_ENABLED).
   */
  regionalSkip?: ReadonlySet<StageKey>;
  settlementLoopsEnabled?: boolean;
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

  const regional = isRegional(authority);
  const regionalSkip = options.regionalSkip ?? REGIONAL_SKIPPED_STAGES;
  const settlementOn = options.settlementLoopsEnabled ?? SETTLEMENT_LOOPS_ENABLED;

  for (const key of STAGE_ORDER) {
    const provider = byKey.get(key);
    // Settlement loops exist only for regional councils: no report line elsewhere (other authorities unchanged).
    if (key === 'settlement_loops' && !regional) continue;
    if (regional && (regionalSkip.has(key) || (key === 'settlement_loops' && !settlementOn))) {
      stages.push({ key, ran: false, offered: 0, added: 0, droppedDuplicate: 0, note: REGIONAL_SKIP_NOTE, selectedAfter: score.selection.counts.selected });
      continue;
    }
    if (quotaMetAfter && QUOTA_GATED_STAGES.has(key)) {
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
      const extra = await options.enrich?.(r);
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

type Enrich = NonNullable<RunStagesOptions['enrich']>;

/** Run several enrich hooks in order; later hooks' keys win. Absent hooks are skipped; all-absent ⇒ undefined. */
export function combineEnrichers(...hooks: Array<Enrich | null | undefined>): Enrich | undefined {
  const live = hooks.filter((h): h is Enrich => !!h);
  if (!live.length) return undefined;
  return async (r) => {
    let out: FromDocOptions | null = null;
    for (const h of live) {
      const x = await h(r);
      if (x) out = { ...(out ?? {}), ...x };
    }
    return out;
  };
}
