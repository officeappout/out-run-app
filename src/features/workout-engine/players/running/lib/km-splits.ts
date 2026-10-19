/**
 * Per-km splits — pure, no React, no Firebase.
 *
 * Two sources, in order of trust:
 *   1. auto-km laps (the run had autoLap = 1 km) — `splitsFromLaps`;
 *   2. the GPS trace (time-stamped samples) when there are none —
 *      `kmSplitsFromTrack`.
 *
 * The trace is raw (pre-filter), so it is cleaned the way a runner would
 * expect: poor fixes, GPS jumps and standing still are dropped, long gaps
 * (pauses) add no time. Distance and time are then scaled so they add up to
 * the run's saved totals — the km markers match the distance the runner
 * saw, and the splits add up to the run's active time. Relative pace between
 * kms is what the trace actually measured.
 */

export interface KmSplit {
  /** Cumulative distance (km) at the end of the split; the last may be partial (5.6). */
  km: number;
  /** Split duration (s). */
  sec: number;
}

export interface TrackSample {
  /** Epoch ms. */
  t: number;
  lat: number;
  lng: number;
  /** Accuracy (m); missing = unknown (kept). */
  acc?: number;
}

/** Fixes worse than this are ignored (same gate as the live route line). */
export const MAX_ACCURACY_M = 40;
/** Faster than this between two fixes is a GPS jump, not running. */
export const MAX_SPEED_MS = 10;
/** Slower than this is standing still / drift. */
export const MIN_SPEED_MS = 0.5;
/** A gap longer than this between fixes is a pause — it adds no time. */
export const MAX_GAP_SEC = 30;
/** A trailing partial km shorter than this is dropped. */
export const MIN_PARTIAL_KM = 0.1;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Splits from the GPS trace. `totalKm` / `activeSec` are the run's saved
 * distance and active time (scale targets; omit or 0 to keep the trace's
 * own). null when the trace is too thin to say anything (< 2 usable fixes
 * or under MIN_PARTIAL_KM of movement).
 */
export function kmSplitsFromTrack(
  samples: readonly TrackSample[] | null | undefined,
  { totalKm = 0, activeSec = 0 }: { totalKm?: number; activeSec?: number } = {},
): KmSplit[] | null {
  if (!samples || samples.length < 2) return null;

  // Clean segments: [distance m, time s] per accepted step.
  const steps: { d: number; dt: number }[] = [];
  let prev: TrackSample | null = null;
  for (const s of samples) {
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng) || !Number.isFinite(s.t)) continue;
    if (s.acc !== undefined && s.acc > MAX_ACCURACY_M) continue;
    if (!prev) {
      prev = s;
      continue;
    }
    const dt = (s.t - prev.t) / 1000;
    if (!(dt > 0)) continue;
    const d = haversineM(prev.lat, prev.lng, s.lat, s.lng);
    if (dt > MAX_GAP_SEC) {
      // Pause / signal loss: re-anchor without counting the gap.
      prev = s;
      continue;
    }
    const v = d / dt;
    if (v > MAX_SPEED_MS) continue; // jump — keep the anchor
    if (v < MIN_SPEED_MS) {
      prev = s; // standing / drift — re-anchor, count nothing
      continue;
    }
    steps.push({ d, dt });
    prev = s;
  }

  const rawM = steps.reduce((a, x) => a + x.d, 0);
  const rawSec = steps.reduce((a, x) => a + x.dt, 0);
  if (rawM / 1000 < MIN_PARTIAL_KM || !(rawSec > 0)) return null;

  const dScale = totalKm > 0 ? (totalKm * 1000) / rawM : 1;
  const tScale = activeSec > 0 ? activeSec / rawSec : 1;

  const out: KmSplit[] = [];
  let cumM = 0;
  let splitStartSec = 0;
  let cumSec = 0;
  let nextMark = 1000;
  for (const x of steps) {
    const d = x.d * dScale;
    const dt = x.dt * tScale;
    // A step may cross one or more km marks — interpolate the crossing time.
    let remainingD = d;
    let remainingT = dt;
    while (cumM + remainingD >= nextMark) {
      const need = nextMark - cumM;
      const tNeed = remainingD > 0 ? (need / remainingD) * remainingT : 0;
      cumM = nextMark;
      cumSec += tNeed;
      out.push({ km: nextMark / 1000, sec: Math.round(cumSec - splitStartSec) });
      splitStartSec = cumSec;
      remainingD -= need;
      remainingT -= tNeed;
      nextMark += 1000;
    }
    cumM += remainingD;
    cumSec += remainingT;
  }
  const partialKm = (cumM - (nextMark - 1000)) / 1000;
  if (partialKm >= MIN_PARTIAL_KM) {
    out.push({ km: round1(cumM / 1000), sec: Math.round(cumSec - splitStartSec) });
  }
  return out.length > 0 ? out : null;
}

export interface LapLike {
  distanceMeters: number;
  durationSeconds: number;
  isActive?: boolean;
}

/**
 * Auto-km laps as splits — only when every completed lap is a ~1 km lap
 * (the last may be shorter). Manual / time laps ⇒ null (they are not
 * per-km splits; the laps UI shows them instead).
 */
export function splitsFromLaps(laps: readonly LapLike[] | null | undefined): KmSplit[] | null {
  const done = (laps ?? []).filter((l) => l && !l.isActive && l.distanceMeters > 0 && l.durationSeconds > 0);
  if (done.length === 0) return null;
  const isKm = (m: number) => m >= 950 && m <= 1050;
  const body = done.slice(0, -1);
  const last = done[done.length - 1];
  if (!body.every((l) => isKm(l.distanceMeters))) return null;
  if (!isKm(last.distanceMeters) && last.distanceMeters > 1050) return null;
  let cum = 0;
  return done.map((l) => {
    cum += l.distanceMeters;
    const km = isKm(l.distanceMeters) ? Math.round(cum / 1000) : round1(cum / 1000);
    return { km, sec: Math.round(l.durationSeconds) };
  });
}

/** sec/km of a split (the partial one uses its own length). */
export function splitPaceSec(split: KmSplit, prevKm: number): number | null {
  const len = split.km - prevKm;
  if (!(len > 0) || !(split.sec > 0)) return null;
  return Math.round(split.sec / len);
}
