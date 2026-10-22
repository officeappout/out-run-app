/**
 * POST /api/routes/generate — request/response shapes and validation.
 * Pure (shared by the route handler and the app-side client).
 */
import { parseWireOurRoutes, type WireOurRoute } from './our-routes/wire';
import type { ShadePrefMeta } from './shade-pref';
import type { TimeAwareMeta } from './time-aware-pref';

export type { ShadePrefMeta, TimeAwareMeta };

export type GenerateActivity = 'running' | 'walking' | 'cycling';

export interface GenerateLoopsRequest {
  mode: 'loop';
  start: { lat: number; lng: number };
  targetKm: number;
  activity: GenerateActivity;
  seed?: number;
  maxResults?: number;
  /** Our mapped routes near the start (enable_loops_prefer_official) — see lib/routing/our-routes. */
  ourRoutes?: WireOurRoute[];
  /** "Shadiest route" (enable_route_pref_shade): rank candidates by Technion shade where the city has a layer. */
  preferShade?: boolean;
  /** The app's resolved city name — picks the shade / hourly-shade / lighting layer. Only read with preferShade, timeAware or shadeTag. */
  city?: string;
  /**
   * Time-aware preference (enable_route_time_aware): hot sunny hours → hourly shade at that
   * hour, after dark → lit streets, otherwise neutral. Ignored when preferShade is set.
   */
  timeAware?: boolean;
  /** ISO instant the run starts (timeAware only); default = server now. Must be within ±24 h. */
  at?: string;
  /**
   * enable_route_shade_tag: add `shadedPct` to each loop the city's shade layer measures
   * (the card's "🌳 מוצל X%"). Never changes the ranking. Absent = the response is unchanged.
   */
  shadeTag?: boolean;
}

export interface GenerateAbRequest {
  mode: 'ab';
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  activity: GenerateActivity;
}

export type GenerateRequest = GenerateLoopsRequest | GenerateAbRequest;

/** One loop as sent over the wire (heavy per-mark arrays dropped). */
export interface GeneratedLoopDto {
  source: 'round_trip' | 'via_loop';
  path: [number, number][];
  distanceKm: number;
  timeMin: number;
  ascendM: number;
  maxGradePct: number;
  pass: boolean;
  reasons: string[];
  score: number;
  /** 0..1 on tertiary+ roads (OSM layer, else GraphHopper road_class). */
  majorRoadPct: number | null;
  /** Unmarked tertiary+ crossings per km; null when the OSM layer was unavailable. */
  unmarkedCrossingsPerKm: number | null;
  retracedPct: number;
  compactness: number;
  /** Mean Technion shade index (0..1) — only with preferShade, null when not measured. */
  shadeShare?: number | null;
  /** Mean hourly shade (0..1) at the requested hour — only when timeAware ranked by shade, null when not measured. */
  hourShade?: number | null;
  /** Lit length ÷ route length (0..1) — only when timeAware ranked by lighting, null when no lighting data matched. */
  litShare?: number | null;
  /** % of the measured length on shaded segments (0..100) — only with shadeTag, and only when measured (absent otherwise). */
  shadedPct?: number;
}

export interface GenerateLoopsResponse {
  backend: 'graphhopper';
  loops: GeneratedLoopDto[];
  calls: number;
  timedOut: boolean;
  osmLayer: boolean;
  /** Only when the request asked for preferShade: whether shade ranking was applied, and why not. */
  shade?: ShadePrefMeta;
  /** Only when the request asked for timeAware (and not preferShade): the mode and whether it applied. */
  timeAware?: TimeAwareMeta;
}

export interface GenerateAbResponse {
  backend: 'graphhopper';
  route: { path: [number, number][]; distanceKm: number; timeMin: number; ascendM: number; maxGradePct: number; majorRoadPct: number } | null;
}

const ISRAEL = { south: 29.3, north: 33.5, west: 34.0, east: 35.95 };
const ACTIVITIES: GenerateActivity[] = ['running', 'walking', 'cycling'];

function point(v: unknown): { lat: number; lng: number } | null {
  const p = v as { lat?: unknown; lng?: unknown } | null;
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return null;
  if (!(p.lat >= ISRAEL.south && p.lat <= ISRAEL.north && p.lng >= ISRAEL.west && p.lng <= ISRAEL.east)) return null;
  return { lat: p.lat, lng: p.lng };
}

/** A run start instant within ±24 h of now (ISO), else undefined (server now is used). */
function parseAt(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 40) return undefined;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 24 * 3_600_000) return undefined;
  return new Date(t).toISOString();
}

/** Parsed request, or a short error code. */
export function parseGenerateRequest(body: unknown): GenerateRequest | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const activity = b.activity as GenerateActivity;
  if (!ACTIVITIES.includes(activity)) return { error: 'bad_activity' };
  if ((b.mode ?? 'loop') === 'loop') {
    const start = point(b.start);
    if (!start) return { error: 'bad_start' };
    const maxKm = activity === 'cycling' ? 60 : 30;
    const targetKm = b.targetKm;
    if (typeof targetKm !== 'number' || !(targetKm >= 1 && targetKm <= maxKm)) return { error: 'bad_target' };
    const seed = typeof b.seed === 'number' && Number.isFinite(b.seed) ? Math.trunc(Math.abs(b.seed)) % 1_000_000 : 0;
    const maxResults = typeof b.maxResults === 'number' ? Math.max(1, Math.min(3, Math.trunc(b.maxResults))) : 3;
    // Malformed / oversized ourRoutes is dropped, not an error: the loop still runs, without it.
    const ourRoutes = b.ourRoutes === undefined ? undefined : parseWireOurRoutes(b.ourRoutes);
    const city = typeof b.city === 'string' && b.city.trim() && b.city.length <= 80 ? b.city.trim() : undefined;
    return {
      mode: 'loop', start, targetKm, activity, seed, maxResults,
      ...(ourRoutes ? { ourRoutes } : {}),
      ...(b.preferShade === true ? { preferShade: true, ...(city ? { city } : {}) } : {}),
      ...(b.preferShade !== true && b.timeAware === true
        ? { timeAware: true, ...(city ? { city } : {}), ...(parseAt(b.at) ? { at: parseAt(b.at)! } : {}) }
        : {}),
      // enable_route_shade_tag: `shadedPct` per measured loop (needs the city too).
      ...(b.shadeTag === true ? { shadeTag: true, ...(city ? { city } : {}) } : {}),
    };
  }
  if (b.mode === 'ab') {
    const from = point(b.from), to = point(b.to);
    if (!from || !to) return { error: 'bad_points' };
    return { mode: 'ab', from, to, activity };
  }
  return { error: 'bad_mode' };
}
