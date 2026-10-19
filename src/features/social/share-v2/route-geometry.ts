/**
 * Route-line geometry for the share images. Pure, unit-tested.
 *
 * The post's routeShape (feed-route.ts) is a location-free polyline with the
 * first and last ROUTE_TRIM_M metres cut. So a whole km k of the run sits at
 * (k·1000 − trim) metres along the drawn line, out of (distance − 2·trim) —
 * as a fraction of the line's own length. No shape or a short run → no marks.
 */
import { ROUTE_TRIM_M } from '../services/feed-route';

export type Pt = [number, number];

/** Max markers on the line; longer runs mark every 2nd / 5th km instead. */
export const MAX_KM_MARKS = 10;

export interface KmMark {
  /** Fraction (0..1) along the drawn line. */
  f: number;
  km: number;
}

export function kmMarkFractions(distanceKm: number, trimM = ROUTE_TRIM_M): KmMark[] {
  if (!(distanceKm > 0)) return [];
  const drawnM = distanceKm * 1000 - trimM * 2;
  if (drawnM <= 0) return [];
  const whole = Math.floor(distanceKm);
  const step = whole <= MAX_KM_MARKS ? 1 : whole <= MAX_KM_MARKS * 2 ? 2 : 5;
  const out: KmMark[] = [];
  for (let k = step; k <= whole; k += step) {
    const f = (k * 1000 - trimM) / drawnM;
    if (f > 0.02 && f < 0.98) out.push({ f: Math.round(f * 1000) / 1000, km: k });
  }
  return out;
}

/** [x0,y0,x1,y1,…] → points fitted (aspect kept, centred) into a w×h box. */
export function fitRoutePoints(shape: unknown, w: number, h: number, pad = 0): Pt[] {
  if (!Array.isArray(shape) || shape.length < 6 || shape.length % 2 !== 0) return [];
  const nums = shape.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return [];
  const pts: Pt[] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const sw = Math.max(...xs) - minX;
  const sh = Math.max(...ys) - minY;
  if (sw <= 0 && sh <= 0) return [];
  const scale = Math.min((w - pad * 2) / (sw || 1), (h - pad * 2) / (sh || 1));
  const offX = (w - sw * scale) / 2;
  const offY = (h - sh * scale) / 2;
  return pts.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale]);
}

/** The point at fraction f (0..1) of a polyline's length. */
export function pointAtFraction(pts: Pt[], f: number): Pt | null {
  if (pts.length < 2) return null;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  if (total <= 0) return null;
  let target = Math.min(1, Math.max(0, f)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const t = seg[i] > 0 ? Math.min(1, target / seg[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    target -= seg[i];
  }
  return null;
}
