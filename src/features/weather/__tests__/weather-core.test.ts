import { describe, it, expect } from 'vitest';
import { parseCellId, toCellId } from '../core/cell';
import {
  classifyWeather,
  jerusalemHourKey,
  selectUpcomingHours,
  WEATHER_LABELS_HE,
} from '../core/classify-weather';
import { deriveHomeWeather } from '../core/derive-home-weather';
import type { WeatherPoint, WeatherSnapshot } from '../core/weather.types';

const pt = (over: Partial<WeatherPoint> = {}): WeatherPoint => ({
  time: '2026-10-18T11:00',
  temperatureC: 24,
  apparentC: 24,
  precipMm: 0,
  precipProb: 0,
  uv: 3,
  windKmh: 8,
  weatherCode: 1,
  ...over,
});

describe('cells', () => {
  it('rounds to the 0.05° grid with two decimals', () => {
    expect(toCellId(32.0712, 34.7834)).toBe('32.05_34.80');
    expect(toCellId(32.076, 34.776)).toBe('32.10_34.80');
    expect(toCellId(29.5577, 34.9519)).toBe('29.55_34.95');
  });

  it('returns null for non-finite input', () => {
    expect(toCellId(NaN, 34)).toBeNull();
    expect(toCellId(32, Infinity)).toBeNull();
  });

  it('round-trips a valid Israeli cell', () => {
    const id = toCellId(31.7683, 35.2137)!;
    expect(parseCellId(id)).toEqual({ lat: 31.75, lng: 35.2 });
  });

  it.each([
    ['', 'empty'],
    ['32.05,34.80', 'wrong separator'],
    ['32.051_34.80', 'three decimals'],
    ['32.5_34.8', 'one decimal'],
    ['32.07_34.80', 'off the 0.05 grid'],
    ['51.50_-0.10', 'outside Israel bbox'],
    ['32.05_34.80; drop', 'garbage suffix'],
    ['1e1_34.80', 'exponent'],
  ])('rejects %s (%s)', (id) => {
    expect(parseCellId(id)).toBeNull();
  });
});

describe('classifyWeather', () => {
  it('flags rain on ≥60% probability in the next 3h', () => {
    const r = classifyWeather(pt(), [pt({ precipProb: 20 }), pt({ precipProb: 65 })], 11);
    expect(r.flag).toBe('rain');
    expect(r.precipProb).toBe(65);
    expect(r.label).toBe(WEATHER_LABELS_HE.rain);
  });

  it('flags rain on ≥0.5 mm/h even with a low probability', () => {
    expect(classifyWeather(pt({ precipMm: 0.6, precipProb: 10 }), [], 11).flag).toBe('rain');
    expect(classifyWeather(pt(), [pt({ precipMm: 0.5 })], 11).flag).toBe('rain');
  });

  it('ignores rain beyond the 3-hour window', () => {
    const later = [pt(), pt(), pt(), pt({ precipProb: 90 })];
    expect(classifyWeather(pt(), later, 11).flag).toBeNull();
  });

  it('flags heat at apparent ≥32°C', () => {
    expect(classifyWeather(pt({ apparentC: 32 }), [], 13).flag).toBe('heat');
    expect(classifyWeather(pt({ apparentC: 31.9 }), [], 13).flag).toBeNull();
  });

  it('flags uv ≥8 only between 10:00 and 16:00', () => {
    expect(classifyWeather(pt({ uv: 8.2 }), [], 10).flag).toBe('uv');
    expect(classifyWeather(pt({ uv: 9 }), [], 15).flag).toBe('uv');
    expect(classifyWeather(pt({ uv: 9 }), [], 16).flag).toBeNull();
    expect(classifyWeather(pt({ uv: 9 }), [], 9).flag).toBeNull();
  });

  it('flags cold at apparent ≤10°C', () => {
    expect(classifyWeather(pt({ apparentC: 10 }), [], 7).flag).toBe('cold');
    expect(classifyWeather(pt({ apparentC: 10.5 }), [], 7).flag).toBeNull();
  });

  it('priority: rain > heat > uv > cold', () => {
    expect(classifyWeather(pt({ apparentC: 35, precipProb: 70 }), [], 12).flag).toBe('rain');
    expect(classifyWeather(pt({ apparentC: 35, uv: 10 }), [], 12).flag).toBe('heat');
    expect(classifyWeather(pt({ apparentC: 5, precipMm: 2 }), [], 12).flag).toBe('rain');
  });

  it('nothing flagged → null flag and null label, numbers still reported', () => {
    const r = classifyWeather(pt({ apparentC: 22, uv: 4, precipProb: 10 }), [], 12);
    expect(r).toEqual({ flag: null, apparentC: 22, precipProb: 10, uv: 4, label: null });
  });

  it('copy has no em-dashes or emoji', () => {
    for (const label of Object.values(WEATHER_LABELS_HE)) {
      expect(label).not.toMatch(/[—–]/);
      expect(label).not.toMatch(/[\uD800-\uDFFF\u2600-\u27BF]/);
    }
  });

  it('tolerates missing numbers', () => {
    const r = classifyWeather(pt({ apparentC: null, uv: null, precipProb: null, precipMm: null }), [], 12);
    expect(r.flag).toBeNull();
  });
});

