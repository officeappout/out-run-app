import { Route } from '../types/route.types';

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return Infinity;
  if (!isFinite(lat1) || !isFinite(lng1) || !isFinite(lat2) || !isFinite(lng2)) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_PROXIMITY_RADIUS_KM = 10;

export function isRouteNearby(
  route: Route,
  userPos: { lat: number; lng: number },
  radiusKm = DEFAULT_PROXIMITY_RADIUS_KM,
): boolean {
  if (!userPos || userPos.lat == null || userPos.lng == null) return false;
  if (!route.path || route.path.length === 0) return false;
  const mid = route.path[Math.floor(route.path.length / 2)];
  if (!mid || mid[0] == null || mid[1] == null) return false;
  return haversineKm(userPos.lat, userPos.lng, mid[1], mid[0]) <= radiusKm;
}

/** Distance (km) from a position to the first coordinate of a route's path. */
export function distanceToRouteStart(
  route: Route,
  userPos: { lat: number; lng: number },
): number {
  if (!route.path || route.path.length === 0) return Infinity;
  const start = route.path[0];
  if (!start || start[0] == null || start[1] == null) return Infinity;
  return haversineKm(userPos.lat, userPos.lng, start[1], start[0]);
}

/**
 * Split a coordinate array into GeoJSON segments wherever the zone label
 * changes — used for multi-color live-path rendering on the map.
 */
export function segmentPathByZone(
  coords: [number, number][],
  zones: (string | null)[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (coords.length < 2) return { type: 'FeatureCollection', features };

  let segStart = 0;
  let currentZone = zones[0] ?? '_default';

  for (let i = 1; i < coords.length; i++) {
    const zone = zones[i] ?? '_default';
    if (zone !== currentZone) {
      features.push({
        type: 'Feature',
        properties: { zoneType: currentZone },
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(segStart, i + 1),
        },
      });
      segStart = i;
      currentZone = zone;
    }
  }

  features.push({
    type: 'Feature',
    properties: { zoneType: currentZone },
    geometry: {
      type: 'LineString',
      coordinates: coords.slice(segStart),
    },
  });

  return { type: 'FeatureCollection', features };
}

/** Linear interpolation between two [lng, lat] points. */
export function interpolatePath(
  p1: [number, number],
  p2: [number, number],
  t: number,
): [number, number] {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
}
