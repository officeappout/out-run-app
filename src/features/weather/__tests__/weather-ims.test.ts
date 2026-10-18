import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apparentTemperatureC } from '../core/apparent-temperature';
import { deriveHomeWeather } from '../core/derive-home-weather';
import {
  __resetImsCaches,
  buildImsSnapshot,
  haversineKm,
  IMS_ENVISTA_BASE,
  IMS_FORECAST_BASE,
  imsCodeToWmo,
  imsNum,
  ImsWeatherProvider,
  jerusalemMinuteKey,
  nearestPlaces,
  parseEnvistaLatest,
  parseEnvistaStations,
  parseEnvistaTime,
  parseImsHourlyForecast,
} from '../server/ims-provider';
import { IMS_FORECAST_LOCALITIES, IMS_STATIONS } from '../server/ims-places';
import { getWeatherProvider, WeatherProviderError } from '../server/weather-provider';
// Real public response, trimmed (GET ims.gov.il/en/full_forecast_data/2, 18.10.2026 ~12:40 IDT).
import FORECAST_LID2 from './fixtures/ims-full-forecast-lid2.json';
// Hand-made in the documented Envista shape (the API needs a token we don't have yet).
import ENVISTA_LATEST_178 from './fixtures/ims-envista-latest-178.json';
import ENVISTA_STATIONS from './fixtures/ims-envista-stations.json';

// 18.10.2026 12:25 Israel summer time (UTC+3).
const NOW = Date.UTC(2026, 9, 18, 9, 25);
const TEL_AVIV_CELL = { lat: 32.08, lng: 34.78 };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('apparent temperature (BOM / Steadman)', () => {
  it('matches hand-computed values', () => {
    // e = 0.5 · 6.105 · exp(17.27·30/267.7) ≈ 21.14 hPa → 30 + 6.98 − 0 − 4 ≈ 33.0
    expect(apparentTemperatureC(30, 50, 0)).toBeCloseTo(33.0, 1);
    // Cold + windy feels colder: 8°C, 70%, 8 m/s → 8 + 0.33·7.53 − 5.6 − 4 ≈ 0.9
    expect(apparentTemperatureC(8, 70, 8)).toBeCloseTo(0.9, 1);
    // Wind missing counts as calm.
    expect(apparentTemperatureC(30, 50, null)).toBe(apparentTemperatureC(30, 50, 0));
  });

  it('returns null without temperature or humidity', () => {
    expect(apparentTemperatureC(null, 50, 2)).toBeNull();
    expect(apparentTemperatureC(25, null, 2)).toBeNull();
    expect(apparentTemperatureC(Number.NaN, 50, 2)).toBeNull();
  });
});

