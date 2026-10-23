/**
 * trail-graph/route-assembly.ts — turning sets of segments into ordered
 * routes, deduplicating them, and generating loops/out-and-backs on the
 * segment graph. Pure.
 */
import { distM } from './geo';
import type { LngLat, RouteShape, TrailSegment } from './types';

export interface OrderedRoute {
  segmentIds: string[];
  forward: boolean[];
  geometry: LngLat[];
  lengthM: number;
  /** This chain's length / total input length (1 = the input was one continuous walk). */
  continuity: number;
  /** Straight bridges inside `geometry`: always 0 for orderSegmentChains (kept for the single-chain wrapper: other chains left out). */
  gaps: number;
}

type SegLite = Pick<TrailSegment, 'id' | 'startNode' | 'endNode' | 'lengthM' | 'geometry'>;

/**
 * Orders an unordered set of segments into CONTINUOUS chains — never bridged.
 *
 * Every chain is a walk in which each segment starts at the node the previous
 * one ended on, so its polyline has no jump longer than a segment's own vertex
 * spacing. A walk starts at the westmost dead end (degree-1 node) of the
 * largest remaining component (else the first segment by id), greedily
 * follows the longest unused continuation, and ENDS when it is stuck. Whatever
 * is left (the other pieces of a relation that was clipped by a boundary or has
 * missing ways, or a spur the walk passed by) starts the next chain.
 *
 * History: this used to "jump to the nearest unused segment end" and keep
 * going, which drew a straight line across the gap (24.10.2026: "שביל גולני ·
 * קטע מטה בנימין", 11.4 km of trail with a 13.8 km chord). Callers decide what
 * to do with the pieces (import-named-routes.ts: each long-enough chain is its
 * own route part). Chains come back longest first; `gaps` is always 0 and
 * `continuity` is the chain's share of ALL the input length.
 */
export function orderSegmentChains(segs: SegLite[]): OrderedRoute[] {
  if (!segs.length) return [];
  const total = segs.reduce((a, s) => a + s.lengthM, 0);
  const used = new Set<string>();
  const chains: OrderedRoute[] = [];
  while (used.size < segs.length) {
    const rest = segs.filter((s) => !used.has(s.id));
    const byNode = new Map<number, SegLite[]>();
    for (const s of rest) {
      for (const n of [s.startNode, s.endNode]) {
        const a = byNode.get(n) ?? [];
        a.push(s);
        byNode.set(n, a);
      }
    }
    // components of what is left (to choose the start)
    const comp = new Map<string, number>();
    const compLen: number[] = [];
    for (const s of rest) {
      if (comp.has(s.id)) continue;
      const c = compLen.length;
      compLen.push(0);
      const stack = [s];
      comp.set(s.id, c);
      while (stack.length) {
        const x = stack.pop()!;
        compLen[c] += x.lengthM;
        for (const n of [x.startNode, x.endNode]) for (const y of byNode.get(n) ?? []) {
          if (!comp.has(y.id)) { comp.set(y.id, c); stack.push(y); }
        }
      }
    }
    let bigComp = 0;
    compLen.forEach((l, i) => { if (l > compLen[bigComp]) bigComp = i; });
    const deadEnds = Array.from(byNode.entries()).filter(([, a]) => a.length === 1 && comp.get(a[0].id) === bigComp);
    // Deterministic start: the dead end that is westmost (then southmost).
    let cur: number;
    if (deadEnds.length) {
      deadEnds.sort((a, b) => {
        const pa = endCoord(a[0], a[1][0]);
        const pb = endCoord(b[0], b[1][0]);
        return pa[0] - pb[0] || pa[1] - pb[1];
      });
      cur = deadEnds[0][0];
    } else {
      cur = rest.filter((s) => comp.get(s.id) === bigComp).sort((a, b) => a.id.localeCompare(b.id))[0].startNode;
    }

    const ids: string[] = [];
    const fwd: boolean[] = [];
    const geometry: LngLat[] = [];
    let len = 0;
    for (;;) {
      const options = (byNode.get(cur) ?? []).filter((s) => !used.has(s.id));
      if (!options.length) break; // stuck: this chain ends — NO jump
      // prefer the longest continuation (keeps the main line, leaves stubs for later)
      const next = options.sort((a, b) => b.lengthM - a.lengthM || a.id.localeCompare(b.id))[0];
      const forward = next.startNode === cur;
      used.add(next.id);
      ids.push(next.id);
      fwd.push(forward);
      len += next.lengthM;
      const g = forward ? next.geometry : [...next.geometry].reverse();
      geometry.push(...(geometry.length ? g.slice(1) : g));
      cur = forward ? next.endNode : next.startNode;
    }
    chains.push({ segmentIds: ids, forward: fwd, geometry, lengthM: Math.round(len * 10) / 10, continuity: total > 0 ? Math.round((len / total) * 1000) / 1000 : 0, gaps: 0 });
  }
  return chains.sort((a, b) => b.lengthM - a.lengthM || a.segmentIds[0].localeCompare(b.segmentIds[0]));
}

