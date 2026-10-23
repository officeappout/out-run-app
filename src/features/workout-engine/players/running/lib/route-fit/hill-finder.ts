/**
 * hill-finder — "where is the nearest hill I can do my repeats on?"
 * (owner, 23.10.2026; flag enable_hill_finder_v1). Pure: no Firebase, no
 * React, no DEM at runtime — callers hand in what they already have.
 *
 * Two sources:
 *   (i)  climb_segments docs (published only — moderation is the gate):
 *        a DEM/OSM-derived climb with its own geometry, length and grade.
 *        Stairs are skipped (grade is null and you can't run reps on them).
 *   (ii) climbs detected on nearby official routes' `elevationProfile`
 *        through findBestClimbInProfile (same scan the route scorer uses).
 *        The climb's foot is located on the route's own path by distance
 *        along it, so the runner gets a real point to go to.
 *
 * Ranking: candidates that meet the spec first; then a blend of fit (grade
 * and length vs. the rep) and proximity. Two candidates whose feet are
 * within DEDUPE_M of each other are the same hill — the better one stays.
 *
 * Exposed as a plain function so other surfaces (e.g. a future AI-coach
 * tool) can call it with their own inputs.
 */

import { haversineKm } from '@/features/parks/core/services/geoUtils';
import type { ClimbSegment } from '@/features/parks/core/types/climb-segment.types';
import { readElevationSamples } from '../route-elevation-ahead';
import { findBestClimbInProfile } from './climb-match';
import type { HillRepSpec } from './types';

export interface HillLatLng { lat: number; lng: number }

/** Only the fields the finder reads — a Firestore doc + its id fits. */
export type HillClimbSegmentInput = Pick<ClimbSegment, 'type' | 'geometry' | 'lengthM' | 'avgGrade' | 'dir' | 'status'> &
  Partial<Pick<ClimbSegment, 'wayName' | 'center'>> & { id: string };

/** Only the fields the finder reads from a route (stored `path` is [lng, lat][] in memory). */
export interface HillRouteInput {
  id: string;
  name?: string | null;
  path?: readonly (readonly number[])[] | null;
  routeShape?: string | null;
  elevationProfile?: unknown;
}

export interface HillCandidate {
  source: 'climb_segment' | 'route_profile';
  /** climb_segments doc id, or the route id for a route-profile climb. */
  id: string;
  name: string | null;
  /** The foot of the climb — where a rep starts. */
  start: HillLatLng;
  /** Straight-line distance from the origin to `start` (km, 2 decimals). */
  distanceKm: number;
  lengthM: number;
  avgGradePct: number;
  meetsSpec: boolean;
  /** route_profile only: metres along the route where the climb starts (the way back for out-and-back). */
  startAlongRouteM?: number;
  /** 0..100. */
  score: number;
}

export interface FindHillsOptions {
  /** Search radius around the origin (km, default 5). */
  radiusKm?: number;
  /** How many to return (default 3). */
  limit?: number;
}

export const HILL_FINDER_RADIUS_KM = 5;
export const HILL_FINDER_LIMIT = 3;
/** Two feet closer than this are the same hill. */
const DEDUPE_M = 60;
/** A "hill" below this share of the wanted grade isn't worth showing at all. */
const MIN_GRADE_SHARE = 0.5;
/** Never call anything under this a hill, whatever the spec says (%). */
const ABS_MIN_GRADE_PCT = 2;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function meetsSpec(gradePct: number, lengthM: number, spec: HillRepSpec): boolean {
  return gradePct >= spec.minGradePct && lengthM >= spec.repLengthM * 0.9;
}

/** Fit 0..1: half grade, half length — each capped at "enough". */
function fitScore(gradePct: number, lengthM: number, spec: HillRepSpec): number {
  const g = spec.minGradePct > 0 ? Math.min(1, gradePct / spec.minGradePct) : 1;
  const l = spec.repLengthM > 0 ? Math.min(1, lengthM / spec.repLengthM) : 1;
  return (g + l) / 2;
}

function scoreOf(gradePct: number, lengthM: number, distanceKm: number, spec: HillRepSpec, radiusKm: number): number {
  const proximity = Math.max(0, 1 - distanceKm / radiusKm);
  return Math.round((0.6 * fitScore(gradePct, lengthM, spec) + 0.4 * proximity) * 100);
}

function minGradeFor(spec: HillRepSpec): number {
  return Math.max(ABS_MIN_GRADE_PCT, spec.minGradePct * MIN_GRADE_SHARE);
}

