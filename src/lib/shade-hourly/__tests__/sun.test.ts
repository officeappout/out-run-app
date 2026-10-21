import { describe, expect, it } from 'vitest';
import {
  buildSunTable,
  cellForInstant,
  cellIndex,
  israelLocalToUtc,
  israelUtcOffsetHours,
  lastSundayOfMonth,
  sunPosition,
  utcToIsraelLocal,
} from '..';

const TLV = { lat: 32.08, lon: 34.78 };

describe('sunPosition (NOAA) against known almanac values', () => {
  it('declination ≈ 0 at the March 2026 equinox (20 Mar 14:46 UTC)', () => {
    const s = sunPosition(new Date(Date.UTC(2026, 2, 20, 14, 46)), 0, 0);
    expect(Math.abs(s.declinationDeg)).toBeLessThan(0.02);
  });
  it('declination ≈ +23.436° at the June 2026 solstice (21 Jun 08:24 UTC)', () => {
    const s = sunPosition(new Date(Date.UTC(2026, 5, 21, 8, 24)), 0, 0);
    expect(s.declinationDeg).toBeCloseTo(23.436, 1);
  });
  it('declination ≈ −23.436° at the December 2026 solstice (21 Dec 20:50 UTC)', () => {
    const s = sunPosition(new Date(Date.UTC(2026, 11, 21, 20, 50)), 0, 0);
    expect(s.declinationDeg).toBeCloseTo(-23.436, 1);
  });
  it('equation of time: ≈ −14.2 min on 11 Feb, ≈ +16.4 min on 3 Nov', () => {
    expect(sunPosition(new Date(Date.UTC(2026, 1, 11, 12)), 0, 0).equationOfTimeMin).toBeCloseTo(-14.2, 0);
    expect(sunPosition(new Date(Date.UTC(2026, 10, 3, 12)), 0, 0).equationOfTimeMin).toBeCloseTo(16.4, 0);
  });
  it('Tel Aviv solar noon on 21 Jun: elevation ≈ 90 − 32.08 + 23.44, azimuth ≈ due south', () => {
    // solar noon ≈ 12:00 − 4·34.78 min − EoT(−1.6 min) ≈ 09:42.7 UTC
    const s = sunPosition(new Date(Date.UTC(2026, 5, 21, 9, 42, 40)), TLV.lat, TLV.lon);
    expect(s.elevationDeg).toBeCloseTo(81.36, 1);
    expect(Math.abs(s.azimuthDeg - 180)).toBeLessThan(2);
  });
  it('Tel Aviv sunrise on 21 Jun (~05:32 IDT = 02:32 UTC) in the ENE', () => {
    const before = sunPosition(new Date(Date.UTC(2026, 5, 21, 2, 20)), TLV.lat, TLV.lon);
    const after = sunPosition(new Date(Date.UTC(2026, 5, 21, 2, 45)), TLV.lat, TLV.lon);
    expect(before.elevationDeg).toBeLessThan(0);
    expect(after.elevationDeg).toBeGreaterThan(0);
    expect(after.azimuthDeg).toBeGreaterThan(55);
    expect(after.azimuthDeg).toBeLessThan(70);
  });
  it('afternoon sun is in the west, morning sun in the east', () => {
    expect(sunPosition(new Date(Date.UTC(2026, 8, 21, 14)), TLV.lat, TLV.lon).azimuthDeg).toBeGreaterThan(220);
    expect(sunPosition(new Date(Date.UTC(2026, 8, 21, 5)), TLV.lat, TLV.lon).azimuthDeg).toBeLessThan(120);
  });
});

describe('Israel local time', () => {
  it('last Sundays of March / October 2026', () => {
    expect(lastSundayOfMonth(2026, 3)).toBe(29);
    expect(lastSundayOfMonth(2026, 10)).toBe(25);
  });
  it('summer time starts the Friday before the last Sunday of March, ends the last Sunday of October', () => {
    expect(israelUtcOffsetHours(2026, 3, 26)).toBe(2);
    expect(israelUtcOffsetHours(2026, 3, 27)).toBe(3);
    expect(israelUtcOffsetHours(2026, 7, 1)).toBe(3);
    expect(israelUtcOffsetHours(2026, 10, 24)).toBe(3);
    expect(israelUtcOffsetHours(2026, 10, 25)).toBe(2);
    expect(israelUtcOffsetHours(2026, 1, 15)).toBe(2);
  });
  it('local ↔ UTC round trip', () => {
    const d = israelLocalToUtc(2026, 7, 21, 13, 30);
    expect(d.toISOString()).toBe('2026-07-21T10:30:00.000Z');
    expect(utcToIsraelLocal(d)).toMatchObject({ year: 2026, month: 7, day: 21, hour: 13, minute: 30 });
    const w = israelLocalToUtc(2026, 1, 21, 13, 30);
    expect(w.toISOString()).toBe('2026-01-21T11:30:00.000Z');
    expect(utcToIsraelLocal(w)).toMatchObject({ month: 1, hour: 13 });
  });
});

describe('time grid', () => {
  const table = buildSunTable(TLV.lat, TLV.lon, 2026);
  it('has 12 × 14 cells in month-major order', () => {
    expect(table).toHaveLength(168);
    expect(table[cellIndex(6, 13)]).toMatchObject({ monthIndex: 6, hour: 13 });
  });
  it('sun is down at 19:30 in winter and up at 19:30 in late June', () => {
    expect(table[cellIndex(0, 19)].elevationDeg).toBeLessThan(0);
    expect(table[cellIndex(5, 19)].elevationDeg).toBeGreaterThan(0);
  });
  it('maps an instant to its cell, null outside 06–19', () => {
    expect(cellForInstant(new Date('2026-07-21T10:10:00Z'))).toEqual({ monthIndex: 6, hour: 13, index: cellIndex(6, 13) });
    expect(cellForInstant(new Date('2026-07-21T01:00:00Z'))).toBeNull();
  });
});
