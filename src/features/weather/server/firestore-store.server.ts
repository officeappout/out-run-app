/**
 * The weather_cache/{cell} store over the Admin SDK — shared by GET /api/weather and Kelly's
 * get_weather (round 4), so both read and refresh the SAME cache. Moved verbatim from the route.
 */
import { getAdminDb } from '@/lib/firebase-admin';
import type { WeatherSnapshot } from '@/features/weather/core/weather.types';
import { WEATHER_CACHE_COLLECTION, WEATHER_STALE_MAX_MS, type WeatherCacheStore } from './weather-cache';

export function firestoreWeatherStore(): WeatherCacheStore {
  const db = getAdminDb();
  const col = db.collection(WEATHER_CACHE_COLLECTION);
  return {
    async read(cell) {
      const snap = await col.doc(cell).get();
      if (!snap.exists) return null;
      const data = snap.data() as { snapshot?: WeatherSnapshot } | undefined;
      const s = data?.snapshot;
      return s && typeof s.fetchedAt === 'number' && s.now ? s : null;
    },
    async write(cell, snapshot) {
      await col.doc(cell).set({
        snapshot,
        provider: snapshot.provider,
        updatedAt: new Date(snapshot.fetchedAt),
        // For an optional Firestore TTL policy on this collection; harmless otherwise.
        expiresAt: new Date(snapshot.fetchedAt + WEATHER_STALE_MAX_MS),
      });
    },
  };
}
