/** Grid index over walkable OSM path lines, for snapping park boundaries to real paths. */
import { makeProjector, pointSegDist, type XY } from '../route-quality/geo';
import type { LngLat, PathLine } from './types';

export interface PathIndex {
  nearest(p: LngLat, maxM: number): { d: number; at: LngLat; lineId: string } | null;
  size: number;
}

export function buildPathIndex(lines: PathLine[], cellM = 60): PathIndex {
  const origin = lines.find((l) => l.coords.length)?.coords[0] ?? ([35, 32] as LngLat);
  const proj = makeProjector(origin);
  const cells = new Map<string, Array<{ a: XY; b: XY; id: string }>>();
  for (const l of lines) {
    for (let i = 1; i < l.coords.length; i++) {
      const a = proj.toXY(l.coords[i - 1]), b = proj.toXY(l.coords[i]);
      for (let cx = Math.floor(Math.min(a[0], b[0]) / cellM); cx <= Math.floor(Math.max(a[0], b[0]) / cellM); cx++) {
        for (let cy = Math.floor(Math.min(a[1], b[1]) / cellM); cy <= Math.floor(Math.max(a[1], b[1]) / cellM); cy++) {
          const k = `${cx}:${cy}`;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k)!.push({ a, b, id: l.id });
        }
      }
    }
  }
  return {
    size: lines.length,
    nearest(p, maxM) {
      const q = proj.toXY(p);
      const r = Math.ceil(maxM / cellM);
      const cx = Math.floor(q[0] / cellM), cy = Math.floor(q[1] / cellM);
      let best: { d: number; xy: XY; id: string } | null = null;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        for (const s of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const { d, t } = pointSegDist(q, s.a, s.b);
          if (d <= maxM && (!best || d < best.d)) best = { d, xy: [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t], id: s.id };
        }
      }
      return best ? { d: best.d, at: proj.toLngLat(best.xy), lineId: best.id } : null;
    },
  };
}
