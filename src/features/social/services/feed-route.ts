/**
 * The route line on a cardio feed post (home v2, design lab "run post").
 *
 * Privacy first: the post never carries a coordinate. The recorded GPS path
 * ([lng, lat] pairs, as useRunningPlayer saves it) is
 *   1. trimmed — the first and last ROUTE_TRIM_M metres are cut, so where
 *      the run starts/ends (usually home) isn't drawn;
 *   2. downsampled to at most ROUTE_MAX_POINTS points;
 *   3. projected and normalised into a 0..ROUTE_BOX box (north up), with
 *      the geographic origin thrown away.
 * What's stored on feed_posts.routeShape is just that flat [x0, y0, x1, y1, …]
 * integer list — a shape, not a place. The card draws it as an SVG line; no
 * map tiles, no token, no address.
 *
 * Pure — no Firebase, unit-tested.
 */

export type LngLat = [number, number];

export const ROUTE_TRIM_M = 200;
export const ROUTE_MAX_POINTS = 64;
export const ROUTE_BOX = 1000;
/** What's left after trimming must be at least this long to be worth drawing. */
const MIN_DRAWN_M = 200;

function haversineM(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function validPoints(path: unknown): LngLat[] {
  if (!Array.isArray(path)) return [];
  const out: LngLat[] = [];
  for (const p of path) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const lng = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lng === 0 && lat === 0) continue;
    out.push([lng, lat]);
  }
  return out;
}

/** Cut the first and last `trimM` metres of the path ([] when too short). */
export function trimRouteEnds(path: LngLat[], trimM = ROUTE_TRIM_M): LngLat[] {
  if (path.length < 2) return [];
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineM(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  if (total < trimM * 2 + MIN_DRAWN_M) return [];
  return path.filter((_, i) => cum[i] >= trimM && cum[i] <= total - trimM);
}

/** Keep at most `max` points, evenly by index, always the last one. */
export function downsampleRoute<T>(path: T[], max = ROUTE_MAX_POINTS): T[] {
  if (path.length <= max) return path;
  const out: T[] = [];
  const step = (path.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(path[Math.round(i * step)]);
  return out;
}

/**
 * Recorded GPS path → the post's location-free route shape, or null when
 * there's nothing worth drawing (no GPS, treadmill, a very short run).
 */
export function buildRouteShape(path: unknown): number[] | null {
  const pts = downsampleRoute(trimRouteEnds(validPoints(path)));
  if (pts.length < 3) return null;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([lng, lat]) => [lng * k, -lat] as const);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  if (!(span > 0)) return null;
  const scale = ROUTE_BOX / span;
  const out: number[] = [];
  for (const [x, y] of xy) out.push(Math.round((x - minX) * scale), Math.round((y - minY) * scale));
  return out;
}

export interface RouteSvg {
  /** SVG path data for the line. */
  d: string;
  start: [number, number];
  end: [number, number];
}

/**
 * The stored shape → an SVG line fitted (aspect kept, centred) into a
 * width × height viewBox with `pad` around it. null for a missing/bad shape.
 */
export function routeShapeToSvg(shape: unknown, width: number, height: number, pad = 16): RouteSvg | null {
  if (!Array.isArray(shape) || shape.length < 6 || shape.length % 2 !== 0) return null;
  const nums = shape.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const pts: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  if (w <= 0 && h <= 0) return null;
  const scale = Math.min((width - pad * 2) / (w || 1), (height - pad * 2) / (h || 1));
  const offX = (width - w * scale) / 2;
  const offY = (height - h * scale) / 2;
  const map = ([x, y]: [number, number]): [number, number] => [
    Math.round((offX + (x - minX) * scale) * 10) / 10,
    Math.round((offY + (y - minY) * scale) * 10) / 10,
  ];
  const mapped = pts.map(map);
  const d = mapped.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return { d, start: mapped[0], end: mapped[mapped.length - 1] };
}
