/**
 * Route Stitching Engine v2 — "Hero Loop" Strategy
 * ==================================================
 * Transforms fragmented GIS infrastructure segments into smooth, circular
 * "Hero Loop" routes for onboarding.
 *
 * Strategy:
 *  1. Identify 5-8 density clusters per authority (neighbourhood coverage)
 *  2. Generate 4-waypoint "Diamond" loops (A→B→C→D→A) per cluster
 *  3. Activity-aware heuristics (Running: straight & fast, Walking: scenic & winding)
 *  4. Hybrid "Urban Strength" mode: snap waypoints to fitness facilities/stairs/benches
 *  5. Douglas-Peucker smoothing for clean "race track" visuals
 *  6. Save to `curated_routes` collection for instant onboarding fetch (<1s)
 */

import {
  Route,
  ActivityType,
  FacilityPriority,
  FacilityStop,
  ACTIVITY_CONFIGS,
} from '../types/route.types';
import { InventoryService } from './inventory.service';
import { getParksByAuthority } from './parks.service';

// ── Constants ───────────────────────────────────────────────────────
const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZGF2aWQtb3V0IiwiYSI6ImNtanZpZmJ0djM5MTEzZXF5YXNmcm9zNGwifQ.8MD8s4TZOr0WYYgEpFfpzw';

/** Max straight-line gap (metres) before we decide two segments are unrelated */
const MAX_BRIDGE_GAP_METERS = 2000;

/** Max number of density clusters to generate per authority */
const MAX_CLUSTERS = 8;
const MIN_CLUSTERS = 3;

/** Snap radius for hybrid facility search (metres) */
const FACILITY_SNAP_RADIUS_METERS = 300;

// ── Infrastructure ↔ Activity Compatibility ─────────────────────────
/**
 * Compatibility matrix: which `infrastructureMode` values are safe for
 * each target activity?
 *
 *  - Cycling  → can use 'cycling', 'shared', and 'pedestrian' paths
 *  - Running  → can ONLY use 'pedestrian' and 'shared' (NOT cycling-only)
 *  - Walking  → can ONLY use 'pedestrian' and 'shared' (NOT cycling-only)
 */
const INFRA_COMPATIBILITY: Record<string, Set<string>> = {
  cycling: new Set(['cycling', 'shared', 'pedestrian']),
  running: new Set(['pedestrian', 'shared']),
  walking: new Set(['pedestrian', 'shared']),
};

/**
 * Determine the effective `infrastructureMode` of a route.
 *
 * For segments that pre-date the `infrastructureMode` field we fall back
 * to the segment's `activityType`:
 *   cycling  → 'cycling'
 *   running  → 'pedestrian'
 *   walking  → 'pedestrian'
 *   other    → 'shared'
 */
function effectiveInfraMode(route: Route): string {
  if (route.infrastructureMode) return route.infrastructureMode;
  // Legacy fallback: infer from activityType set during import
  if (route.activityType === 'cycling' || route.type === 'cycling') return 'cycling';
  if (route.activityType === 'running' || route.activityType === 'walking') return 'pedestrian';
  return 'shared';
}

/**
 * Filter infrastructure segments to only those compatible with the
 * target activity.  Returns an object with the compatible segments and
 * a human-readable `dataSource` label for admin transparency.
 */
function filterCompatibleInfrastructure(
  allInfra: Route[],
  targetActivity: ActivityType
): { compatible: Route[]; dataSource: 'cycling' | 'pedestrian' | 'mixed' | 'none' } {
  const allowed = INFRA_COMPATIBILITY[targetActivity] || new Set(['shared']);
  const compatible = allInfra.filter((r) => allowed.has(effectiveInfraMode(r)));

  // Determine predominant data source
  const modes = new Set(compatible.map(effectiveInfraMode));
  let dataSource: 'cycling' | 'pedestrian' | 'mixed' | 'none';
  if (compatible.length === 0) {
    dataSource = 'none';
  } else if (modes.size === 1) {
    const only = [...modes][0];
    dataSource = only === 'cycling' ? 'cycling' : only === 'pedestrian' ? 'pedestrian' : 'mixed';
  } else {
    dataSource = 'mixed';
  }

  return { compatible, dataSource };
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS — Geo / Math
// ══════════════════════════════════════════════════════════════════════

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Calculate total path distance in km via Haversine. */
function pathDistanceKm(path: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
  }
  return total / 1000;
}

/**
 * Move a point by a given bearing and distance.
 * Returns [lng, lat].
 */
