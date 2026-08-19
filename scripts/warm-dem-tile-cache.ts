/**
 * scripts/warm-dem-tile-cache.ts — true city-wide (route-independent) DEM
 * tile-cache warming, 19.08.2026, full city-mapping build.
 *
 * Gap this closes: populate-route-elevation-tlv.ts (map-city.ts's DEM step)
 * derives its bbox from EXISTING official_routes geometry — for a brand-new
 * city with zero routes it short-circuits to "nothing to do," so the DEM
 * cache never gets warmed until routes exist. warmDemTileCache() itself
 * (src/lib/dem-tile-cache/dem-tile-cache-admin.node.ts) already takes a
 * plain bbox with zero route dependency — this script is a thin wrapper
 * that exposes it directly, so a city's cache can be warmed BEFORE route
 * discovery has produced anything, using the city's own known bbox
 * (map-city.ts's CITY_CONFIGS.<city>.bbox).
 *
 * Cache is idempotent and shared: any tile this script warms is picked up
 * for free by populate-route-elevation-tlv.ts's own later warmDemTileCache
 * call (same Storage path, same tile coordinates) — this only gets the
 * (slow, network-bound) fetch out of the way earlier in the pipeline, it
 * doesn't change what gets warmed.
 *
 * Usage:
 *   DRY RUN (default — reports what WOULD be fetched, makes no Mapbox call,
 *   no Storage write):
 *     npx tsx scripts/warm-dem-tile-cache.ts --bbox 32.734,34.9296,32.854,35.0496
 *
 *   APPLY (fetches + caches for real — requires explicit --apply):
 *     npx tsx scripts/warm-dem-tile-cache.ts --bbox 32.734,34.9296,32.854,35.0496 --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY and NEXT_PUBLIC_MAPBOX_TOKEN set in .env.local
 *   - Run from the repo root so dotenv/.env.local + the src/lib import resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { warmDemTileCache } from '../src/lib/dem-tile-cache/dem-tile-cache-admin.node';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const bboxArg = getArg('--bbox');
if (!bboxArg) {
  console.error('❌  --bbox <south,west,north,east> is required (this script has no default city).');
  process.exit(1);
}
const [south, west, north, east] = bboxArg.split(',').map(Number);
const bbox = { latMin: south, lonMin: west, latMax: north, lonMax: east };

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id, storageBucket: 'appout-1.firebasestorage.app' });
}
const storage = admin.storage();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  DEM Tile Cache Warm (city-wide)         [${mode.padEnd(8)}]      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  bbox: lat [${bbox.latMin}, ${bbox.latMax}]  lon [${bbox.lonMin}, ${bbox.lonMax}]`);

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no Mapbox fetch, no Storage write. Reports what would be fetched.');
    console.log('   Run with --apply to warm the cache for real.\n');
  }

  const result = await warmDemTileCache(storage, bbox, { dryRun: !isApply });

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Tiles requested:         ${String(result.requested).padEnd(31)}║`);
  console.log(`║  Already cached:          ${String(result.alreadyCached).padEnd(31)}║`);
  console.log(`║  ${isApply ? 'Fetched from Mapbox:       ' + String(result.fetchedFromMapbox).padEnd(31) : 'Would fetch from Mapbox:   ' + String(result.fetchedFromMapbox).padEnd(31)}║`);
  console.log(`║  Failed:                  ${String(result.failed.length).padEnd(31)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (result.failed.length > 0) {
    console.log('\nFailed tiles:');
    for (const f of result.failed) console.log(`   z${f.tile.z}/${f.tile.x}/${f.tile.y}: ${f.error}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
