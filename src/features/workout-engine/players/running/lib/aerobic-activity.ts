/**
 * Aerobic activity of the live player (walking · running · cycling) — pure
 * logic, no React / Firebase. Cycling (enable_home_v2 only — only v2 entry
 * points ever set it) reuses the running player end to end; this module holds
 * everything that differs for a bike:
 *
 *   • GPS filter thresholds — bikes move 4–15 m/s, so a 1 Hz fix can be far
 *     from the anchor without being a satellite jump.
 *   • speed (km/h) instead of pace (min/km) on every live / summary surface.
 *   • calories by cycling MET (Compendium of Physical Activities, by speed) —
 *     the running path's per-km factor would bill a 30 km ride as a 30 km run.
 *   • auto-lap distances sized for a bike.
 *
 * Walking / running values here are EXACTLY the ones the player used before
 * this module existed (pinned by tests) — flag off = today.
 */

export type AerobicActivity = 'running' | 'walking' | 'cycling';

export function isCycling(activity: string | null | undefined): boolean {
  return activity === 'cycling';
}

/** What the live surfaces show as the "rate" metric. */
export type RateMetric = 'pace' | 'speed';

export function rateMetricFor(activity: string | null | undefined): RateMetric {
  return isCycling(activity) ? 'speed' : 'pace';
}

export const AEROBIC_LABEL: Record<AerobicActivity, string> = { running: 'ריצה', walking: 'הליכה', cycling: 'רכיבה' };

/** Hebrew name of the activity; anything unknown reads as a run (today's label). */
export function aerobicLabel(activity: string | null | undefined): string {
  return activity === 'walking' || activity === 'cycling' ? AEROBIC_LABEL[activity] : AEROBIC_LABEL.running;
}

// ── GPS filter thresholds ────────────────────────────────────────────────

export interface GpsFilterThresholds {
  /** Displacement from the anchor needed before a sample counts (m). */
  distanceThresholdM: number;
  /** A single displacement above this is a satellite jump (m). */
  maxJumpM: number;
  /** Implied speed above this is physically impossible for the activity (m/s). */
  maxRealisticSpeedMs: number;
  /** Below this average speed the displacement is drift, not movement (m/s). */
  minSpeedMs: number;
  /** Instant paces slower than this are not fed to the pace smoother (min/km). */
  maxPaceMinKm: number;
}

/**
 * Cycling: a wider movement gate (fewer jittery 5 m steps at speed), a jump
 * gate that a 15 m/s rider with a late fix can't trip (~13 s of riding), and
 * a speed ceiling of ~80 km/h (fast descents pass, car-speed glitches don't).
 */
export const BIKE_GPS_THRESHOLDS: GpsFilterThresholds = {
  distanceThresholdM: 8,
  maxJumpM: 200,
  maxRealisticSpeedMs: 22,
  minSpeedMs: 0.5,
  maxPaceMinKm: 30,
};

/**
 * The gates for this sample: a ride gets the bike gates; walking / running
 * keep the caller's own (the player's constants, untouched).
 */
export function gpsFilterThresholds(activity: string | null | undefined, onFoot: GpsFilterThresholds): GpsFilterThresholds {
  return activity === 'cycling' ? BIKE_GPS_THRESHOLDS : onFoot;
}

// ── Speed ────────────────────────────────────────────────────────────────

/** Average speed in km/h; 0 before 50 m or without time. */
export function speedKmh(distanceKm: number, durationSec: number): number {
  if (!(distanceKm > 0.05) || !(durationSec > 0)) return 0;
  return distanceKm / (durationSec / 3600);
}

/** Pace (sec/km) → speed (km/h); 0 for no / invalid pace. */
export function paceSecToKmh(paceSec: number): number {
  return Number.isFinite(paceSec) && paceSec > 0 ? 3600 / paceSec : 0;
}