function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceKm: number
): [number, number] {
  const R = 6371; // Earth radius in km
  const d = distanceKm / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

/**
 * Douglas-Peucker line simplification.
 * Removes micro-zigs while preserving overall shape.
 */
function douglasPeucker(
  points: [number, number][],
  toleranceMeters: number
): [number, number][] {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from the line start→end
  const start = points[0];
  const end = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > toleranceMeters) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), toleranceMeters);
    const right = douglasPeucker(points.slice(maxIdx), toleranceMeters);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  // Approximate using haversine for short distances
  const dTotal = haversineMeters(lineStart[1], lineStart[0], lineEnd[1], lineEnd[0]);
  if (dTotal === 0) return haversineMeters(point[1], point[0], lineStart[1], lineStart[0]);

  const dStart = haversineMeters(lineStart[1], lineStart[0], point[1], point[0]);
  const dEnd = haversineMeters(lineEnd[1], lineEnd[0], point[1], point[0]);

  // Use Heron's formula for triangle area → height
  const s = (dTotal + dStart + dEnd) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - dTotal) * (s - dStart) * (s - dEnd)));
  return (2 * area) / dTotal;
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 — Density Clustering (K-Means style)
// ══════════════════════════════════════════════════════════════════════

interface Cluster {
  center: [number, number]; // [lng, lat]
  density: number;
  segmentIndices: number[];
}

/**
 * Identify density clusters from infrastructure segment centroids.
 * Uses simplified k-means to find natural groupings.
 */
function identifyDensityClusters(
  segments: [number, number][][],
  targetClusters: number = 6
): Cluster[] {
  if (segments.length === 0) return [];

  // Get centroids of all segments
  const centroids = segments.map((seg) => {
    const midIdx = Math.floor(seg.length / 2);
    return seg[midIdx] as [number, number]; // [lng, lat]
  });

  const k = Math.min(Math.max(MIN_CLUSTERS, targetClusters), MAX_CLUSTERS, segments.length);

  // Initialize cluster centers by picking evenly spaced centroids
  const sorted = [...centroids].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const step = Math.max(1, Math.floor(sorted.length / k));
  let centers: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    centers.push(sorted[Math.min(i * step, sorted.length - 1)]);
  }

  // K-means iterations (max 20)
  for (let iter = 0; iter < 20; iter++) {
    const assignments: number[][] = Array.from({ length: k }, () => []);

    // Assign each centroid to nearest cluster center
    centroids.forEach((c, idx) => {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let ci = 0; ci < centers.length; ci++) {
        const d = haversineMeters(c[1], c[0], centers[ci][1], centers[ci][0]);
        if (d < minDist) {
          minDist = d;
          bestCluster = ci;
        }
      }
      assignments[bestCluster].push(idx);
    });

    // Recalculate centers
    let converged = true;
    const newCenters: [number, number][] = [];
    for (let ci = 0; ci < k; ci++) {
      const members = assignments[ci];
      if (members.length === 0) {
        newCenters.push(centers[ci]);
        continue;
      }
      const avgLng = members.reduce((s, i) => s + centroids[i][0], 0) / members.length;
      const avgLat = members.reduce((s, i) => s + centroids[i][1], 0) / members.length;
      const newCenter: [number, number] = [avgLng, avgLat];

      if (haversineMeters(newCenter[1], newCenter[0], centers[ci][1], centers[ci][0]) > 50) {
        converged = false;
      }
      newCenters.push(newCenter);
    }

    centers = newCenters;
    if (converged) break;
  }

  // Build final clusters with segment assignments
  const finalAssignments: number[][] = Array.from({ length: k }, () => []);
  centroids.forEach((c, idx) => {
    let minDist = Infinity;
    let bestCluster = 0;
    for (let ci = 0; ci < centers.length; ci++) {
      const d = haversineMeters(c[1], c[0], centers[ci][1], centers[ci][0]);
      if (d < minDist) {
        minDist = d;
        bestCluster = ci;
      }
    }
    finalAssignments[bestCluster].push(idx);
  });

  return centers
    .map((center, i) => ({
      center,
      density: finalAssignments[i].length,
      segmentIndices: finalAssignments[i],
    }))
    .filter((c) => c.density > 0)
    .sort((a, b) => b.density - a.density);
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 — Diamond Waypoint Generation
// ══════════════════════════════════════════════════════════════════════

/**
 * Generate 4 waypoints in a diamond pattern around a center point.
 * Uses cardinal bearings (0°, 90°, 180°, 270°) offset slightly for variety.
 * Returns 5 points: [A, B, C, D, A] to form a closed loop.
 */
