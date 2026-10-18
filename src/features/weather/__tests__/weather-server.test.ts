import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildOpenMeteoUrl,
  getWeatherProvider,
  OpenMeteoProvider,
  parseOpenMeteoResponse,
  WeatherProviderError,
  type WeatherProvider,
} from '../server/weather-provider';
import {
  __resetWeatherInFlight,
  getCellWeather,
  WEATHER_FRESH_MS,
  WEATHER_STALE_MAX_MS,
  WeatherUnavailableError,
  type WeatherCacheStore,
} from '../server/weather-cache';
import type { WeatherSnapshot } from '../core/weather.types';

// Trimmed real response (live GET, 18.10.2026, cell 32.05_34.80).
const OPEN_METEO_SAMPLE = {
  latitude: 32.01884,
  longitude: 34.831924,
  timezone: 'Asia/Jerusalem',
  current: {
    time: '2026-10-18T11:15',
    interval: 900,
    temperature_2m: 25.6,
    apparent_temperature: 26.3,
    precipitation: 0.0,
    precipitation_probability: 1,
    uv_index: 5.0,
    wind_speed_10m: 8.2,
    weather_code: 3,
  },
  hourly: {
    time: ['2026-10-18T11:00', '2026-10-18T12:00', '2026-10-18T13:00', '2026-10-18T14:00', '2026-10-18T15:00', '2026-10-18T16:00', '2026-10-18T17:00'],
    temperature_2m: [25.5, 25.4, 25.4, 24.5, 24.4, 23.9, 23.3],
    apparent_temperature: [26.2, 26.1, 26.1, 25.9, 26.0, 25.6, 25.1],
    precipitation: [0, 0, 0, 0, 0, 0, 0],
    precipitation_probability: [0, 5, 5, 5, 8, 8, 15],
    uv_index: [4.35, 5.25, 5.25, 4.45, 3.45, 2.45, 1.15],
    wind_speed_10m: [7.4, 10.6, 10.8, 11.0, 9.9, 9.5, 9.1],
    weather_code: [2, 3, 3, 3, 3, 3, 3],
  },
};

describe('Open-Meteo adapter', () => {
  it('parses the real response shape into a WeatherSnapshot', () => {
    const s = parseOpenMeteoResponse(OPEN_METEO_SAMPLE, 123);
    expect(s.provider).toBe('open-meteo');
    expect(s.fetchedAt).toBe(123);
    expect(s.now).toEqual({
      time: '2026-10-18T11:15',
      temperatureC: 25.6,
      apparentC: 26.3,
      precipMm: 0,
      precipProb: 1,
      uv: 5,
      windKmh: 8.2,
      weatherCode: 3,
    });
    expect(s.hourly).toHaveLength(7);
    expect(s.hourly[1]).toMatchObject({ time: '2026-10-18T12:00', precipProb: 5, uv: 5.25, weatherCode: 3 });
  });

  it('throws on a response without a current block', () => {
    expect(() => parseOpenMeteoResponse({ hourly: {} }, 0)).toThrow(WeatherProviderError);
    expect(() => parseOpenMeteoResponse(null, 0)).toThrow(WeatherProviderError);
  });

  it('nulls missing/garbage numbers instead of throwing', () => {
    const s = parseOpenMeteoResponse({ current: { time: '2026-10-18T11:15', uv_index: 'x' } }, 0);
    expect(s.now.uv).toBeNull();
    expect(s.hourly).toEqual([]);
  });

  it('free endpoint without a key, commercial endpoint + apikey with one', () => {
    const free = new URL(buildOpenMeteoUrl({ lat: 32.05, lng: 34.8 }));
    expect(free.origin).toBe('https://api.open-meteo.com');
    expect(free.searchParams.get('latitude')).toBe('32.05');
    expect(free.searchParams.get('longitude')).toBe('34.80');
    expect(free.searchParams.get('timezone')).toBe('Asia/Jerusalem');
    expect(free.searchParams.get('current')).toContain('precipitation_probability');
    expect(free.searchParams.get('apikey')).toBeNull();

    const paid = new URL(buildOpenMeteoUrl({ lat: 32.05, lng: 34.8 }, 'k123'));
    expect(paid.origin).toBe('https://customer-api.open-meteo.com');
    expect(paid.searchParams.get('apikey')).toBe('k123');
  });

  it('provider selection by env', () => {
    expect(getWeatherProvider({}).id).toBe('open-meteo');
    expect(getWeatherProvider({ WEATHER_PROVIDER: 'OPEN-METEO' }).id).toBe('open-meteo');
    expect(getWeatherProvider({ WEATHER_PROVIDER: 'unknown' }).id).toBe('open-meteo');
  });

  it('getCell maps HTTP errors to WeatherProviderError', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 429 })) as unknown as typeof fetch;
    await expect(new OpenMeteoProvider(undefined, fetchImpl).getCell({ lat: 32.05, lng: 34.8 }))
      .rejects.toMatchObject({ name: 'WeatherProviderError', status: 429 });
  });

  it('getCell parses a successful fetch', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(OPEN_METEO_SAMPLE), { status: 200 })) as unknown as typeof fetch;
    const s = await new OpenMeteoProvider(undefined, fetchImpl).getCell({ lat: 32.05, lng: 34.8 });
    expect(s.now.apparentC).toBe(26.3);
  });
});

