/**
 * ImsWeatherProvider — Israel Meteorological Service (השירות המטאורולוגי).
 *
 * Two IMS sources, fetched in parallel per cell:
 *
 *   now     Envista API (api.ims.gov.il/v1/envista) — 10-minute observations from the
 *           automatic station nearest the cell centre (TD temp, RH humidity, WS wind
 *           m/s, Rain mm per 10 min). Needs IMS_API_TOKEN (header "Authorization:
 *           ApiToken <token>"). Tries up to 3 nearest stations within 30 km, skipping one
 *           whose temperature is missing/invalid or whose reading is older than 60 min.
 *
 *   hours   ims.gov.il/en/full_forecast_data/{lid} — the hourly locality forecast the IMS
 *           website itself renders (temp, RH, wind km/h, rain mm, rain_chance %, UV index,
 *           IMS weather code), for the nearest of 175 forecast localities. Public, no
 *           token. NOTE: an undocumented website endpoint, not part of the official XML /
 *           API offering — it can change without notice (IMS terms §9 say the same of all
 *           its data), so every field is parsed defensively.
 *
 * Merge: now = station observation, with UV / rain chance / weather code taken from the
 * forecast's current hour (stations don't measure UV index). If the station side fails,
 * now = the forecast's current hour. If the forecast fails, hourly = [] and UV = null
 * (the classifier handles both). Both fail → WeatherProviderError → the cache layer's
 * stale-serve / 503 path.
 *
 * Apparent temperature is computed (BOM / Steadman) — IMS publishes a "heat stress"
 * index, which is a different scale from the apparent temperature the classifier's
 * thresholds were written for.
 *
 * In-memory caches (per server instance): station list 24h, station reading 9 min,
 * locality forecast 30 min. Many cells share one locality / station, so a cold
 * weather_cache costs IMS far fewer calls than cells.
 *
 * Privacy: errors never carry URLs, coordinates, station ids or the token.
 */

import { apparentTemperatureC, kmhToMs, msToKmh } from '../core/apparent-temperature';
import { jerusalemHourKey } from '../core/classify-weather';
import type { WeatherPoint, WeatherSnapshot } from '../core/weather.types';
import { IMS_FORECAST_LOCALITIES, IMS_STATIONS, type ImsPlace } from './ims-places';
import { WeatherProviderError, type WeatherProvider } from './weather-provider';

export const IMS_ENVISTA_BASE = 'https://api.ims.gov.il/v1/envista';
export const IMS_FORECAST_BASE = 'https://ims.gov.il/en/full_forecast_data';

const FETCH_TIMEOUT_MS = 5_000;
const STATION_MAX_KM = 30;
const STATION_MAX_TRIES = 3;
const OBS_MAX_AGE_MS = 60 * 60 * 1000;
const STATIONS_TTL_MS = 24 * 60 * 60 * 1000;
const OBS_TTL_MS = 9 * 60 * 1000;
const FORECAST_TTL_MS = 30 * 60 * 1000;

// ── Geometry ─────────────────────────────────────────────────────────────────

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Places sorted by distance from the point (nearest first), optionally capped by km. */
export function nearestPlaces(
  places: readonly ImsPlace[],
  at: { lat: number; lng: number },
  opts: { limit?: number; maxKm?: number } = {},
): Array<{ place: ImsPlace; km: number }> {
  const { limit = Infinity, maxKm = Infinity } = opts;
  return places
    .map((place) => ({ place, km: haversineKm(at.lat, at.lng, place[2], place[3]) }))
    .filter((p) => p.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

// ── Small parsing helpers ────────────────────────────────────────────────────

/** IMS sends numbers as strings ("25.9"); null for blanks, garbage and sentinels. */
export function imsNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= -999) return null;
  return n;
}

