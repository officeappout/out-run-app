/**
 * intent-routes.service.ts — Intent-first "3 distinct options" selector.
 *
 * Given an ORIGIN + a target distance, build up to 3 route options from the
 * EXISTING curated data (published `official_routes` — Zichron 27 + curated
 * loops), NOT the dynamic generator. The 3 options sit on an access-effort
 * axis (quality rises with effort):
 *
 *   here  — starts AT the user (≤150 m). A curated loop if one exists, else a
 *           synthesized out-and-back (built via Mapbox — not the generator).
 *           This is the "מומלץ" default.
 *   near  — a nicer route a short WALK away (≤1.2 km) — "X דק' הליכה".
 *   drive — the best route in the AREA, a short DRIVE away (≤10 km) — "X דק' נסיעה".
 *
 * Each bucket is a RANKED list: index 0 is shown, the rest feed the "החלף"
 * (swap-within-same-bucket) affordance.
 *
 * Architecture: `selectIntentOptions` is PURE (routes in → buckets out, no IO)
 * so it is unit-testable in Node. `buildIntentOptions` is the IO shell — it
 * dynamic-imports the client Firestore service + Mapbox (matching this repo's
 * dynamic-import convention) so importing the pure core never evaluates the
 * client SDK.
 *
 * Distance unit: `official_routes.distance` is KILOMETRES (unit-of-truth fix).
 * Paths are `[lng,lat]` tuples once through `fetchOfficialRoutes`.
 */
import type { Route, ActivityType } from '../types/route.types';
import { distanceToRouteStart, haversineMeters } from './geoUtils';

export type IntentBucket = 'here' | 'near' | 'drive';
export type RouteShape = 'loop' | 'out_and_back' | 'point_to_point';

export interface IntentOption {
  bucket: IntentBucket;
  route: Route;
  shape: RouteShape;
  /** ×N laps applied so a short curated loop fits the target (1 for non-loops). */
  laps: number;
  /** The distance the user actually covers: route.distance × laps (km). */
  effectiveKm: number;
  /** Straight-line distance origin → route start, in metres. */
  accessMeters: number;
  /** Estimated access time: walk (here/near) or drive (drive), in minutes. */
  accessMinutes: number;
  /** Ranking value within the bucket (higher = better). */
  quality: number;
  /** True for the on-the-fly out-and-back (not a stored curated route). */
  synthetic?: boolean;
}

export interface IntentOptionsResult {
  here: IntentOption[];
  near: IntentOption[];
  drive: IntentOption[];
}

export interface IntentParams {
  origin: { lat: number; lng: number };
  targetKm: number;
  activity: ActivityType;
  /** Optional Firestore scoping; omitted → all published routes (capped). */
  authorityIds?: string[];
  /** Distance-fit window around targetKm (fraction). Default 0.35. */
  tolerance?: number;
}

// ── Tunable constants ────────────────────────────────────────────────────────
/** Access-effort bucket thresholds (metres from origin to route start). */
const HERE_MAX_M = 150;
const NEAR_MAX_M = 1200;
const DRIVE_MAX_M = 10000;
/** ETA estimates (metres/minute). walk ≈ 4.8 km/h, drive ≈ 30 km/h urban. */
const WALK_M_PER_MIN = 80;
const DRIVE_M_PER_MIN = 500;
/** Default distance-fit window around the user's target. */
const DEFAULT_TOLERANCE = 0.35;
/** start≈end ⇒ loop (mirrors geo-discovery LOOP_CLOSE_M / isLoopRoute 50m). */
const LOOP_CLOSE_M = 60;

// ── Pure helpers (all field-guarded) ─────────────────────────────────────────
function isLoopGeom(route: Route): boolean {
  const p = route?.path;
  if (!Array.isArray(p) || p.length < 3) return false;
  const a = p[0], b = p[p.length - 1];
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  // path is [lng,lat]; haversineMeters takes (lat,lng,lat,lng).
  return haversineMeters(a[1], a[0], b[1], b[0]) < LOOP_CLOSE_M;
}

function activityMatches(route: Route, activity: ActivityType): boolean {
  const list = route?.activityTypes?.length
    ? route.activityTypes
    : [route?.activityType ?? route?.type];
  // Permissive: a route with no activity metadata is eligible for any activity.
  return list.length === 0 || list.some((a) => a == null || a === activity);
}

