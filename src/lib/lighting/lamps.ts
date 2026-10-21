/**
 * Lamp-post point index (uniform grid in a local metric frame) and the
 * per-piece lit classification. Pure.
 */
import { haversineM, isLonLat, makeFrame, toXY, type LocalFrame } from '../shade/geometry';
import type { LonLat } from '../shade/types';
import { litFromTags } from '../trail-graph/tags';
import { LIT_LAMP_RADIUS_M, LIT_PIECE_MIN_SHARE, LIT_SAMPLE_STEP_M } from './constants';

export interface LampIndex {
  frame: LocalFrame;
  cellM: number;
  cells: Map<string, Array<[number, number]>>;
  count: number;
}

export function buildLampIndex(lamps: LonLat[], origin?: LonLat, cellM = LIT_LAMP_RADIUS_M): LampIndex {
  const pts = lamps.filter(isLonLat);
  const o = origin ?? (pts.length ? pts[0] : ([0, 0] as LonLat));
  const frame = makeFrame(o[0], o[1]);
  const cells = new Map<string, Array<[number, number]>>();
  for (const p of pts) {
    const xy = toXY(frame, p);
    const k = `${Math.floor(xy[0] / cellM)}:${Math.floor(xy[1] / cellM)}`;
    const arr = cells.get(k);
    if (arr) arr.push(xy);
    else cells.set(k, [xy]);
  }
  return { frame, cellM, cells, count: pts.length };
}

export function hasLampWithin(idx: LampIndex, p: LonLat, radiusM = LIT_LAMP_RADIUS_M): boolean {
  if (!idx.count) return false;
  const [x, y] = toXY(idx.frame, p);
  const r2 = radiusM * radiusM;
  const span = Math.ceil(radiusM / idx.cellM);
  const cx = Math.floor(x / idx.cellM), cy = Math.floor(y / idx.cellM);
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      const arr = idx.cells.get(`${cx + i}:${cy + j}`);
      if (!arr) continue;
      for (const q of arr) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 <= r2) return true;
    }
  }
  return false;
}

/** Share (0..1) of sample points along `line` within `radiusM` of a lamp. */
export function lampShare(idx: LampIndex | null, line: LonLat[], radiusM = LIT_LAMP_RADIUS_M, stepM = LIT_SAMPLE_STEP_M): number {
  if (!idx || !idx.count) return 0;
  const pts = line.filter(isLonLat);
  let n = 0, hit = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = haversineM(pts[i - 1], pts[i]);
    if (!(len > 0)) continue;
    const steps = Math.max(1, Math.round(len / stepM));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const p: LonLat = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
      n++;
      if (hasLampWithin(idx, p, radiusM)) hit++;
    }
  }
  return n ? hit / n : 0;
}

export type LitState = 'yes' | 'no' | 'unknown';
export type LitBasis = 'osm_lit_no' | 'osm_lit_yes' | 'lamps' | 'osm_lit_yes+lamps' | 'none';

/** Merge OSM `lit=*` with lamp proximity for one street piece. */
export function classifyLitPiece(tags: Record<string, string>, share: number, minShare = LIT_PIECE_MIN_SHARE): { lit: LitState; basis: LitBasis } {
  const osm = litFromTags(tags);
  if (osm === 'no') return { lit: 'no', basis: 'osm_lit_no' };
  const byLamps = share >= minShare;
  if (osm === 'yes') return { lit: 'yes', basis: byLamps ? 'osm_lit_yes+lamps' : 'osm_lit_yes' };
  if (byLamps) return { lit: 'yes', basis: 'lamps' };
  return { lit: 'unknown', basis: 'none' };
}