describe('hours', () => {
  it('jerusalemHourKey uses Israel time', () => {
    // 2026-10-18 08:30 UTC = 11:30 in Israel (IDT, UTC+3).
    expect(jerusalemHourKey(new Date('2026-10-18T08:30:00Z'))).toEqual({ key: '2026-10-18T11', hour: 11 });
    // 2026-12-01 22:10 UTC = 00:10 next day (IST, UTC+2).
    expect(jerusalemHourKey(new Date('2026-12-01T22:10:00Z'))).toEqual({ key: '2026-12-02T00', hour: 0 });
  });

  it('selectUpcomingHours keeps the current hour and drops past ones', () => {
    const hourly = ['10', '11', '12', '13', '14'].map((h) => pt({ time: `2026-10-18T${h}:00` }));
    expect(selectUpcomingHours(hourly, '2026-10-18T11').map((h) => h.time)).toEqual([
      '2026-10-18T11:00',
      '2026-10-18T12:00',
      '2026-10-18T13:00',
    ]);
  });
});

describe('deriveHomeWeather', () => {
  const snapshot = (hourly: WeatherPoint[], now = pt()): WeatherSnapshot => ({
    provider: 'open-meteo',
    fetchedAt: 0,
    now,
    hourly,
  });

  it('classifies against the upcoming hours at the given clock', () => {
    const hourly = [
      pt({ time: '2026-10-18T10:00', precipProb: 90 }), // already past at 11:30
      pt({ time: '2026-10-18T11:00' }),
      pt({ time: '2026-10-18T12:00', precipProb: 70 }),
    ];
    const at = new Date('2026-10-18T08:30:00Z'); // 11:30 Israel
    const w = deriveHomeWeather(snapshot(hourly), at);
    expect(w.classification.flag).toBe('rain');
    expect(w.workoutWeather).toEqual({ flag: 'rain', apparentC: 24, precipProb: 70 });
    expect(w.isNight).toBe(false);
  });

  it('ignores a past rainy hour', () => {
    const hourly = [pt({ time: '2026-10-18T10:00', precipProb: 90 }), pt({ time: '2026-10-18T11:00' })];
    const w = deriveHomeWeather(snapshot(hourly), new Date('2026-10-18T08:30:00Z'));
    expect(w.classification.flag).toBeNull();
  });

  it('marks night after 19:00 Israel time', () => {
    const w = deriveHomeWeather(snapshot([]), new Date('2026-10-18T17:30:00Z')); // 20:30
    expect(w.isNight).toBe(true);
  });
});
