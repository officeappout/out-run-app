/**
 * Small local-plane geometry helpers (equirectangular around a reference
 * latitude). Accurate to well under 1% over a few km — plenty for 15 m
 * buffer matching inside one city. Pure, no deps.
 */
import type { LonLat } from './types';

const EARTH_R = 6_371_008.8;
const DEG = Math.PI / 180;

export interface LocalFrame {
  lon0: number;
  lat0: number;
  /** metres per degree longitude at lat0 */
  mx: number;
  /** metres per degree latitude */
  my: number;
}

export function makeFrame(lon0: number, lat0: number): LocalFrame {
  const my = EARTH_R * DEG;
  return { lon0, lat0, mx: my * Math.cos(lat0 * DEG), my };
}

export function toXY(f: LocalFrame, p: LonLat): [number, number] {
  return [(p[0] - f.lon0) * f.mx, (p[1] - f.lat0) * f.my];
}

export function toLonLat(f: LocalFrame, x: number, y: number): LonLat {
  return [f.lon0 + x / f.mx, f.lat0 + y / f.my];
}

/** Haversine distance in metres. */
export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function lineLengthM(line: LonLat[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversineM(line[i - 1], line[i]);
  return s;
}

/** Distance (m, local plane) from point p to segment ab, all in XY metres. */
export function pointSegDistXY(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * dx - p[0];
  const qy = a[1] + t * dy - p[1];
  return Math.sqrt(qx * qx + qy * qy);
}

export function isLonLat(v: unknown): v is LonLat {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}
