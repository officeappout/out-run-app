/**
 * Shade-layer loader with an in-memory, per-process cache: one fetch + one
 * index build per city for the life of the process (script run, or a warm
 * serverless instance). The fetcher is injected so the same code runs in
 * scripts (Admin SDK bucket), API routes (server Admin app) and tests.
 * A missing / unreadable city resolves to null — callers treat that as
 * "no shade data here", never as an error.
 */
import { buildShadeIndex, type ShadeSpatialIndex } from './match';
import { TECHNION_SHADE_LAYERS } from './technion-layers';
import type { ShadeSegmentCollection } from './types';

export const SHADE_STORAGE_PREFIX = 'shade/technion/v1';

export const shadeObjectPath = (citySlug: string) => `${SHADE_STORAGE_PREFIX}/${citySlug}.geojson.gz`;

/** Returns the parsed JSON body of a Storage object, or null when it doesn't exist. */
export type ShadeObjectFetcher = (objectPath: string) => Promise<unknown | null>;

const norm = (s: string) =>
  s.trim().replace(/^(עיריית|עירית|מועצה מקומית|מועצה)\s+/, '').replace(/["'״׳`]/g, '').replace(/[\s\-–—_.()־]/g, '').replace(/וו/g, 'ו').toLowerCase();

const BY_NAME = new Map<string, string>();
for (const l of TECHNION_SHADE_LAYERS) {
  BY_NAME.set(norm(l.cityHe), l.city);
  BY_NAME.set(norm(l.city), l.city);
}

/** Authority / route city name (Hebrew or slug) → Technion city slug, or null when the city has no layer. */
export function technionCityForName(name: string | null | undefined): string | null {
  if (!name) return null;
  return BY_NAME.get(norm(name)) ?? null;
}

export interface ShadeLoader {
  /** Spatial index for a city slug, or null (no layer / not readable). Cached per process. */
  indexFor(citySlug: string): Promise<ShadeSpatialIndex | null>;
  /** Convenience: by authority / city name. */
  indexForName(name: string | null | undefined): Promise<{ city: string; index: ShadeSpatialIndex } | null>;
}

export function createShadeLoader(fetchObject: ShadeObjectFetcher, log: (s: string) => void = () => {}): ShadeLoader {
  const cache = new Map<string, Promise<ShadeSpatialIndex | null>>();
  const indexFor = (city: string) => {
    let p = cache.get(city);
    if (!p) {
      p = (async () => {
        try {
          const body = (await fetchObject(shadeObjectPath(city))) as ShadeSegmentCollection | null;
          if (!body || !Array.isArray(body.features)) return null;
          const idx = buildShadeIndex(body);
          log(`[shade] ${city}: ${body.features.length} segments indexed`);
          return idx;
        } catch (e) {
          log(`[shade] ${city}: not loaded (${(e as Error).message})`);
          return null;
        }
      })();
      cache.set(city, p);
    }
    return p;
  };
  return {
    indexFor,
    async indexForName(name) {
      const city = technionCityForName(name);
      if (!city) return null;
      const index = await indexFor(city);
      return index ? { city, index } : null;
    },
  };
}