/** IMS weather code → WMO code (what WeatherChip's icon map speaks). */
export const IMS_TO_WMO: Readonly<Record<number, number>> = {
  1250: 0, // Clear
  1310: 0, // Hot
  1580: 0, // Extremely hot
  1300: 0, // Frost
  1270: 1, // Muggy
  1320: 1, // Cold
  1590: 1, // Extremely cold
  1220: 2, // Partly cloudy
  1530: 2, // Partly cloudy, possible rain (the rain flag comes from rain_chance, not the icon)
  1230: 3, // Cloudy
  1540: 3, // Cloudy, possible rain
  1260: 3, // Windy
  1570: 6, // Dust
  1010: 7, // Sandstorms
  1160: 45, // Fog
  1560: 61, // Cloudy, light rain
  1140: 63, // Rainy
  1080: 66, // Sleet
  1510: 82, // Stormy
  1070: 71, // Light snow
  1060: 73, // Snow
  1520: 75, // Heavy snow
  1020: 95, // Thunderstorms
};

export function imsCodeToWmo(code: number | null): number | null {
  return code == null ? null : IMS_TO_WMO[code] ?? null;
}

const JERUSALEM_MINUTE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Epoch ms → 'YYYY-MM-DDTHH:mm' Israel wall-clock (the WeatherPoint.time format). */
export function jerusalemMinuteKey(epochMs: number): string {
  const parts = JERUSALEM_MINUTE.formatToParts(new Date(epochMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${String(Number(get('hour')) % 24).padStart(2, '0')}:${get('minute')}`;
}

/**
 * Envista timestamps: IMS documents that the observation time is ALWAYS Israel winter
 * time (UTC+2), whatever offset the string claims ("…+03:00" in summer is wrong). So the
 * offset is ignored and the wall-clock part is read as UTC+2.
 */
export function parseEnvistaTime(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return Date.UTC(y, mo - 1, d, h - 2, mi);
}

// ── Envista: stations + latest observation ──────────────────────────────────

/** Envista /stations → stations that are active, located, and measure temperature. */
export function parseEnvistaStations(json: unknown): ImsPlace[] {
  if (!Array.isArray(json)) throw new WeatherProviderError('ims: bad stations payload');
  const out: ImsPlace[] = [];
  for (const raw of json) {
    const s = raw as {
      stationId?: unknown;
      name?: unknown;
      active?: unknown;
      location?: { latitude?: unknown; longitude?: unknown };
      monitors?: Array<{ name?: unknown; active?: unknown }>;
    };
    const id = imsNum(s?.stationId);
    const lat = imsNum(s?.location?.latitude);
    const lng = imsNum(s?.location?.longitude);
    if (id == null || lat == null || lng == null || s.active === false) continue;
    const hasTemp = Array.isArray(s.monitors)
      && s.monitors.some((m) => m?.name === 'TD' && m?.active !== false);
    if (!hasTemp) continue;
    out.push([id, typeof s.name === 'string' ? s.name : String(id), lat, lng]);
  }
  return out;
}

export interface StationObservation {
  stationId: number;
  /** Epoch ms of the observation (corrected to real UTC). */
  observedAt: number;
  tempC: number | null;
  rh: number | null;
  windMs: number | null;
  /** mm in the 10-minute interval. */
  rain10Mm: number | null;
}

/** Envista /stations/{id}/data/latest → the last observation. Throws on a bad shape. */
export function parseEnvistaLatest(json: unknown): StationObservation {
  const body = json as { stationId?: unknown; data?: Array<{ datetime?: unknown; channels?: unknown[] }> } | null;
  const row = Array.isArray(body?.data) ? body!.data[body!.data.length - 1] : undefined;
  const observedAt = parseEnvistaTime(row?.datetime);
  const stationId = imsNum(body?.stationId);
  if (!row || observedAt == null || stationId == null || !Array.isArray(row.channels)) {
    throw new WeatherProviderError('ims: bad observation payload');
  }
  const channel = (name: string): number | null => {
    for (const c of row.channels as Array<{ name?: unknown; value?: unknown; valid?: unknown; status?: unknown }>) {
      if (c?.name !== name) continue;
      if (c.valid === false) return null;
      if (c.status !== undefined && c.status !== 1) return null; // 1 = correct, 2 = incorrect
      return imsNum(c.value);
    }
    return null;
  };
  return {
    stationId,
    observedAt,
    tempC: channel('TD'),
    rh: channel('RH'),
    windMs: channel('WS'),
    rain10Mm: channel('Rain'),
  };
}

// ── Locality hourly forecast ────────────────────────────────────────────────

export interface ImsForecastHour {
  /** 'YYYY-MM-DDTHH:00' Israel wall-clock. */
  time: string;
  tempC: number | null;
  rh: number | null;
  windKmh: number | null;
  rainMm: number | null;
  rainChance: number | null;
  uv: number | null;
  imsCode: number | null;
}

/** full_forecast_data JSON → flat, time-sorted hourly list. Throws on a bad shape. */
export function parseImsHourlyForecast(json: unknown): ImsForecastHour[] {
  const days = (json as { data?: Record<string, { hourly?: Record<string, Record<string, unknown>> }> } | null)?.data;
  if (!days || typeof days !== 'object') throw new WeatherProviderError('ims: bad forecast payload');
  const out: ImsForecastHour[] = [];
  for (const day of Object.values(days)) {
    const hourly = day?.hourly;
    if (!hourly || typeof hourly !== 'object') continue;
    for (const h of Object.values(hourly)) {
      const ft = typeof h?.forecast_time === 'string' ? h.forecast_time : '';
      const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):/.exec(ft);
      if (!m) continue;
      out.push({
        time: `${m[1]}T${m[2]}:00`,
        tempC: imsNum(h.precise_temperature) ?? imsNum(h.temperature),
        rh: imsNum(h.relative_humidity),
        windKmh: imsNum(h.wind_speed),
        rainMm: imsNum(h.rain),
        rainChance: imsNum(h.rain_chance),
        uv: imsNum(h.u_v_index),
        imsCode: imsNum(h.weather_code),
      });
    }
  }
  if (out.length === 0) throw new WeatherProviderError('ims: empty forecast');
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

function forecastPoint(h: ImsForecastHour): WeatherPoint {
  return {
    time: h.time,
    temperatureC: h.tempC,
    apparentC: apparentTemperatureC(h.tempC, h.rh, h.windKmh == null ? null : kmhToMs(h.windKmh)),
    precipMm: h.rainMm,
    precipProb: h.rainChance,
    uv: h.uv,
    windKmh: h.windKmh,
    weatherCode: imsCodeToWmo(h.imsCode),
  };
}

/**
 * Pure merge: station observation (may be null) + forecast hours (may be null) + clock →
 * WeatherSnapshot. Throws when neither side has a usable "now".
 */
export function buildImsSnapshot(
  obs: StationObservation | null,
  forecast: ImsForecastHour[] | null,
  nowMs: number,
): WeatherSnapshot {
  const { key: hourKey } = jerusalemHourKey(new Date(nowMs));
  const upcoming = (forecast ?? []).filter((h) => h.time.slice(0, 13) >= hourKey).slice(0, 7);
  const current = upcoming[0] && upcoming[0].time.slice(0, 13) === hourKey ? upcoming[0] : null;

  let now: WeatherPoint;
  if (obs && obs.tempC != null) {
    const rh = obs.rh ?? current?.rh ?? null;
    const windMs = obs.windMs ?? (current?.windKmh != null ? kmhToMs(current.windKmh) : null);
    now = {
      time: jerusalemMinuteKey(obs.observedAt),
      temperatureC: obs.tempC,
      apparentC: apparentTemperatureC(obs.tempC, rh, windMs),
      // 10-minute rain → an mm/h rate, the unit the classifier's 0.5 mm/h threshold uses.
      precipMm: obs.rain10Mm == null ? current?.rainMm ?? null : Math.round(obs.rain10Mm * 6 * 100) / 100,
      precipProb: current?.rainChance ?? null,
      uv: current?.uv ?? null,
      windKmh: windMs == null ? null : Math.round(msToKmh(windMs) * 10) / 10,
      weatherCode: imsCodeToWmo(current?.imsCode ?? null),
    };
  } else if (current) {
    now = { ...forecastPoint(current), time: jerusalemMinuteKey(nowMs) };
  } else {
    throw new WeatherProviderError('ims: no observation and no current forecast hour');
  }

  return { provider: 'ims', fetchedAt: nowMs, now, hourly: upcoming.map(forecastPoint) };
}

// ── Provider ─────────────────────────────────────────────────────────────────

type Cached<T> = { at: number; value: T };
const stationListCache: { entry: Cached<ImsPlace[]> | null } = { entry: null };
const obsCache = new Map<number, Cached<StationObservation>>();
const forecastCache = new Map<number, Cached<ImsForecastHour[]>>();

/** Test hook. */
export function __resetImsCaches(): void {
  stationListCache.entry = null;
  obsCache.clear();
  forecastCache.clear();
}

export class ImsWeatherProvider implements WeatherProvider {
  readonly id = 'ims';
  constructor(
    private readonly apiToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  private async getJson(url: string, withToken: boolean): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: withToken
          ? { Authorization: `ApiToken ${this.apiToken}`, Accept: 'application/json' }
          : { Accept: 'application/json' },
      });
      if (!res.ok) throw new WeatherProviderError(`ims: HTTP ${res.status}`, res.status);
      return await res.json();
    } catch (err) {
      if (err instanceof WeatherProviderError) throw err;
      throw new WeatherProviderError(`ims: ${(err as Error)?.name ?? 'fetch failed'}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Envista station list (24h), falling back to the bundled constant. */
  private async stations(): Promise<readonly ImsPlace[]> {
    const now = this.clock();
    const c = stationListCache.entry;
    if (c && now - c.at < STATIONS_TTL_MS) return c.value;
    try {
      const list = parseEnvistaStations(await this.getJson(`${IMS_ENVISTA_BASE}/stations`, true));
      if (list.length > 0) {
        stationListCache.entry = { at: now, value: list };
        return list;
      }
    } catch {
      /* fall through to the bundled list */
    }
    // Remember the fallback for an hour so a broken /stations isn't retried per request.
    stationListCache.entry = { at: now - STATIONS_TTL_MS + 60 * 60 * 1000, value: [...IMS_STATIONS] };
    return IMS_STATIONS;
  }

  private async latest(stationId: number): Promise<StationObservation> {
    const now = this.clock();
    const c = obsCache.get(stationId);
    if (c && now - c.at < OBS_TTL_MS) return c.value;
    const obs = parseEnvistaLatest(
      await this.getJson(`${IMS_ENVISTA_BASE}/stations/${stationId}/data/latest`, true),
    );
    obsCache.set(stationId, { at: now, value: obs });
    return obs;
  }

  /** Nearest station with a fresh, valid temperature (up to 3 tries within 30 km). */
  async observation(cell: { lat: number; lng: number }): Promise<StationObservation | null> {
    const candidates = nearestPlaces(await this.stations(), cell, { limit: STATION_MAX_TRIES, maxKm: STATION_MAX_KM });
    for (const { place } of candidates) {
      try {
        const obs = await this.latest(place[0]);
        if (obs.tempC != null && this.clock() - obs.observedAt <= OBS_MAX_AGE_MS) return obs;
      } catch (err) {
        // A rejected token fails the same way on every station — stop early.
        if (err instanceof WeatherProviderError && (err.status === 401 || err.status === 403)) throw err;
      }
    }
    return null;
  }

  async forecast(cell: { lat: number; lng: number }): Promise<ImsForecastHour[]> {
    const nearest = nearestPlaces(IMS_FORECAST_LOCALITIES, cell, { limit: 1 })[0];
    if (!nearest) throw new WeatherProviderError('ims: no forecast locality');
    const lid = nearest.place[0];
    const now = this.clock();
    const c = forecastCache.get(lid);
    if (c && now - c.at < FORECAST_TTL_MS) return c.value;
    const hours = parseImsHourlyForecast(await this.getJson(`${IMS_FORECAST_BASE}/${lid}`, false));
    forecastCache.set(lid, { at: now, value: hours });
    return hours;
  }

  async getCell(cell: { lat: number; lng: number }): Promise<WeatherSnapshot> {
    const [obs, fc] = await Promise.allSettled([this.observation(cell), this.forecast(cell)]);
    return buildImsSnapshot(
      obs.status === 'fulfilled' ? obs.value : null,
      fc.status === 'fulfilled' ? fc.value : null,
      this.clock(),
    );
  }
}