describe('IMS parsing helpers', () => {
  it('imsNum reads IMS string numbers and drops blanks / sentinels', () => {
    expect(imsNum('25.9')).toBe(25.9);
    expect(imsNum(3)).toBe(3);
    expect(imsNum('')).toBeNull();
    expect(imsNum(null)).toBeNull();
    expect(imsNum('x')).toBeNull();
    expect(imsNum(-9999)).toBeNull();
  });

  it('maps IMS weather codes to WMO', () => {
    expect(imsCodeToWmo(1250)).toBe(0);
    expect(imsCodeToWmo(1230)).toBe(3);
    expect(imsCodeToWmo(1140)).toBe(63);
    expect(imsCodeToWmo(1020)).toBe(95);
    expect(imsCodeToWmo(4242)).toBeNull();
    expect(imsCodeToWmo(null)).toBeNull();
  });

  it('Envista time is read as UTC+2 whatever offset the string claims', () => {
    // Summer: "+03:00" is wrong per IMS — 11:20 winter time = 12:20 local summer time.
    const summer = parseEnvistaTime('2026-10-18T11:20:00+03:00')!;
    expect(summer).toBe(Date.UTC(2026, 9, 18, 9, 20));
    expect(jerusalemMinuteKey(summer)).toBe('2026-10-18T12:20');
    // Winter: wall clock = local time.
    const winter = parseEnvistaTime('2026-01-10T08:00:00+02:00')!;
    expect(jerusalemMinuteKey(winter)).toBe('2026-01-10T08:00');
    expect(parseEnvistaTime('garbage')).toBeNull();
  });

  it('haversine + nearest', () => {
    // Tel Aviv ↔ Jerusalem ≈ 54 km.
    expect(haversineKm(32.08, 34.78, 31.778, 35.2)).toBeGreaterThan(50);
    expect(haversineKm(32.08, 34.78, 31.778, 35.2)).toBeLessThan(58);
    const near = nearestPlaces(IMS_STATIONS, TEL_AVIV_CELL, { limit: 3, maxKm: 30 });
    expect(near[0].place[1]).toBe('Tel Aviv Coast');
    expect(near.map((n) => n.km)).toEqual([...near.map((n) => n.km)].sort((a, b) => a - b));
    expect(nearestPlaces(IMS_FORECAST_LOCALITIES, TEL_AVIV_CELL, { limit: 1 })[0].place[0]).toBe(2);
    // Far from every station (outside Israel) → nothing within 30 km.
    expect(nearestPlaces(IMS_STATIONS, { lat: 35, lng: 30 }, { maxKm: 30 })).toEqual([]);
  });

  it('bundled reference lists are sane', () => {
    expect(IMS_STATIONS.length).toBeGreaterThan(50);
    expect(IMS_FORECAST_LOCALITIES.length).toBeGreaterThan(100);
    for (const [, , lat, lng] of [...IMS_STATIONS, ...IMS_FORECAST_LOCALITIES]) {
      expect(lat).toBeGreaterThan(29);
      expect(lat).toBeLessThan(33.5);
      expect(lng).toBeGreaterThan(34);
      expect(lng).toBeLessThan(36);
    }
  });
});

describe('IMS hourly forecast (real fixture)', () => {
  it('flattens days into a time-sorted hourly list', () => {
    const hours = parseImsHourlyForecast(FORECAST_LID2);
    expect(hours).toHaveLength(9);
    expect(hours[0]).toEqual({
      time: '2026-10-18T12:00',
      tempC: 25.9,
      rh: 58,
      windKmh: 9,
      rainMm: 0,
      rainChance: 0,
      uv: 5,
      imsCode: 1230,
    });
    expect(hours[8].time).toBe('2026-10-19T02:00');
  });

  it('throws on a bad payload', () => {
    expect(() => parseImsHourlyForecast(null)).toThrow(WeatherProviderError);
    expect(() => parseImsHourlyForecast({ data: {} })).toThrow(WeatherProviderError);
  });
});

describe('Envista parsing (documented shape)', () => {
  it('latest observation: TD/RH/WS/Rain, invalid channels dropped', () => {
    const obs = parseEnvistaLatest(ENVISTA_LATEST_178);
    expect(obs).toEqual({
      stationId: 178,
      observedAt: Date.UTC(2026, 9, 18, 9, 20),
      tempC: 25.4,
      rh: 62,
      windMs: 3.5,
      rain10Mm: 0.1,
    });
  });

  it('a channel with status 2 / valid false reads as null', () => {
    const j = clone(ENVISTA_LATEST_178);
    j.data[0].channels.find((c) => c.name === 'TD')!.valid = false;
    expect(parseEnvistaLatest(j).tempC).toBeNull();
  });

  it('throws on a bad payload', () => {
    expect(() => parseEnvistaLatest({})).toThrow(WeatherProviderError);
    expect(() => parseEnvistaLatest({ stationId: 1, data: [] })).toThrow(WeatherProviderError);
  });

  it('station list keeps active stations that measure temperature', () => {
    expect(parseEnvistaStations(ENVISTA_STATIONS)).toEqual([[178, 'TEL AVIV COAST', 32.058, 34.7588]]);
    expect(() => parseEnvistaStations({})).toThrow(WeatherProviderError);
  });
});

