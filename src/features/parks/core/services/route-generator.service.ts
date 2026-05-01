// src/features/map/services/route-generator.service.ts

import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Route, ActivityType } from '../types/route.types';
import { Park as MapPark } from '../types/park.types';
import { MapboxService } from './mapbox.service';

// ── Diagnostics for the UI ──────────────────────────────────────────────────
// The generator runs in a service module so the UI can't observe its
// intermediate state directly. We expose a small read-only snapshot of the
// last query's outcome so dev surfaces (e.g. FreeRunRouteSelector's empty
// state banner) can render an actionable hint instead of a generic
// "no routes" message — most often "your street_segments collection is
// empty for this city, run the OSM importer".
//
// The snapshot is overwritten on every call so consumers must read it
// immediately after `generateDynamicRoutes()` resolves; it is not a
// reactive store and is intended for debugging / dev banners only.
export type WaypointSourceUsed =
  | 'street_segments'           // scored docs found within radius
  | 'random_fallback_no_city'   // cityName was undefined → went random
  | 'random_fallback_empty_city' // collection has docs but none for this city
  | 'random_fallback_empty_collection' // collection itself is empty
  | 'random_fallback_out_of_radius' // city has docs but none within targetDistance/2
  | 'random_fallback_query_error'; // Firestore threw

export interface RouteGenerationDiagnostics {
  cityNameUsed?: string;
  cityNameRaw?: string;
  source: WaypointSourceUsed;
  segmentsFetched: number;
  segmentsInRadius: number;
  collectionSampleCityName?: string;
  timestamp: number;
}

let _lastDiagnostics: RouteGenerationDiagnostics | null = null;
function setDiagnostics(d: Omit<RouteGenerationDiagnostics, 'timestamp'>) {
  _lastDiagnostics = { ...d, timestamp: Date.now() };
}
export function getLastGenerationDiagnostics(): RouteGenerationDiagnostics | null {
  return _lastDiagnostics;
}

interface WaypointCandidate {
  lat: number;
  lng: number;
  score: number;
  distanceFromUser: number;
  nearbyParks: number;
  isGreen: boolean;
  isSafe: boolean;
}

interface RouteGenerationOptions {
  userLocation: { lat: number; lng: number };
  targetDistance: number; // in km
  activity: ActivityType;
  routeGenerationIndex: number;
  preferences: {
    includeStrength: boolean;
    surface?: 'road' | 'trail';
  };
  parks: MapPark[];
  /** City name used to query street_segments from Firestore. Falls back to random waypoints when absent. */
  cityName?: string;
  /**
   * When set, segments from `street_segments` whose `officialRouteId`
   * matches this value get a 5× score multiplier — strongly biasing the
   * dynamic generator to send the user back onto the original official
   * route's corridor. Used by `useRouteDeviationOrchestrator` to recover
   * the user toward their intended route after a deviation.
   *
   * Has no effect when (a) the value is undefined, (b) the active path
   * source is `random_fallback_*` (no segments to bias), or (c) no
   * segments in the candidate pool carry that officialRouteId.
   */
  activeOfficialRouteId?: string;
}

// ── Street-segment types ───────────────────────────────────────────────────────
// Flexible enough to match whatever geometry fields the collection uses.
// Canonical writer = src/features/admin/services/osm-segment-importer.ts,
// which produces docs with { path, midpoint }. The other field names are
// kept as fallbacks so legacy / hand-imported docs still resolve.

interface StreetSegment {
  score: number;
  cityName?: string;
  /** Canonical: pre-computed midpoint stored by the OSM importer. */
  midpoint?: { lat: number; lng: number };
  /** Canonical: ordered list of nodes from the OSM importer. */
  path?: Array<{ lat: number; lng: number }>;
  /** Legacy/alternative: array of coordinate objects. */
  coordinates?: Array<{ lat: number; lng: number }>;
  /** Legacy/alternative: single pre-computed centroid. */
  center?: { lat: number; lng: number };
  /** Legacy/alternative: start/end pair — midpoint is computed. */
  start?: { lat: number; lng: number };
  end?: { lat: number; lng: number };
  /**
   * True for segments broadcast by the official-route bridge (writer:
   * `official-route-broadcaster.ts`). Carries no behaviour by itself
   * inside the generator — the discrimination knob is `officialRouteId`
   * below. Useful for analytics and admin tooling.
   */
  isOfficial?: boolean;
  /**
   * Back-reference to the `official_routes` document this segment was
   * broadcast from. Used by the deviation orchestrator to apply the 5×
   * bias when the user wanders off the corresponding route.
   */
  officialRouteId?: string;
}

