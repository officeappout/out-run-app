/**
 * Length-weighted shade along a route line, by buffer matching against the
 * normalized Technion street segments.
 *
 * Method: the route is walked in short steps (≤ `stepM`). Each step's
 * midpoint is matched to the nearest segment axis within `bufferM` (default
 * 15 m, widened by half the segment's polygon width so wide boulevards still
 * match from the sidewalk). Among candidates, segments running roughly
 * parallel to the step (≤ `maxAngleDeg`) are preferred — that stops a route
 * that crosses a side street from being credited with the side street's
 * shade. Unmatched steps count toward the route length but not toward the
 * shade (`coverage` reports the matched share).
 *
 * Pure, no I/O. Build the index once per city, reuse for every route.
 */
import { haversineM, isLonLat, makeFrame, pointSegDistXY, toXY, type LocalFrame } from './geometry';
import type { LonLat, ShadeSegmentCollection, ShadeSegmentFeature } from './types';

const CELL_M = 100;

interface IndexedSeg {
  a: [number, number];
  b: [number, number];
  /** unit direction a→b */
  ux: number;
  uy: number;
  halfWidthM: number;
  shadeIndex: number;
}

export interface ShadeSpatialIndex {
  frame: LocalFrame;
  cells: Map<string, IndexedSeg[]>;
  size: number;
}

const key = (cx: number, cy: number) => `${cx}:${cy}`;

export function buildShadeIndex(segments: ShadeSegmentCollection | ShadeSegmentFeature[]): ShadeSpatialIndex {
  const feats = Array.isArray(segments) ? segments : segments.features;
  let lon0 = 0;
  let lat0 = 0;
  let n = 0;
  for (const f of feats) {
    const c = f.geometry?.coordinates?.[0];
    if (isLonLat(c)) {
      lon0 += c[0];
      lat0 += c[1];
      n++;
    }
  }
  const frame = makeFrame(n ? lon0 / n : 0, n ? lat0 / n : 0);
  const cells = new Map<string, IndexedSeg[]>();
  let size = 0;
  for (const f of feats) {
    const coords = f.geometry?.coordinates ?? [];
    const si = f.properties?.shadeIndex;
    if (typeof si !== 'number' || !Number.isFinite(si)) continue;
    const halfWidthM = Math.max(0, (f.properties?.widthM ?? 0) / 2);
    for (let i = 1; i < coords.length; i++) {
      if (!isLonLat(coords[i - 1]) || !isLonLat(coords[i])) continue;
      const a = toXY(frame, coords[i - 1]);
      const b = toXY(frame, coords[i]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.01) continue;
      const seg: IndexedSeg = { a, b, ux: (b[0] - a[0]) / len, uy: (b[1] - a[1]) / len, halfWidthM, shadeIndex: si };
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL_M);
      const x1 = Math.floor(Math.max(a[0], b[0]) / CELL_M);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL_M);
      const y1 = Math.floor(Math.max(a[1], b[1]) / CELL_M);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = key(cx, cy);
          const arr = cells.get(k);
          if (arr) arr.push(seg);
          else cells.set(k, [seg]);
        }
      }
      size++;
    }
  }
  return { frame, cells, size };
}

export interface ShadeShareOptions {
  /** Match radius from the segment axis, metres. Default 15. */
  bufferM?: number;
  /** Add half the segment polygon width to the buffer. Default true. */
  widenByWidth?: boolean;
  /** Cap on the widening, metres. Default 15. */
  maxWidenM?: number;
  /** Walking step, metres. Default 5. */
  stepM?: number;
  /** Prefer segments within this angle of the route direction. Default 45. */
  maxAngleDeg?: number;
  /** Matched steps on a segment with shadeIndex ≥ this count toward `shadedLengthM`. Default 0.25 (SHADED_MIN_SI). */
  shadedMinIndex?: number;
}

