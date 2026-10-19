/**
 * Kelly round 4 — get_weather (server). The SAME weather service the home chip uses: the
 * weather_cache/{cell} store + the configured provider (IMS when WEATHER_PROVIDER=ims), for the
 * user's ~5 km cell. Gated exactly like the app (isWeatherOnFor: weather_enabled +
 * weather_admins_only). Coordinates are rounded to the cell and never logged or returned.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { isWeatherOnFor } from '@/features/weather/core/weather-access';
import { parseCellId, toCellId } from '@/features/weather/core/cell';
import { deriveHomeWeather } from '@/features/weather/core/derive-home-weather';
import { getCellWeather } from '@/features/weather/server/weather-cache';
import { getWeatherProvider } from '@/features/weather/server/weather-provider';
import { firestoreWeatherStore } from '@/features/weather/server/firestore-store.server';
import { readUserOrigin } from './location.server';
import { WEATHER_UNAVAILABLE, weatherToolResult } from './weather-result';

export async function getWeatherForUser(ctx: {
  db: Firestore;
  uid: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile
  profile: Record<string, any>;
  now: Date;
  flags: { weatherEnabled: boolean; weatherAdminsOnly: boolean };
}): Promise<Record<string, unknown>> {
  if (!isWeatherOnFor(ctx.flags, ctx.profile?.core?.isSuperAdmin === true)) return { ...WEATHER_UNAVAILABLE };
  const origin = await readUserOrigin(ctx.db, ctx.uid, ctx.profile, ctx.now);
  const cell = origin ? toCellId(origin.lat, origin.lng) : null;
  const centre = cell ? parseCellId(cell) : null;
  if (!origin || !cell || !centre) return { ...WEATHER_UNAVAILABLE };
  try {
    const { snapshot } = await getCellWeather(cell, centre, { store: firestoreWeatherStore(), provider: getWeatherProvider() });
    return weatherToolResult(deriveHomeWeather(snapshot, ctx.now), origin.kind);
  } catch {
    return { ...WEATHER_UNAVAILABLE };
  }
}
