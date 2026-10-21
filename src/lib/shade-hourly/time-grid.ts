/**
 * The time grid every hourly shade profile is computed on:
 * 12 reference days (the 21st of each month) × 14 local-clock hours
 * (06…19, Israel time). Cell (monthIndex, hourIndex) represents the
 * clock hour HH:00–HH:59, sampled at its midpoint HH:30 by default.
 *
 * Pure. Sun positions are computed once per city (one lat/lng for the whole
 * city — the sun moves < 0.1° across Tel Aviv).
 */
import { israelLocalToUtc, utcToIsraelLocal } from './israel-time';
import { sunPosition } from './sun';

export const REFERENCE_DAY_OF_MONTH = 21;
export const FIRST_HOUR = 6;
export const LAST_HOUR = 19;
export const HOURS: readonly number[] = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
export const MONTHS = 12;
export const HOURS_PER_DAY = HOURS.length; // 14
export const GRID_CELLS = MONTHS * HOURS_PER_DAY; // 168
/** Minute inside each clock hour at which the sun is sampled. */
export const DEFAULT_SAMPLE_MINUTE = 30;

export interface SunCell {
  /** 0-based month index (0 = January). */
  monthIndex: number;
  /** Local clock hour (6…19). */
  hour: number;
  azimuthDeg: number;
  elevationDeg: number;
}

/** Flat index of (monthIndex 0..11, hour 6..19) in a 168-cell profile. */
export function cellIndex(monthIndex: number, hour: number): number {
  return monthIndex * HOURS_PER_DAY + (hour - FIRST_HOUR);
}

/** Grid cell for a UTC instant (Israel local clock), or null outside 06:00–19:59. */
export function cellForInstant(d: Date): { monthIndex: number; hour: number; index: number } | null {
  const l = utcToIsraelLocal(d);
  if (l.hour < FIRST_HOUR || l.hour > LAST_HOUR) return null;
  return { monthIndex: l.month - 1, hour: l.hour, index: cellIndex(l.month - 1, l.hour) };
}

/** Sun position for all 168 cells at one location. `year` only moves the result by hundredths of a degree. */
export function buildSunTable(latDeg: number, lonDeg: number, year: number, sampleMinute = DEFAULT_SAMPLE_MINUTE): SunCell[] {
  const out: SunCell[] = [];
  for (let mi = 0; mi < MONTHS; mi++) {
    for (const hour of HOURS) {
      const t = israelLocalToUtc(year, mi + 1, REFERENCE_DAY_OF_MONTH, hour, sampleMinute);
      const s = sunPosition(t, latDeg, lonDeg);
      out.push({ monthIndex: mi, hour, azimuthDeg: s.azimuthDeg, elevationDeg: s.elevationDeg });
    }
  }
  return out;
}