describe('buildImsSnapshot (merge)', () => {
  const obs = parseEnvistaLatest(ENVISTA_LATEST_178);
  const hours = parseImsHourlyForecast(FORECAST_LID2);

  it('station now + forecast UV / rain chance / code + next hours', () => {
    const s = buildImsSnapshot(obs, hours, NOW);
    expect(s.provider).toBe('ims');
    expect(s.fetchedAt).toBe(NOW);
    expect(s.now).toEqual({
      time: '2026-10-18T12:20',
      temperatureC: 25.4,
      apparentC: apparentTemperatureC(25.4, 62, 3.5),
      precipMm: 0.6, // 0.1 mm / 10 min → 0.6 mm/h
      precipProb: 0,
      uv: 5,
      windKmh: 12.6,
      weatherCode: 3,
    });
    expect(s.hourly).toHaveLength(7); // capped at now + 6h
    expect(s.hourly[0].time).toBe('2026-10-18T12:00');
    expect(s.hourly[0].apparentC).toBe(apparentTemperatureC(25.9, 58, 9 / 3.6));
  });

  it('drops past forecast hours', () => {
    const later = Date.UTC(2026, 9, 18, 12, 5); // 15:05 local
    const s = buildImsSnapshot(null, hours, later);
    expect(s.hourly[0].time).toBe('2026-10-18T15:00');
    expect(s.now.time).toBe('2026-10-18T15:05');
    expect(s.now.temperatureC).toBe(hours[3].tempC);
  });

  it('no station → now from the current forecast hour', () => {
    const s = buildImsSnapshot(null, hours, NOW);
    expect(s.now.temperatureC).toBe(25.9);
    expect(s.now.uv).toBe(5);
    expect(s.now.time).toBe('2026-10-18T12:25');
  });

  it('no forecast → station now, no hours, UV null', () => {
    const s = buildImsSnapshot(obs, null, NOW);
    expect(s.now.temperatureC).toBe(25.4);
    expect(s.now.uv).toBeNull();
    expect(s.now.precipProb).toBeNull();
    expect(s.hourly).toEqual([]);
    // The classifier copes with null UV / no hours.
    expect(deriveHomeWeather(s, new Date(NOW)).classification.flag).toBe('rain'); // 0.6 mm/h now
  });

  it('nothing usable → throws (→ stale-serve / 503)', () => {
    expect(() => buildImsSnapshot(null, null, NOW)).toThrow(WeatherProviderError);
    const old = Date.UTC(2026, 9, 25, 9, 0); // forecast entirely in the past
    expect(() => buildImsSnapshot(null, hours, old)).toThrow(WeatherProviderError);
  });

  it('a forecast rain chance ≥ 60% in the next 3h flags rain', () => {
    const f = clone(FORECAST_LID2) as typeof FORECAST_LID2;
    (f.data['2026-10-18'].hourly as Record<string, { rain_chance: string }>)['14:00'].rain_chance = '70';
    const dry = { ...obs, rain10Mm: 0 };
    const s = buildImsSnapshot(dry, parseImsHourlyForecast(f), NOW);
    const home = deriveHomeWeather(s, new Date(NOW));
    expect(home.classification.flag).toBe('rain');
    expect(home.classification.precipProb).toBe(70);
  });
});