function generateDiamondWaypoints(
  center: [number, number], // [lng, lat]
  radiusKm: number,
  rotationOffset: number = 0 // degrees to rotate the diamond for variety
): [number, number][] {
  const lat = center[1];
  const lng = center[0];
  const bearings = [0, 90, 180, 270].map((b) => b + rotationOffset);

  const waypoints: [number, number][] = [];
  for (const bearing of bearings) {
    waypoints.push(destinationPoint(lat, lng, bearing, radiusKm));
  }

  // Close the loop: last point === first point
  waypoints.push(waypoints[0]);

  return waypoints;
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1 — Circular Route via Mapbox Directions
// ══════════════════════════════════════════════════════════════════════

/**
 * Build a circular route through waypoints using Mapbox Directions API.
 * The first and last waypoints must be the same point (closed loop).
 */
async function buildCircularRoute(
  waypoints: [number, number][],
  profile: 'walking' | 'cycling' = 'walking',
  continuesStraight: boolean = true
): Promise<{ path: [number, number][]; distance: number; duration: number } | null> {
  try {
    if (waypoints.length < 3) return null;

    // Build coordinate string: "lng,lat;lng,lat;..."
    const coordStr = waypoints.map((wp) => `${wp[0]},${wp[1]}`).join(';');

    const params = new URLSearchParams({
      geometries: 'geojson',
      overview: 'full',
      steps: 'false',
      access_token: MAPBOX_TOKEN,
    });

    if (continuesStraight) {
      params.set('continue_straight', 'true');
    }

    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordStr}?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[StitchingEngine] Mapbox error (${res.status}) for circular route`);
      return null;
    }

    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    return {
      path: route.geometry.coordinates as [number, number][],
      distance: route.distance / 1000, // Convert to km
      duration: route.duration, // seconds
    };
  } catch (err) {
    console.warn('[StitchingEngine] Circular route error:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 2 — Hybrid "Urban Strength" Facility Snapping
// ══════════════════════════════════════════════════════════════════════

interface FacilityCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  priority: FacilityPriority;
  numberOfSteps?: number;
  hasShade?: boolean;
  isInParkOrPlaza?: boolean;
}

/**
 * Fetch and categorise facilities for an authority into priority tiers.
 */
async function fetchCategorisedFacilities(
  authorityId: string
): Promise<{
  primary: FacilityCandidate[];
  secondary: FacilityCandidate[];
  tertiary: FacilityCandidate[];
}> {
  try {
    const parks = await getParksByAuthority(authorityId);

    const primary: FacilityCandidate[] = [];
    const secondary: FacilityCandidate[] = [];
    const tertiary: FacilityCandidate[] = [];

    // Build a set of park/plaza IDs for bench validation
    const parkZones = parks.filter(
      (p) => p.category === 'gym_park' || p.category === 'zen_spot' || p.category === 'nature_community'
    );

    for (const p of parks) {
      if (!p.location?.lat || !p.location?.lng) continue;

      const base = {
        id: p.id,
        name: p.name,
        lat: p.location.lat,
        lng: p.location.lng,
      };

      // PRIMARY: calisthenics, functional, crossfit, fitness_station
      const sportTypes = Array.isArray(p.sportTypes) ? p.sportTypes : [];
      const isPrimary =
        sportTypes.some((t: string) =>
          ['calisthenics', 'functional', 'crossfit'].includes(t)
        ) || p.category === 'gym_park';

      if (isPrimary) {
        primary.push({
          ...base,
          type: sportTypes[0] || 'fitness_station',
          priority: FacilityPriority.PRIMARY,
        });
        continue;
      }

      // SECONDARY: stairs, public_steps
      if (p.urbanType === 'stairs' || p.urbanType === 'public_steps') {
        secondary.push({
          ...base,
          type: p.urbanType,
          priority: FacilityPriority.SECONDARY,
          numberOfSteps: (p as any).stairsDetails?.numberOfSteps || 0,
          hasShade: (p as any).stairsDetails?.hasShade || false,
        });
        continue;
      }

      // TERTIARY: bench (only if near a park or plaza)
      if (p.urbanType === 'bench') {
        const isNearParkOrPlaza =
          p.environment === 'plaza' ||
          parkZones.some(
            (zone) =>
              zone.id !== p.id &&
              zone.location?.lat &&
              zone.location?.lng &&
              haversineMeters(
                p.location.lat,
                p.location.lng,
                zone.location.lat,
                zone.location.lng
              ) < 200
          );

        if (isNearParkOrPlaza) {
          tertiary.push({
            ...base,
            type: 'bench',
            priority: FacilityPriority.TERTIARY,
            isInParkOrPlaza: true,
          });
        }
      }
    }

    return { primary, secondary, tertiary };
  } catch (err) {
    console.warn('[StitchingEngine] Facility fetch error:', err);
    return { primary: [], secondary: [], tertiary: [] };
  }
}

/**
 * Find the nearest facility candidate to a given point within a radius.
 */
function findNearestFacility(
  point: [number, number], // [lng, lat]
  candidates: FacilityCandidate[],
  maxDistMeters: number
): (FacilityCandidate & { distance: number }) | null {
  let best: (FacilityCandidate & { distance: number }) | null = null;

  for (const c of candidates) {
    const d = haversineMeters(point[1], point[0], c.lat, c.lng);
    if (d <= maxDistMeters && (!best || d < best.distance)) {
      best = { ...c, distance: d };
    }
  }

  return best;
}

/**
 * Snap diamond waypoints to nearby facilities using the 3-tier priority fallback.
 *
 * Activity-Aware Constraints:
 *
 * ── Walking Hybrid (Exploration Mode) ──
 *  • Up to 4 pit-stops per route
 *  • Multi-category snapping: a single route CAN combine different facility types
 *    (e.g. fitness_station at waypoint B AND stairs at waypoint D)
 *  • Diversity scoring: favour varied facility mix over repeated same-type stops
 *  • If mixed, naming = "הליכה היברידית: משולב כוח ומדרגות"
 *
 * ── Running Hybrid (Performance Mode) ──
 *  • Strict max 2 pit-stops
 *  • Priority-only snapping: pick the HIGHEST available tier (Gym > Stairs > Bench)
 *    and only snap from that single tier to maintain cardio flow
 *
 * Common rules:
 *  • Only snap waypoints B, C, D (indices 1, 2, 3). A is start/end.
 *  • Snap radius: 300m from waypoint
 */
async function snapWaypointsToFacilities(
  waypoints: [number, number][], // 5 points: [A, B, C, D, A]
  authorityId: string,
  routeDistanceKm: number,
  activityType: ActivityType
): Promise<{
  waypoints: [number, number][];
  facilityStops: FacilityStop[];
  hybridType: 'primary' | 'secondary' | 'tertiary' | 'mixed' | null;
}> {
  const result = [...waypoints];
  const facilityStops: FacilityStop[] = [];
  let hybridType: 'primary' | 'secondary' | 'tertiary' | 'mixed' | null = null;

  const { primary, secondary, tertiary } = await fetchCategorisedFacilities(authorityId);
  const config = ACTIVITY_CONFIGS[activityType] || ACTIVITY_CONFIGS.running;

  // Snappable indices: B=1, C=2, D=3
  const snappableIndices = [1, 2, 3];

  // ── Already-snapped facility IDs — prevent double-snapping to same place ──
  const usedFacilityIds = new Set<string>();

  if (activityType === 'walking') {
    // ═══════════════════════════════════════════════════════════════════
    // WALKING HYBRID — Exploration Mode
    // Up to 4 stops, multi-category, diversity-aware
    // ═══════════════════════════════════════════════════════════════════
    const maxStops = Math.min(Math.floor(routeDistanceKm / 2), 4);

    // Attempt to fill each waypoint with the BEST available facility
    // across ALL tiers to maximise diversity.
    const tierPools: { pool: FacilityCandidate[]; tier: 'primary' | 'secondary' | 'tertiary' }[] = [
      { pool: primary, tier: 'primary' },
      { pool: secondary.filter((s) => (s.numberOfSteps || 0) > 15), tier: 'secondary' },
      { pool: tertiary, tier: 'tertiary' },
    ];

    // Track which tiers we've used (for diversity scoring & naming)
    const usedTiers = new Set<'primary' | 'secondary' | 'tertiary'>();

    for (const idx of snappableIndices) {
      if (facilityStops.length >= maxStops) break;

      // Diversity scoring: prefer a tier we haven't used yet
      const sortedPools = [...tierPools].sort((a, b) => {
        const aUsed = usedTiers.has(a.tier) ? 1 : 0;
        const bUsed = usedTiers.has(b.tier) ? 1 : 0;
        if (aUsed !== bUsed) return aUsed - bUsed; // Unused tier first
        // Then by priority (primary < secondary < tertiary)
        const tierOrder = { primary: 0, secondary: 1, tertiary: 2 };
        return tierOrder[a.tier] - tierOrder[b.tier];
      });

      let snapped = false;
      for (const { pool, tier } of sortedPools) {
        if (snapped) break;
        // Filter out already-used facilities
        const available = pool.filter((f) => !usedFacilityIds.has(f.id));
        const nearest = findNearestFacility(result[idx], available, FACILITY_SNAP_RADIUS_METERS);
        if (nearest) {
          result[idx] = [nearest.lng, nearest.lat];
          usedFacilityIds.add(nearest.id);
          usedTiers.add(tier);
          facilityStops.push({
            id: nearest.id,
            name: nearest.name,
            lat: nearest.lat,
            lng: nearest.lng,
            waypointIndex: idx,
            priority: nearest.priority,
            type: nearest.type,
            stopType: 'journey', // Walking = always "journey" mode
          });
          snapped = true;
        }
      }
    }

    // Determine hybrid type for naming
    if (usedTiers.size > 1) {
      hybridType = 'mixed';
    } else if (usedTiers.has('primary')) {
      hybridType = 'primary';
    } else if (usedTiers.has('secondary')) {
      hybridType = 'secondary';
    } else if (usedTiers.has('tertiary')) {
      hybridType = 'tertiary';
    }
  } else {
    // ═══════════════════════════════════════════════════════════════════
    // RUNNING / CYCLING HYBRID — Performance Mode
    // Strict max 2 stops, highest-priority-only tier
    // ═══════════════════════════════════════════════════════════════════
    const maxStops = Math.min(Math.floor(routeDistanceKm / 5), 2);

    // Find the highest-priority tier that has reachable facilities
    const tierAttempts: { pool: FacilityCandidate[]; tier: 'primary' | 'secondary' | 'tertiary' }[] = [
      { pool: primary, tier: 'primary' },
    ];

    // Running: only try stairs as fallback with strict height requirement
    if (!config.avoidStairs) {
      tierAttempts.push({
        pool: secondary.filter((s) => (s.numberOfSteps || 0) > 15),
        tier: 'secondary',
      });
    } else {
      // Avoids stairs normally, but accepts tall ones as last resort (max 1)
      tierAttempts.push({
        pool: secondary.filter((s) => (s.numberOfSteps || 0) > 20),
        tier: 'secondary',
      });
    }
    tierAttempts.push({ pool: tertiary, tier: 'tertiary' });

    // Pick the FIRST tier that yields at least one snap, and only use that tier
    for (const { pool, tier } of tierAttempts) {
      if (facilityStops.length > 0) break; // Already found a tier, don't mix

      for (const idx of snappableIndices) {
        if (facilityStops.length >= maxStops) break;
        const available = pool.filter((f) => !usedFacilityIds.has(f.id));
        const nearest = findNearestFacility(result[idx], available, FACILITY_SNAP_RADIUS_METERS);
        if (nearest) {
          result[idx] = [nearest.lng, nearest.lat];
          usedFacilityIds.add(nearest.id);
          facilityStops.push({
            id: nearest.id,
            name: nearest.name,
            lat: nearest.lat,
            lng: nearest.lng,
            waypointIndex: idx,
            priority: nearest.priority,
            type: nearest.type,
            stopType: 'pit-stop', // Running = always "pit-stop" mode
          });
          hybridType = hybridType || tier;
        }
      }

      // Running stairs fallback: limit to 1 stop even if maxStops=2
      if (tier === 'secondary' && config.avoidStairs && facilityStops.length > 0) {
        break; // Do not fill the second slot with stairs for running
      }
    }
  }

  // Ensure the last waypoint still matches the first (closed loop)
  result[result.length - 1] = result[0];

  return { waypoints: result, facilityStops, hybridType };
}

/**
 * Generate context-aware Hebrew route name based on hybrid type.
 *
 * Walking mixed routes get a special combined name:
 *   "הליכה היברידית: משולב כוח ומדרגות"
 */
function generateHybridRouteName(
  hybridType: 'primary' | 'secondary' | 'tertiary' | 'mixed' | null,
  activityType: ActivityType,
  authorityName: string,
  tier: 'short' | 'medium' | 'long'
): string {
  const activityLabel: Record<string, string> = {
    running: 'ריצה',
    walking: 'הליכה',
    cycling: 'רכיבה',
  };
  const label = activityLabel[activityType] || 'אימון';

  switch (hybridType) {
    case 'mixed':
      // Walking-only: multi-category exploration
      return `${label} היברידית: משולב כוח ומדרגות – ${authorityName}`;
    case 'primary':
      return `מסלול היברידי: ${label} + מתקני כושר – ${authorityName}`;
    case 'secondary':
      return `מסלול היברידי: ${label} + אימון מדרגות – ${authorityName}`;
    case 'tertiary':
      return `מסלול היברידי: ${label} + Urban Strength – ${authorityName}`;
    default: {
      const tierLabels: Record<string, string> = {
        short: 'סיבוב קצר',
        medium: 'לופ בינוני',
        long: 'מסלול ארוך',
      };
      return `${tierLabels[tier] || 'לופ'} – ${authorityName}`;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// LEGACY — Greedy Chain Builder (kept for backward-compatible fallback)
// ══════════════════════════════════════════════════════════════════════

function startOf(path: [number, number][]): [number, number] {
  return path[0];
}

function endOf(path: [number, number][]): [number, number] {
  return path[path.length - 1];
}

function findNearest(
  point: [number, number],
  segments: [number, number][][],
  visited: Set<number>
): { index: number; reversed: boolean; distance: number } | null {
  let best: { index: number; reversed: boolean; distance: number } | null = null;

  for (let i = 0; i < segments.length; i++) {
    if (visited.has(i)) continue;
    const seg = segments[i];
    const dStart = haversineMeters(point[1], point[0], seg[0][1], seg[0][0]);
    const dEnd = haversineMeters(point[1], point[0], seg[seg.length - 1][1], seg[seg.length - 1][0]);

    const closer =
      dStart <= dEnd ? { dist: dStart, rev: false } : { dist: dEnd, rev: true };

    if (!best || closer.dist < best.distance) {
      best = { index: i, reversed: closer.rev, distance: closer.dist };
    }
  }

  return best;
}

async function bridgeGap(
  from: [number, number],
  to: [number, number],
  profile: 'cycling' | 'walking' | 'driving' = 'cycling'
): Promise<[number, number][] | null> {
  try {
    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    return data.routes[0].geometry.coordinates as [number, number][];
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════

export interface StitchingProgress {
  phase: string;
  detail: string;
  percent: number;
}

export interface StitchingResult {
  curatedRoutes: Route[];
  stats: {
    totalInfrastructureKm: number;
    segmentsProcessed: number;
    /** How many segments were compatible with the target activity (post-filter) */
    compatibleSegments: number;
    bridgesCreated: number;
    tiersGenerated: number;
    clustersFound: number;
    hybridRoutes: number;
    /** What kind of infrastructure data the routes were built on */
    dataSource: 'cycling' | 'pedestrian' | 'mixed' | 'none';
  };
}

/** Tier config per activity type */
interface TierConfig {
  tier: 'short' | 'medium' | 'long';
  label: string;
  minKm: number;
  maxKm: number;
  radiusKm: number; // Radius for diamond waypoints
}

function getTierConfigs(activityType: ActivityType): TierConfig[] {
  switch (activityType) {
    case 'running':
      return [
        { tier: 'short', label: 'סיבוב ריצה קצר', minKm: 4, maxKm: 7, radiusKm: 1.0 },
        { tier: 'medium', label: 'לופ ריצה', minKm: 8, maxKm: 12, radiusKm: 1.6 },
        { tier: 'long', label: 'מסלול ריצה ארוך', minKm: 12, maxKm: 20, radiusKm: 2.5 },
      ];
    case 'walking':
      return [
        { tier: 'short', label: 'טיול קצר', minKm: 2, maxKm: 4, radiusKm: 0.5 },
        { tier: 'medium', label: 'טיול בינוני', minKm: 4, maxKm: 6, radiusKm: 0.8 },
        { tier: 'long', label: 'טיול ארוך', minKm: 6, maxKm: 10, radiusKm: 1.3 },
      ];
    case 'cycling':
      return [
        { tier: 'short', label: 'סיבוב רכיבה קצר', minKm: 5, maxKm: 10, radiusKm: 1.5 },
        { tier: 'medium', label: 'לופ רכיבה', minKm: 10, maxKm: 20, radiusKm: 3.0 },
        { tier: 'long', label: 'מסלול רכיבה ארוך', minKm: 20, maxKm: 50, radiusKm: 5.0 },
      ];
    default:
      return [
        { tier: 'short', label: 'סיבוב קצר', minKm: 2, maxKm: 6, radiusKm: 0.8 },
        { tier: 'medium', label: 'לופ בינוני', minKm: 6, maxKm: 14, radiusKm: 1.8 },
        { tier: 'long', label: 'מסלול ארוך', minKm: 14, maxKm: 50, radiusKm: 4.0 },
      ];
  }
}

export const RouteStitchingService = {
  /**
   * Generate Hero Loop curated routes for an authority.
   *
   * Pipeline:
   *  1. Fetch infrastructure segments
   *  2. Identify density clusters (5-8 per authority)
   *  3. For each cluster × each tier: generate a diamond loop
   *  4. Apply hybrid facility snapping if applicable
   *  5. Smooth paths with Douglas-Peucker
   *  6. Save to curated_routes
   */
  generateCuratedRoutes: async (
    authorityId: string,
    authorityName: string,
    activityType: ActivityType = 'cycling',
    onProgress?: (p: StitchingProgress) => void,
    options?: { enableHybrid?: boolean }
  ): Promise<StitchingResult> => {
    const progress = (phase: string, detail: string, percent: number) => {
      console.log(`[StitchingEngine] ${phase}: ${detail} (${percent}%)`);
      onProgress?.({ phase, detail, percent });
    };

    const enableHybrid = options?.enableHybrid ?? true;
    const config = ACTIVITY_CONFIGS[activityType] || ACTIVITY_CONFIGS.running;
    const tierConfigs = getTierConfigs(activityType);

    // ── 1. Fetch infrastructure ──────────────────────────────────
    progress('fetch', 'טוען תשתיות גולמיות...', 5);
    const allInfra = await InventoryService.fetchInfrastructureByAuthority(authorityId);

    if (allInfra.length === 0) {
      return {
        curatedRoutes: [],
        stats: {
          totalInfrastructureKm: 0,
          segmentsProcessed: 0,
          compatibleSegments: 0,
          bridgesCreated: 0,
          tiersGenerated: 0,
          clustersFound: 0,
          hybridRoutes: 0,
          dataSource: 'none',
        },
      };
    }

    // ── 1b. Filter by activity ↔ infrastructure compatibility ──
    const { compatible: infra, dataSource } = filterCompatibleInfrastructure(allInfra, activityType);

    const activityLabels: Record<string, string> = {
      running: 'ריצה',
      walking: 'הליכה',
      cycling: 'רכיבה',
    };

    if (infra.length === 0) {
      // No compatible infrastructure for this activity → Pioneer Card
      console.warn(
        `[StitchingEngine] ⚠️ Authority "${authorityName}" has ${allInfra.length} infra segments ` +
        `but NONE are compatible with ${activityType}. Skipping route generation.`
      );
      progress(
        'done',
        `אין תשתית תואמת ל${activityLabels[activityType] || activityType} ברשות זו`,
        100
      );

      return {
        curatedRoutes: [],
        stats: {
          totalInfrastructureKm: 0,
          segmentsProcessed: allInfra.length,
          compatibleSegments: 0,
          bridgesCreated: 0,
          tiersGenerated: 0,
          clustersFound: 0,
          hybridRoutes: 0,
          dataSource: 'none',
        },
      };
    }

    progress(
      'filter',
      `${infra.length}/${allInfra.length} מקטעים תואמי ${activityLabels[activityType] || activityType}`,
      8
    );

    const allPaths = infra.filter((r) => r.path && r.path.length >= 2).map((r) => r.path);
    const totalInfraKm = allPaths.reduce((sum, p) => sum + pathDistanceKm(p), 0);

    progress('cluster', `${allPaths.length} מקטעים (${totalInfraKm.toFixed(1)} ק"מ)`, 10);

    // ── 2. Identify density clusters ────────────────────────────
    const targetClusterCount = Math.min(MAX_CLUSTERS, Math.max(MIN_CLUSTERS, Math.ceil(allPaths.length / 10)));
    const clusters = identifyDensityClusters(allPaths, targetClusterCount);

    progress('cluster', `נמצאו ${clusters.length} אשכולות צפיפות`, 20);

    // ── 3. Generate diamond loops ───────────────────────────────
    const curatedRoutes: Route[] = [];
    let totalBridges = 0;
    let hybridCount = 0;
    const totalSteps = clusters.length * tierConfigs.length;
    let stepsDone = 0;

    // Limit to top clusters to avoid excessive API calls
    const topClusters = clusters.slice(0, Math.min(clusters.length, 6));

    for (let ci = 0; ci < topClusters.length; ci++) {
      const cluster = topClusters[ci];

      for (let ti = 0; ti < tierConfigs.length; ti++) {
        stepsDone++;
        const tier = tierConfigs[ti];
        const pct = 20 + Math.round((stepsDone / totalSteps) * 60);
        progress(
          'stitch',
          `אשכול ${ci + 1}/${topClusters.length}: יוצר "${tier.label}"...`,
          pct
        );

        // Generate diamond waypoints around cluster center
        const rotationOffset = ci * 15 + ti * 30; // Rotate for variety
        let waypoints = generateDiamondWaypoints(
          cluster.center,
          tier.radiusKm,
          rotationOffset
        );

        // Apply hybrid snapping if enabled
        let facilityStops: FacilityStop[] = [];
        let hybridType: 'primary' | 'secondary' | 'tertiary' | 'mixed' | null = null;

        if (enableHybrid) {
          const snap = await snapWaypointsToFacilities(
            waypoints,
            authorityId,
            tier.maxKm,
            activityType
          );
          waypoints = snap.waypoints;
          facilityStops = snap.facilityStops;
          hybridType = snap.hybridType;
        }

        // Build circular route via Mapbox Directions
        const continuesStraight = config.turnPenalty === 'very_high';
        const circularResult = await buildCircularRoute(
          waypoints,
          config.mapboxProfile,
          continuesStraight
        );

        if (!circularResult || circularResult.path.length < 10) {
          console.warn(`[StitchingEngine] Skipping: no valid route for cluster ${ci + 1}, tier ${tier.tier}`);
          continue;
        }

        // Apply Douglas-Peucker smoothing
        const smoothingTolerance = config.turnPenalty === 'very_high' ? 15 : 8;
        const smoothedPath = douglasPeucker(circularResult.path, smoothingTolerance);

        // Verify path length meets tier requirements
        const routeKm = circularResult.distance;
        if (routeKm < tier.minKm * 0.5) {
          console.warn(`[StitchingEngine] Route too short (${routeKm.toFixed(1)}km < ${tier.minKm * 0.5}km), skipping`);
          continue;
        }

        // Verify circularity (start ≈ end within 100m)
        const startEnd = haversineMeters(
          smoothedPath[0][1],
          smoothedPath[0][0],
          smoothedPath[smoothedPath.length - 1][1],
          smoothedPath[smoothedPath.length - 1][0]
        );
        if (startEnd > 100) {
          // Force close the loop
          smoothedPath.push(smoothedPath[0]);
        }

        const isHybrid = facilityStops.length > 0;
        if (isHybrid) hybridCount++;

        // Generate route name
        const routeName = isHybrid
          ? generateHybridRouteName(hybridType, activityType, authorityName, tier.tier)
          : generateHybridRouteName(null, activityType, authorityName, tier.tier);

      const curatedRoute: Route = {
          id: `hero_${authorityId}_${activityType}_${tier.tier}_c${ci}_${Date.now()}`,
          name: routeName,
          description: `Hero Loop – ${tier.label} שנוצר אוטומטית מאשכול ${ci + 1}`,
          distance: Math.round(routeKm * 100) / 100,
          duration: Math.round(circularResult.duration / 60), // minutes
          score: Math.round(routeKm * 10),
        type: activityType,
        activityType,
        difficulty: tier.tier === 'short' ? 'easy' : tier.tier === 'medium' ? 'medium' : 'hard',
          rating: 4.0 + (isHybrid ? 0.3 : 0), // Small boost for hybrid routes
          calories: Math.round(
            routeKm * (activityType === 'cycling' ? 30 : activityType === 'running' ? 65 : 45)
          ),
          path: smoothedPath,
        segments: [],
        features: {
            hasGym: isHybrid && hybridType === 'primary',
            hasBenches: isHybrid && hybridType === 'tertiary',
            scenic: activityType === 'walking',
          lit: true,
          terrain: 'asphalt',
          environment: 'urban',
          trafficLoad: 'low',
          surface: 'road',
        },
        source: {
          type: 'system',
            name: 'Hero Loop Engine v2',
        },
        authorityId,
        city: authorityName,
          importBatchId: `hero_${authorityId}_${Date.now()}`,
          importSourceName: `Hero Loop Engine – ${authorityName}`,
        isInfrastructure: false,
          infrastructureMode: dataSource === 'none' ? undefined : dataSource === 'mixed' ? 'shared' : dataSource,
          bridgeCount: 0,
        curatedTier: tier.tier,
          // Hybrid metadata
          isHybrid,
          hybridType: hybridType || undefined,
          hybridActivities: isHybrid ? [activityType, 'workout'] : undefined,
          facilityStops: facilityStops.length > 0 ? facilityStops : undefined,
      };

      curatedRoutes.push(curatedRoute);

        // Rate-limit: 1.5s delay between Mapbox requests
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    // ── 4. Save to Firestore ────────────────────────────────────
    if (curatedRoutes.length > 0) {
      progress('save', 'שומר מסלולים מעובדים...', 90);
      await InventoryService.deleteCuratedRoutesByAuthority(authorityId);
      await InventoryService.saveCuratedRoutes(curatedRoutes);
    }

    progress(
      'done',
      `${curatedRoutes.length} מסלולי Hero Loop נוצרו (${hybridCount} היברידיים)`,
      100
    );

    return {
      curatedRoutes,
      stats: {
        totalInfrastructureKm: Math.round(totalInfraKm * 10) / 10,
        segmentsProcessed: allInfra.length,
        compatibleSegments: infra.length,
        bridgesCreated: totalBridges,
        tiersGenerated: curatedRoutes.length,
        clustersFound: clusters.length,
        hybridRoutes: hybridCount,
        dataSource,
      },
    };
  },
};
