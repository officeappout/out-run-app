/**
 * scripts/populate-route-elevation-tlv.ts — Stage 5 Phase B of the
 * route-enrichment-pipeline plan (autonomous city-enrichment build run,
 * 18.08.2026).
 *
 * Populates `Route.elevationGain`/`maxGrade` (Stage 1A typed fields,
 * computed-but-never-written until now) on the 27 TLV `official_routes`
 * docs by sampling a CACHED DEM tile set — never a live per-route Mapbox
 * call (that's explicitly out of scope; see the plan's own Stage 0 scope
 * correction). This is what makes `computeDifficulty()`
 * (route-difficulty.service.ts) produce real, differentiated 1-3 values
 * instead of the flat "always 1" it degrades to with undefined inputs.
 *
 * Two distinct kinds of "write" happen here, deliberately treated
 * differently:
 *   1. DEM tile cache warming (Mapbox fetch → Firebase Storage) — this
 *      script performs this FOR REAL, unconditionally. It's new,
 *      additive infrastructure (a brand-new `dem-tiles/` Storage path)
 *      that touches zero existing production collections/behavior, and
 *      it's the ONLY way to produce a real, verifiable difficulty
 *      distribution rather than a stubbed dry-run report — see the run's
 *      final report for the exact tile count / cost this incurred.
 *   2. `official_routes` doc writes (elevationGain/maxGrade onto EXISTING
 *      production route docs) — strictly dry-run by default, gated behind
 *      --apply, same as every other backfill in this plan.
 *
 * TLV bbox: derived from the 27 routes' OWN path coordinates (+ a margin),
 * NOT a hardcoded municipal boundary — geo-discovery-routes.ts has no TLV
 * REGION entry at all (confirmed by inspection; it only has zichron/
 * ashkelon), so there's no existing bbox to reuse, and deriving from real
 * route geometry is both more precise and more cost-controlled (fetches
 * only the tiles that actually matter) than guessing an administrative
 * boundary.
 *
 * Usage:
 *   DRY RUN (default — warms the DEM cache for real, computes + PRINTS
 *   the elevation/difficulty for all 27 routes, writes NOTHING to
 *   official_routes):
 *     npx tsx scripts/populate-route-elevation-tlv.ts
 *
 *   LIVE RUN (also commits elevationGain/maxGrade to official_routes —
 *   requires explicit --apply):
 *     npx tsx scripts/populate-route-elevation-tlv.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY and NEXT_PUBLIC_MAPBOX_TOKEN set in .env.local
 *   - Run from the repo root so dotenv/.env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { warmDemTileCache, loadCachedTiles } from '../src/lib/dem-tile-cache/dem-tile-cache-admin.node';
import { computeDemProfile } from '../src/lib/dem-tile-cache/dem-sampling.service';
import { boundingBoxWithMargin } from '../src/lib/dem-tile-cache/tile-math';
import { computeDifficulty } from '../src/features/parks/core/services/route-difficulty.service';
import { buildValidatedDoc } from '../src/lib/route-collections';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const TLV_CITY = 'תל אביב-יפו';
const BBOX_MARGIN_METERS = 300; // covers bilinear-interpolation edge-neighbor needs

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id, storageBucket: 'appout-1.firebasestorage.app' });
}
const db = admin.firestore();
const storage = admin.storage();

interface RouteResult {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number | null;
  maxGradePercent: number | null;
  difficultyLevel: number | null;
  coverageGap: boolean;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Route Elevation Population — TLV only   [${mode.padEnd(8)}]      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — official_routes will NOT be written.');
    console.log('   (The DEM tile cache itself IS warmed for real in both modes — see header comment.)');
    console.log('   Run with --apply to write elevationGain/maxGrade to official_routes.\n');
  }

  const snap = await db.collection('official_routes').where('city', '==', TLV_CITY).get();
  console.log(`\n📊 ${snap.size} TLV official_routes doc(s) found.`);

  const routes = snap.docs
    .map((d) => {
      const data = d.data();
      const rawPath = data.path;
      if (!Array.isArray(rawPath) || rawPath.length < 2) return null;
      const pathLatLng: Array<[number, number]> = rawPath.map((p: any) => [Number(p.lat) || 0, Number(p.lng) || 0]);
      // Route.distance is stored in KILOMETERS already (verified against
      // every real write site — e.g. route-generator.service.ts's
      // `distance: parseFloat(totalDistanceKm.toFixed(1))` — never meters).
      return { id: d.id, name: data.name ?? '(no name)', distanceKm: Number(data.distance) || 0, pathLatLng, authorityId: data.authorityId, city: data.city };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (routes.length === 0) {
    console.log('\n(no routes with usable geometry — nothing to do)');
    return;
  }

  const allPoints = routes.flatMap((r) => r.pathLatLng.map(([lat, lng]) => ({ lat, lng })));
  const bbox = boundingBoxWithMargin(allPoints, BBOX_MARGIN_METERS);
  console.log(`\n📍 Derived TLV route bbox (from ${routes.length} routes' real geometry, +${BBOX_MARGIN_METERS}m margin):`);
  console.log(`   lat [${bbox.latMin.toFixed(4)}, ${bbox.latMax.toFixed(4)}]  lon [${bbox.lonMin.toFixed(4)}, ${bbox.lonMax.toFixed(4)}]`);

  console.log('\n🗺️  Warming DEM tile cache (Mapbox Terrain-RGB → Firebase Storage)...');
  const warmResult = await warmDemTileCache(storage, bbox);
  console.log(`   requested=${warmResult.requested}  alreadyCached=${warmResult.alreadyCached}  fetchedFromMapbox=${warmResult.fetchedFromMapbox}  failed=${warmResult.failed.length}`);
  if (warmResult.failed.length > 0) {
    for (const f of warmResult.failed) console.log(`   ⚠ failed tile z${f.tile.z}/${f.tile.x}/${f.tile.y}: ${f.error}`);
  }

  console.log('\n🔍 Loading cached tiles for sampling...');
  const tiles = await loadCachedTiles(storage, bbox);
  console.log(`   ${tiles.size} tile(s) loaded into sampling cache.`);

  const results: RouteResult[] = [];
  for (const r of routes) {
    const profile = computeDemProfile(r.pathLatLng, tiles);
    const distanceKm = r.distanceKm;
    if (!profile) {
      results.push({ id: r.id, name: r.name, distanceKm, elevationGainM: null, maxGradePercent: null, difficultyLevel: null, coverageGap: true });
      continue;
    }
    const difficulty = computeDifficulty(profile.elevationGainM, profile.maxGradePercent, distanceKm);
    results.push({
      id: r.id, name: r.name, distanceKm,
      elevationGainM: profile.elevationGainM, maxGradePercent: profile.maxGradePercent,
      difficultyLevel: difficulty.level, coverageGap: false,
    });
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PER-ROUTE RESULTS                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const r of results) {
    if (r.coverageGap) {
      console.log(`  [${r.id}] "${r.name}"  ⚠ DEM coverage gap — no tile data for this path`);
    } else {
      console.log(`  [${r.id}] "${r.name}"  gain=${r.elevationGainM}m  maxGrade=${r.maxGradePercent}%  distance=${r.distanceKm.toFixed(2)}km  → difficulty=${r.difficultyLevel}`);
    }
  }

  const withData = results.filter((r) => !r.coverageGap);
  const distribution = { 1: 0, 2: 0, 3: 0 };
  for (const r of withData) {
    if (r.difficultyLevel === 1) distribution[1]++;
    else if (r.difficultyLevel === 2) distribution[2]++;
    else if (r.difficultyLevel === 3) distribution[3]++;
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  DIFFICULTY DISTRIBUTION                                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Level 1 (easy):   ${distribution[1]} route(s)`);
  console.log(`  Level 2 (medium): ${distribution[2]} route(s)`);
  console.log(`  Level 3 (hard):   ${distribution[3]} route(s)`);
  console.log(`  Coverage gaps:    ${results.length - withData.length} route(s)`);

  if (isApply && withData.length > 0) {
    console.log('\n✍️  Applying elevationGain/maxGrade to official_routes...');
    const authoritySnap = await db.collection('authorities').get();
    const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));
    const CHUNK = 500;
    let applied = 0;
    for (let i = 0; i < withData.length; i += CHUNK) {
      const chunk = withData.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const r of chunk) {
        const routeMeta = routes.find((x) => x.id === r.id)!;
        const validated = buildValidatedDoc(
          'official_routes',
          { elevationGain: r.elevationGainM, maxGrade: r.maxGradePercent, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { mode: 'update', knownAuthorityIds, existing: { authorityId: routeMeta.authorityId, city: routeMeta.city } },
        );
        batch.update(db.collection('official_routes').doc(r.id), validated as Record<string, unknown>);
      }
      await batch.commit();
      applied += chunk.length;
      console.log(`  ✔ committed ${applied}/${withData.length}`);
    }
  } else if (!isApply) {
    console.log(`\n[dry-run] would apply elevationGain/maxGrade to ${withData.length} official_routes doc(s).`);
    console.log('   Run with --apply to write.');
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Routes processed:        ${String(results.length).padEnd(31)}║`);
  console.log(`║  Routes with real DEM data: ${String(withData.length).padEnd(29)}║`);
  console.log(`║  DEM tiles fetched (new):  ${String(warmResult.fetchedFromMapbox).padEnd(30)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