describe('ImsWeatherProvider (fake fetch)', () => {
  beforeEach(() => __resetImsCaches());

  type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
  function fakeFetch(route: Route) {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get('authorization') });
      return route(url, init);
    }) as unknown as typeof fetch;
    return { impl, calls };
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('station + forecast; token only goes to Envista', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url === `${IMS_ENVISTA_BASE}/stations`) return json(ENVISTA_STATIONS);
      if (url === `${IMS_ENVISTA_BASE}/stations/178/data/latest`) return json(ENVISTA_LATEST_178);
      if (url === `${IMS_FORECAST_BASE}/2`) return json(FORECAST_LID2);
      return json({}, 404);
    });
    const s = await new ImsWeatherProvider('tok', impl, () => NOW).getCell(TEL_AVIV_CELL);
    expect(s.now.temperatureC).toBe(25.4);
    expect(s.now.uv).toBe(5);
    expect(s.hourly.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.auth).toBe(c.url.startsWith(IMS_ENVISTA_BASE) ? 'ApiToken tok' : null);
    }
  });

  it('falls back to the bundled station list and to the next station when one is stale', async () => {
    const stale = clone(ENVISTA_LATEST_178);
    stale.data[0].datetime = '2026-10-18T08:00:00+03:00'; // 3h+ old
    const { impl, calls } = fakeFetch((url) => {
      if (url === `${IMS_ENVISTA_BASE}/stations`) return json({}, 500);
      if (url === `${IMS_ENVISTA_BASE}/stations/178/data/latest`) return json(stale);
      if (/\/stations\/\d+\/data\/latest$/.test(url)) {
        const id = Number(url.split('/').at(-3));
        const ok = clone(ENVISTA_LATEST_178);
        ok.stationId = id;
        ok.data[0].channels.find((c) => c.name === 'TD')!.value = 24;
        return json(ok);
      }
      if (url.startsWith(IMS_FORECAST_BASE)) return json(FORECAST_LID2);
      return json({}, 404);
    });
    const s = await new ImsWeatherProvider('tok', impl, () => NOW).getCell(TEL_AVIV_CELL);
    expect(s.now.temperatureC).toBe(24);
    const tried = calls.filter((c) => c.url.endsWith('/data/latest')).map((c) => c.url);
    expect(tried).toHaveLength(2);
    expect(tried[0]).toContain('/stations/178/');
  });

  it('a rejected token stops after one station; the forecast still answers', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.startsWith(IMS_ENVISTA_BASE)) return json({ Message: 'Authorization has been denied for this request.' }, 401);
      return json(FORECAST_LID2);
    });
    const s = await new ImsWeatherProvider('bad', impl, () => NOW).getCell(TEL_AVIV_CELL);
    expect(s.now.temperatureC).toBe(25.9); // forecast hour
    expect(calls.filter((c) => c.url.endsWith('/data/latest'))).toHaveLength(1);
  });

  it('everything down → WeatherProviderError', async () => {
    const { impl } = fakeFetch(() => json({}, 503));
    await expect(new ImsWeatherProvider('tok', impl, () => NOW).getCell(TEL_AVIV_CELL))
      .rejects.toBeInstanceOf(WeatherProviderError);
  });

  it('caches the locality forecast across cells that share it', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.startsWith(IMS_FORECAST_BASE)) return json(FORECAST_LID2);
      return json({}, 503);
    });
    const p = new ImsWeatherProvider('tok', impl, () => NOW);
    await p.getCell({ lat: 32.08, lng: 34.78 });
    await p.getCell({ lat: 32.09, lng: 34.77 });
    expect(calls.filter((c) => c.url.startsWith(IMS_FORECAST_BASE))).toHaveLength(1);
  });
});

describe('provider selection', () => {
  it('ims with a token → ImsWeatherProvider', () => {
    expect(getWeatherProvider({ WEATHER_PROVIDER: 'ims', IMS_API_TOKEN: 'x' }).id).toBe('ims');
    expect(getWeatherProvider({ WEATHER_PROVIDER: ' IMS ', IMS_API_TOKEN: 'x' }).id).toBe('ims');
  });

  it('ims without a token → open-meteo, warned once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getWeatherProvider({ WEATHER_PROVIDER: 'ims' }).id).toBe('open-meteo');
    expect(getWeatherProvider({ WEATHER_PROVIDER: 'ims', IMS_API_TOKEN: '  ' }).id).toBe('open-meteo');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toMatch(/token\s*=/i);
    warn.mockRestore();
  });
});
