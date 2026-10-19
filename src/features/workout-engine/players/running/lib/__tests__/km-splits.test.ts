import { describe, expect, it } from 'vitest';
import { kmSplitsFromTrack, splitPaceSec, splitsFromLaps, type TrackSample } from '../km-splits';

const M_PER_DEG = 111195; // metres per degree of latitude (haversine R = 6371 km)

/** A straight run north: `legs` = [metres, seconds] at constant speed, 1 fix/s. */
function track(legs: [number, number][], start = 1_700_000_000_000): TrackSample[] {
  const out: TrackSample[] = [{ t: start, lat: 32, lng: 34.8, acc: 5 }];
  let t = start;
  let lat = 32;
  for (const [m, s] of legs) {
    const step = m / s / M_PER_DEG;
    for (let i = 0; i < s; i++) {
      t += 1000;
      lat += step;
      out.push({ t, lat, lng: 34.8, acc: 5 });
    }
  }
  return out;
}

describe('kmSplitsFromTrack', () => {
  it('splits a steady run into kms + a partial', () => {
    const s = kmSplitsFromTrack(track([[2500, 900]]))!;
    expect(s.map((x) => x.km)).toEqual([1, 2, 2.5]);
    expect(s[0].sec).toBeCloseTo(360, -1);
    expect(s[1].sec).toBeCloseTo(360, -1);
    expect(s[2].sec).toBeCloseTo(180, -1);
  });

  it('keeps relative pace (a slow km then a fast one)', () => {
    const s = kmSplitsFromTrack(track([[1000, 400], [1000, 300]]))!;
    expect(s).toHaveLength(2);
    expect(s[0].sec).toBeGreaterThan(s[1].sec + 80);
  });

  it('scales to the saved distance and active time', () => {
    const s = kmSplitsFromTrack(track([[1900, 600]]), { totalKm: 2, activeSec: 660 })!;
    expect(s.map((x) => x.km)).toEqual([1, 2]);
    expect(s[0].sec + s[1].sec).toBeCloseTo(660, -1);
  });

  it('ignores pauses, jumps, standing and poor fixes', () => {
    const base = track([[1000, 300]]);
    const last = base[base.length - 1];
    // 2-minute pause (no fixes), then a GPS jump, a poor fix, standing still, then 1 km more.
    const resume = last.t + 120_000;
    const extra: TrackSample[] = [
      { t: resume, lat: last.lat, lng: 34.8, acc: 5 },
      { t: resume + 1000, lat: last.lat + 500 / M_PER_DEG, lng: 34.8, acc: 5 }, // 500 m in 1 s
      { t: resume + 2000, lat: last.lat, lng: 34.9, acc: 80 }, // poor
      { t: resume + 3000, lat: last.lat, lng: 34.8, acc: 5 }, // standing
    ];
    const tail = track([[1000, 300]], resume + 3000).map((p) => ({ ...p, lat: p.lat - 32 + last.lat }));
    const s = kmSplitsFromTrack([...base, ...extra, ...tail.slice(1)])!;
    expect(s).toHaveLength(2);
    expect(s[0].sec).toBeCloseTo(300, -1);
    expect(s[1].sec).toBeCloseTo(300, -1);
  });

  it('returns null for a thin trace', () => {
    expect(kmSplitsFromTrack([])).toBeNull();
    expect(kmSplitsFromTrack(track([[50, 20]]))).toBeNull();
    expect(kmSplitsFromTrack(null)).toBeNull();
  });
});

describe('splitsFromLaps', () => {
  const lap = (m: number, s: number, isActive = false) => ({ distanceMeters: m, durationSeconds: s, isActive });
  it('auto-km laps (last partial)', () => {
    expect(splitsFromLaps([lap(1000, 360), lap(1004, 350), lap(600, 200), lap(10, 3, true)])).toEqual([
      { km: 1, sec: 360 },
      { km: 2, sec: 350 },
      { km: 2.6, sec: 200 },
    ]);
  });
  it('manual laps are not splits', () => {
    expect(splitsFromLaps([lap(400, 100), lap(1000, 360)])).toBeNull();
    expect(splitsFromLaps([])).toBeNull();
  });
});

describe('splitPaceSec', () => {
  it('uses the split length', () => {
    expect(splitPaceSec({ km: 2, sec: 360 }, 1)).toBe(360);
    expect(splitPaceSec({ km: 2.5, sec: 180 }, 2)).toBe(360);
    expect(splitPaceSec({ km: 2, sec: 0 }, 1)).toBeNull();
  });
});
