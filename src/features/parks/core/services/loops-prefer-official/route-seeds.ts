/**
 * Waypoint seeds ON our mapped routes for the v1 (Mapbox) loop generator:
 * points sampled every SEED_STEP_M along each nearby route, each with the
 * route's travel bearing there (so buildLoopDirectionsParams pins Mapbox to
 * pass THROUGH the route in the loop's direction), kept only in the ring where
 * loop waypoints belong (SEED_RING × the ideal waypoint distance). They are
 * mixed with the quiet-street candidates; the generator's own scoring and
 * angular selection decide which win (official + calm-street bonuses, both
 * gated on distance fit).
 */
import type { OurRouteLine } from '@/lib/route-quality';
import { compassBearing } from '../route-quality-v1/segment-anchor';
import type { QualityCandidate } from '../route-quality-v1/quality-waypoints';

export const SEED_STEP_M = 150;
export const MAX_SEEDS = 48;
/** Seeds between these multiples of the ideal waypoint distance from the user. */
export const SEED_RING = [0.45, 1.9] as const;
/** A seed counts as a top-quality calm segment (scoreWaypoint's preferQuietSegments). */
const SEED_SEG_QUALITY = 10;

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
type P = { lat: number; lng: number };
const distM = (a: P, b: P) => {
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.hypot(x, y) * R;
};

export function seedsFromOurRoutes(lines: OurRouteLine[], user: P, idealKm: number): QualityCandidate[] {
  const minM = SEED_RING[0] * idealKm * 1000;
  const maxM = SEED_RING[1] * idealKm * 1000;
  const seeds: QualityCandidate[] = [];
  for (const line of lines) {
    const pts = line.path.map(([lng, lat]) => ({ lat, lng }));
    let next = SEED_STEP_M / 2;
    let cum = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = distM(a, b);
      if (seg === 0) continue;
      while (next <= cum + seg) {
        const t = (next - cum) / seg;
        const p = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
        const d = distM(user, p);
        if (d >= minM && d <= maxM) {
          seeds.push({ lat: p.lat, lng: p.lng, bearingDeg: compassBearing(a, b), snapped: true, isOfficial: true, flowScore: 0, segQuality: SEED_SEG_QUALITY });
        }
        next += SEED_STEP_M;
      }
      cum += seg;
    }
  }
  if (seeds.length <= MAX_SEEDS) return seeds;
  // Evenly thinned — keeps every route represented instead of the first ones only.
  const step = seeds.length / MAX_SEEDS;
  return Array.from({ length: MAX_SEEDS }, (_, k) => seeds[Math.floor(k * step)]);
}

/** Quiet-street candidates + seeds on our routes (the quiet ones keep their order first). */
export function withOurRouteSeeds(candidates: QualityCandidate[], lines: OurRouteLine[], user: P, idealKm: number): QualityCandidate[] {
  if (lines.length === 0) return candidates;
  const seeds = seedsFromOurRoutes(lines, user, idealKm);
  return seeds.length ? [...candidates, ...seeds] : candidates;
}
