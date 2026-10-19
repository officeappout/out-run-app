/**
 * Plain route → the ONE overview drawer (route mode, boards M-5a / M-5b).
 * Pure helpers — everything is derived from data the Route already carries
 * (distance, path, routeShape, qualitySignals, elevationGain,
 * elevationProfile, nearbyAmenities, facilityStops). No fetches.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import type { AmenityCategory } from '@/features/parks/core/types/osm-amenity.types';
import { haversineKm } from '@/features/arena/utils/distance';
import { isRouteLitVerified } from '@/features/parks/core/services/route-quality-badges.service';
import { readElevationSamples, type ElevationSamples } from '@/features/workout-engine/players/running/lib/route-elevation-ahead';
import { formatMinutes } from '../../hybrid/hybrid-format';
import type { OverviewLeg } from '../overview-legs';

export type RouteActivity = 'walking' | 'running' | 'cycling';
export const ROUTE_ACTIVITIES: readonly RouteActivity[] = ['walking', 'running', 'cycling'];

/**
 * Minutes per km by activity — the same table the route editor uses to store
 * `route.duration` (route-geometry-edit.service: cycling 3 · running 6 ·
 * walking 12), so the trio's numbers agree with the stored duration.
 */
export const ACTIVITY_MIN_PER_KM: Record<RouteActivity, number> = { walking: 12, running: 6, cycling: 3 };

export const ACTIVITY_LABEL: Record<RouteActivity, string> = { walking: 'הליכה', running: 'ריצה', cycling: 'רכיבה' };

export function activityMinutes(distanceKm: number, activity: RouteActivity): number {
  const km = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  return Math.max(1, Math.round(km * ACTIVITY_MIN_PER_KM[activity]));
}

/** The route's own activity when it is one of the three; otherwise the caller's. */
export function initialRouteActivity(route: Pick<Route, 'activityType' | 'type'>, fallback?: string | null): RouteActivity {
  const own = route.activityType ?? route.type;
  if (own === 'walking' || own === 'running' || own === 'cycling') return own;
  if (fallback === 'walking' || fallback === 'running' || fallback === 'cycling') return fallback;
  return 'running';
}

/** The running player has walking and running session modes; a ride runs as a free run (same as FreeRunDrawer). */
export function playerActivityFor(activity: RouteActivity): 'walking' | 'running' {
  return activity === 'walking' ? 'walking' : 'running';
}

const LOOP_CLOSE_KM = 0.15;

/** A loop returns to its start — stored shape first, else the path's closure. */
export function isLoopRoute(route: Pick<Route, 'routeShape' | 'path'>): boolean {
  if (route.routeShape) return route.routeShape === 'loop';
  const p = route.path;
  if (!Array.isArray(p) || p.length < 3) return false;
  const [a, b] = [p[0], p[p.length - 1]];
  return haversineKm(a[1], a[0], b[1], b[0]) <= LOOP_CLOSE_KM;
}

/** The route's legs: optional walk there / back + ONE expandable aerobic leg. */
export function buildRouteLegs(
  route: Pick<Route, 'name' | 'distance' | 'routeShape' | 'path'>,
  activity: RouteActivity,
  walk: { thereMin: number; backMin: number } | null,
): OverviewLeg[] {
  const min = activityMinutes(route.distance, activity);
  const label = ACTIVITY_LABEL[activity];
  const legs: OverviewLeg[] = [];
  if (walk && walk.thereMin > 0) legs.push({ kind: 'transport', key: 'walk-there', phase: 'there', label: 'הליכה אל המסלול', minutes: walk.thereMin });
  legs.push({
    kind: 'aerobic',
    key: 'route',
    activity,
    durationSec: min * 60,
    distanceKm: route.distance,
    layout: 'standard',
    title: `${label} · ${route.name?.trim() || 'מסלול'}`,
    badge: label,
    meta: [
      { key: 'km', icon: 'distance', text: `${(route.distance ?? 0).toFixed(1)} ק״מ` },
      { key: 'min', icon: 'time', text: formatMinutes(min * 60) },
    ],
    // A ride has no meaningful per-km pace pill.
    paceSecPerKm: activity === 'cycling' ? undefined : ACTIVITY_MIN_PER_KM[activity] * 60,
    loopNote: isLoopRoute(route),
    expandable: true,
  });
  if (walk && walk.backMin > 0) legs.push({ kind: 'transport', key: 'walk-back', phase: 'back', label: 'הליכה חזרה', minutes: walk.backMin });
  return legs;
}

