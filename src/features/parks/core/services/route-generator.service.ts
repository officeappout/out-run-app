// src/features/map/services/route-generator.service.ts

import { Route, ActivityType } from '../types/route.types';
import { Park as MapPark } from '../types/park.types';
import { MapboxService } from './mapbox.service';

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
  const baseRadius = (targetDistance / 3) / kmPerDegree;
  
  // Use index to rotate the entire pattern
  const angleOffset = (routeGenerationIndex * 45) % 360;
  const angleRad = (angleOffset * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    const radiusVariation = 0.6 + (Math.random() * 0.8);
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
    parks
  } = options;

  console.log(`[RouteGenerator] Starting generation. Target: ${targetDistance.toFixed(1)}km, Activity: ${activity}`);

  // 1. Find fitness anchor if needed
  const fitnessAnchor = preferences.includeStrength
    ? await findFitnessAnchor(userLocation, targetDistance, parks)
    : null;

  // 2. Generate waypoint candidates
  const candidateWaypoints = generateRandomWaypoints(
    userLocation,
    targetDistance,
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
  const MIN_PATH_POINTS = 50; // ✅ Strict requirement: no straight lines

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
      const minKm = Math.max(0.5, targetDistance - 0.5);
      const maxKm = targetDistance + 2.5;
      if (routeDistanceKm < minKm || routeDistanceKm > maxKm) {
        console.warn(
          `[RouteGenerator] Route ${i} REJECTED: distance ${routeDistanceKm.toFixed(
            1,
          )}km outside allowed range [${minKm.toFixed(1)}–${maxKm.toFixed(1)}]km (target ${targetDistance.toFixed(
            1,
          )}km)`,
        );

        // ✅ Wait before next attempt to avoid 429
        if (i < routeCombinations.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) {
          await delay(1500);
        }
        continue;
      }

      // ✅ VALID ROUTE!
      const durationMinutes = Math.round((routeDistanceKm / (activity === 'cycling' ? 20 : 6)) * 60);
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
