/**
 * Hourly shade city files (`shade/hourly/v1/<city>.bin.gz`) with an
 * in-memory, per-process cache: one fetch + decode + index per city. The
 * byte fetcher is injected (Admin SDK bucket in scripts / API routes, a map
 * in tests). Missing / unreadable ⇒ null, never an error.
 */
import { technionCityForName } from '../shade/loader';
import { decodeCityFile } from './city-file';
import { hourlyShadeObjectPath } from './cities';
import { buildHourlyCity, type HourlyCity } from './route-hourly';
import { buildSunTable } from './time-grid';

/** Raw (already gunzipped) bytes of a Storage object, or null when it doesn't exist. */
export type BytesFetcher = (objectPath: string) => Promise<Uint8Array | null>;

export interface HourlyShadeLoader {
  cityFor(slug: string): Promise<HourlyCity | null>;
  /** By authority / city name (Hebrew or slug) — same name map as the Technion layers. */
  cityForName(name: string | null | undefined): Promise<HourlyCity | null>;
}

export function createHourlyShadeLoader(fetchBytes: BytesFetcher, log: (s: string) => void = () => {}): HourlyShadeLoader {
  const cache = new Map<string, Promise<HourlyCity | null>>();
  const cityFor = (slug: string) => {
    let p = cache.get(slug);
    if (!p) {
      p = (async () => {
        try {
          const bytes = await fetchBytes(hourlyShadeObjectPath(slug));
          if (!bytes) return null;
          const { header, segments } = decodeCityFile(bytes);
          const c = buildHourlyCity(slug, segments, buildSunTable(header.origin[1], header.origin[0], header.year));
          log(`[shade-hourly] ${slug}: ${segments.length} pieces indexed`);
          return c;
        } catch (e) {
          log(`[shade-hourly] ${slug}: not loaded (${(e as Error).message})`);
          return null;
        }
      })();
      cache.set(slug, p);
    }
    return p;
  };
  return {
    cityFor,
    async cityForName(name) {
      const slug = technionCityForName(name) ?? (name && /^[a-z-]+$/.test(name) ? name : null);
      return slug ? cityFor(slug) : null;
    },
  };
}