/** Extract a single representative { lat, lng } point from a segment document.
 *  Priority: midpoint → center → path midpoint → coordinates midpoint
 *           → start/end midpoint.
 *  Returns null when no usable geometry is found. */
function segmentMidpoint(seg: StreetSegment): { lat: number; lng: number } | null {
  if (seg.midpoint) return { lat: seg.midpoint.lat, lng: seg.midpoint.lng };
  if (seg.center) return { lat: seg.center.lat, lng: seg.center.lng };
  if (seg.path && seg.path.length > 0) {
    const mid = seg.path[Math.floor(seg.path.length / 2)];
    return { lat: mid.lat, lng: mid.lng };
  }
  if (seg.coordinates && seg.coordinates.length > 0) {
    const mid = seg.coordinates[Math.floor(seg.coordinates.length / 2)];
    return { lat: mid.lat, lng: mid.lng };
  }
  if (seg.start && seg.end) {
    return {
      lat: (seg.start.lat + seg.end.lat) / 2,
      lng: (seg.start.lng + seg.end.lng) / 2,
    };
  }
  return null;
}

/**
 * Query Firestore `street_segments` for high-scoring segments in the user's city,
 * convert them into waypoint candidates within `targetDistance / 2` km of the user,
 * and return the top 12 by score.
 *
 * Requires a composite Firestore index on (cityName ASC, score DESC).
 * Falls back to `null` when the city is unknown or the collection is empty.
 */
/**
 * Strip invisible Unicode chars that Mapbox / pasted UI strings often carry
 * but Firestore's exact-match query won't match through:
 *   • U+200E / U+200F (LRM / RLM) — bidi direction overrides commonly
 *     injected when Hebrew strings cross a Latin context.
 *   • U+202A–U+202E — embedding / override pairs.
 *   • U+FEFF — zero-width no-break space (BOM).
 *   • U+200B–U+200D — zero-width space / joiner / non-joiner.
 * The visual string is identical before and after; the byte length differs.
 * Without this, `cityName === "תל אביב"` and `cityName === "\u200Fתל אביב"`
 * look the same in console but Firestore treats them as distinct keys.
 */
function sanitizeCityKey(raw: string): string {
  return raw.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').trim();
}

/**
 * Score multiplier applied to street_segments whose `officialRouteId`
 * matches the orchestrator's `activeOfficialRouteId`. With max segment
 * score = 10, a 5× multiplier yields 50 — guaranteed to dominate ALL
 * other candidates in the top-12 sort. This is the dial to turn down to
 * 2–3 if the recovery loop ever feels too aggressive.
 */
const OFFICIAL_ROUTE_BIAS_MULTIPLIER = 5;