export const NAMED_MAIN_MIN_M = 300;
export const NAMED_PART_MIN_M = 800;

export interface ChainPlan {
  /** Chains that become routes, longest first; `rank` is 1-based among ALL chains of the relation. */
  parts: Array<{ chain: OrderedRoute; rank: number }>;
  /** Chains too short to be a route (rank, length). */
  droppedShort: Array<{ rank: number; lengthM: number }>;
  /** ALL chains of the relation (kept or not) — decides whether ids carry a `_pN` suffix. */
  partCount: number;
}

/**
 * Which chains of one relation become routes: the longest needs NAMED_MAIN_MIN_M
 * (the pipeline's usual floor), every further chain NAMED_PART_MIN_M.
 */
export function planChainParts(chains: OrderedRoute[], mainMinM = NAMED_MAIN_MIN_M, partMinM = NAMED_PART_MIN_M): ChainPlan {
  const parts: ChainPlan['parts'] = [];
  const droppedShort: ChainPlan['droppedShort'] = [];
  chains.forEach((chain, i) => {
    if (chain.lengthM >= (i === 0 ? mainMinM : partMinM)) parts.push({ chain, rank: i + 1 });
    else droppedShort.push({ rank: i + 1, lengthM: Math.round(chain.lengthM) });
  });
  return { parts, droppedShort, partCount: chains.length };
}

/**
 * Doc id of a relation route. A relation that is a single continuous chain keeps
 * `osm_rel_<id>`; one that is several chains gets `osm_rel_<id>_p<rank>` for EVERY
 * chain (even if only one is long enough) so none can collide with an older,
 * bridged `osm_rel_<id>` doc — create-only would skip the id.
 */
export function relationRouteId(relationId: number, rank: number, partCount: number): string {
  return partCount > 1 ? `osm_rel_${relationId}_p${rank}` : `osm_rel_${relationId}`;
}

/**
 * The longest continuous chain only (never bridged). `gaps` = how many other
 * chains were left out; `continuity` = the returned chain's share of the input.
 * Kept for callers that want exactly one walk; the trails pipeline uses
 * orderSegmentChains so no piece is silently dropped.
 */
export function orderSegments(segs: SegLite[]): OrderedRoute {
  const chains = orderSegmentChains(segs);
  if (!chains.length) return { segmentIds: [], forward: [], geometry: [], lengthM: 0, continuity: 0, gaps: 0 };
  return { ...chains[0], gaps: chains.length - 1 };
}

function endCoord(node: number, s: SegLite): LngLat {
  return node === s.startNode ? s.geometry[0] : s.geometry[s.geometry.length - 1];
}

export const LOOP_CLOSE_M = 150;

export function classifyShape(geometry: LngLat[], lengthM: number): RouteShape {
  if (geometry.length < 2) return 'linear';
  return lengthM > 500 && distM(geometry[0], geometry[geometry.length - 1]) <= LOOP_CLOSE_M ? 'loop' : 'linear';
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of Array.from(A)) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export const DEDUP_JACCARD = 0.8;

/**
 * Greedy dedup: items sorted best-first by `rank` (lower = better); an item
 * whose segment set has Jaccard ≥ threshold with an already-kept item is
 * merged into it (its id recorded on `mergedInto`).
 */