/** ×N laps so a short curated loop reaches the target; non-loops stay at 1. */
function fitLaps(route: Route, isLoop: boolean, targetKm: number): number {
  const km = route?.distance ?? 0;
  if (!isLoop || !(km > 0)) return 1;
  return Math.max(1, Math.round(targetKm / km));
}

/** Transparent quality score: scenic + rating + capped score/usage/climb. */
function qualityOf(route: Route): number {
  const scenic = route?.features?.scenic ? 1 : 0;
  const rating = Number(route?.rating) || 0;
  const score = Number(route?.score) || 0;
  const usage = Number(route?.analytics?.usageCount) || 0;
  const gain = Number((route as { elevationGain?: number })?.elevationGain) || 0;
  return scenic * 20 + rating * 8 + Math.min(score, 60) + Math.min(usage, 20) + Math.min(gain / 10, 10);
}

function bucketFor(accessMeters: number): IntentBucket | null {
  if (accessMeters <= HERE_MAX_M) return 'here';
  if (accessMeters <= NEAR_MAX_M) return 'near';
  if (accessMeters <= DRIVE_MAX_M) return 'drive';
  return null;
}

/**
 * PURE core — rank already-fetched routes into the 3 access-effort buckets.
 * No IO, deterministic. Does NOT include the synthesized out-and-back (that
 * needs Mapbox and is added by the IO shell). Exposed for unit tests / console.
 */
export function selectIntentOptions(routes: Route[], params: IntentParams): IntentOptionsResult {
  const { origin, targetKm, activity } = params;
  const tol = params.tolerance ?? DEFAULT_TOLERANCE;
  const opts: IntentOption[] = [];

  for (const route of routes ?? []) {
    if (!route?.path || route.path.length < 2) continue;
    if (!activityMatches(route, activity)) continue;
    const km = route.distance ?? 0;
    if (!(km > 0)) continue;

    const loop = isLoopGeom(route);
    const laps = fitLaps(route, loop, targetKm);
    const effectiveKm = +(km * laps).toFixed(2);
    if (Math.abs(effectiveKm - targetKm) > targetKm * tol) continue; // distance fit

    const accessKm = distanceToRouteStart(route, origin);
    if (!Number.isFinite(accessKm)) continue;
    const accessMeters = Math.round(accessKm * 1000);
    const bucket = bucketFor(accessMeters);
    if (!bucket) continue;

    const perMin = bucket === 'drive' ? DRIVE_M_PER_MIN : WALK_M_PER_MIN;
    opts.push({
      bucket,
      route,
      shape: loop ? 'loop' : 'point_to_point',
      laps,
      effectiveKm,
      accessMeters,
      accessMinutes: bucket === 'here' ? 0 : Math.max(1, Math.round(accessMeters / perMin)),
      quality: qualityOf(route),
    });
  }

  // Rank within a bucket: quality desc → closest to target → nearest access.
  const rank = (a: IntentOption, b: IntentOption) =>
    b.quality - a.quality ||
    Math.abs(a.effectiveKm - targetKm) - Math.abs(b.effectiveKm - targetKm) ||
    a.accessMeters - b.accessMeters;

  return {
    here: opts.filter((o) => o.bucket === 'here').sort(rank),
    near: opts.filter((o) => o.bucket === 'near').sort(rank),
    // TODO(Phase 3 / tweak): a linear (point_to_point) route in the DRIVE bucket
    // strands the user far from their car. Present drive-bucket linear trails as
    // out-and-back (mirror the geometry) so every drive option returns to the
    // parking spot. Loops are already fine.
    drive: opts.filter((o) => o.bucket === 'drive').sort(rank),
  };
}

