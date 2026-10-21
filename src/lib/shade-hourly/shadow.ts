/**
 * Is a ground point in shadow at a given sun position?
 *
 * Exact for flat-topped prisms: a ground point P is shaded by a prism of
 * height h iff the horizontal ray from P toward the sun's azimuth, of length
 * h / tan(elevation), enters the prism's footprint (or P is inside it).
 * No shadow polygons are ever built — each query walks only the grid cells
 * the ray crosses (Amanatides–Woo traversal), so cost is proportional to
 * the shadow length, not to the city size.
 *
 * Pure, no I/O.
 */
import { cellKey, type ObstacleIndex } from './obstacles';

const DEG = Math.PI / 180;

/** Shadows longer than this are cut (very low sun). Everything is in shade then anyway. */
export const MAX_SHADOW_M = 300;

/** Precomputed per-sun-position ray parameters. */
export interface SunRay {
  /** Unit vector toward the sun's azimuth in the local frame (x east, y north). */
  sx: number;
  sy: number;
  /** 1 / tan(elevation) — shadow length per metre of height. */
  cot: number;
  /** False when the sun is at/below the horizon (no direct sun at all). */
  up: boolean;
}

export function sunRay(azimuthDeg: number, elevationDeg: number): SunRay {
  const up = elevationDeg > 0;
  return {
    sx: Math.sin(azimuthDeg * DEG),
    sy: Math.cos(azimuthDeg * DEG),
    cot: up ? 1 / Math.tan(elevationDeg * DEG) : Infinity,
    up,
  };
}

function pointInRing(xy: Float64Array, start: number, n: number, px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xy[(start + i) * 2], yi = xy[(start + i) * 2 + 1];
    const xj = xy[(start + j) * 2], yj = xy[(start + j) * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Proper or touching intersection of segment p→q with segment a→b. */
function segIntersects(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): boolean {
  const d1x = qx - px, d1y = qy - py;
  const d2x = bx - ax, d2y = by - ay;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return false; // parallel: the ring's other edges decide
  const t = ((ax - px) * d2y - (ay - py) * d2x) / den;
  const u = ((ax - px) * d1y - (ay - py) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function rayHitsObstacle(idx: ObstacleIndex, o: number, px: number, py: number, qx: number, qy: number): boolean {
  const b = o * 4;
  const minX = px < qx ? px : qx, maxX = px < qx ? qx : px;
  const minY = py < qy ? py : qy, maxY = py < qy ? qy : py;
  if (maxX < idx.bbox[b] || minX > idx.bbox[b + 2] || maxY < idx.bbox[b + 1] || minY > idx.bbox[b + 3]) return false;
  const start = idx.ringStart[o];
  const n = idx.ringLen[o];
  if (px >= idx.bbox[b] && px <= idx.bbox[b + 2] && py >= idx.bbox[b + 1] && py <= idx.bbox[b + 3] && pointInRing(idx.xy, start, n, px, py)) {
    return true;
  }
  const xy = idx.xy;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (segIntersects(px, py, qx, qy, xy[(start + j) * 2], xy[(start + j) * 2 + 1], xy[(start + i) * 2], xy[(start + i) * 2 + 1])) return true;
  }
  return false;
}

/**
 * Shade at local point (px, py): the largest opacity among casters whose
 * shadow covers the point (0 = full sun, 1 = fully shaded). 1 when the sun
 * is down.
 */
export function shadeAtPoint(idx: ObstacleIndex, px: number, py: number, sun: SunRay, maxShadowM = MAX_SHADOW_M): number {
  if (!sun.up) return 1;
  if (idx.count === 0) return 0;
  const reach = Math.min(maxShadowM, idx.maxHeightM * sun.cot);
  const seq = ++idx.stampSeq.v;
  if (seq === 0xffffffff) {
    idx.stamp.fill(0);
    idx.stampSeq.v = 1;
  }
  const stampVal = idx.stampSeq.v;
  const c = idx.cellM;

  // Amanatides–Woo grid traversal from P along (sx, sy) for `reach` metres.
  let cx = Math.floor(px / c);
  let cy = Math.floor(py / c);
  const stepX = sun.sx > 0 ? 1 : -1;
  const stepY = sun.sy > 0 ? 1 : -1;
  const tDeltaX = sun.sx !== 0 ? Math.abs(c / sun.sx) : Infinity;
  const tDeltaY = sun.sy !== 0 ? Math.abs(c / sun.sy) : Infinity;
  let tMaxX = sun.sx !== 0 ? ((sun.sx > 0 ? (cx + 1) * c - px : px - cx * c) / Math.abs(sun.sx)) : Infinity;
  let tMaxY = sun.sy !== 0 ? ((sun.sy > 0 ? (cy + 1) * c - py : py - cy * c) / Math.abs(sun.sy)) : Infinity;

  let best = 0;
  let t = 0;
  for (;;) {
    const ids = idx.cells.get(cellKey(cx, cy));
    if (ids) {
      for (let k = 0; k < ids.length; k++) {
        const o = ids[k];
        if (idx.stamp[o] === stampVal) continue;
        idx.stamp[o] = stampVal;
        const op = idx.opacity[o];
        if (op <= best) continue;
        const len = Math.min(maxShadowM, idx.heightM[o] * sun.cot);
        if (rayHitsObstacle(idx, o, px, py, px + sun.sx * len, py + sun.sy * len)) {
          best = op;
          if (best >= 1) return 1;
        }
      }
    }
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      cy += stepY;
    }
    if (t > reach) break;
  }
  return best;
}
