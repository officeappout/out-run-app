/**
 * scripts/populate-street-segment-elevation.ts — 19.08.2026, full
 * city-mapping build.
 *
 * DEM-samples EVERY street_segments doc for a city (not just arterials —
 * verified cheap against an already-warmed tile cache, see this script's
 * own run report) and writes StreetSegment.demGradePercent (steepest local
 * grade %) + demElevationGainM (total ascent, meters), computed from
 * Mapbox Terrain-RGB via the same shared dem-tile-cache module
 * populate-route-elevation-tlv.ts already uses (warmDemTileCache /
 * loadCachedTiles / computeDemProfile — reused, not reimplemented).
 *
 * DELIBERATELY SEPARATE from the existing StreetSegment.inclinePct field
 * (parsed from OSM's `incline=*` tag by osm-segment-importer.ts) — see
 * demGradePercent's own doc comment (route-generator.service.ts) for why:
 * inclinePct is sparse (confirmed live: 0/11,180 real segments have it,
 * since most OSM ways carry no incline tag at all) while demGradePercent
 * is computed for every segment with usable path geometry, regardless of
 * OSM tagging — a fundamentally different provenance kept in a separate
 * field on purpose, not merged into inclinePct.
 *
 * Data capture only. Generator wiring (e.g. preferring flatter segments)
 * is explicitly a separate future step — not built here.
 *
 * Two distinct kinds of "write" happen here, same split as
 * populate-route-elevation-tlv.ts:
 *   1. DEM tile cache warming — performed for real, unconditionally (new
 *      additive Storage path, touches zero existing collections/behavior;
 *      the only way to produce a real, verifiable coverage report rather
 *      than a stubbed dry-run).
 *   2. street_segments doc writes (demGradePercent/demElevationGainM onto
 *      EXISTING production docs) — strictly dry-run by default, gated
 *      behind --apply.
 *
 * Usage:
 *   DRY RUN (default — warms the DEM cache for real, computes + PRINTS
 *   coverage for every segment, writes NOTHING to street_segments):
 *     npx tsx scripts/populate-street-segment-elevation.ts --city חיפה
 *
 *   LIVE RUN (also commits demGradePercent/demElevationGainM to
 *   street_segments — requires explicit --apply):
 *     npx tsx scripts/populate-street-segment-elevation.ts --city חיפה --apply
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
import { buildValidatedDoc } from '../src/lib/route-collections';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const CITY = getArg('--city') ?? 'תל אביב-יפו';
const BBOX_MARGIN_METERS = 300; // covers bilinear-interpolation edge-neighbor needs, same as populate-route-elevation-tlv.ts

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

interface SegmentResult {
  id: string;
  demGradePercent: number | null;
  demElevationGainM: number | null;
  coverageGap: boolean;
  gapReason?: string;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Street-Segment Elevation Population    [${mode.padEnd(8)}]      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  City: ${CITY}`);

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — street_segments will NOT be written.');
    console.log('   (The DEM tile cache itself IS warmed for real in both modes — see header comment.)');
    console.log('   Run with --apply to write demGradePercent/demElevationGainM to street_segments.\n');
  }

  const snap = await db.collection('street_segments').where('cityName', '==', CITY).get();
  console.log(`\n📊 ${snap.size} ${CITY} street_segments doc(s) found.`);

  const segments = snap.docs
    .map((d) => {
      const data = d.data();
      const rawPath = data.path;
      let pathLatLng: Array<[number, number]> | null = null;
      if (Array.isArray(rawPath) && rawPath.length >= 2) {
        pathLatLng = rawPath.map((p: any) => [Number(p.lat) || 0, Number(p.lng) || 0]);
      }
      return { id: d.id, pathLatLng, authorityId: data.authorityId, cityName: data.cityName };
    });

  if (segments.length === 0) {
    console.log('\n(no segments found — nothing to do)');
    return;
  }

  const noPathCount = segments.filter((s) => !s.pathLatLng).length;
  const withPath = segments.filter((s): s is typeof segments[number] & { pathLatLng: Array<[number, number]> } => s.pathLatLng !== null);
  console.log(`   ${withPath.length} with usable multi-point path, ${noPathCount} without (midpoint-only or legacy — can't DEM-profile a single point).`);

  if (withPath.length === 0) {
    console.log('\n(no segments with usable path geometry — nothing to do)');
    return;
  }

  const allPoints = withPath.flatMap((s) => s.pathLatLng.map(([lat, lng]) => ({ lat, lng })));
  const bbox = boundingBoxWithMargin(allPoints, BBOX_MARGIN_METERS);
  console.log(`\n📍 Derived ${CITY} segment bbox (from ${withPath.length} segments' real geometry, +${BBOX_MARGIN_METERS}m margin):`);
  console.log(`   lat [${bbox.latMin.toFixed(4)}, ${bbox.latMax.toFixed(4)}]  lon [${bbox.lonMin.toFixed(4)}, ${bbox.lonMax.toFixed(4)}]`);

  console.log('\n🗺️  Warming DEM tile cache (Mapbox Terrain-RGB → Firebase Storage)...');
  const startWarm = Date.now();
  const warmResult = await warmDemTileCache(storage, bbox);
  console.log(`   requested=${warmResult.requested}  alreadyCached=${warmResult.alreadyCached}  fetchedFromMapbox=${warmResult.fetchedFromMapbox}  failed=${warmResult.failed.length}  (${((Date.now() - startWarm) / 1000).toFixed(1)}s)`);
  if (warmResult.failed.length > 0) {
    for (const f of warmResult.failed) console.log(`   ⚠ failed tile z${f.tile.z}/${f.tile.x}/${f.tile.y}: ${f.error}`);
  }

  console.log('\n🔍 Loading cached tiles for sampling...');
  const tiles = await loadCachedTiles(storage, bbox);
  console.log(`   ${tiles.size} tile(s) loaded into sampling cache.`);

  const startSample = Date.now();
  const results: SegmentResult[] = [];
  for (const s of withPath) {
    const profile = computeDemProfile(s.pathLatLng, tiles);
    if (!profile) {
      results.push({ id: s.id, demGradePercent: null, demElevationGainM: null, coverageGap: true, gapReason: 'DEM tile coverage gap' });
      continue;
    }
    results.push({ id: s.id, demGradePercent: profile.maxGradePercent, demElevationGainM: profile.elevationGainM, coverageGap: false });
  }
  const sampleDurationMs = Date.now() - startSample;

  const withData = results.filter((r) => !r.coverageGap);
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  COVERAGE SUMMARY                                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Total segments (this city):        ${segments.length}`);
  console.log(`  No usable path geometry:            ${noPathCount}`);
  console.log(`  Usable path, DEM coverage gap:       ${results.length - withData.length}`);
  console.log(`  DEM-graded successfully:            ${withData.length}`);
  console.log(`  Coverage: ${((withData.length / segments.length) * 100).toFixed(1)}% of all segments, ${((withData.length / withPath.length) * 100).toFixed(1)}% of segments with usable path`);
  console.log(`  Sampling time: ${(sampleDurationMs / 1000).toFixed(2)}s for ${withPath.length} segments (${(sampleDurationMs / Math.max(1, withPath.length)).toFixed(2)}ms/segment — cache-hit sampling, no new Mapbox calls)`);

  if (withData.length > 0) {
    const grades = withData.map((r) => r.demGradePercent!).sort((a, b) => a - b);
    const median = grades[Math.floor(grades.length / 2)];
    const p90 = grades[Math.floor(grades.length * 0.9)];
    console.log(`  Grade distribution: median=${median.toFixed(1)}%  p90=${p90.toFixed(1)}%  max=${grades[grades.length - 1].toFixed(1)}%`);
    console.log('\n  sample (first 5):');
    for (const r of withData.slice(0, 5)) console.log(`    [${r.id}]  grade=${r.demGradePercent}%  gain=${r.demElevationGainM}m`);
  }

  if (isApply && withData.length > 0) {
    console.log('\n✍️  Applying demGradePercent/demElevationGainM to street_segments...');
    const authoritySnap = await db.collection('authorities').get();
    const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));
    const CHUNK = 500;
    let applied = 0;
    for (let i = 0; i < withData.length; i += CHUNK) {
      const chunk = withData.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const r of chunk) {
        const segMeta = segments.find((x) => x.id === r.id)!;
        const validated = buildValidatedDoc(
          'street_segments',
          { demGradePercent: r.demGradePercent, demElevationGainM: r.demElevationGainM, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { mode: 'update', knownAuthorityIds, existing: { authorityId: segMeta.authorityId, cityName: segMeta.cityName } },
        );
        batch.update(db.collection('street_segments').doc(r.id), validated as Record<string, unknown>);
      }
      await batch.commit();
      applied += chunk.length;
      console.log(`  ✔ committed ${applied}/${withData.length}`);
    }
  } else if (!isApply) {
    console.log(`\n[dry-run] would apply demGradePercent/demElevationGainM to ${withData.length} street_segments doc(s).`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
