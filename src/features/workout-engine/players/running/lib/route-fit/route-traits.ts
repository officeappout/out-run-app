/**
 * The route facts the workout preferences care about, each as a 0..1 score
 * plus an honest "known" flag (unknown data is neutral 0.5 — never a claim,
 * never a penalty). Pure; reads only fields already on the route doc.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { computeRouteTurns, haversineKm } from '@/features/parks/core/services/geoUtils';
import { isRouteLitVerified } from '@/features/parks/core/services/route-quality-badges.service';
import { readElevationSamples } from '../route-elevation-ahead';
import { routeKm } from './distance-fit';

export interface Trait {
  score: number;
  known: boolean;
}

const UNKNOWN: Trait = { score: 0.5, known: false };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** 1 at ≤ good, 0 at ≥ bad, linear between. */
const ramp = (v: number, good: number, bad: number) => clamp01((bad - v) / (bad - good));

type TraitRoute = Pick<Route, 'distance' | 'path' | 'elevationGain' | 'maxGrade' | 'qualitySignals' | 'featureTags' | 'rating' | 'routeShape'> & {
  elevationProfile?: unknown;
};

/** Metres climbed per km — from the profile when present, else elevationGain. */
export function climbPerKm(route: TraitRoute): number | null {
  const km = routeKm(route);
  if (!(km > 0)) return null;
  const s = readElevationSamples(route);
  if (s) {
    let gain = 0;
    for (let i = 1; i < s.elevationsM.length; i++) gain += Math.max(0, s.elevationsM[i] - s.elevationsM[i - 1]);
    return gain / km;
  }
  return typeof route.elevationGain === 'number' ? route.elevationGain / km : null;
}

/** Flat: ≤ 5 m/km climbing → 1, ≥ 25 m/km → 0; a steep pitch (> 6%) costs a little more. */
export function flatness(route: TraitRoute): Trait {
  const perKm = climbPerKm(route);
  if (perKm == null) return UNKNOWN;
  let score = ramp(perKm, 5, 25);
  if (typeof route.maxGrade === 'number' && route.maxGrade > 6) score -= 0.2;
  return { score: clamp01(score), known: true };
}

export type Lighting = 'lit' | 'unlit' | 'unknown';

/** Verified street-lighting data, or an admin's night_lighting tag. features.lit is a legacy heuristic — ignored. */
export function lighting(route: TraitRoute): Lighting {
  if (isRouteLitVerified(route) || route.featureTags?.includes('night_lighting')) return 'lit';
  const l = route.qualitySignals?.lighting;
  if (l?.status === 'computed' && l.isLit === false) return 'unlit';
  return 'unknown';
}

/** Share of the route on genuine (dedicated) paths. */
export function dedicatedPath(route: TraitRoute): Trait & { pct: number | null } {
  const pct = route.qualitySignals?.composition?.genuinePct;
  if (typeof pct !== 'number') return { ...UNKNOWN, pct: null };
  return { score: clamp01(pct / 100), known: true, pct };
}

/** Road crossings per km: ≤ 1 → 1, ≥ 6 → 0 (only where amenities were computed). */
export function crossings(route: TraitRoute): Trait & { perKm: number | null } {
  const a = route.qualitySignals?.amenities;
  const km = routeKm(route);
  if (!a || a.status !== 'computed' || !(km > 0)) return { ...UNKNOWN, perKm: null };
  const perKm = (a.counts?.crossing ?? 0) / km;
  return { score: ramp(perKm, 1, 6), known: true, perKm };
}

/** Paths denser than this are sampled down before counting turns (cost bound). */
const MAX_TURN_POINTS = 400;

/** Sharp turns (≥ 70°) per km from the geometry: ≤ 2 → 1, ≥ 10 → 0. The out-and-back turnaround doesn't count. */
export function turns(route: TraitRoute): Trait & { perKm: number | null } {
  const path = route.path;
  const km = routeKm(route);
  if (!Array.isArray(path) || path.length < 3 || !(km > 0)) return { ...UNKNOWN, perKm: null };
  const stride = Math.max(1, Math.ceil(path.length / MAX_TURN_POINTS));
  const sampled = stride === 1 ? path : path.filter((_, i) => i % stride === 0 || i === path.length - 1);
  const sharp = computeRouteTurns(sampled).filter(
    (t) => !t.isTurnaround && (t.instruction === 'פנה ימינה' || t.instruction === 'פנה שמאלה'),
  ).length;
  const perKm = sharp / km;
  return { score: ramp(perKm, 2, 10), known: true, perKm };
}

export interface Comfort extends Trait {
  water: boolean;
  shaded: boolean;
  benches: boolean;
  rating: number | null;
}

/** Easy-run comfort: water, shade, benches, rating, dedicated path. */
export function comfort(route: TraitRoute): Comfort {
  const has = route.qualitySignals?.amenities?.status === 'computed' ? route.qualitySignals.amenities.has : null;
  const tags = route.featureTags ?? [];
  const water = !!has?.drinking_water || tags.includes('water_fountain');
  const shaded = tags.includes('shaded');
  const benches = !!has?.bench || tags.includes('has_benches');
  const rating = typeof route.rating === 'number' && route.rating > 0 ? route.rating : null;
  const path = dedicatedPath(route);
  const parts: number[] = [];
  if (path.known) parts.push(path.score);
  if (rating != null) parts.push(clamp01((rating - 3) / 2));
  const bonus = (water ? 0.15 : 0) + (shaded ? 0.1 : 0) + (benches ? 0.05 : 0);
  const known = parts.length > 0 || bonus > 0;
  const base = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.5;
  return { score: clamp01(base + bonus), known, water, shaded, benches, rating };
}

/** Distance (km) from the origin to the closest point of the route (vertices, sampled). */
export function accessKm(route: Pick<Route, 'path'>, origin: { lat: number; lng: number }): number {
  const path = route.path;
  if (!Array.isArray(path) || path.length === 0) return Infinity;
  const stride = Math.max(1, Math.ceil(path.length / 200));
  let best = Infinity;
  for (let i = 0; i < path.length; i += stride) {
    const p = path[i];
    if (!p || typeof p[0] !== 'number' || typeof p[1] !== 'number') continue;
    const d = haversineKm(origin.lat, origin.lng, p[1], p[0]);
    if (d < best) best = d;
  }
  return best;
}