export function dedupBySegments<T extends { id: string; segmentIds: string[] }>(items: T[], rank: (t: T) => number, threshold = DEDUP_JACCARD): { kept: T[]; merged: Array<{ id: string; into: string; jaccard: number }> } {
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const kept: T[] = [];
  const merged: Array<{ id: string; into: string; jaccard: number }> = [];
  for (const it of sorted) {
    let hit: { into: string; j: number } | null = null;
    for (const k of kept) {
      const j = jaccard(it.segmentIds, k.segmentIds);
      if (j >= threshold) { hit = { into: k.id, j }; break; }
    }
    if (hit) merged.push({ id: it.id, into: hit.into, jaccard: Math.round(hit.j * 1000) / 1000 });
    else kept.push(it);
  }
  return { kept, merged };
}

// ── Graph search ─────────────────────────────────────────────────────────

export interface GraphEdge { seg: SegLite; cost: number }

export class SegmentGraph {
  readonly adj = new Map<number, Array<{ to: number; edge: GraphEdge; forward: boolean }>>();
  constructor(segs: SegLite[], costOf: (s: SegLite) => number = (s) => s.lengthM) {
    for (const s of segs) {
      const e = { seg: s, cost: costOf(s) };
      this.push(s.startNode, { to: s.endNode, edge: e, forward: true });
      this.push(s.endNode, { to: s.startNode, edge: e, forward: false });
    }
  }
  private push(n: number, x: { to: number; edge: GraphEdge; forward: boolean }) {
    const a = this.adj.get(n) ?? [];
    a.push(x);
    this.adj.set(n, a);
  }

  /** Dijkstra from `src`, optional per-segment cost multiplier, bounded by maxCost. */
  dijkstra(src: number, maxCost = Infinity, penalty?: Map<string, number>): { dist: Map<number, number>; prev: Map<number, { from: number; segId: string; forward: boolean }> } {
    const dist = new Map<number, number>([[src, 0]]);
    const prev = new Map<number, { from: number; segId: string; forward: boolean }>();
    const heap = new MinHeap();
    heap.push(0, src);
    while (heap.size) {
      const [d, n] = heap.pop()!;
      if (d > (dist.get(n) ?? Infinity)) continue;
      for (const { to, edge, forward } of this.adj.get(n) ?? []) {
        if (to === n) continue;
        const nd = d + edge.cost * (penalty?.get(edge.seg.id) ?? 1);
        if (nd > maxCost) continue;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          prev.set(to, { from: n, segId: edge.seg.id, forward });
          heap.push(nd, to);
        }
      }
    }
    return { dist, prev };
  }
}

export function pathTo(prev: Map<number, { from: number; segId: string; forward: boolean }>, src: number, dst: number): Array<{ segId: string; forward: boolean }> | null {
  const out: Array<{ segId: string; forward: boolean }> = [];
  let n = dst;
  let guard = 0;
  while (n !== src) {
    const p = prev.get(n);
    if (!p || guard++ > 100000) return null;
    out.push({ segId: p.segId, forward: p.forward });
    n = p.from;
  }
  return out.reverse();
}

