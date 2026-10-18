/**
 * trail-graph/segment-graph.ts — OSM ways → trail segments. Pure (all I/O
 * — DEM, polygons, lamps — is injected via SegmentContext).
 *
 * A SEGMENT is a maximal chain of way pieces between two graph junctions
 * along which nothing that matters changes: same raw tags that drive our
 * attributes (highway/surface/tracktype/lit/sac/mtb/name/access) and the
 * same route-relation membership. So:
 *   1. split every included way at interior junction nodes (node shared by
 *      ≥3 way-ends, counting an interior pass-through as 2);
 *   2. merge pieces back together through nodes where exactly two piece
 *      ends meet AND their signatures are equal.
 * Membership changes therefore always land on a segment boundary — a named
 * route is an exact union of segments, never a partial one.
 */
import type { SmoothedProfile } from '@/lib/dem-tile-cache/elevation-profile';
import { polylineLengthM } from '@/lib/dem-tile-cache/elevation-profile';
import { bicycleAllowed, footAllowed, isTrailWay, resolveLit, resolveSurface, trailColour } from './tags';
import { OSM_LICENSE, type LngLat, type OsmData, type OsmRelation, type OsmWay, type TrailSegment } from './types';

export const ROUTE_RELATION_KINDS = new Set(['hiking', 'foot', 'walking', 'mtb', 'bicycle']);

export function isTrailRouteRelation(r: OsmRelation): boolean {
  return r.tags.type === 'route' && ROUTE_RELATION_KINDS.has(r.tags.route ?? '');
}

export interface SegmentContext {
  /** Share (0–1) of the line inside built-up polygons. */
  builtUpShare(line: LngLat[]): number;
  /** Share (0–1) of the line within LAMP_RADIUS_M of a street lamp. */
  lampCoverage(line: LngLat[]): number;
  profile(line: LngLat[]): SmoothedProfile | null;
}

export interface RouteMembership {
  /** wayId → sorted relation ids */
  byWay: Map<number, number[]>;
  info: Map<number, { colour: string | null; ref: string | null }>;
}

export function buildRouteMembership(data: OsmData): RouteMembership {
  const byWay = new Map<number, number[]>();
  const info = new Map<number, { colour: string | null; ref: string | null }>();
  for (const r of Array.from(data.relations.values())) {
    if (!isTrailRouteRelation(r)) continue;
    info.set(r.id, { colour: trailColour(r.tags), ref: r.tags.ref ?? null });
    for (const m of r.members) {
      if (m.type !== 'w') continue;
      const arr = byWay.get(m.ref) ?? [];
      if (!arr.includes(r.id)) arr.push(r.id);
      byWay.set(m.ref, arr);
    }
  }
  for (const arr of Array.from(byWay.values())) arr.sort((a, b) => a - b);
  return { byWay, info };
}

const SIG_KEYS = ['highway', 'surface', 'tracktype', 'lit', 'sac_scale', 'mtb:scale', 'name', 'foot', 'bicycle', 'access', 'osmc:symbol'];

export function waySignature(w: OsmWay, membership: RouteMembership): string {
  const parts = SIG_KEYS.map((k) => w.tags[k] ?? '');
  parts.push((membership.byWay.get(w.id) ?? []).join(';'));
  return parts.join('|');
}

interface Piece {
  idx: number;
  way: OsmWay;
  nodes: number[];
  sig: string;
}

/** Step 1: split included ways at junctions. Exported for tests. */
export function splitWaysAtJunctions(ways: OsmWay[], membership: RouteMembership): Piece[] {
  const incidence = new Map<number, number>();
  for (const w of ways) {
    w.nodes.forEach((n, i) => {
      const inc = i === 0 || i === w.nodes.length - 1 ? 1 : 2;
      incidence.set(n, (incidence.get(n) ?? 0) + inc);
    });
  }
  const pieces: Piece[] = [];
  for (const w of ways) {
    const sig = waySignature(w, membership);
    let cur: number[] = [w.nodes[0]];
    for (let i = 1; i < w.nodes.length; i++) {
      cur.push(w.nodes[i]);
      const isLast = i === w.nodes.length - 1;
      if (!isLast && (incidence.get(w.nodes[i]) ?? 0) >= 3) {
        pieces.push({ idx: pieces.length, way: w, nodes: cur, sig });
        cur = [w.nodes[i]];
      }
    }
    if (cur.length >= 2) pieces.push({ idx: pieces.length, way: w, nodes: cur, sig });
  }
  return pieces;
}

export interface Chain {
  nodes: number[];
  pieces: Piece[];
}

