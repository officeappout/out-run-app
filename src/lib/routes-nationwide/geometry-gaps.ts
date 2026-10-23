/**
 * Detection + repair planning for straight "bridges" in stored official_routes
 * (24.10.2026). Pure — no I/O; the CLI (scripts/routes-nationwide/repair-route-geometry-gaps.ts)
 * reads the docs and the writer lib applies the plan.
 *
 * A route built by the OLD trails pipeline from an OSM relation with missing
 * pieces had its pieces joined by straight lines. Two independent signals:
 *   1. EXACT: the doc stores `trail.segmentIds` (`seg_<way>_<startNode>_<endNode>`) and
 *      `trail.segmentForward`. Two consecutive segments that do not meet at one
 *      node were joined by a bridge — no threshold, no false positives from a
 *      legitimately sparse straight way.
 *   2. MEASURED: the longest vertex-to-vertex step of `path` (route-geometry/gaps.ts), used
 *      for reporting and for the (non-relation) docs that carry no segment ids.
 *
 * Why the repair is "archive, then regenerate" and not "trim path in place": everything
 * else on the doc — trail.stats, segmentIds, difficulty, stars, elevationProfile/Gain,
 * maxGrade, route_scores, shade/urban enrichment — was derived from the same bridged walk.
 * A stored polyline cannot give those back correctly; the fixed pipeline can.
 */
import { GEOMETRY_GAP_SUSPICIOUS_M, haversineLngLatM, measureGaps, polylineLengthM, type GapPoint } from '../route-geometry/gaps';
import { NAMED_MAIN_MIN_M, NAMED_PART_MIN_M } from '../trail-graph/route-assembly';

export const GEOMETRY_GAP_REJECTION_REASON = 'geometry gap — regenerate';
export const REPAIR_REVIEWER = 'script:repair-route-geometry-gaps';

const SEG_ID = /^seg_(\d+)_(-?\d+)_(-?\d+)(?:_\d+)?$/;

/** Start/end OSM node of a pipeline segment id, null for any other format. */
export function segmentNodes(id: string): { start: number; end: number } | null {
  const m = SEG_ID.exec(id);
  return m ? { start: Number(m[2]), end: Number(m[3]) } : null;
}

export interface SegmentWalkReport {
  /** Consecutive pairs that do not share a node — each one is a straight bridge. */
  discontinuities: number;
  /** Indexes i where segment i → i+1 is discontinuous. */
  breaks: number[];
  /** False when any id could not be parsed (the exact test is then unavailable). */
  parsed: boolean;
}

export function checkSegmentWalk(segmentIds: unknown, segmentForward: unknown): SegmentWalkReport {
  const ids = Array.isArray(segmentIds) ? segmentIds.filter((x): x is string => typeof x === 'string') : [];
  const fwd = Array.isArray(segmentForward) ? segmentForward : [];
  if (ids.length < 2 || fwd.length !== ids.length) return { discontinuities: 0, breaks: [], parsed: ids.length >= 2 ? false : true };
  const nodes = ids.map(segmentNodes);
  if (nodes.some((n) => !n)) return { discontinuities: 0, breaks: [], parsed: false };
  const breaks: number[] = [];
  for (let i = 0; i + 1 < ids.length; i++) {
    const a = nodes[i]!, b = nodes[i + 1]!;
    const endOfA = fwd[i] === false ? a.start : a.end;
    const startOfB = fwd[i + 1] === false ? b.end : b.start;
    if (endOfA !== startOfB) breaks.push(i);
  }
  return { discontinuities: breaks.length, breaks, parsed: true };
}

export interface GapDocInput {
  id: string;
  authorityId: string | null;
  name: string;
  origin: string | null;
  status: string | null;
  published: boolean;
  km: number;
  path: Array<readonly [number, number]>;
  /** trail.kind */
  trailKind: string | null;
  segmentIds: unknown;
  segmentForward: unknown;
  /** trail.stats.lengthM — the real trail length the pipeline summed (bridges excluded). */
  trailLengthM: number | null;
}

export interface GapDocReport {
  id: string;
  /** Pending + unpublished + osm_import: the only docs a repair may touch. */
  inRepairScope: boolean;
  /** Exact bridges from the segment walk (null = not a relation doc / ids unparsable). */
  discontinuities: number | null;
  maxGapM: number;
  gapsOver500: number;
  gapsOver200: number;
  gapsOver2k: number;
  pathLengthM: number;
  /** Path length minus the real trail length: what the bridges add (m); null without trail.stats. */
  bridgeM: number | null;
  /** The decision. */
  affected: boolean;
  /** Why: exact walk break, or a path step with no segment ids to verify it. */
  basis: 'segment_walk' | 'path_gap_unverified' | 'none';
}

export function isRepairScope(d: Pick<GapDocInput, 'origin' | 'status' | 'published'>): boolean {
  return d.origin === 'osm_import' && d.status === 'pending' && d.published === false;
}

export function analyzeGapDoc(d: GapDocInput): GapDocReport {
  const g = measureGaps(d.path, GEOMETRY_GAP_SUSPICIOUS_M);
  const over = (t: number) => measureGaps(d.path, t).gapCount;
  const walk = d.trailKind === 'osm_relation' ? checkSegmentWalk(d.segmentIds, d.segmentForward) : null;
  const exact = walk && walk.parsed ? walk.discontinuities : null;
  let basis: GapDocReport['basis'] = 'none';
  if (exact != null && exact > 0) basis = 'segment_walk';
  else if (exact == null && g.maxGapM >= GEOMETRY_GAP_SUSPICIOUS_M) basis = 'path_gap_unverified';
  return {
    id: d.id,
    inRepairScope: isRepairScope(d),
    discontinuities: exact,
    maxGapM: Math.round(g.maxGapM),
    gapsOver500: g.gapCount,
    gapsOver200: over(200),
    gapsOver2k: over(2000),
    pathLengthM: Math.round(g.lengthM),
    bridgeM: d.trailLengthM != null ? Math.max(0, Math.round(g.lengthM - d.trailLengthM)) : null,
    affected: basis !== 'none',
    basis,
  };
}

export interface PartEstimate {
  /** Estimated continuous pieces (m), longest first. */
  pieceM: number[];
  /** How many would become routes in the fixed pipeline (longest ≥ 300 m, others ≥ 800 m). */
  expectedRoutes: number;
}

/**
 * ESTIMATE only (the real split happens in the pipeline from the OSM segments): cut the stored path at its
 * `breaks` longest steps — the bridges are by far the longest steps of a bridged walk.
 */
export function estimateParts(path: ReadonlyArray<GapPoint>, breaks: number): PartEstimate {
  if (path.length < 2 || breaks <= 0) return { pieceM: [polylineLengthM(path)], expectedRoutes: polylineLengthM(path) >= NAMED_MAIN_MIN_M ? 1 : 0 };
  const steps = path.slice(1).map((p, i) => ({ i, d: haversineLngLatM(path[i], p) })).sort((a, b) => b.d - a.d || a.i - b.i).slice(0, breaks);
  const cuts = new Set(steps.map((s) => s.i));
  const pieces: number[] = [];
  let cur = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    if (cuts.has(i)) { pieces.push(cur); cur = 0; } else cur += haversineLngLatM(path[i], path[i + 1]);
  }
  pieces.push(cur);
  pieces.sort((a, b) => b - a);
  return { pieceM: pieces.map(Math.round), expectedRoutes: pieces.filter((m, i) => m >= (i === 0 ? NAMED_MAIN_MIN_M : NAMED_PART_MIN_M)).length };
}
