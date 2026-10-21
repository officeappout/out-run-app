import type { LngLat } from '../types';

export const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
export const M_PER_DEG_LAT = 111_320;

/** A straight east-west line from (lng,lat), lenM long, ~50 m vertex spacing. */
export function east(lng: number, lat: number, lenM: number): LngLat[] {
  const n = Math.max(1, Math.round(lenM / 50));
  const dx = lenM / mPerDegLng(lat);
  return Array.from({ length: n + 1 }, (_, k) => [lng + (dx * k) / n, lat] as LngLat);
}

export const shiftNorth = (c: LngLat[], m: number): LngLat[] => c.map(([x, y]) => [x, y + m / M_PER_DEG_LAT]);

export function lineFeature(coords: number[][], props: Record<string, unknown>) {
  return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } };
}

export function square(lng: number, lat: number, sideM: number) {
  const dx = sideM / mPerDegLng(lat), dy = sideM / M_PER_DEG_LAT;
  return { type: 'Polygon' as const, coordinates: [[[lng, lat], [lng + dx, lat], [lng + dx, lat + dy], [lng, lat + dy], [lng, lat]]] };
}
