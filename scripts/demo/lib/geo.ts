/**
 * Fake-but-plausible GPS for demo runs and walks (pure): a closed loop of the workout's
 * distance around a start point, with a little GPS noise. Never a real user's track.
 */
import { gauss } from './rng';

export interface LatLng {
  lat: number;
  lng: number;
}

const KM_PER_DEG_LAT = 111.32;

export function offset(p: LatLng, dLat: number, dLng: number): LatLng {
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** ~one point per 150 m, 8..60 points, loop circumference = distanceKm. */
export function loopRoute(start: LatLng, distanceKm: number, r: () => number): LatLng[] {
  const n = Math.max(8, Math.min(60, Math.round(distanceKm / 0.15)));
  const radiusKm = Math.max(0.15, distanceKm / (2 * Math.PI));
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((start.lat * Math.PI) / 180);
  const phase = r() * 2 * Math.PI;
  // Centre the loop so it starts at `start`.
  const centre = offset(start, -(radiusKm * Math.sin(phase)) / KM_PER_DEG_LAT, -(radiusKm * Math.cos(phase)) / kmPerDegLng);
  const pts: LatLng[] = [];
  for (let i = 0; i <= n; i++) {
    const a = phase + (i / n) * 2 * Math.PI;
    const noiseKm = 0.006;
    pts.push({
      lat: +(centre.lat + (radiusKm * Math.sin(a) + gauss(r) * noiseKm) / KM_PER_DEG_LAT).toFixed(6),
      lng: +(centre.lng + (radiusKm * Math.cos(a) + gauss(r) * noiseKm) / kmPerDegLng).toFixed(6),
    });
  }
  return pts;
}
