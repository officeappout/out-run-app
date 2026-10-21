/**
 * POST /api/routes/generate — request/response shapes and validation.
 * Pure (shared by the route handler and the app-side client).
 */
import { parseWireOurRoutes, type WireOurRoute } from './our-routes/wire';
import type { ShadePrefMeta } from './shade-pref';

export type { ShadePrefMeta };

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
  /** The app's resolved city name — picks the shade layer. Only read with preferShade. */
  city?: string;
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
}

export interface GenerateLoopsResponse {
  backend: 'graphhopper';
  loops: GeneratedLoopDto[];
  calls: number;
  timedOut: boolean;
  osmLayer: boolean;
  /** Only when the request asked for preferShade: whether shade ranking was applied, and why not. */
  shade?: ShadePrefMeta;
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
    };
  }
  if (b.mode === 'ab') {
    const from = point(b.from), to = point(b.to);
    if (!from || !to) return { error: 'bad_points' };
    return { mode: 'ab', from, to, activity };
  }
  return { error: 'bad_mode' };
}