// ── Out-and-back synthesis (IO — Mapbox) ─────────────────────────────────────
/** Destination point `distKm` away from origin along `bearingDeg` (great-circle). */
function destPoint(origin: { lat: number; lng: number }, distKm: number, bearingDeg: number): { lat: number; lng: number } {
  const R = 6371;
  const d = distKm / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

function syntheticRoute(path: [number, number][], distanceKm: number, durationSec: number, activity: ActivityType, origin: { lat: number; lng: number }, targetKm: number): Route {
  const km = +distanceKm.toFixed(2);
  return {
    id: `oab-${Math.round(origin.lat * 1e4)}-${Math.round(origin.lng * 1e4)}-${Math.round(targetKm * 10)}`,
    name: `הלוך-חזור ${km} ק״מ`,
    description: 'מסלול הלוך-חזור מהמיקום שלך',
    distance: km,
    duration: Math.max(1, Math.round(durationSec / 60)),
    score: 0,
    type: activity,
    activityType: activity,
    activityTypes: [activity],
    difficulty: km > 8 ? 'hard' : km > 3.5 ? 'medium' : 'easy',
    rating: 0,
    calories: Math.round(km * 65),
    features: { hasGym: false, hasBenches: false, scenic: false, lit: false, terrain: '', environment: '', trafficLoad: 'none', surface: activity === 'cycling' ? 'road' : '' },
    segments: [],
    path,
    source: { type: 'system', name: 'out-and-back' },
  } as Route;
}

/**
 * Build an out-and-back from the origin toward a point at half the target
 * distance, routed there-and-back via Mapbox (existing engine — not the
 * generator). Tries a few bearings and keeps the round-trip whose length is
 * closest to the target. Returns null if Mapbox yields nothing.
 */
export async function buildOutAndBack(origin: { lat: number; lng: number }, targetKm: number, activity: ActivityType): Promise<IntentOption | null> {
  if (!origin || !(targetKm > 0)) return null;
  const { MapboxService } = await import('./mapbox.service');
  const profile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';
  const halfKm = targetKm / 2;
  const bearings = [0, 90, 180, 270];
  let best: { path: [number, number][]; km: number; dur: number } | null = null;

  for (const brng of bearings) {
    const dest = destPoint(origin, halfKm, brng);
    const res = await MapboxService.getSmartPath(
      { lng: origin.lng, lat: origin.lat },
      { lng: origin.lng, lat: origin.lat },
      profile,
      [{ lng: dest.lng, lat: dest.lat }],
    );
    if (!res?.path || res.path.length < 2) continue;
    const km = res.distance / 1000;
    if (!best || Math.abs(km - targetKm) < Math.abs(best.km - targetKm)) {
      best = { path: res.path, km, dur: res.duration };
    }
  }
  if (!best) return null;

  const route = syntheticRoute(best.path, best.km, best.dur, activity, origin, targetKm);
  return {
    bucket: 'here',
    route,
    shape: 'out_and_back',
    laps: 1,
    effectiveKm: +best.km.toFixed(2),
    accessMeters: 0,
    accessMinutes: 0,
    quality: 0,
    synthetic: true,
  };
}

/**
 * SLOT for the clean generated loop (option 1, priority 2).
 *
 * "כאן ועכשיו" priority: curated loop → clean GENERATED loop (returns by a
 * DIFFERENT way, not a there-and-back) → out-and-back safety net. The generated
 * loop is produced by route-generator.service (branch feat/route-generator-quality
 * — "generator A"). Until that returns clean, non-backtracking loops, this stub
 * returns null and the chain falls through to the out-and-back. Wire it here when
 * the generator is clean — nothing else in the chain changes.
 */
export async function buildGeneratedLoop(
  _origin: { lat: number; lng: number },
  _targetKm: number,
  _activity: ActivityType,
): Promise<IntentOption | null> {
  // TODO(generator-clean): call generateDynamicRoutes({ userLocation, targetKm,
  // activity, ... }) loop mode, take the best clean loop, wrap as an IntentOption
  // { bucket:'here', shape:'loop', synthetic:true }. Returns null for now.
  return null;
}

/**
 * IO shell — fetch published curated routes, rank into buckets, and guarantee
 * option 1 ("here & now") via the priority chain:
 *   curated loop at the user → clean generated loop → out-and-back.
 */
export async function buildIntentOptions(params: IntentParams): Promise<IntentOptionsResult> {
  const { InventoryService } = await import('./inventory.service');
  const routes = await InventoryService.fetchOfficialRoutes(params.authorityIds, true);
  const result = selectIntentOptions(routes, params);

  // Only synthesize when no curated loop already starts at the user.
  const hasHereLoop = result.here.some((o) => o.shape === 'loop');
  if (!hasHereLoop) {
    const generated = await buildGeneratedLoop(params.origin, params.targetKm, params.activity);
    const fallback = generated ?? await buildOutAndBack(params.origin, params.targetKm, params.activity);
    if (fallback) result.here.unshift(fallback); // becomes the recommended option 1
  }
  return result;
}