/** The point `alongM` metres along a [lng, lat] path (clamped to its ends). */
export function pointAlongPath(path: readonly (readonly number[])[], alongM: number): HillLatLng | null {
  const pts = path.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
  if (pts.length === 0) return null;
  if (alongM <= 0 || pts.length === 1) return { lng: pts[0][0], lat: pts[0][1] };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [lng0, lat0] = pts[i - 1];
    const [lng1, lat1] = pts[i];
    const seg = haversineKm(lat0, lng0, lat1, lng1) * 1000;
    if (seg > 0 && acc + seg >= alongM) {
      const f = (alongM - acc) / seg;
      return { lng: lng0 + (lng1 - lng0) * f, lat: lat0 + (lat1 - lat0) * f };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return { lng: last[0], lat: last[1] };
}

function pathLengthM(path: readonly (readonly number[])[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (isNum(a?.[0]) && isNum(a?.[1]) && isNum(b?.[0]) && isNum(b?.[1])) m += haversineKm(a[1], a[0], b[1], b[0]) * 1000;
  }
  return m;
}

/** A published, runnable climb_segments doc → candidate (null: not a usable hill). */
export function climbSegmentCandidate(
  c: HillClimbSegmentInput,
  origin: HillLatLng,
  spec: HillRepSpec,
  radiusKm = HILL_FINDER_RADIUS_KM,
): HillCandidate | null {
  if (c.status !== 'published' || c.type === 'stairs') return null;
  if (!isNum(c.avgGrade) || !isNum(c.lengthM) || c.lengthM <= 0) return null;
  const grade = Math.abs(c.avgGrade);
  if (grade < minGradeFor(spec)) return null;
  const geom = (c.geometry ?? []).filter((p) => p && isNum(p.lat) && isNum(p.lng));
  // The foot: the low end. 'down' geometry runs top → bottom, so its foot is the last point.
  const foot = geom.length ? (c.dir === 'down' ? geom[geom.length - 1] : geom[0]) : c.center;
  if (!foot || !isNum(foot.lat) || !isNum(foot.lng)) return null;
  const distanceKm = haversineKm(origin.lat, origin.lng, foot.lat, foot.lng);
  if (distanceKm > radiusKm) return null;
  const avgGradePct = round1(grade);
  return {
    source: 'climb_segment',
    id: c.id,
    name: c.wayName?.trim() || null,
    start: { lat: foot.lat, lng: foot.lng },
    distanceKm: round2(distanceKm),
    lengthM: Math.round(c.lengthM),
    avgGradePct,
    meetsSpec: meetsSpec(avgGradePct, c.lengthM, spec),
    score: scoreOf(avgGradePct, c.lengthM, distanceKm, spec, radiusKm),
  };
}

/** The best climb on a route's stored elevation profile → candidate (null: no profile / no usable climb / too far). */
export function routeProfileCandidate(
  r: HillRouteInput,
  origin: HillLatLng,
  spec: HillRepSpec,
  radiusKm = HILL_FINDER_RADIUS_KM,
): HillCandidate | null {
  const samples = readElevationSamples(r);
  if (!samples || !Array.isArray(r.path) || r.path.length < 2) return null;
  const climb = findBestClimbInProfile(samples, spec, { alsoReverse: r.routeShape === 'point_to_point' });
  if (!climb || climb.startM == null || climb.lengthM == null) return null;
  if (climb.avgGradePct < minGradeFor(spec)) return null;
  const profileM = (samples.elevationsM.length - 1) * samples.stepM;
  // Reverse scan (out-and-back): startM = total + r·step on the way back ↔ forward position total − r·step.
  const forwardM = climb.startM > profileM ? 2 * profileM - climb.startM : climb.startM;
  // The profile is sampled along the path; map by share so a small length mismatch can't push the foot off.
  const pathM = pathLengthM(r.path);
  const alongM = profileM > 0 ? (forwardM / profileM) * pathM : 0;
  const foot = pointAlongPath(r.path, alongM);
  if (!foot) return null;
  const distanceKm = haversineKm(origin.lat, origin.lng, foot.lat, foot.lng);
  if (distanceKm > radiusKm) return null;
  return {
    source: 'route_profile',
    id: r.id,
    name: r.name?.trim() || null,
    start: foot,
    distanceKm: round2(distanceKm),
    lengthM: climb.lengthM,
    avgGradePct: climb.avgGradePct,
    meetsSpec: climb.meetsSpec,
    startAlongRouteM: climb.startM,
    score: scoreOf(climb.avgGradePct, climb.lengthM, distanceKm, spec, radiusKm),
  };
}

function better(a: HillCandidate, b: HillCandidate): number {
  return Number(b.meetsSpec) - Number(a.meetsSpec) || b.score - a.score || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id);
}

/**
 * The nearest suitable hills for a rep spec, best first: spec-meeting ones
 * before near-misses, then fit × proximity. Empty when nothing usable is in range.
 */
export function findHillsNear(
  origin: HillLatLng,
  spec: HillRepSpec,
  sources: { climbs?: readonly HillClimbSegmentInput[]; routes?: readonly HillRouteInput[] },
  opts: FindHillsOptions = {},
): HillCandidate[] {
  if (!isNum(origin?.lat) || !isNum(origin?.lng)) return [];
  const radiusKm = opts.radiusKm ?? HILL_FINDER_RADIUS_KM;
  const all: HillCandidate[] = [];
  for (const c of sources.climbs ?? []) {
    const h = climbSegmentCandidate(c, origin, spec, radiusKm);
    if (h) all.push(h);
  }
  for (const r of sources.routes ?? []) {
    const h = routeProfileCandidate(r, origin, spec, radiusKm);
    if (h) all.push(h);
  }
  all.sort(better);
  const kept: HillCandidate[] = [];
  for (const h of all) {
    const dup = kept.some((k) => haversineKm(k.start.lat, k.start.lng, h.start.lat, h.start.lng) * 1000 < DEDUPE_M);
    if (!dup) kept.push(h);
    if (kept.length >= (opts.limit ?? HILL_FINDER_LIMIT)) break;
  }
  return kept;
}
