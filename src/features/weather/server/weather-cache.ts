/**
 * Cell-level weather cache: Firestore weather_cache/{cell} (Admin SDK only — the
 * collection has no client rule, so the root-admin catch-all keeps it server-only).
 *
 *   fresh (< 30 min)            → serve the cached snapshot, no provider call
 *   stale / missing             → ask the provider, write back (best effort), serve it
 *   provider fails, cache < 3h  → serve the old snapshot with stale: true
 *   provider fails, nothing     → WeatherUnavailableError (route answers 503)
 *
 * Storage is injected so the decision logic is unit-testable without Firestore.
 */

import type { WeatherSnapshot } from '../core/weather.types';
import type { WeatherProvider } from './weather-provider';

export const WEATHER_CACHE_COLLECTION = 'weather_cache';
export const WEATHER_FRESH_MS = 30 * 60 * 1000;
export const WEATHER_STALE_MAX_MS = 3 * 60 * 60 * 1000;

export interface WeatherCacheStore {
  read(cell: string): Promise<WeatherSnapshot | null>;
  write(cell: string, snapshot: WeatherSnapshot): Promise<void>;
}

export class WeatherUnavailableError extends Error {
  constructor() {
    super('weather unavailable');
    this.name = 'WeatherUnavailableError';
  }
}

export interface CellWeatherResult {
  snapshot: WeatherSnapshot;
  source: 'cache' | 'provider' | 'stale-cache';
}

// Per-instance in-flight dedupe — a burst of requests for one cell on a cold cache
// makes ONE provider call, not N.
const inFlight = new Map<string, Promise<CellWeatherResult>>();

export async function getCellWeather(
  cell: string,
  centre: { lat: number; lng: number },
  deps: { store: WeatherCacheStore; provider: WeatherProvider; now?: () => number },
): Promise<CellWeatherResult> {
  const pending = inFlight.get(cell);
  if (pending) return pending;
  const p = resolveCellWeather(cell, centre, deps).finally(() => inFlight.delete(cell));
  inFlight.set(cell, p);
  return p;
}

async function resolveCellWeather(
  cell: string,
  centre: { lat: number; lng: number },
  { store, provider, now = Date.now }: { store: WeatherCacheStore; provider: WeatherProvider; now?: () => number },
): Promise<CellWeatherResult> {
  let cached: WeatherSnapshot | null = null;
  try {
    cached = await store.read(cell);
  } catch {
    cached = null; // a cache read failure must never block a live answer
  }

  const age = cached ? now() - cached.fetchedAt : Infinity;
  if (cached && age >= 0 && age < WEATHER_FRESH_MS) {
    return { snapshot: cached, source: 'cache' };
  }

  try {
    const fresh = await provider.getCell(centre);
    // Best effort, but awaited: on Vercel an un-awaited write can be cut off once the
    // response is sent. A failed write still serves the fresh data.
    try {
      await store.write(cell, fresh);
    } catch {
      /* cache write failure is non-fatal */
    }
    return { snapshot: fresh, source: 'provider' };
  } catch {
    if (cached && age >= 0 && age < WEATHER_STALE_MAX_MS) {
      return { snapshot: cached, source: 'stale-cache' };
    }
    throw new WeatherUnavailableError();
  }
}

/** Test hook — clears the in-flight map between cases. */
export function __resetWeatherInFlight(): void {
  inFlight.clear();
}
