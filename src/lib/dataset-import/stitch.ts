/**
 * Stitch dataset line pieces into continuous corridors. Government cycling
 * layers are infrastructure SECTIONS, not routes (NATIONWIDE-PLAN.md §3.1):
 * a route is a chain of touching sections. Greedy chaining from the longest
 * unused piece, extending either end with the nearest unused piece whose
 * endpoint is within JOIN_TOLERANCE_M. Only corridors ≥ MIN_CORRIDOR_M are kept.
 */
import { haversineM, pathLengthM } from '../route-quality/geo';
import type { Corridor, DatasetLine, DatasetSpec, LngLat } from './types';

export const JOIN_TOLERANCE_M = 30;
export const MIN_CORRIDOR_M = 2000;
export const CLOSED_MAX_GAP_M = 50;

interface Piece { line: DatasetLine; lengthM: number }

function chainGroup(pieces: Piece[], tolM: number): Array<{ ids: string[]; names: Map<string, number>; coords: LngLat[] }> {
  const unused = new Set(pieces.map((_, i) => i));
  const out: Array<{ ids: string[]; names: Map<string, number>; coords: LngLat[] }> = [];
  const order = pieces.map((p, i) => [p.lengthM, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, startIdx] of order) {
    if (!unused.has(startIdx)) continue;
    unused.delete(startIdx);
    const start = pieces[startIdx];
    let coords = start.line.coords.slice();
    const ids = [start.line.featureId];
    const names = new Map<string, number>([[start.line.name, start.lengthM]]);
    for (;;) {
      const head = coords[0];
      const tail = coords[coords.length - 1];
      let best: { idx: number; d: number; atTail: boolean; reverse: boolean } | null = null;
      for (const idx of Array.from(unused)) {
        const c = pieces[idx].line.coords;
        const a = c[0], b = c[c.length - 1];
        const cands = [
          { d: haversineM(tail, a), atTail: true, reverse: false },
          { d: haversineM(tail, b), atTail: true, reverse: true },
          { d: haversineM(head, b), atTail: false, reverse: false },
          { d: haversineM(head, a), atTail: false, reverse: true },
        ];
        for (const k of cands) if (k.d <= tolM && (!best || k.d < best.d || (k.d === best.d && idx < best.idx))) best = { idx, ...k };
      }
      if (!best) break;
      unused.delete(best.idx);
      const p = pieces[best.idx];
      const seg = best.reverse ? p.line.coords.slice().reverse() : p.line.coords.slice();
      if (best.atTail) { coords = coords.concat(best.d === 0 ? seg.slice(1) : seg); ids.push(p.line.featureId); }
      else { coords = (best.d === 0 ? seg.slice(0, -1) : seg).concat(coords); ids.unshift(p.line.featureId); }
      names.set(p.line.name, (names.get(p.line.name) ?? 0) + p.lengthM);
    }
    out.push({ ids, names, coords });
  }
  return out;
}

function dominantName(names: Map<string, number>): string {
  let best = '', bestLen = -1;
  for (const [n, len] of Array.from(names.entries())) if (n && (len > bestLen || (len === bestLen && n < best))) { best = n; bestLen = len; }
  return best;
}

export interface StitchReport { pieces: number; chains: number; kept: number; droppedShort: number }

export function stitchCorridors(lines: DatasetLine[], spec: DatasetSpec, opts: { toleranceM?: number; minLengthM?: number } = {}): { corridors: Corridor[]; report: StitchReport } {
  const tol = opts.toleranceM ?? spec.joinToleranceM ?? JOIN_TOLERANCE_M;
  const minLen = opts.minLengthM ?? MIN_CORRIDOR_M;
  const pieces: Piece[] = lines.map((line) => ({ line, lengthM: pathLengthM(line.coords) }));
  const groups = new Map<string, Piece[]>();
  for (const p of pieces) {
    const k = spec.stitchBy === 'name' ? p.line.name : '*';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const raw: Corridor[] = [];
  let chains = 0;
  for (const [, group] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const ch of chainGroup(group, tol)) {
      chains++;
      const lengthM = pathLengthM(ch.coords);
      raw.push({
        name: dominantName(ch.names),
        featureIds: ch.ids,
        coords: ch.coords,
        lengthM,
        closed: ch.coords.length > 2 && haversineM(ch.coords[0], ch.coords[ch.coords.length - 1]) <= CLOSED_MAX_GAP_M,
      });
    }
  }
  const corridors = raw.filter((c) => c.lengthM >= minLen).sort((a, b) => b.lengthM - a.lengthM || a.name.localeCompare(b.name));
  return { corridors, report: { pieces: pieces.length, chains, kept: corridors.length, droppedShort: raw.length - corridors.length } };
}