describe('cell cache (30-min TTL, 3h stale window)', () => {
  const NOW = 10_000_000_000;
  const snap = (fetchedAt: number): WeatherSnapshot => ({
    provider: 'open-meteo',
    fetchedAt,
    now: { time: 't', temperatureC: 20, apparentC: 20, precipMm: 0, precipProb: 0, uv: 0, windKmh: 0, weatherCode: 0 },
    hourly: [],
  });
  const centre = { lat: 32.05, lng: 34.8 };

  function memStore(initial?: WeatherSnapshot): WeatherCacheStore & { writes: WeatherSnapshot[] } {
    let value = initial ?? null;
    const writes: WeatherSnapshot[] = [];
    return {
      writes,
      read: async () => value,
      write: async (_cell, s) => {
        writes.push(s);
        value = s;
      },
    };
  }
  const okProvider = (s: WeatherSnapshot): WeatherProvider & { calls: number } => {
    const p = { id: 'test', calls: 0, getCell: async () => { p.calls++; return s; } };
    return p;
  };
  const failingProvider = (): WeatherProvider => ({
    id: 'test',
    getCell: async () => { throw new WeatherProviderError('down', 500); },
  });

  beforeEach(() => __resetWeatherInFlight());

  it('serves a fresh cache hit without calling the provider', async () => {
    const provider = okProvider(snap(NOW));
    const r = await getCellWeather('32.05_34.80', centre, { store: memStore(snap(NOW - 5 * 60_000)), provider, now: () => NOW });
    expect(r.source).toBe('cache');
    expect(provider.calls).toBe(0);
  });

  it('refreshes a stale entry and writes it back', async () => {
    const store = memStore(snap(NOW - WEATHER_FRESH_MS - 1));
    const provider = okProvider(snap(NOW));
    const r = await getCellWeather('32.05_34.80', centre, { store, provider, now: () => NOW });
    expect(r.source).toBe('provider');
    expect(r.snapshot.fetchedAt).toBe(NOW);
    expect(store.writes).toHaveLength(1);
  });

  it('provider error + cache < 3h → serves stale', async () => {
    const r = await getCellWeather('32.05_34.80', centre, {
      store: memStore(snap(NOW - 2 * 60 * 60_000)),
      provider: failingProvider(),
      now: () => NOW,
    });
    expect(r.source).toBe('stale-cache');
  });

  it('provider error + cache ≥ 3h → unavailable', async () => {
    await expect(getCellWeather('32.05_34.80', centre, {
      store: memStore(snap(NOW - WEATHER_STALE_MAX_MS)),
      provider: failingProvider(),
      now: () => NOW,
    })).rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it('provider error + no cache → unavailable', async () => {
    await expect(getCellWeather('32.05_34.80', centre, { store: memStore(), provider: failingProvider(), now: () => NOW }))
      .rejects.toBeInstanceOf(WeatherUnavailableError);
  });

  it('a cache read/write failure never blocks a live answer', async () => {
    const store: WeatherCacheStore = {
      read: async () => { throw new Error('firestore down'); },
      write: async () => { throw new Error('firestore down'); },
    };
    const r = await getCellWeather('32.05_34.80', centre, { store, provider: okProvider(snap(NOW)), now: () => NOW });
    expect(r.source).toBe('provider');
  });

  it('dedupes concurrent requests for one cell into one provider call', async () => {
    const provider = okProvider(snap(NOW));
    const store = memStore();
    await Promise.all([
      getCellWeather('32.05_34.80', centre, { store, provider, now: () => NOW }),
      getCellWeather('32.05_34.80', centre, { store, provider, now: () => NOW }),
      getCellWeather('32.05_34.80', centre, { store, provider, now: () => NOW }),
    ]);
    expect(provider.calls).toBe(1);
  });
});
