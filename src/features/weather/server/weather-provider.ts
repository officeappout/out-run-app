/**
 * WeatherProvider — the adapter seam. The owner hasn't picked a provider yet
 * (Open-Meteo paid plan vs. Israel Meteorological Service), so everything above this
 * file talks to the interface only. Adding IMS = one new class + one case in
 * getWeatherProvider(); nothing else changes.
 *
 * Selected by env WEATHER_PROVIDER (default 'open-meteo'); WEATHER_API_KEY switches
 * Open-Meteo to its commercial endpoint. WEATHER_PROVIDER='ims' selects the Israel
 * Meteorological Service (ims-provider.ts) and needs IMS_API_TOKEN (server-only); without
 * the token it falls back to Open-Meteo and logs that once per instance.
 *
 * Licensing: the free api.open-meteo.com endpoint is for NON-COMMERCIAL use only. OUT
 * is a commercial product, so production needs either an Open-Meteo API subscription
 * (set WEATHER_API_KEY → customer-api.open-meteo.com) or another provider.
 *
 * Server-only by usage (imported from the API route); kept free of 'server-only' so the
 * pure parser is unit-testable under vitest.
 */

import type { WeatherPoint, WeatherSnapshot } from '../core/weather.types';
import { ImsWeatherProvider } from './ims-provider';

export interface WeatherProvider {
  readonly id: string;
  /** Current conditions + the next 6 hours for a cell centre. Throws on failure. */
  getCell(cell: { lat: number; lng: number }): Promise<WeatherSnapshot>;
}

export class WeatherProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WeatherProviderError';
  }
}

// ── Open-Meteo ────────────────────────────────────────────────────────────────

const OPEN_METEO_FREE = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_COMMERCIAL = 'https://customer-api.open-meteo.com/v1/forecast';
const OPEN_METEO_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'precipitation_probability',
  'uv_index',
  'wind_speed_10m',
  'weather_code',
].join(',');
const FETCH_TIMEOUT_MS = 5_000;

export function buildOpenMeteoUrl(cell: { lat: number; lng: number }, apiKey?: string): string {
  const params = new URLSearchParams({
    latitude: cell.lat.toFixed(2),
    longitude: cell.lng.toFixed(2),
    current: OPEN_METEO_FIELDS,
    hourly: OPEN_METEO_FIELDS,
    timezone: 'Asia/Jerusalem',
    // Current hour + the next 6.
    forecast_hours: '7',
  });
  if (apiKey) params.set('apikey', apiKey);
  return `${apiKey ? OPEN_METEO_COMMERCIAL : OPEN_METEO_FREE}?${params.toString()}`;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Pure: Open-Meteo JSON → WeatherSnapshot. Throws WeatherProviderError on a bad shape. */
export function parseOpenMeteoResponse(json: unknown, fetchedAt: number): WeatherSnapshot {
  const body = json as {
    current?: Record<string, unknown>;
    hourly?: Record<string, unknown[]>;
  } | null;
  const cur = body?.current;
  if (!cur || typeof cur.time !== 'string') {
    throw new WeatherProviderError('open-meteo: missing current block');
  }
  const now: WeatherPoint = {
    time: cur.time,
    temperatureC: num(cur.temperature_2m),
    apparentC: num(cur.apparent_temperature),
    precipMm: num(cur.precipitation),
    precipProb: num(cur.precipitation_probability),
    uv: num(cur.uv_index),
    windKmh: num(cur.wind_speed_10m),
    weatherCode: num(cur.weather_code),
  };

  const h = body?.hourly;
  const times = Array.isArray(h?.time) ? (h!.time as unknown[]) : [];
  const col = (k: string, i: number) => (Array.isArray(h?.[k]) ? num(h![k][i]) : null);
  const hourly: WeatherPoint[] = [];
  for (let i = 0; i < times.length && hourly.length < 7; i++) {
    const t = times[i];
    if (typeof t !== 'string') continue;
    hourly.push({
      time: t,
      temperatureC: col('temperature_2m', i),
      apparentC: col('apparent_temperature', i),
      precipMm: col('precipitation', i),
      precipProb: col('precipitation_probability', i),
      uv: col('uv_index', i),
      windKmh: col('wind_speed_10m', i),
      weatherCode: col('weather_code', i),
    });
  }

  return { provider: 'open-meteo', fetchedAt, now, hourly };
}

export class OpenMeteoProvider implements WeatherProvider {
  readonly id = 'open-meteo';
  constructor(private readonly apiKey?: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async getCell(cell: { lat: number; lng: number }): Promise<WeatherSnapshot> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(buildOpenMeteoUrl(cell, this.apiKey), {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new WeatherProviderError(`open-meteo: HTTP ${res.status}`, res.status);
      return parseOpenMeteoResponse(await res.json(), Date.now());
    } catch (err) {
      if (err instanceof WeatherProviderError) throw err;
      // Never echo the URL (it carries the cell, and the api key when commercial).
      throw new WeatherProviderError(`open-meteo: ${(err as Error)?.name ?? 'fetch failed'}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

let warnedImsWithoutToken = false;

/** env → provider. Unknown ids fall back to Open-Meteo. */
export function getWeatherProvider(env: Record<string, string | undefined> = process.env): WeatherProvider {
  const id = (env.WEATHER_PROVIDER ?? 'open-meteo').trim().toLowerCase();
  const apiKey = env.WEATHER_API_KEY?.trim() || undefined;
  switch (id) {
    case 'ims': {
      const token = env.IMS_API_TOKEN?.trim();
      if (token) return new ImsWeatherProvider(token);
      if (!warnedImsWithoutToken) {
        warnedImsWithoutToken = true;
        console.warn('[weather] WEATHER_PROVIDER=ims but IMS_API_TOKEN is not set — using open-meteo');
      }
      return new OpenMeteoProvider(apiKey);
    }
    case 'open-meteo':
    default:
      return new OpenMeteoProvider(apiKey);
  }
}
