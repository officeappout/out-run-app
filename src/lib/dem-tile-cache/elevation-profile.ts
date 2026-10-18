/**
 * dem-tile-cache/elevation-profile.ts — smoothed elevation profile for a
 * polyline (trails pilot, 18.10.2026). Pure, browser-safe.
 *
 * Pipeline (each step a named, tunable constant):
 *   1. resample the path every STEP_M (default 15 m, allowed 10–20 m)
 *   2. sample elevation through an ElevationProvider (null anywhere → null)
 *   3. running-median filter (MEDIAN_WINDOW samples) — kills single-pixel
 *      DEM spikes (trees/buildings in a DSM) that a moving average smears
 *   4. gain/loss with HYSTERESIS_M (≥3 m): a climb only counts once the
 *      profile has moved ≥3 m from the last confirmed turning point, so
 *      sub-metre DEM noise on flat ground no longer accumulates "gain"
 *   5. max grade over a ≥ GRADE_WINDOW_M (50 m) window, each direction —
 *      never a single-step delta (a 15 m step makes 1 m of noise = 6.7 %)
 *
 * Gain in the reverse direction == loss in the forward direction, so one
 * profile serves both traversal directions of a segment.
 */
import type { ElevationProvider } from './elevation-provider';

export const PROFILE_STEP_M = 15;
export const PROFILE_MEDIAN_WINDOW = 5;
export const PROFILE_HYSTERESIS_M = 3;
export const PROFILE_GRADE_WINDOW_M = 50;

export interface ProfileOptions {
  stepM?: number;
  medianWindow?: number;
  hysteresisM?: number;
  gradeWindowM?: number;
}

export interface SmoothedProfile {
  lengthM: number;
  /** Ascent / descent walking the path in its given (forward) order. */
  gainM: number;
  lossM: number;
  /** Steepest sustained uphill over ≥ gradeWindowM, forward / reverse, %. */
  maxGradeFwdPct: number;
  maxGradeRevPct: number;
  minEleM: number;
  maxEleM: number;
  startEleM: number;
  endEleM: number;
  /** Window actually used (= path length when the path is shorter than the window). */
  gradeWindowM: number;
  samples: number;
}

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** [lng, lat] polyline length in meters. */
export function polylineLengthM(coords: Array<[number, number]>): number {
  let L = 0;
  for (let i = 1; i < coords.length; i++) L += haversineM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  return L;
}

/**
 * Resample a [lng, lat] polyline at a fixed step. Always includes both
 * endpoints; returns the distance-along of each sample too.
 */
export function resamplePolyline(coords: Array<[number, number]>, stepM: number): { points: Array<[number, number]>; dist: number[] } {
  const points: Array<[number, number]> = [];
  const dist: number[] = [];
  if (coords.length === 0) return { points, dist };
  points.push(coords[0]);
  dist.push(0);
  let along = 0;
  let nextAt = stepM;
  for (let i = 1; i < coords.length; i++) {
    const [aLng, aLat] = coords[i - 1];
    const [bLng, bLat] = coords[i];
    const seg = haversineM(aLat, aLng, bLat, bLng);
    if (seg === 0) continue;
    while (nextAt <= along + seg) {
      const t = (nextAt - along) / seg;
      points.push([aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t]);
      dist.push(nextAt);
      nextAt += stepM;
    }
    along += seg;
  }
  if (along - dist[dist.length - 1] > 1e-6) {
    points.push(coords[coords.length - 1]);
    dist.push(along);
  }
  return { points, dist };
}

/** Centered running median; window shrinks symmetrically at the ends. */
export function medianFilter(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const h = Math.min(half, i, values.length - 1 - i);
    const w = values.slice(i - h, i + h + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

/** Gain/loss with a dead band: only moves ≥ threshold from the last turning point count. */
export function hysteresisGainLoss(values: number[], thresholdM: number): { gain: number; loss: number } {
  if (values.length < 2) return { gain: 0, loss: 0 };
  let gain = 0;
  let loss = 0;
  let ref = values[0];
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - ref;
    if (d >= thresholdM) {
      gain += d;
      ref = values[i];
    } else if (-d >= thresholdM) {
      loss += -d;
      ref = values[i];
    }
  }
  // Residual at the end (path finishes mid-climb by < threshold): ignored
  // on purpose — it is indistinguishable from noise.
  return { gain, loss };
}

/**
 * Max sustained grade (%), both directions, over windows of at least
 * `windowM`. Uses the cumulative-distance array so uneven last steps are
 * handled. Paths shorter than the window use their full length.
 */
export function maxWindowGrade(ele: number[], dist: number[], windowM: number): { fwd: number; rev: number; windowUsed: number } {
  const total = dist[dist.length - 1] ?? 0;
  if (ele.length < 2 || total <= 0) return { fwd: 0, rev: 0, windowUsed: 0 };
  if (total < windowM) {
    const g = ((ele[ele.length - 1] - ele[0]) / total) * 100;
    return { fwd: Math.max(0, g), rev: Math.max(0, -g), windowUsed: total };
  }
  let fwd = 0;
  let rev = 0;
  let j = 0;
  for (let i = 0; i < ele.length; i++) {
    if (j < i) j = i;
    while (j < ele.length && dist[j] - dist[i] < windowM) j++;
    if (j >= ele.length) break;
    const g = ((ele[j] - ele[i]) / (dist[j] - dist[i])) * 100;
    if (g > fwd) fwd = g;
    if (-g > rev) rev = -g;
  }
  return { fwd, rev, windowUsed: windowM };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Smoothed profile of a [lng, lat] polyline. Returns null when the path is
 * degenerate or ANY sample is outside provider coverage — never a partial
 * or guessed profile (same discipline as computeDemProfile).
 */
export function computeSmoothedProfile(coords: Array<[number, number]>, provider: ElevationProvider, opts: ProfileOptions = {}): SmoothedProfile | null {
  const stepM = Math.min(20, Math.max(10, opts.stepM ?? PROFILE_STEP_M));
  const medianWindow = opts.medianWindow ?? PROFILE_MEDIAN_WINDOW;
  const hysteresisM = Math.max(3, opts.hysteresisM ?? PROFILE_HYSTERESIS_M);
  const gradeWindowM = Math.max(50, opts.gradeWindowM ?? PROFILE_GRADE_WINDOW_M);
  if (coords.length < 2) return null;
  const { points, dist } = resamplePolyline(coords, stepM);
  if (points.length < 2) return null;
  const raw: number[] = [];
  for (const [lng, lat] of points) {
    const e = provider.sample(lat, lng);
    if (e == null || !Number.isFinite(e)) return null;
    raw.push(e);
  }
  const ele = medianFilter(raw, medianWindow);
  const { gain, loss } = hysteresisGainLoss(ele, hysteresisM);
  const g = maxWindowGrade(ele, dist, gradeWindowM);
  return {
    lengthM: r1(dist[dist.length - 1]),
    gainM: r1(gain),
    lossM: r1(loss),
    maxGradeFwdPct: r1(g.fwd),
    maxGradeRevPct: r1(g.rev),
    minEleM: r1(Math.min(...ele)),
    maxEleM: r1(Math.max(...ele)),
    startEleM: r1(ele[0]),
    endEleM: r1(ele[ele.length - 1]),
    gradeWindowM: r1(g.windowUsed),
    samples: ele.length,
  };
}