/**
 * Walk to the route and back (display only). Only a loop ends where it started,
 * so only a loop gets the walk-back leg; the walk there is the map's real
 * Mapbox walk time for the focused route (useMapStore.walkToRouteMinutes).
 */
export function routeWalkLegs(walkToRouteMinutes: number | null | undefined, loop: boolean): { thereMin: number; backMin: number } | null {
  const m = walkToRouteMinutes != null && Number.isFinite(walkToRouteMinutes) ? Math.round(walkToRouteMinutes) : 0;
  if (m <= 0) return null;
  return { thereMin: m, backMin: loop ? m : 0 };
}

// ── Leg details (M-5b) ─────────────────────────────────────────────────────

export interface RouteDetailChip { key: 'lighting' | 'dedicated' | 'ascent'; label: string }

/** Lighting (verified only), dedicated path share, ascent — positive / known only. */
export function routeDetailChips(route: Pick<Route, 'qualitySignals' | 'elevationGain'>, samples: ElevationSamples | null): RouteDetailChip[] {
  const chips: RouteDetailChip[] = [];
  if (isRouteLitVerified(route)) {
    const pct = route.qualitySignals?.lighting?.litCoveragePct;
    chips.push({ key: 'lighting', label: pct != null && Number.isFinite(pct) ? `מואר ${Math.round(pct)}%` : 'מואר' });
  }
  const genuine = route.qualitySignals?.composition?.genuinePct;
  if (genuine != null && Number.isFinite(genuine) && genuine > 0) chips.push({ key: 'dedicated', label: `שביל ייעודי ${Math.round(genuine)}%` });
  const gain = route.elevationGain ?? (samples ? elevationSummary(samples).gainM : null);
  if (gain != null && Number.isFinite(gain) && gain >= 1) chips.push({ key: 'ascent', label: `${Math.round(gain)} מ׳ עלייה` });
  return chips;
}

export interface ElevationSummary {
  minM: number;
  maxM: number;
  gainM: number;
  lengthKm: number;
  /** The steepest stretch (~a quarter of the route), when it climbs ≥ 5 m. */
  climb: { fromKm: number; toKm: number; riseM: number } | null;
}

export const MIN_HIGHLIGHT_RISE_M = 5;

export function elevationSummary(s: ElevationSamples): ElevationSummary {
  const e = s.elevationsM;
  let gain = 0;
  for (let i = 1; i < e.length; i++) if (e[i] > e[i - 1]) gain += e[i] - e[i - 1];
  const win = Math.max(1, Math.round((e.length - 1) / 4));
  let best = { i: 0, rise: -Infinity };
  for (let i = 0; i + win < e.length; i++) {
    const rise = e[i + win] - e[i];
    if (rise > best.rise) best = { i, rise };
  }
  const climb = best.rise >= MIN_HIGHLIGHT_RISE_M
    ? { fromKm: (best.i * s.stepM) / 1000, toKm: ((best.i + win) * s.stepM) / 1000, riseM: Math.round(best.rise) }
    : null;
  return {
    minM: Math.min(...e), maxM: Math.max(...e), gainM: Math.round(gain),
    lengthKm: ((e.length - 1) * s.stepM) / 1000, climb,
  };
}

export function routeElevation(route: unknown): ElevationSamples | null {
  return readElevationSamples(route);
}

/**
 * SVG geometry for the profile (RTL: the start on the RIGHT, x = W at 0 m).
 * Returns the line path, the closed area path and the climb highlight (x, width).
 */