/** Step 2: merge pieces through degree-2 nodes with equal signatures. Exported for tests. */
export function mergePieces(pieces: Piece[]): Chain[] {
  const ends = new Map<number, Array<{ p: Piece; atStart: boolean }>>();
  const addEnd = (n: number, p: Piece, atStart: boolean) => {
    const arr = ends.get(n) ?? [];
    arr.push({ p, atStart });
    ends.set(n, arr);
  };
  for (const p of pieces) {
    addEnd(p.nodes[0], p, true);
    addEnd(p.nodes[p.nodes.length - 1], p, false);
  }
  const visited = new Set<number>();
  const partner = (n: number, from: Piece): { p: Piece; atStart: boolean } | null => {
    const e = ends.get(n);
    if (!e || e.length !== 2) return null;
    const other = e[0].p === from ? e[1] : e[0];
    if (other.p === from || visited.has(other.p.idx) || other.p.sig !== from.sig) return null;
    return other;
  };
  const chains: Chain[] = [];
  for (const start of pieces) {
    if (visited.has(start.idx)) continue;
    visited.add(start.idx);
    let nodes = [...start.nodes];
    const used: Piece[] = [start];
    // forward
    let tail = start;
    for (;;) {
      const nx = partner(nodes[nodes.length - 1], tail);
      if (!nx) break;
      visited.add(nx.p.idx);
      const seq = nx.atStart ? nx.p.nodes : [...nx.p.nodes].reverse();
      nodes = nodes.concat(seq.slice(1));
      used.push(nx.p);
      tail = nx.p;
    }
    // backward
    let head = start;
    for (;;) {
      const pv = partner(nodes[0], head);
      if (!pv) break;
      visited.add(pv.p.idx);
      const seq = pv.atStart ? [...pv.p.nodes].reverse() : pv.p.nodes;
      nodes = seq.slice(0, -1).concat(nodes);
      used.unshift(pv.p);
      head = pv.p;
    }
    chains.push({ nodes, pieces: used });
  }
  return chains;
}

export interface BuildSegmentsResult {
  segments: TrailSegment[];
  includedWays: number;
  skippedMissingNodes: number;
}

export function buildSegments(data: OsmData, ctx: SegmentContext, membership = buildRouteMembership(data)): BuildSegmentsResult {
  let skippedMissingNodes = 0;
  const ways: OsmWay[] = [];
  for (const w of Array.from(data.ways.values())) {
    if (!isTrailWay(w.tags) || w.nodes.length < 2) continue;
    if (!w.nodes.every((n) => data.nodes.has(n))) {
      skippedMissingNodes++;
      continue;
    }
    ways.push(w);
  }
  const chains = mergePieces(splitWaysAtJunctions(ways, membership));
  const seenIds = new Map<string, number>();
  const segments: TrailSegment[] = [];
  for (const ch of chains) {
    const geometry: LngLat[] = ch.nodes.map((n) => {
      const nd = data.nodes.get(n)!;
      return [nd.lon, nd.lat];
    });
    const lengthM = polylineLengthM(geometry);
    if (lengthM < 1) continue;
    const w = ch.pieces[0].way;
    const tags = w.tags;
    const inBuiltUp = ctx.builtUpShare(geometry) >= 0.5;
    const surf = resolveSurface(tags, inBuiltUp);
    const lit = resolveLit(tags, ctx.lampCoverage(geometry), inBuiltUp);
    const rels = membership.byWay.get(w.id) ?? [];
    const relInfo = rels.map((r) => membership.info.get(r)).filter(Boolean) as Array<{ colour: string | null; ref: string | null }>;
    const colour = trailColour(tags) ?? relInfo.find((r) => r.colour)?.colour ?? null;
    const refs = Array.from(new Set(relInfo.map((r) => r.ref).filter(Boolean))) as string[];
    const prof = ctx.profile(geometry);
    const wayIds = Array.from(new Set(ch.pieces.map((p) => p.way.id)));
    const startNode = ch.nodes[0];
    const endNode = ch.nodes[ch.nodes.length - 1];
    let id = `seg_${wayIds[0]}_${startNode}_${endNode}`;
    const dup = seenIds.get(id) ?? 0;
    seenIds.set(id, dup + 1);
    if (dup) id += `_${dup}`;
    segments.push({
      id,
      geometry,
      startNode,
      endNode,
      lengthM: Math.round(lengthM * 10) / 10,
      elevation: prof
        ? {
            provider: 'copernicus-glo30',
            gainFwdM: prof.gainM,
            gainRevM: prof.lossM,
            maxGrade50mFwdPct: prof.maxGradeFwdPct,
            maxGrade50mRevPct: prof.maxGradeRevPct,
            minEleM: prof.minEleM,
            maxEleM: prof.maxEleM,
          }
        : null,
      highwayClass: tags.highway,
      surface: surf.surface,
      surfaceRaw: surf.raw,
      surfaceConfidence: surf.confidence,
      lit: lit.lit,
      litSource: lit.source,
      sacScale: tags.sac_scale ?? null,
      mtbScale: tags['mtb:scale'] ?? null,
      tracktype: tags.tracktype ?? null,
      colour,
      itcRef: refs.length ? refs.join(';') : null,
      name: tags['name:he'] ?? tags.name ?? null,
      inBuiltUp,
      osmWayIds: wayIds,
      routeRelationIds: rels,
      foot: footAllowed(tags),
      bicycle: bicycleAllowed(tags),
      license: OSM_LICENSE,
    });
  }
  return { segments, includedWays: ways.length, skippedMissingNodes };
}