class MinHeap {
  private a: Array<[number, number]> = [];
  get size() { return this.a.length; }
  push(k: number, v: number) {
    const a = this.a;
    a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// ── Loop / out-and-back generation ───────────────────────────────────────

export interface GeneratedCandidate {
  shape: 'loop' | 'out_and_back';
  steps: Array<{ segId: string; forward: boolean }>;
  lengthM: number;
  /** Share of the loop's length that is ridden twice (0 for a clean loop). */
  overlap: number;
  turnNode: number;
}

export const LOOP_TARGETS_M = [2500, 4000, 6000, 8000];
export const LOOP_MIN_M = 2000;
export const LOOP_MAX_M = 8000;
export const LOOP_MAX_OVERLAP = 0.25;
export const LOOP_DIVERSITY_JACCARD = 0.6;
export const LOOP_PENALTY = 8;

/**
 * Loops from `start`: for each target length L, try turnaround nodes T at
 * shortest-path distance ≈ L/3..L/2 spread over 8 bearings; outbound =
 * shortest path start→T, return = shortest path T→start with the outbound
 * segments penalised ×LOOP_PENALTY. Keep loops with overlap ≤ 25 % and
 * length 2–8 km, diverse (Jaccard < 0.6). Falls back to an out-and-back
 * (turning at a node at ≈ L/2) when no loop qualifies for a target.
 */
export function generateFromStart(graph: SegmentGraph, segById: Map<string, SegLite>, start: number, nodeCoord: (n: number) => LngLat, maxPerStart = 3): GeneratedCandidate[] {
  const out: GeneratedCandidate[] = [];
  const base = graph.dijkstra(start, LOOP_MAX_M / 2 + 500);
  const lenOf = (steps: Array<{ segId: string }>) => steps.reduce((a, s) => a + (segById.get(s.segId)?.lengthM ?? 0), 0);
  const startPt = nodeCoord(start);

  for (const L of LOOP_TARGETS_M) {
    if (out.length >= maxPerStart) break;
    // candidate turnaround nodes, best (farthest in-range) per bearing sector
    const sectors = new Map<number, { n: number; d: number }>();
    for (const [n, d] of Array.from(base.dist)) {
      if (d < L / 3 || d > L / 2) continue;
      const p = nodeCoord(n);
      const ang = Math.atan2(p[1] - startPt[1], (p[0] - startPt[0]) * Math.cos((startPt[1] * Math.PI) / 180));
      const sector = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 8) % 8;
      const cur = sectors.get(sector);
      if (!cur || d > cur.d || (d === cur.d && n < cur.n)) sectors.set(sector, { n, d });
    }
    let best: GeneratedCandidate | null = null;
    for (const { n: T } of Array.from(sectors.values()).sort((a, b) => a.n - b.n)) {
      const outSteps = pathTo(base.prev, start, T);
      if (!outSteps?.length) continue;
      const pen = new Map(outSteps.map((s) => [s.segId, LOOP_PENALTY]));
      const back = graph.dijkstra(T, LOOP_MAX_M * 2, pen);
      const backSteps = pathTo(back.prev, T, start);
      if (!backSteps?.length) continue;
      const outIds = new Set(outSteps.map((s) => s.segId));
      const shared = backSteps.filter((s) => outIds.has(s.segId)).reduce((a, s) => a + (segById.get(s.segId)?.lengthM ?? 0), 0);
      const steps = [...outSteps, ...backSteps];
      const len = lenOf(steps);
      const overlap = len > 0 ? shared * 2 / len : 1;
      if (len < LOOP_MIN_M || len > LOOP_MAX_M || overlap > LOOP_MAX_OVERLAP) continue;
      const cand: GeneratedCandidate = { shape: 'loop', steps, lengthM: len, overlap, turnNode: T };
      const score = Math.abs(len - L) / L + overlap;
      if (!best || score < Math.abs(best.lengthM - L) / L + best.overlap) best = cand;
    }
    if (!best) {
      // out-and-back to the farthest node at ≈ L/2 (deterministic: largest d, then id)
      let T: number | null = null;
      let bestD = 0;
      for (const [n, d] of Array.from(base.dist)) {
        if (d <= L / 2 && (d > bestD || (d === bestD && T != null && n < T))) { bestD = d; T = n; }
      }
      if (T != null) {
        const outSteps = pathTo(base.prev, start, T)!;
        const steps = [...outSteps, ...[...outSteps].reverse().map((s) => ({ segId: s.segId, forward: !s.forward }))];
        const len = lenOf(steps);
        if (len >= LOOP_MIN_M && len <= LOOP_MAX_M) best = { shape: 'out_and_back', steps, lengthM: len, overlap: 1, turnNode: T };
      }
    }
    if (!best) continue;
    const ids = best.steps.map((s) => s.segId);
    if (out.some((o) => jaccard(o.steps.map((s) => s.segId), ids) >= LOOP_DIVERSITY_JACCARD)) continue;
    out.push(best);
  }
  return out;
}

export function stepsGeometry(steps: Array<{ segId: string; forward: boolean }>, segById: Map<string, SegLite>): LngLat[] {
  const g: LngLat[] = [];
  for (const s of steps) {
    const seg = segById.get(s.segId);
    if (!seg) continue;
    const pts = s.forward ? seg.geometry : [...seg.geometry].reverse();
    g.push(...(g.length ? pts.slice(1) : pts));
  }
  return g;
}
