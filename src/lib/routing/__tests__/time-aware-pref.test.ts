import { describe, expect, it } from 'vitest';
import { rankLoopsByMeasure, timeAwareMode, TIME_AWARE_MIN_SUN_ELEVATION_DEG } from '../time-aware-pref';
import { parseGenerateRequest } from '../api-contract';

const TLV = { lat: 32.08, lng: 34.78 };
const loop = (id: string, pass = true) => ({ id, verdict: { pass } });

describe('timeAwareMode', () => {
  it('hot month + high sun → shade, with the hour cell', () => {
    const d = timeAwareMode(new Date('2026-07-21T10:30:00Z'), TLV.lat, TLV.lng); // 13:30 IDT
    expect(d.mode).toBe('shade');
    expect(d.hour).toBe(13);
    expect(d.cell).not.toBeNull();
    expect(d.sunElevationDeg).toBeGreaterThan(TIME_AWARE_MIN_SUN_ELEVATION_DEG);
  });
  it('after sunset / before sunrise → lit', () => {
    expect(timeAwareMode(new Date('2026-07-21T19:00:00Z'), TLV.lat, TLV.lng).mode).toBe('lit'); // 22:00 IDT
    expect(timeAwareMode(new Date('2026-01-21T03:00:00Z'), TLV.lat, TLV.lng).mode).toBe('lit'); // 05:00 IST
  });
  it('low morning sun in summer, and winter midday → neutral', () => {
    expect(timeAwareMode(new Date('2026-07-21T03:30:00Z'), TLV.lat, TLV.lng).mode).toBe('neutral'); // 06:30 IDT, sun ~13°
    expect(timeAwareMode(new Date('2026-01-21T10:30:00Z'), TLV.lat, TLV.lng).mode).toBe('neutral'); // 12:30 IST
  });
});

describe('rankLoopsByMeasure', () => {
  it('passing first, then measure (bucketed) high → low, unmeasured after, then generator order', () => {
    const loops = [loop('a'), loop('b'), loop('c', false), loop('d'), loop('e')];
    const m: Record<string, number | null> = { a: 0.1, b: 0.5, c: 0.9, d: null, e: 0.52 };
    const r = rankLoopsByMeasure(loops, (l) => m[l.id], 5);
    // b (0.5) and e (0.52) share a 0.05 bucket → generator order keeps b first
    expect(r.loops.map((l) => l.id)).toEqual(['b', 'e', 'a', 'd', 'c']);
    expect(r.applied).toBe(true);
    expect(r.loops[0].measure).toBe(0.5);
  });
  it('nothing measured → generator order, applied false', () => {
    const r = rankLoopsByMeasure([loop('a'), loop('b'), loop('c')], () => null, 2);
    expect(r.loops.map((l) => l.id)).toEqual(['a', 'b']);
    expect(r.applied).toBe(false);
  });
});

describe('parseGenerateRequest — timeAware', () => {
  const base = { mode: 'loop', start: { lat: 32.08, lng: 34.78 }, targetKm: 5, activity: 'running' };
  it('timeAware + city + at (within 24 h)', () => {
    const at = new Date(Date.now() + 3_600_000).toISOString();
    expect(parseGenerateRequest({ ...base, timeAware: true, city: 'תל אביב-יפו', at })).toMatchObject({ timeAware: true, city: 'תל אביב-יפו', at });
  });
  it('a far-away or malformed `at` is dropped (server now is used)', () => {
    const r = parseGenerateRequest({ ...base, timeAware: true, at: '2020-01-01T00:00:00Z' }) as Record<string, unknown>;
    expect(r.timeAware).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(r, 'at')).toBe(false);
  });
  it('preferShade wins; no timeAware key without the flag', () => {
    const r = parseGenerateRequest({ ...base, preferShade: true, timeAware: true }) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(r, 'timeAware')).toBe(false);
    const off = parseGenerateRequest(base) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(off, 'timeAware')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(off, 'city')).toBe(false);
  });
});
