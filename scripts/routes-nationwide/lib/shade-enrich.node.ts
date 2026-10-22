/**
 * Shade inputs for the runner's scoring (RC8) — the same loaders as
 * scripts/backfill-route-score.ts: the Technion summer Shade Index layer
 * (comfort points) and the hourly file (informational), both read-only from
 * Storage. Returns the runAuthorityStages `enrich` hook for one authority, so
 * EVERY candidate — existing, dataset, OSM, park loop, generated — is scored
 * with the same shade measurement. Cities without a layer: no hook (shade
 * stays "not measured", no penalty).
 */
import { parsePath, type FromDocOptions } from '../../../src/lib/route-score';
import type { CandidateRoute } from '../../../src/lib/routes-nationwide';
import { createShadeLoader, measureRouteShade, type ShadeLoader } from '../../../src/lib/shade';
import { bucketShadeFetcher } from '../../../src/lib/shade/bucket-fetcher.node';
import { createHourlyShadeLoader, hourlyProfileSummary, type HourlyShadeLoader } from '../../../src/lib/shade-hourly';
import { bucketBytesFetcher } from '../../../src/lib/shade-hourly/bucket-fetcher.node';

export interface ShadeLoaders { shade: ShadeLoader; hourly: HourlyShadeLoader }

export async function createShadeLoaders(target: { app: unknown; projectId: string }, log: (s: string) => void): Promise<ShadeLoaders> {
  const { getStorage } = await import('firebase-admin/storage');
  const bucket = getStorage(target.app as never).bucket(`${target.projectId}.firebasestorage.app`);
  return {
    shade: createShadeLoader(bucketShadeFetcher(bucket as never), log),
    hourly: createHourlyShadeLoader(bucketBytesFetcher(bucket as never), log),
  };
}

export async function shadeEnricher(loaders: ShadeLoaders | null, authorityName: string): Promise<{ enrich: ((r: CandidateRoute) => FromDocOptions | null) | undefined; note: string }> {
  if (!loaders) return { enrich: undefined, note: 'shade off' };
  const city = await loaders.shade.indexForName(authorityName);
  const hourly = await loaders.hourly.cityForName(authorityName);
  if (!city && !hourly) return { enrich: undefined, note: 'no shade layer for this city' };
  return {
    note: `shade: ${city ? `SI layer ${city.city}` : 'no SI layer'}${hourly ? `, hourly ${hourly.city}` : ''}`,
    enrich: (r) => {
      const line = parsePath(r.data?.path);
      if (line.length < 2) return null;
      const out: FromDocOptions = {};
      if (city) out.shade = measureRouteShade(line, city.index);
      const h = hourly ? hourlyProfileSummary(hourly, line) : null;
      if (h) out.hourlyShade = h;
      return out;
    },
  };
}
