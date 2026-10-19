/**
 * scripts/route-quality/measure.ts — before/after route-quality measurement.
 *
 * Runs the REAL loop generator (generateDynamicRoutes) at the 6 fixed starts
 * × 3/5 km, N regenerations each, with route quality v1 OFF and ON, against
 * real Mapbox Directions + Overpass, and scores every returned route with the
 * pure src/lib/route-quality metrics. Firestore is an offline, read-only
 * corpus replay (a read-only street_segments dump; the dump script was kept out of the repo — see PR #480) — nothing can
 * reach production Firestore (firebase is stubbed at the resolver level).
 *
 *   HERMETIC_CORPUS_DIR=<dir> npx tsx --env-file=.env.local \
 *     --tsconfig scripts/route-quality/hermetic/tsconfig.json \
 *     scripts/route-quality/measure.ts --runs 3 --out <dir> [--only tlv-dizengoff] [--variants off,on]
 */
import './hermetic/guard';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEASURE_STARTS, MEASURE_TARGETS_KM } from './starts';
import { summarize, toMarkdown, type RouteRow } from './summarize';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg('runs', '3'));
const OUT = arg('out', 'route-quality-out')!;
const ONLY = arg('only');
const VARIANTS = (arg('variants', 'off,on') ?? '').split(',') as Array<'off' | 'on'>;

/** Overpass mirrors refuse Node's default User-Agent (406). */
const withUA: typeof fetch = (url, init) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'OUT-route-quality-measure/1.0 (office@appout.co.il)' } });

async function main() {
  // Silence the generator's very chatty console.log; keep warnings out too.
  const log = console.log; console.log = () => {}; console.warn = () => {};
  const { generateDynamicRoutes } = await import('@/features/parks/core/services/route-generator.service');
  const { computeRouteQualityMetrics, evaluateLoopQuality, fetchOsmRoadLayer, bboxAround } = await import('@/lib/route-quality');
  const { OVERPASS_ENDPOINTS } = await import('@/lib/route-quality/osm-layer');
  const { seedOsmRoadLayer } = await import('@/lib/route-quality/osm-layer-cache');
  const READS = (globalThis as { __RQ_READS?: { docs: number; queries: number } }).__RQ_READS!;
  mkdirSync(OUT, { recursive: true });

  const rows: RouteRow[] = [];
  for (const s of MEASURE_STARTS.filter(x => !ONLY || x.id === ONLY)) {
    const osmFile = join(OUT, `osm-${s.id}.json`);
    let osm;
    if (existsSync(osmFile)) osm = JSON.parse(readFileSync(osmFile, 'utf8'));
    else {
      for (let attempt = 0; !osm; attempt++) {
        try { osm = await fetchOsmRoadLayer(bboxAround(s.lat, s.lng, 3.5), { endpoints: [...OVERPASS_ENDPOINTS].reverse(), fetchImpl: withUA }); }
        catch (e) { if (attempt >= 4) throw e; log(`  overpass retry (${(e as Error).message})`); await new Promise(r => setTimeout(r, 20000)); }
      }
      writeFileSync(osmFile, JSON.stringify(osm));
    }
    // The app's v1 generator judges crossings with the cached OSM layer — seed
    // the cache for the exact area keys it will ask for (warm-cache behaviour).
    for (const targetKm of MEASURE_TARGETS_KM) seedOsmRoadLayer(s.lat, s.lng, Math.max(targetKm, 1.5) / 2 + 0.5, osm);
    for (const targetKm of MEASURE_TARGETS_KM) {
      for (const variant of VARIANTS) {
        for (let run = 0; run < RUNS; run++) {
          const before = READS.docs;
          const t0 = Date.now();
          let routes: Array<{ path: [number, number][]; distance: number; features?: unknown; rating?: number }> = [];
          try {
            routes = await generateDynamicRoutes({
              userLocation: { lat: s.lat, lng: s.lng },
              targetDistance: targetKm,
              activity: 'running',
              routeGenerationIndex: run * 7 + 1,
              preferences: { includeStrength: false, maxRoutes: 3 },
              parks: [],
              cityName: s.cityName,
              routeQualityV1: variant === 'on',
            } as Parameters<typeof generateDynamicRoutes>[0]);
          } catch (e) { log(`  ! ${s.id} ${targetKm} ${variant} run ${run}: ${(e as Error).message}`); }
          const reads = READS.docs - before;
          const ms = Date.now() - t0;
          routes.forEach((r, rank) => {
            const m = computeRouteQualityMetrics(r.path, { targetKm, osm });
            const v = evaluateLoopQuality(m);
            rows.push({
              start: s.id, targetKm, variant, run, rank, reads, ms,
              distanceKm: r.distance, metrics: { ...m, uTurns: [], crossings: m.crossings ? { ...m.crossings, marks: [] } : null },
              pass: v.pass, reasons: v.reasons, features: r.features, rating: r.rating,
            });
          });
          if (routes.length === 0) rows.push({ start: s.id, targetKm, variant, run, rank: -1, reads, ms, empty: true });
          log(`${s.id} ${targetKm}km ${variant} run ${run}: ${routes.length} route(s), ${reads} reads, ${ms} ms`);
        }
      }
    }
  }
  writeFileSync(join(OUT, 'rows.json'), JSON.stringify(rows, null, 1));
  const sum = summarize(rows);
  writeFileSync(join(OUT, 'summary.md'), toMarkdown(sum));
  log(toMarkdown(sum));
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
