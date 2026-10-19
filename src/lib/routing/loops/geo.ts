/** Small spherical helpers for placing loop waypoints. */
export interface LatLng { lat: number; lng: number }

/** Point `km` away from `from` along `bearingDeg` (equirectangular; fine at < 20 km). */
export function destination(from: LatLng, bearingDeg: number, km: number): LatLng {
  const b = (bearingDeg * Math.PI) / 180;
  return {
    lat: from.lat + (km * Math.cos(b)) / 110.54,
    lng: from.lng + (km * Math.sin(b)) / (111.32 * Math.cos((from.lat * Math.PI) / 180)),
  };
}

/** Three evenly spread directions (120° apart) rotated per generation. */
export function spreadHeadings(seed: number, count = 3): number[] {
  return Array.from({ length: count }, (_, k) => (((seed * 40 + k * (360 / count)) % 360) + 360) % 360);
}
