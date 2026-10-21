/**
 * Flat, typed-array index of shadow casters (building footprints and tree
 * crowns as prisms: outer ring + top height + opacity), in a local metric
 * frame, bucketed into a uniform grid.
 *
 * Memory: ~16 bytes per vertex + ~40 bytes per obstacle, so Tel Aviv
 * (≈45k buildings + ≈160k crowns) stays in the tens of MB. Holes
 * (courtyards) are ignored in v1 — a courtyard is treated as built.
 *
 * Pure, no I/O.
 */
import { makeFrame, toXY, type LocalFrame } from '../shade/geometry';
import type { LonLat } from '../shade/types';

export const DEFAULT_CELL_M = 50;

export type ObstacleKind = 'building' | 'tree';

export interface ObstacleIndex {
  frame: LocalFrame;
  cellM: number;
  count: number;
  /** Vertex coordinates, interleaved x,y (metres). */
  xy: Float64Array;
  /** Start (in vertices) and vertex count of each obstacle's ring. */
  ringStart: Int32Array;
  ringLen: Int32Array;
  heightM: Float32Array;
  opacity: Float32Array;
  kind: Uint8Array; // 0 building, 1 tree
  /** minX, minY, maxX, maxY per obstacle. */
  bbox: Float64Array;
  maxHeightM: number;
  /** cell key → obstacle ids. */
  cells: Map<number, Int32Array>;
  /** Scratch for per-query dedupe (one stamp per obstacle). */
  stamp: Uint32Array;
  stampSeq: { v: number };
}

// Cell keys as one integer: (cx + OFF) * SPAN + (cy + OFF). ±500 km at 50 m.
const OFF = 10_000;
const SPAN = 20_000;
export const cellKey = (cx: number, cy: number): number => (cx + OFF) * SPAN + (cy + OFF);

export interface ObstacleIndexBuilder {
  /** Add one prism. Ring may be closed or open; < 3 distinct vertices is skipped. Returns false when skipped. */
  add(ring: LonLat[], heightM: number, opacity: number, kind: ObstacleKind): boolean;
  readonly size: number;
  finish(): ObstacleIndex;
}

export function createObstacleIndexBuilder(origin: LonLat, cellM = DEFAULT_CELL_M): ObstacleIndexBuilder {
  const frame = makeFrame(origin[0], origin[1]);
  const xy: number[] = [];
  const ringStart: number[] = [];
  const ringLen: number[] = [];
  const heights: number[] = [];
  const opac: number[] = [];
  const kinds: number[] = [];
  const bbox: number[] = [];
  let maxH = 0;

  return {
    get size() {
      return ringStart.length;
    },
    add(ring, heightM, opacity, kind) {
      if (!(heightM > 0) || !(opacity > 0)) return false;
      let n = ring.length;
      if (n >= 2 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--; // drop closing vertex
      if (n < 3) return false;
      const start = xy.length / 2;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const p = ring[i];
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false;
      }
      for (let i = 0; i < n; i++) {
        const [x, y] = toXY(frame, ring[i]);
        xy.push(x, y);
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
      ringStart.push(start);
      ringLen.push(n);
      heights.push(heightM);
      opac.push(Math.min(1, opacity));
      kinds.push(kind === 'tree' ? 1 : 0);
      bbox.push(x0, y0, x1, y1);
      if (heightM > maxH) maxH = heightM;
      return true;
    },
    finish() {
      const count = ringStart.length;
      const tmp = new Map<number, number[]>();
      for (let i = 0; i < count; i++) {
        const cx0 = Math.floor(bbox[i * 4] / cellM);
        const cy0 = Math.floor(bbox[i * 4 + 1] / cellM);
        const cx1 = Math.floor(bbox[i * 4 + 2] / cellM);
        const cy1 = Math.floor(bbox[i * 4 + 3] / cellM);
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let cy = cy0; cy <= cy1; cy++) {
            const k = cellKey(cx, cy);
            const arr = tmp.get(k);
            if (arr) arr.push(i);
            else tmp.set(k, [i]);
          }
        }
      }
      const cells = new Map<number, Int32Array>();
      tmp.forEach((v, k) => cells.set(k, Int32Array.from(v)));
      return {
        frame,
        cellM,
        count,
        xy: Float64Array.from(xy),
        ringStart: Int32Array.from(ringStart),
        ringLen: Int32Array.from(ringLen),
        heightM: Float32Array.from(heights),
        opacity: Float32Array.from(opac),
        kind: Uint8Array.from(kinds),
        bbox: Float64Array.from(bbox),
        maxHeightM: maxH,
        cells,
        stamp: new Uint32Array(count),
        stampSeq: { v: 0 },
      };
    },
  };
}