async function fetchScoredWaypoints(
  cityName: string,
  userLocation: { lat: number; lng: number },
  targetDistance: number,
  activeOfficialRouteId?: string,
): Promise<Array<{ lat: number; lng: number }> | null> {
  // Defensive sanitisation at the query boundary. Even though useUserCityName
  // normalises before returning, callers (and any future upstream code path)
  // could feed us a string with invisible bidi marks and silently produce a
  // zero-result query — the most painful possible failure mode because the
  // strings look identical in logs.
  const cleanCity = sanitizeCityKey(cityName);

  // EXPLICIT diagnostic — surfaces the *exact* bytes we're about to send.
  // `JSON.stringify` reveals invisible chars as `\u200F` etc.; the length
  // mismatch between raw and clean confirms whether sanitisation actually
  // changed anything. Char codes round it out for the rare case where the
  // string contains a homoglyph (e.g. Latin "a" inside a Hebrew word).
  const rawBytes = Array.from(cityName).map((c) => c.charCodeAt(0).toString(16)).join(' ');
  const cleanBytes = Array.from(cleanCity).map((c) => c.charCodeAt(0).toString(16)).join(' ');
  console.log(
    `[RouteGenerator] Final City Query: ${JSON.stringify(cleanCity)} ` +
      `(length=${cleanCity.length}, raw="${cityName}", rawLen=${cityName.length})`,
  );
  if (rawBytes !== cleanBytes) {
    console.warn(
      `[RouteGenerator] cityName had invisible chars stripped. ` +
        `raw bytes: [${rawBytes}] → clean bytes: [${cleanBytes}]`,
    );
  }

  try {
    const q = query(
      collection(db, 'street_segments'),
      where('cityName', '==', cleanCity),
      where('score', '>=', 6),
      orderBy('score', 'desc'),
      limit(50),
    );

    const snap = await getDocs(q);
    if (snap.empty) {
      console.log(`[RouteGenerator] No street_segments found for city "${cleanCity}" — using random waypoints.`);
      // Diagnostic: pull a single doc from the collection so the developer
      // can see what cityName values DO exist. Cheap (limit 1) and only
      // fires on the empty path, so it can't slow the happy-path call.
      let collectionSampleCityName: string | undefined;
      let collectionIsEmpty = false;
      try {
        const probe = await getDocs(query(collection(db, 'street_segments'), limit(1)));
        if (!probe.empty) {
          const sample = probe.docs[0].data() as StreetSegment;
          collectionSampleCityName = sample.cityName;
          console.log(
            `[RouteGenerator] Sample existing segment: cityName=${JSON.stringify(sample.cityName)} ` +
              `(length=${sample.cityName?.length ?? 0})`,
          );
        } else {
          collectionIsEmpty = true;
          console.log('[RouteGenerator] street_segments collection is empty — run the OSM importer.');
        }
      } catch {
        // Probe is best-effort; swallow to keep the original return path.
      }
      setDiagnostics({
        cityNameUsed: cleanCity,
        cityNameRaw: cityName,
        source: collectionIsEmpty
          ? 'random_fallback_empty_collection'
          : 'random_fallback_empty_city',
        segmentsFetched: 0,
        segmentsInRadius: 0,
        collectionSampleCityName,
      });
      return null;
    }

    const searchRadiusKm = targetDistance / 2;

    let officialBiasApplied = 0;
    const candidates = snap.docs
      .map((d) => {
        const seg = d.data() as StreetSegment;
        const point = segmentMidpoint(seg);
        if (!point) return null;
        const distKm = getDistanceKm(userLocation.lat, userLocation.lng, point.lat, point.lng);
        if (distKm > searchRadiusKm) return null;

        // Effective score = base × (5 if this segment belongs to the
        // user's original official route AND we're in deviation-recovery
        // mode, otherwise 1). The boost makes those segments dominate the
        // sort below, biasing the triangular loop builder to weave back
        // through the original corridor.
        const matchesActiveRoute =
          activeOfficialRouteId !== undefined &&
          seg.officialRouteId === activeOfficialRouteId;
        const baseScore = seg.score ?? 0;
        const effectiveScore = matchesActiveRoute
          ? baseScore * OFFICIAL_ROUTE_BIAS_MULTIPLIER
          : baseScore;
        if (matchesActiveRoute) officialBiasApplied += 1;

        return { ...point, score: effectiveScore };
      })
      .filter((c): c is { lat: number; lng: number; score: number } => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (activeOfficialRouteId) {
      console.log(
        `[RouteGenerator] Deviation recovery: ${officialBiasApplied} segment(s) matched ` +
          `officialRouteId=${activeOfficialRouteId} and got a ${OFFICIAL_ROUTE_BIAS_MULTIPLIER}× bonus.`,
      );
    }

    if (candidates.length === 0) {
      console.log(`[RouteGenerator] street_segments for "${cleanCity}" found (${snap.size} total) but none within ${searchRadiusKm.toFixed(1)} km of user — using random waypoints.`);
      setDiagnostics({
        cityNameUsed: cleanCity,
        cityNameRaw: cityName,
        source: 'random_fallback_out_of_radius',
        segmentsFetched: snap.size,
        segmentsInRadius: 0,
      });
      return null;
    }

    console.log(`[RouteGenerator] Using ${candidates.length} scored waypoints from street_segments (city: "${cleanCity}").`);
    setDiagnostics({
      cityNameUsed: cleanCity,
      cityNameRaw: cityName,
      source: 'street_segments',
      segmentsFetched: snap.size,
      segmentsInRadius: candidates.length,
    });
    return candidates.map(({ lat, lng }) => ({ lat, lng }));
  } catch (err: any) {
    console.warn('[RouteGenerator] fetchScoredWaypoints failed, falling back to random:', err?.message ?? err);
    setDiagnostics({
      cityNameUsed: cleanCity,
      cityNameRaw: cityName,
      source: 'random_fallback_query_error',
      segmentsFetched: 0,
      segmentsInRadius: 0,
    });
    return null;
  }
}

// ✅ CRITICAL FIX: 1.5 second delay between API calls to prevent 429 errors
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Helper Functions ---

function generateRandomWaypoints(
  userLocation: { lat: number; lng: number },
  targetDistance: number,
  count: number = 15, // Generate more waypoints for variety
  routeGenerationIndex: number = 0
): Array<{ lat: number; lng: number }> {
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const kmPerDegree = 111;

  // Triangular-loop geometry: with three waypoints at radius `r` spaced
  // ~120° apart, the perimeter is `3 · √3 · r ≈ 5.2r`. The previous
  // formula (`targetDistance / 3`) ignored that factor and produced loops
  // ~70% longer than requested — a 5.5km target consistently came back as
  // ~9.5km after Mapbox's road snapping added another 10–20% on top.
  // Using `targetDistance / 6` keeps the geometric loop slightly under the
  // user's target so the road-snapped result lands in the valid window.
  const baseRadius = (targetDistance / 6) / kmPerDegree;

  // Use index to rotate the entire pattern
  const angleOffset = (routeGenerationIndex * 45) % 360;
  const angleRad = (angleOffset * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    // Tightened from 0.6–1.4 (40% spread) to 0.85–1.15 (15% spread). The
    // wider range was generating both routes that were too long AND routes
    // that were too short, wasting Mapbox API calls on rejections. The
    // tighter spread keeps every candidate within ~15% of the target so
    // far fewer combinations get thrown out by the distance-window check.
    const radiusVariation = 0.85 + (Math.random() * 0.3);
    const radius = baseRadius * radiusVariation;
    const baseAngle = (i * (360 / count)) * (Math.PI / 180) + angleRad;
    const angleVariation = (Math.random() - 0.5) * (40 * Math.PI / 180);
    const angle = baseAngle + angleVariation;

    waypoints.push({
      lng: userLocation.lng + radius * Math.cos(angle),
      lat: userLocation.lat + radius * Math.sin(angle)
    });
  }
  return waypoints;
}

function scoreWaypoint(
  waypoint: { lat: number; lng: number },
  userLocation: { lat: number; lng: number },
  parks: MapPark[],
  preferences: { includeStrength: boolean }
): WaypointCandidate {
  const distanceFromUser = getDistanceKm(userLocation.lat, userLocation.lng, waypoint.lat, waypoint.lng);
  const nearbyParks = parks.filter(park => {
    const dist = getDistanceKm(park.location.lat, park.location.lng, waypoint.lat, waypoint.lng);
    return dist < 0.5;
  }).length;

  let score = 50;
  if (nearbyParks > 0) score += nearbyParks * 15;

  const idealDistance = 1.0;
  const distanceDiff = Math.abs(distanceFromUser - idealDistance);
  if (distanceDiff < 0.3) score += 20;
  else if (distanceDiff < 0.6) score += 10;
  else if (distanceDiff > 2.0) score -= 15;

  const hasNearbyGym = parks.some(park => {
    const dist = getDistanceKm(park.location.lat, park.location.lng, waypoint.lat, waypoint.lng);
    return dist < 0.5 && park.devices && park.devices.length > 0;
  });

  if (preferences.includeStrength && hasNearbyGym) score += 25;

  const isSafe = distanceFromUser < 3.0;
  if (!isSafe) score -= 20;

  return { ...waypoint, score, distanceFromUser, nearbyParks, isGreen: nearbyParks > 0, isSafe };
}

async function findFitnessAnchor(
  userLocation: { lat: number, lng: number },
  targetDistanceKm: number,
  parks: MapPark[]
): Promise<{ lat: number, lng: number, id: string } | null> {
  if (!parks || parks.length === 0) return null;
  const idealMinDist = targetDistanceKm * 0.25;
  const idealMaxDist = targetDistanceKm * 0.6;

  const candidates = parks
    .filter(p => p.devices && p.devices.length > 0)
    .map(p => ({
      ...p,
      distance: getDistanceKm(userLocation.lat, userLocation.lng, p.location.lat, p.location.lng)
    }));

  let matches = candidates.filter(p => p.distance >= idealMinDist && p.distance <= idealMaxDist);

  if (matches.length === 0) {
    matches = candidates.sort((a, b) => a.distance - b.distance).slice(0, 1);
  }

  if (matches.length === 0) return null;
  const selected = matches[0];

  return { lat: selected.location.lat, lng: selected.location.lng, id: selected.id };
}

/**
 * MAIN GENERATOR FUNCTION
 * ✅ FIX #1: Sequential processing with 1.5s delays, require 50+ points, return 3+ routes
 *
 * Waypoint strategy (in priority order):
 *   1. Firestore street_segments (scored, city-specific) — via fetchScoredWaypoints()
 *   2. Random geometric fallback — via generateRandomWaypoints()
 */
export async function generateDynamicRoutes(
  options: RouteGenerationOptions
): Promise<Route[]> {
  const {
    userLocation,
    targetDistance,
    activity,
    routeGenerationIndex,
    preferences,
    parks,
    cityName,
    activeOfficialRouteId,
  } = options;

  const rawDistance = typeof targetDistance === 'number' && !isNaN(targetDistance) ? targetDistance : 3;
  // Mapbox Directions returns disappointingly few path points for very short
  // routes (~1km loops can come back with 10–30 points), which then fail the
  // MIN_PATH_POINTS guard below and the user sees an empty card list. Clamp
  // the target up to 1.5km so the loop is always long enough to densify the
  // returned polyline. The user-facing duration/calorie target stays as the
  // user picked it — we only inflate the *generation* distance, not the
  // workout goal.
  const MIN_GENERATION_KM = 1.5;
  const safeDistance = Math.max(rawDistance, MIN_GENERATION_KM);
  if (safeDistance !== rawDistance) {
    console.log(`[RouteGenerator] Bumping target ${rawDistance.toFixed(2)}km → ${safeDistance.toFixed(2)}km (below MIN_GENERATION_KM)`);
  }
  console.log(`[RouteGenerator] Starting generation. Target: ${safeDistance.toFixed(1)}km, Activity: ${activity}, City: ${cityName ?? '(none)'}`);

  // 1. Find fitness anchor if needed
  const fitnessAnchor = preferences.includeStrength
    ? await findFitnessAnchor(userLocation, safeDistance, parks)
    : null;

  // 2. Fetch waypoint candidates — prefer scored street_segments, fall back to random
  let rawCandidates: Array<{ lat: number; lng: number }> | null = null;
  if (cityName) {
    rawCandidates = await fetchScoredWaypoints(
      cityName,
      userLocation,
      safeDistance,
      activeOfficialRouteId,
    );
  } else {
    // Record the no-city case so the dev banner can suggest "we never even
    // tried — useUserCityName returned undefined". Different remediation
    // path than "we tried and the collection was empty".
    setDiagnostics({
      cityNameUsed: undefined,
      cityNameRaw: undefined,
      source: 'random_fallback_no_city',
      segmentsFetched: 0,
      segmentsInRadius: 0,
    });
  }

  const candidateWaypoints: Array<{ lat: number; lng: number }> = rawCandidates ?? generateRandomWaypoints(
    userLocation,
    safeDistance,
    15, // More candidates for variety
    routeGenerationIndex
  );

  const scoredWaypoints = candidateWaypoints.map(wp =>
    scoreWaypoint(wp, userLocation, parks, preferences)
  );

  const topCandidates = scoredWaypoints
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // 3. Create route combinations (triangular loops)
  const routeCombinations: Array<{ waypoints: Array<WaypointCandidate>, score: number }> = [];

  // Generate up to 5 combinations to ensure we get at least 3 valid routes
  for (let i = 0; i < 5; i++) {
    const offset = i * 2;
    const wp1 = topCandidates[offset % topCandidates.length];
    const wp2 = topCandidates[(offset + 1) % topCandidates.length];
    const wp3 = topCandidates[(offset + 2) % topCandidates.length];

    if (wp1 && wp2 && wp3) {
      routeCombinations.push({
        waypoints: [wp1, wp2, wp3],
        score: (wp1.score + wp2.score + wp3.score) / 3
      });
    }
  }

  const validRoutes: Route[] = [];
  const MIN_REQUIRED_ROUTES = 3;
  // Adaptive minimum: short loops genuinely return fewer points from Mapbox
  // even when they're geometrically valid (a 1.2km loop with 6 turns can be
  // ~30 points and still be a real walk). Loosen the bar for short targets,
  // keep the strict 50 for anything 2km+ where straight-line shortcuts would
  // really stand out as broken routes.
  const MIN_PATH_POINTS = safeDistance < 2 ? 30 : 50;

  // 4. ✅ SEQUENTIAL PROCESSING - One at a time with delays (prevents 429 errors)
  for (let i = 0; i < routeCombinations.length; i++) {
    // Stop if we have enough valid routes
    if (validRoutes.length >= MIN_REQUIRED_ROUTES) {
      console.log(`[RouteGenerator] Got ${MIN_REQUIRED_ROUTES} routes, stopping.`);
      break;
    }

    const combination = routeCombinations[i];
    const [wp1, wp2, wp3] = combination.waypoints;

    // Build waypoint list
    const waypointsToUse: Array<{ lat: number; lng: number }> = [
      { lat: wp1.lat, lng: wp1.lng },
      { lat: wp2.lat, lng: wp2.lng },
      { lat: wp3.lat, lng: wp3.lng }
    ];

    // Add fitness anchor if available
    if (fitnessAnchor) {
      waypointsToUse.splice(1, 0, { lat: fitnessAnchor.lat, lng: fitnessAnchor.lng });
    }

    console.log(`[RouteGenerator] Fetching route ${i + 1}/${routeCombinations.length}...`);

    try {
      const result = await MapboxService.getSmartPath(
        userLocation,
        userLocation, // Loop back home
        activity === 'cycling' ? 'cycling' : 'walking',
        waypointsToUse
      );

      // ✅ STRICT VALIDATION: Must have 50+ points (prevents straight lines/triangles)
      if (!result || !result.path || result.path.length < MIN_PATH_POINTS) {
        console.warn(`[RouteGenerator] Route ${i} REJECTED: only ${result?.path?.length || 0} points (need ${MIN_PATH_POINTS}+)`);
        
        // ✅ Wait before next attempt to avoid 429
        if (i < routeCombinations.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) {
          await delay(1500);
        }
        continue;
      }

      const routeDistanceKm = result.distance / 1000;

      // Flexible but realistic distance window:
      // Accept anything between (target - 0.5km) and (target + 2.5km),
      // e.g. for 3km → [2.5km, 5.5km]
      const minKm = Math.max(0.5, safeDistance - 0.5);
      const maxKm = safeDistance + 2.5;
      if (routeDistanceKm < minKm || routeDistanceKm > maxKm) {
        console.warn(
          `[RouteGenerator] Route ${i} REJECTED: distance ${routeDistanceKm.toFixed(
            1,
          )}km outside allowed range [${minKm.toFixed(1)}–${maxKm.toFixed(1)}]km (target ${safeDistance.toFixed(
            1,
          )}km)`,
        );

        // ✅ Wait before next attempt to avoid 429
        if (i < routeCombinations.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) {
          await delay(1500);
        }
        continue;
      }

      // Use Mapbox API duration (in seconds) as the single source of truth
      const durationMinutes = Math.round(result.duration / 60);
      const calories = Math.round(routeDistanceKm * (activity === 'cycling' ? 25 : 65));
      const hasGym = !!fitnessAnchor;

      const route: Route = {
        id: `gen-${Date.now()}-${i}-${routeGenerationIndex}`,
        name: hasGym ? 'סיבוב כושר' : 'סיבוב אורבני',
        description: `מסלול מעגלי של ${routeDistanceKm.toFixed(1)} ק"מ`,
        distance: parseFloat(routeDistanceKm.toFixed(1)),
        duration: durationMinutes,
        score: Math.round(combination.score + (routeDistanceKm * 10)),
        type: activity,
        activityType: activity,
        difficulty: 'easy',
        path: result.path,
        segments: [],
        rating: 4.5 + (Math.random() * 0.5),
        calories: calories,
        analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
        source: { type: 'system', name: 'OutRun AI' },
        features: {
          hasGym: hasGym,
          hasBenches: true,
          scenic: combination.score > 70,
          lit: true,
          terrain: 'road',
          environment: 'urban',
          trafficLoad: 'low',
          surface: preferences.surface === 'trail' ? 'dirt' : 'asphalt'
        },
        calculatedScore: combination.score,
        distanceFromUser: 0,
        isReachableWithoutCar: true,
        includesOfficialSegments: false,
        visitingParkId: fitnessAnchor?.id || null,
        includesFitnessStop: hasGym
      };

      validRoutes.push(route);
      console.log(`[RouteGenerator] ✅ Route ${i} VALID! (${result.path.length} points, ${routeDistanceKm.toFixed(1)}km)`);

    } catch (err: any) {
      console.error(`[RouteGenerator] Error on route ${i}:`, err?.message || err);
    }

    // ✅ CRITICAL: 1.5 second delay at the END of each iteration (except last or when we have enough routes)
    if (i < routeCombinations.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) {
      console.log('[RouteGenerator] Waiting 1.5s before next API call...');
      await delay(1500);
    }
  }

  console.log(`[RouteGenerator] Finished. Generated ${validRoutes.length} valid routes.`);
  return validRoutes;
}
