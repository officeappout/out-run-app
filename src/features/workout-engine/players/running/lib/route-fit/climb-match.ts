/**
 * Hill detection for a hill-repeat workout. Pure.
 *
 * Sources, best first:
 *   1. `route.elevationProfile` (equally spaced DEM samples, trails pipeline)
 *      → slide a window of the rep length along the profile, keep the
 *      steepest SUSTAINED one (no real dip inside), then grow it while the
 *      road keeps climbing. Gives grade, length and the km it starts at.
 *      Point-to-point routes are also scanned backwards (run as
 *      out-and-back, a descent out is a climb back).
 *   2. `route.terrainFeatures` (nearby climb_segments refs, avg grade
 *      denormalized) → grade only; no length, no position along the route.
 *   3. `route.maxGrade` (steepest 15 m step) → a hint that something steep
 *      exists; never "meets spec" (15 m says nothing about a 200 m rep).
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { readElevationSamples, type ElevationSamples } from '../route-elevation-ahead';
import type { ClimbMatch, HillRepSpec } from './types';

/** A step falling more than this (%) breaks a climb. */
const DIP_TOLERANCE_PCT = -1;
/** Terrain refs further than this from the path don't count (m). */
const TERRAIN_NEAR_M = 40;

interface Scan { startIdx: number; endIdx: number; avgGradePct: number }

function gradeAt(e: number[], i: number, step: number): number {
  return ((e[i + 1] - e[i]) / step) * 100;
}

function scanProfile(e: number[], step: number, repLengthM: number): Scan | null {
  const intervals = e.length - 1;
  if (intervals < 1) return null;
  const k = Math.min(intervals, Math.max(1, Math.ceil(repLengthM / step - 1e-9)));
  let best: Scan | null = null;
  for (let i = 0; i + k <= intervals; i++) {
    let sustained = true;
    for (let j = i; j < i + k; j++) {
      if (gradeAt(e, j, step) < DIP_TOLERANCE_PCT) { sustained = false; break; }
    }
    if (!sustained) continue;
    const avg = ((e[i + k] - e[i]) / (k * step)) * 100;
    if (avg <= 0) continue;
    if (!best || avg > best.avgGradePct) best = { startIdx: i, endIdx: i + k, avgGradePct: avg };
  }
  if (!best) return null;
  // Grow forward / backward while it keeps climbing at ≥ half the window's grade.
  const floor = best.avgGradePct / 2;
  let { startIdx, endIdx } = best;
  while (endIdx < intervals && gradeAt(e, endIdx, step) >= floor) endIdx++;
  while (startIdx > 0 && gradeAt(e, startIdx - 1, step) >= floor) startIdx--;
  const avg = ((e[endIdx] - e[startIdx]) / ((endIdx - startIdx) * step)) * 100;
  // Growing may dilute the grade; keep the longer climb only while it stays close to the window's.
  return avg >= best.avgGradePct * 0.85 ? { startIdx, endIdx, avgGradePct: avg } : best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Best climb in an elevation profile for the rep spec (null: nothing uphill). */
export function findBestClimbInProfile(
  s: ElevationSamples,
  spec: HillRepSpec,
  opts: { alsoReverse?: boolean } = {},
): ClimbMatch | null {
  const totalM = (s.elevationsM.length - 1) * s.stepM;
  const candidates: ClimbMatch[] = [];
  const fwd = scanProfile(s.elevationsM, s.stepM, spec.repLengthM);
  if (fwd) candidates.push(toMatch(fwd, fwd.startIdx * s.stepM));
  if (opts.alsoReverse) {
    const rev = scanProfile([...s.elevationsM].reverse(), s.stepM, spec.repLengthM);
    // Reversed index r ↔ along the way back: totalM (out) + r·step.
    if (rev) candidates.push(toMatch(rev, totalM + rev.startIdx * s.stepM));
  }
  if (candidates.length === 0) return null;
  // A climb that meets the spec beats a steeper one that doesn't; then steeper wins; then earlier.
  candidates.sort((a, b) =>
    Number(b.meetsSpec) - Number(a.meetsSpec) || b.avgGradePct - a.avgGradePct || (a.startM ?? 0) - (b.startM ?? 0));
  return candidates[0];

  function toMatch(scan: Scan, startM: number): ClimbMatch {
    const lengthM = (scan.endIdx - scan.startIdx) * s.stepM;
    const avgGradePct = round1(scan.avgGradePct);
    return {
      startM: Math.round(startM),
      lengthM: Math.round(lengthM),
      avgGradePct,
      source: 'profile',
      meetsSpec: avgGradePct >= spec.minGradePct && lengthM >= spec.repLengthM * 0.9,
    };
  }
}

/** Climb for a route: profile first, then terrain refs, then maxGrade. */
export function findClimbForRoute(
  route: Pick<Route, 'routeShape' | 'terrainFeatures' | 'maxGrade'> & { elevationProfile?: unknown },
  spec: HillRepSpec,
): ClimbMatch | null {
  const samples = readElevationSamples(route);
  if (samples) {
    // A real profile with no uphill is a proven "no climb" — distinct from "no data" (null).
    return (
      findBestClimbInProfile(samples, spec, { alsoReverse: route.routeShape === 'point_to_point' }) ??
      { startM: null, lengthM: 0, avgGradePct: 0, source: 'profile', meetsSpec: false }
    );
  }
  const terrain = (route.terrainFeatures ?? [])
    .filter((t) => t.type !== 'stairs' && t.distanceFromPathMeters <= TERRAIN_NEAR_M && typeof t.avgGrade === 'number' && t.avgGrade > 0)
    .sort((a, b) => (b.avgGrade ?? 0) - (a.avgGrade ?? 0))[0];
  if (terrain && terrain.avgGrade != null) {
    return {
      startM: null,
      lengthM: null,
      avgGradePct: round1(terrain.avgGrade),
      source: 'terrain',
      meetsSpec: terrain.avgGrade >= spec.minGradePct,
    };
  }
  if (typeof route.maxGrade === 'number' && route.maxGrade > 0) {
    return { startM: null, lengthM: null, avgGradePct: round1(route.maxGrade), source: 'maxGrade', meetsSpec: false };
  }
  return null;
}

const fmtGrade = (g: number) => `${Number.isInteger(g) ? g : g.toFixed(1)}%`;
const fmtKm = (m: number) => {
  const km = m / 1000;
  return Number.isInteger(km) ? String(km) : km.toFixed(1);
};

/** "עלייה של 6% באורך 300 מ׳ בק״מ 1.2" / "עלייה של 8% ליד המסלול" / "שיפוע מרבי 7%". */
export function climbReason(c: ClimbMatch): string {
  if (c.source === 'maxGrade') return `שיפוע מרבי ${fmtGrade(Math.round(c.avgGradePct))}`;
  if (c.lengthM == null || c.startM == null) return `עלייה של ${fmtGrade(Math.round(c.avgGradePct))} ליד המסלול`;
  const len = `${Math.round(c.lengthM / 10) * 10} מ׳`;
  return `עלייה של ${fmtGrade(Math.round(c.avgGradePct))} באורך ${len} בק״מ ${fmtKm(c.startM)}`;
}
