/**
 * 1-byte quantization of a profile cell, and the daily summaries used to
 * sanity-check against the Technion daily Shade Index.
 *
 * Byte: 0…200 = shade 0…1 in steps of 0.005; 255 = sun below horizon.
 * Pure.
 */
import { SUN_DOWN } from './profile';
import { HOURS_PER_DAY, type SunCell } from './time-grid';

export const Q_SCALE = 200;
export const Q_SUN_DOWN = 255;

export function quantizeCell(v: number): number {
  if (v === SUN_DOWN || !Number.isFinite(v) || v < 0) return Q_SUN_DOWN;
  return Math.round(Math.min(1, v) * Q_SCALE);
}

/** Shade 0..1, or null when the sun is down. */
export function dequantizeCell(b: number): number | null {
  if (b === Q_SUN_DOWN || b > Q_SCALE) return null;
  return b / Q_SCALE;
}

export function quantizeProfile(p: Float32Array | number[]): Uint8Array {
  const out = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = quantizeCell(p[i]);
  return out;
}

/**
 * Direct-radiation-weighted mean shade over the given months: each hour is
 * weighted by sin(sun elevation) (horizontal-surface share of direct beam),
 * so it estimates "share of the day's direct sun that is blocked" — the
 * same notion as the Technion SI (which also counts diffuse light, so the
 * two are correlated, not equal). Null when no sunlit cell.
 */
export function radiationWeightedMean(profile: Uint8Array, sunTable: SunCell[], monthIndexes: number[]): number | null {
  let w = 0;
  let s = 0;
  for (const mi of monthIndexes) {
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const c = mi * HOURS_PER_DAY + h;
      const v = dequantizeCell(profile[c]);
      const el = sunTable[c]?.elevationDeg ?? 0;
      if (v == null || el <= 0) continue;
      const wt = Math.sin((el * Math.PI) / 180);
      w += wt;
      s += wt * v;
    }
  }
  return w > 0 ? s / w : null;
}
