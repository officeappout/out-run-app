'use client';

/**
 * useWeather — the home screen's weather for the user's ~5 km cell.
 *
 * Location: the user's home anchor (users.core.anchorLat/anchorLng) first, else the last
 * GPS snapshot already in useGPSStore. Never prompts for location itself. The coordinates
 * are rounded to a 0.05° cell HERE, on the device, before anything leaves it.
 *
 * Cache: in memory + localStorage for 30 min per cell (the server caches the same
 * window, so a warm open costs zero requests). Offline (navigator.onLine === false) →
 * returns null, nothing is shown. Any failure → null; weather is decoration, never a
 * blocker.
 *
 * `enabled` is the `weather_enabled` remote flag — when false the hook does nothing at all.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { toCellId } from '../core/cell';
import { deriveHomeWeather, type HomeWeather } from '../core/derive-home-weather';
import type { WeatherApiResponse, WeatherSnapshot } from '../core/weather.types';

export type { HomeWeather };

export const WEATHER_CLIENT_TTL_MS = 30 * 60 * 1000;
const LS_PREFIX = 'out-weather-v1:';

const memory = new Map<string, { snapshot: WeatherSnapshot; at: number }>();
const inFlight = new Map<string, Promise<WeatherSnapshot | null>>();

function readCache(cell: string): WeatherSnapshot | null {
  const now = Date.now();
  const m = memory.get(cell);
  if (m && now - m.at < WEATHER_CLIENT_TTL_MS) return m.snapshot;
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(LS_PREFIX + cell);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot?: WeatherSnapshot; at?: number };
    if (!parsed.snapshot || typeof parsed.at !== 'number' || now - parsed.at >= WEATHER_CLIENT_TTL_MS) return null;
    memory.set(cell, { snapshot: parsed.snapshot, at: parsed.at });
    return parsed.snapshot;
  } catch {
    return null;
  }
}

function writeCache(cell: string, snapshot: WeatherSnapshot): void {
  const at = Date.now();
  memory.set(cell, { snapshot, at });
  try {
    window.localStorage.setItem(LS_PREFIX + cell, JSON.stringify({ snapshot, at }));
  } catch {
    /* private mode / quota — memory cache still works */
  }
}

function fetchCell(cell: string): Promise<WeatherSnapshot | null> {
  const pending = inFlight.get(cell);
  if (pending) return pending;
  const p = fetch(`/api/weather?cell=${encodeURIComponent(cell)}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as WeatherApiResponse;
      if (!body?.snapshot?.now) return null;
      // A stale (provider-down) answer is shown but not cached as fresh.
      if (!body.stale) writeCache(cell, body.snapshot);
      return body.snapshot;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(cell));
  inFlight.set(cell, p);
  return p;
}

export function useWeather(enabled: boolean): HomeWeather | null {
  const anchorCell = useUserStore((s) => {
    const core = s.profile?.core as { anchorLat?: number; anchorLng?: number } | undefined;
    return typeof core?.anchorLat === 'number' && typeof core?.anchorLng === 'number'
      ? toCellId(core.anchorLat, core.anchorLng)
      : null;
  });
  // Select the CELL, not the coords — re-renders only when the user crosses a ~5 km
  // boundary, not on every GPS tick.
  const gpsCell = useGPSStore((s) => (s.coords ? toCellId(s.coords.lat, s.coords.lng) : null));
  const cell = enabled ? (anchorCell ?? gpsCell) : null;

  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(() => (cell ? readCache(cell) : null));
  const [online, setOnline] = useState<boolean>(() => typeof navigator === 'undefined' || navigator.onLine !== false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!cell || !online) {
      if (!cell) setSnapshot(null);
      return;
    }
    const cached = readCache(cell);
    if (cached) {
      setSnapshot(cached);
      return;
    }
    let cancelled = false;
    fetchCell(cell).then((s) => {
      if (!cancelled) setSnapshot(s);
    });
    return () => {
      cancelled = true;
    };
  }, [cell, online]);

  return useMemo(() => {
    if (!enabled || !online || !snapshot) return null;
    return deriveHomeWeather(snapshot);
  }, [enabled, online, snapshot]);
}
