/**
 * Hourly shade profile of one street segment: for each of the 168 grid
 * cells (12 reference days × 14 hours), the mean shade over sample points
 * spaced along the segment (optionally offset sideways to both sidewalks).
 *
 * Pure. Streaming-friendly: one segment in, one Float32Array(168) out —
 * the caller never has to hold the city's segments in memory.
 */
import { haversineM, isLonLat, toXY } from '../shade/geometry';
import type { LonLat } from '../shade/types';
import type { ObstacleIndex } from './obstacles';
import { MAX_SHADOW_M, shadeAtPoint, sunRay, type SunRay } from './shadow';
import { GRID_CELLS, type SunCell } from './time-grid';

/** Profile value for a cell where the sun is below the horizon. */
export const SUN_DOWN = -1;
export const DEFAULT_SAMPLE_STEP_M = 10;

export interface ProfileOptions {
  /** Spacing of sample points along the segment, metres. Default 10. */
  stepM?: number;
  /**
   * Lateral offsets (metres, + = left of travel direction) at which each
   * sample is taken. Default [0] (the axis). [-6, 6] samples both sidewalks
   * of a typical street.
   */
  offsetsM?: number[];
  maxShadowM?: number;
}

/** Precompute the 168 sun rays once per city. */
export function sunRays(table: SunCell[]): SunRay[] {
  return table.map((c) => sunRay(c.azimuthDeg, c.elevationDeg));
}

/** Sample points (local XY) along a line. Always at least one per line part. */
export function samplePoints(idx: ObstacleIndex, line: LonLat[], stepM: number, offsetsM: number[]): Array<[number, number]> {
  const pts = line.filter(isLonLat);
  const out: Array<[number, number]> = [];
  for (let i = 1; i < pts.length; i++) {
    const len = haversineM(pts[i - 1], pts[i]);
    if (!(len > 0)) continue;
    const a = toXY(idx.frame, pts[i - 1]);
    const b = toXY(idx.frame, pts[i]);
    const pl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // left normal of the travel direction
    const nx = -(b[1] - a[1]) / pl;
    const ny = (b[0] - a[0]) / pl;
    const steps = Math.max(1, Math.round(len / stepM));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      for (const off of offsetsM) out.push([x + nx * off, y + ny * off]);
    }
  }
  if (out.length === 0 && pts.length > 0) out.push(toXY(idx.frame, pts[0]));
  return out;
}

/**
 * Mean shade (0..1) per grid cell for one segment, SUN_DOWN where the sun is
 * below the horizon. `rays` must come from `sunRays(buildSunTable(...))`.
 */
export function segmentShadeProfile(idx: ObstacleIndex, line: LonLat[], rays: SunRay[], options: ProfileOptions = {}): Float32Array {
  const stepM = options.stepM ?? DEFAULT_SAMPLE_STEP_M;
  const offsets = options.offsetsM && options.offsetsM.length ? options.offsetsM : [0];
  const maxShadowM = options.maxShadowM ?? MAX_SHADOW_M;
  const pts = samplePoints(idx, line, stepM, offsets);
  const out = new Float32Array(rays.length || GRID_CELLS);
  for (let c = 0; c < rays.length; c++) {
    const r = rays[c];
    if (!r.up) {
      out[c] = SUN_DOWN;
      continue;
    }
    if (pts.length === 0) {
      out[c] = 0;
      continue;
    }
    let s = 0;
    for (let i = 0; i < pts.length; i++) s += shadeAtPoint(idx, pts[i][0], pts[i][1], r, maxShadowM);
    out[c] = s / pts.length;
  }
  return out;
}
