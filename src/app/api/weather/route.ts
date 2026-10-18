/**
 * GET /api/weather?cell=<lat>_<lng>
 *
 * Coarse weather for one ~5 km cell (coords rounded to 0.05° ON THE DEVICE — this
 * route never sees a precise location). Public, read-only for the caller; the only
 * writes are the server's own cache (weather_cache/{cell}) and the shared rate-limit
 * counter, both via the Admin SDK.
 *
 * Privacy: never log the cell or any coordinate. Errors log the provider id + status only.
 *
 * Feature flag: the client only calls this when `weather_enabled` is on. The route itself
 * is not flag-gated (a flag read per request would cost a Firestore read for nothing) —
 * with the flag off nobody calls it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';
import { parseCellId } from '@/features/weather/core/cell';
import type { WeatherApiResponse, WeatherSnapshot } from '@/features/weather/core/weather.types';
import { getWeatherProvider } from '@/features/weather/server/weather-provider';
import {
  getCellWeather,
  WEATHER_CACHE_COLLECTION,
  WEATHER_STALE_MAX_MS,
  WeatherUnavailableError,
  type WeatherCacheStore,
} from '@/features/weather/server/weather-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

function firestoreStore(): WeatherCacheStore {
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

export async function GET(request: NextRequest) {
  const cell = request.nextUrl.searchParams.get('cell')?.trim() ?? '';
  const centre = parseCellId(cell);
  if (!centre) {
    return NextResponse.json({ error: 'Invalid cell' }, { status: 400 });
  }

  // Light rate limit per IP. isRateLimited fails OPEN on a Firestore error, which is
  // fine here: the worst case is a few extra cached reads.
  const db = getAdminDb();
  const ip = getRequestIp(request);
  if (await isRateLimited(db, `weather:${ip}`, { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS_PER_WINDOW })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const provider = getWeatherProvider();
  try {
    const { snapshot, source } = await getCellWeather(cell, centre, { store: firestoreStore(), provider });
    const body: WeatherApiResponse = { cell, snapshot, ...(source === 'stale-cache' ? { stale: true } : {}) };
    return NextResponse.json(body, {
      headers: {
        // The answer is per-cell, not per-user — safe for the CDN to share briefly.
        'Cache-Control': source === 'stale-cache'
          ? 'public, max-age=60, s-maxage=60'
          : 'public, max-age=300, s-maxage=600, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    if (err instanceof WeatherUnavailableError) {
      console.warn(`[weather] provider=${provider.id} unavailable and no usable cache`);
      return NextResponse.json({ error: 'Weather unavailable' }, { status: 503 });
    }
    console.error(`[weather] provider=${provider.id} unexpected error: ${(err as Error)?.name ?? 'unknown'}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