export interface ShadeShareResult {
  /**
   * Length-weighted mean shade index (0..1) over the MATCHED length, or null
   * when nothing matched. This is the value for routeScore's `shadeShare`.
   */
  shadeShare: number | null;
  /** matchedLengthM / totalLengthM (0..1). */
  coverage: number;
  matchedLengthM: number;
  totalLengthM: number;
  /** Matched length on segments with shadeIndex ≥ `shadedMinIndex`. */
  shadedLengthM: number;
}

function candidates(idx: ShadeSpatialIndex, p: [number, number], r: number): IndexedSeg[] {
  const out = new Set<IndexedSeg>();
  const x0 = Math.floor((p[0] - r) / CELL_M);
  const x1 = Math.floor((p[0] + r) / CELL_M);
  const y0 = Math.floor((p[1] - r) / CELL_M);
  const y1 = Math.floor((p[1] + r) / CELL_M);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const arr = idx.cells.get(key(cx, cy));
      if (arr) for (const s of arr) out.add(s);
    }
  }
  return Array.from(out);
}

/** Best segment for a step midpoint `p` heading (dx,dy unit), or null. */
function matchStep(
  idx: ShadeSpatialIndex,
  p: [number, number],
  dx: number,
  dy: number,
  o: Required<ShadeShareOptions>,
): IndexedSeg | null {
  const reach = o.bufferM + (o.widenByWidth ? o.maxWidenM : 0);
  const cosMax = Math.cos((o.maxAngleDeg * Math.PI) / 180);
  let bestParallel: { s: IndexedSeg; d: number } | null = null;
  let bestAny: { s: IndexedSeg; d: number } | null = null;
  for (const s of candidates(idx, p, reach)) {
    const d = pointSegDistXY(p, s.a, s.b);
    const limit = o.bufferM + (o.widenByWidth ? Math.min(o.maxWidenM, s.halfWidthM) : 0);
    if (d > limit) continue;
    const parallel = Math.abs(dx * s.ux + dy * s.uy) >= cosMax;
    if (parallel && (!bestParallel || d < bestParallel.d)) bestParallel = { s, d };
    if (!bestAny || d < bestAny.d) bestAny = { s, d };
  }
  return (bestParallel ?? bestAny)?.s ?? null;
}

export function shadeShareForLine(
  line: LonLat[],
  segments: ShadeSpatialIndex | ShadeSegmentCollection | ShadeSegmentFeature[],
  options: ShadeShareOptions = {},
): ShadeShareResult {
  const o: Required<ShadeShareOptions> = {
    bufferM: options.bufferM ?? 15,
    widenByWidth: options.widenByWidth ?? true,
    maxWidenM: options.maxWidenM ?? 15,
    stepM: options.stepM ?? 5,
    maxAngleDeg: options.maxAngleDeg ?? 45,
    shadedMinIndex: options.shadedMinIndex ?? 0.25,
  };
  const idx = 'cells' in segments ? segments : buildShadeIndex(segments);
  let total = 0;
  let matched = 0;
  let weighted = 0;
  let shaded = 0;
  const pts = line.filter(isLonLat);
  for (let i = 1; i < pts.length; i++) {
    const segLen = haversineM(pts[i - 1], pts[i]);
    if (!(segLen > 0)) continue;
    const a = toXY(idx.frame, pts[i - 1]);
    const b = toXY(idx.frame, pts[i]);
    const planeLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const dx = (b[0] - a[0]) / planeLen;
    const dy = (b[1] - a[1]) / planeLen;
    const steps = Math.max(1, Math.ceil(segLen / o.stepM));
    const stepLen = segLen / steps;
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const p: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      total += stepLen;
      const s = idx.size ? matchStep(idx, p, dx, dy, o) : null;
      if (s) {
        matched += stepLen;
        weighted += stepLen * s.shadeIndex;
        if (s.shadeIndex >= o.shadedMinIndex) shaded += stepLen;
      }
    }
  }
  return {
    shadeShare: matched > 0 ? weighted / matched : null,
    coverage: total > 0 ? matched / total : 0,
    matchedLengthM: matched,
    totalLengthM: total,
    shadedLengthM: shaded,
  };
}