/** Pace (min/km) → speed (km/h); 0 for no / invalid pace. */
export function paceMinToKmh(paceMinKm: number | null | undefined): number {
  return paceMinKm != null && Number.isFinite(paceMinKm) && paceMinKm > 0 ? 60 / paceMinKm : 0;
}

/** "24.3" — one decimal, "--" for none. */
export function fmtSpeed(kmh: number): string {
  return Number.isFinite(kmh) && kmh > 0 ? kmh.toFixed(1) : '--';
}

// ── Calories (cycling MET by speed) ──────────────────────────────────────

/**
 * Compendium of Physical Activities (2011) general road-cycling METs by
 * average speed (10–20 mph bands): < 16 km/h leisure 4.0 · 16–19.3 6.8 ·
 * 19.3–22.5 8.0 · 22.5–25.7 10.0 · 25.7–30.6 12.0 · ≥ 30.6 15.8.
 */
export function cyclingMet(kmh: number): number {
  if (!(kmh > 0)) return 4.0;
  if (kmh < 16) return 4.0;
  if (kmh < 19.3) return 6.8;
  if (kmh < 22.5) return 8.0;
  if (kmh < 25.7) return 10.0;
  if (kmh < 30.6) return 12.0;
  return 15.8;
}

/** kcal = MET × kg × hours, by the ride's average moving speed. Whole kcal, ≥ 0. */
export function cyclingCalories(durationSec: number, distanceKm: number, weightKg: number): number {
  const sec = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (sec === 0) return 0;
  const kg = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 70;
  const met = cyclingMet(speedKmh(distanceKm, sec));
  return Math.round(met * kg * (sec / 3600));
}

// ── Auto-lap ─────────────────────────────────────────────────────────────

export interface AutoLapDistanceRange {
  minKm: number;
  maxKm: number;
  stepKm: number;
  defaultKm: number;
}

/** The settings slider for distance laps. Running / walking = today's 0.1–2.0 km. */
export function autoLapDistanceRange(activity: string | null | undefined): AutoLapDistanceRange {
  return activity === 'cycling'
    ? { minKm: 1, maxKm: 10, stepKm: 1, defaultKm: 5 }
    : { minKm: 0.1, maxKm: 2.0, stepKm: 0.1, defaultKm: 1.0 };
}

/**
 * The distance-lap length actually used. A bike never laps more often than
 * every km (a runner's 0.4 km setting would lap every ~1 min on a bike).
 */
export function effectiveAutoLapKm(activity: string | null | undefined, valueKm: number): number {
  if (activity !== 'cycling') return valueKm;
  return Math.max(1, Number.isFinite(valueKm) ? valueKm : 0);
}

// ── Saved workout labels ─────────────────────────────────────────────────

/** workoutType + displayIcon written on the workout doc (same values storage.service derives). */
export function savedWorkoutLabels(activity: string | null | undefined): {
  workoutType: 'running' | 'walking' | 'cycling';
  displayIcon?: 'bike';
} {
  if (activity === 'walking') return { workoutType: 'walking' };
  if (activity === 'cycling') return { workoutType: 'cycling', displayIcon: 'bike' };
  return { workoutType: 'running' };
}

// ── Rate text for the live card ─────────────────────────────────────────

export interface RateLabels {
  /** Page tab. */
  page: string;
  /** Tile under the hero. */
  current: string;
  average: string;
  /** Big page header. */
  now: string;
  /** Line under the big number. */
  unitLine: string;
}

export function rateLabels(metric: RateMetric): RateLabels {
  return metric === 'speed'
    ? { page: 'מהירות', current: 'מהירות', average: 'מהירות ממוצעת', now: 'מהירות עכשיו', unitLine: 'קמ״ש' }
    : { page: 'קצב', current: 'קצב נוכחי', average: 'קצב ממוצע', now: 'קצב עכשיו', unitLine: 'דק׳ לק״מ · ממוצע 15 שנ׳' };
}