export function elevationPaths(s: ElevationSamples, w: number, h: number, pad = 2): {
  line: string; area: string; highlight: { x: number; width: number } | null;
} {
  const sum = elevationSummary(s);
  const span = Math.max(1, sum.maxM - sum.minM);
  const n = s.elevationsM.length - 1;
  const x = (i: number) => +(w - (i / n) * w).toFixed(1);
  const y = (v: number) => +(pad + (1 - (v - sum.minM) / span) * (h - pad * 2)).toFixed(1);
  const pts = s.elevationsM.map((v, i) => `${x(i)} ${y(v)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L0 ${h} L${w} ${h} Z`;
  let highlight: { x: number; width: number } | null = null;
  if (sum.climb && sum.lengthKm > 0) {
    const a = x(Math.round((sum.climb.fromKm * 1000) / s.stepM));
    const b = x(Math.round((sum.climb.toKm * 1000) / s.stepM));
    highlight = { x: Math.min(a, b), width: Math.abs(a - b) };
  }
  return { line, area, highlight };
}

// ── Along the route (km from the start) ─────────────────────────────────────

export type AlongPointKind = 'start' | 'stop' | AmenityCategory;
export interface AlongPoint { key: string; kind: AlongPointKind; label: string; km: number }

const AMENITY_LABEL: Partial<Record<AmenityCategory, string>> = {
  drinking_water: 'ברזייה', bench: 'ספסלים', fitness_station: 'מתקני כושר', court: 'מגרש ספורט', dog_park: 'גינת כלבים',
};
export const MAX_ALONG_POINTS = 6;
/** Same-label points closer than this collapse into the first. */
const DEDUPE_KM = 0.3;

/** Cumulative km at each path vertex ([lng, lat] pairs). */
export function cumulativeKm(path: readonly [number, number][]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    out.push(out[i - 1] + haversineKm(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]));
  }
  return out;
}

function nearestVertex(path: readonly [number, number][], lat: number, lng: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = haversineKm(lat, lng, path[i][1], path[i][0]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Start + facility stops + nearby amenities, ordered by km from the start (capped). */
export function alongRoutePoints(route: Pick<Route, 'path' | 'facilityStops' | 'nearbyAmenities'>, max = MAX_ALONG_POINTS): AlongPoint[] {
  const path = route.path;
  if (!Array.isArray(path) || path.length < 2) return [];
  const cum = cumulativeKm(path);
  const pts: AlongPoint[] = [];
  for (const s of route.facilityStops ?? []) {
    const idx = Number.isInteger(s.waypointIndex) && s.waypointIndex >= 0 && s.waypointIndex < path.length
      ? s.waypointIndex : nearestVertex(path, s.lat, s.lng);
    pts.push({ key: `stop-${s.id}`, kind: 'stop', label: s.name, km: cum[idx] });
  }
  for (const a of route.nearbyAmenities ?? []) {
    const label = AMENITY_LABEL[a.category];
    if (!label || !a.location) continue;
    pts.push({ key: `am-${a.amenityId}`, kind: a.category, label, km: cum[nearestVertex(path, a.location.lat, a.location.lng)] });
  }
  pts.sort((p, q) => p.km - q.km);
  const kept: AlongPoint[] = [];
  for (const p of pts) {
    if (kept.some((k) => k.label === p.label && Math.abs(k.km - p.km) < DEDUPE_KM)) continue;
    kept.push(p);
  }
  if (kept.length === 0) return [];
  const start: AlongPoint = { key: 'start', kind: 'start', label: 'התחלה', km: 0 };
  return [start, ...kept].slice(0, max);
}

/** Placeholder prose until per-route descriptions come from the admin panel. */
export function routeDescription(route: Pick<Route, 'description' | 'distance' | 'city'>, cityName?: string): string {
  const own = route.description?.trim();
  if (own) return own;
  const city = cityName ?? route.city;
  return `מסלול של ${(route.distance ?? 0).toFixed(1)} ק״מ${city ? `, ב${city}` : ''}.`;
}

/** "HH:MM" finish estimate. */
export function finishClock(nowMs: number, totalMin: number): string {
  const d = new Date(nowMs + totalMin * 60_000);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
