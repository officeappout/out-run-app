import { makeProjector } from '../geo';
import type { LngLat } from '../types';

/** Fixtures are drawn in local metres around a Tel Aviv origin, then converted to [lng, lat]. */
export const ORIGIN: LngLat = [34.774, 32.0779];
const proj = makeProjector(ORIGIN);
export const m = (pts: Array<[number, number]>): LngLat[] => pts.map(p => proj.toLngLat(p));

/** Densify a metre polyline so fixtures look like real Mapbox geometry (a vertex every ~10 m). */
export function dense(pts: Array<[number, number]>, step = 10): Array<[number, number]> {
  const out: Array<[number, number]> = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** 500 m square loop starting/ending at its south-west corner — 2 km. */
export const SQUARE = m(dense([[0, 0], [500, 0], [500, 500], [0, 500], [0, 0]]));

/** Same square with a 100 m dead-end spur off the middle of the east side. */
export const SQUARE_WITH_SPUR = m(dense([[0, 0], [500, 0], [500, 250], [600, 250], [500, 250], [500, 500], [0, 500], [0, 0]]));

/** 1 km straight out and back. */
export const OUT_AND_BACK = m(dense([[0, 0], [1000, 0], [0, 0]]));

/** Figure eight: crosses itself once in the middle. */
export const FIGURE_EIGHT = m(dense([[0, 0], [400, 400], [400, 0], [0, 400], [0, 0]]));

/** Lollipop: a 200 m stick out to a 400 m square and back along the stick. */
export const LOLLIPOP = m(dense([[0, 0], [0, 200], [200, 200], [200, 600], [-200, 600], [-200, 200], [0, 200], [0, 0]]));
