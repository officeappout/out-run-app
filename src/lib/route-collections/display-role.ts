/**
 * Route display role (RC10, owner decision 22.10.2026).
 *
 * Some official_routes docs are not routes a user should pick on their own —
 * short "transition segments" a municipality drew to stitch its real routes
 * together (Sderot's own import: "מקטע 2", "תוספת א שכונת הנביאים", …). They
 * stay in the data (the corridor engine / loop builder may still stitch with
 * them) but user-facing route lists skip them.
 *
 *   displayRole: 'connector'  — hidden from user-facing route lists
 *   displayRole absent / null — an ordinary route (every doc today)
 *
 * Hiding is behind the panel flag enable_hide_route_connectors (fail-closed,
 * default false): flag off = every list exactly as before, field or no field.
 *
 * Pure, zero Firebase imports — usable from the app, the panel and Node scripts.
 */

export const ROUTE_DISPLAY_ROLES = ['connector'] as const;
export type RouteDisplayRole = (typeof ROUTE_DISPLAY_ROLES)[number];

/** True when a route doc is marked as a connector (hidden from user-facing lists when the flag is on). */
export function isConnectorRoute(route: { displayRole?: unknown } | null | undefined): boolean {
  return route?.displayRole === 'connector';
}

/**
 * User-facing filter. `enabled` is the enable_hide_route_connectors flag value.
 * Off → returns the SAME array instance (byte-identical behaviour, no copy).
 */
export function hideConnectorRoutes<T extends { displayRole?: unknown }>(routes: T[], enabled: boolean): T[] {
  if (!enabled) return routes;
  return routes.filter((r) => !isConnectorRoute(r));
}

// ── The connector rule (used by the backfill script; pure) ─────────────────

/**
 * Name prefixes a municipality uses for pieces that are not stand-alone routes:
 * "מקטע" (segment), "תוספת" (extension A/B of a neighbourhood loop), "הפרד"
 * (a split/separator piece). Matched at the start of the trimmed name.
 */
export const CONNECTOR_NAME_PATTERN = /^(מקטע|תוספת|הפרד)/;
/** A route whose start and end are farther apart than this is open (not a loop). */
export const CONNECTOR_MIN_OPEN_GAP_M = 50;
/** Both ends must lie within this distance of ANOTHER route's line — it connects something. */
export const CONNECTOR_ATTACH_M = 40;

export type LngLat = [number, number];

export interface ConnectorCandidate {
  id: string;
  name: string;
  /** [lng, lat] points, path order. */
  path: LngLat[];
}

export type ConnectorVerdict =
  | { id: string; connector: true; lengthM: number; endGapM: number; startAttachM: number; endAttachM: number; startTo: string; endTo: string }
  | { id: string; connector: false; reason: 'name' | 'closed' | 'detached' | 'no_path'; lengthM: number; endGapM: number | null; startAttachM: number | null; endAttachM: number | null };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

function toXY(p: LngLat, o: LngLat): [number, number] {
  return [rad(p[0] - o[0]) * R * Math.cos(rad(o[1])), rad(p[1] - o[1]) * R];
}

function distM(a: LngLat, b: LngLat): number {
  const [x, y] = toXY(b, a);
  return Math.hypot(x, y);
}

export function pathLengthM(path: LngLat[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += distM(path[i - 1], path[i]);
  return L;
}

/** Shortest distance (m) from a point to a polyline (local equirectangular — fine at ≤ km scale). */
export function pointToPathM(p: LngLat, path: LngLat[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distM(p, path[0]);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = toXY(path[i - 1], p);
    const b = toXY(path[i], p);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    const u = L2 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + u * dx, a[1] + u * dy));
  }
  return best;
}

function nearestOther(p: LngLat, selfId: string, all: ConnectorCandidate[]): { d: number; id: string } {
  let best = { d: Infinity, id: '' };
  for (const o of all) {
    if (o.id === selfId || o.path.length < 2) continue;
    const d = pointToPathM(p, o.path);
    if (d < best.d) best = { d, id: o.id };
  }
  return best;
}

/**
 * A route is a connector when ALL of:
 *   1. its trimmed name starts with מקטע / תוספת / הפרד (CONNECTOR_NAME_PATTERN);
 *   2. it is open — start and end > CONNECTOR_MIN_OPEN_GAP_M apart (a closed
 *      loop named "מקטע 21" is a real loop, not a connector);
 *   3. BOTH ends lie within CONNECTOR_ATTACH_M of another route of the same set.
 * Everything else is an ordinary route. Never guesses on length alone: a short
 * route with a real name ("פארק המוסיקה") stays visible.
 */
export function classifyConnectors(routes: ConnectorCandidate[]): ConnectorVerdict[] {
  return routes.map((r): ConnectorVerdict => {
    const lengthM = Math.round(pathLengthM(r.path));
    if (r.path.length < 2) return { id: r.id, connector: false, reason: 'no_path', lengthM, endGapM: null, startAttachM: null, endAttachM: null };
    const endGapM = Math.round(distM(r.path[0], r.path[r.path.length - 1]));
    const s = nearestOther(r.path[0], r.id, routes);
    const e = nearestOther(r.path[r.path.length - 1], r.id, routes);
    const startAttachM = Number.isFinite(s.d) ? Math.round(s.d) : null;
    const endAttachM = Number.isFinite(e.d) ? Math.round(e.d) : null;
    const base = { id: r.id, lengthM, endGapM, startAttachM, endAttachM };
    if (!CONNECTOR_NAME_PATTERN.test(String(r.name ?? '').trim())) return { ...base, connector: false, reason: 'name' };
    if (endGapM <= CONNECTOR_MIN_OPEN_GAP_M) return { ...base, connector: false, reason: 'closed' };
    if (!(s.d <= CONNECTOR_ATTACH_M && e.d <= CONNECTOR_ATTACH_M)) return { ...base, connector: false, reason: 'detached' };
    return { id: r.id, connector: true, lengthM, endGapM, startAttachM: startAttachM!, endAttachM: endAttachM!, startTo: s.id, endTo: e.id };
  });
}
