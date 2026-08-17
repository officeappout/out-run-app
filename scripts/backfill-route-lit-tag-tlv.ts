/**
 * scripts/backfill-route-lit-tag-tlv.ts — Stage 5 quick win (route-enrichment-
 * pipeline plan, 17.08.2026): auto-suggest `night_lighting` (RouteFeatureTag)
 * from street_segments.tags.lit, already fetched/scored/stored by the OSM
 * importer — this script is the missing route-level rollup, not a new data
 * source. Uses the pure computeLitCoverage/shouldSuggestNightLighting
 * (route-comfort-tags.service.ts).
 *
 * TLV ONLY — matches the build-out arc (every layer proven on Tel Aviv
 * before any other city).
 *
 * Per route: samples up to 20 evenly-spaced path points (bounding query
 * count — a dense Mapbox-derived path can have 100+ raw vertices, sampling
 * keeps this a real "quick win," not a slow city-wide crawl). For each
 * sample point, a geohash-bounded query (same geofire-common pattern every
 * other proximity join in this plan uses) fetches nearby street_segments;
 * computeLitCoverage does the precise proximity+lit check. Routes already
 * carrying night_lighting are skipped (idempotent, no double-suggest).
 *
 * Usage:
 *   DRY RUN (default — no writes, prints every route's coverage + verdict):
 *     npx tsx scripts/backfill-route-lit-tag-tlv.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-route-lit-tag-tlv.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so relative imports + .env.local resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { geohashQueryBounds } from 'geofire-common';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const TLV_CITY = 'תל אביב-יפו';
const MAX_SAMPLES_PER_ROUTE = 20;
// Generous prefilter radius around each sample point — must exceed
// LIT_TAG_PROXIMITY_METERS (20m) by a wide margin, same "coarse box, precise
// check" reasoning as every other geohash join in this plan.
const SEGMENT_QUERY_RADIUS_METERS = 200;

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
}
const db = admin.firestore();

/** Evenly samples up to `max` points from a path, always including first+last. */
function sampleEvenly<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  night_lighting Auto-Suggest — TLV      [${mode.padEnd(8)}]  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after review).\n');
  }

  const { computeLitCoverage, shouldSuggestNightLighting, LIT_TAG_PROXIMITY_METERS, LIT_TAG_COVERAGE_THRESHOLD } =
    await import('../src/features/parks/core/services/route-comfort-tags.service');

  console.log(`📊 Fetching published official_routes (city="${TLV_CITY}")...`);
  const routesSnap = await db.collection('official_routes').where('city', '==', TLV_CITY).where('published', '==', true).get();
  console.log(`   ${routesSnap.size} published TLV route(s) total.`);

  const suggested: Array<{ id: string; name: string; coverage: number }> = [];
  let alreadyTagged = 0, noUsablePath = 0;

  for (const d of routesSnap.docs) {
    const data = d.data();
    if (Array.isArray(data.featureTags) && data.featureTags.includes('night_lighting')) {
      alreadyTagged++;
      continue;
    }
    const rawPath = data.path;
    if (!Array.isArray(rawPath) || rawPath.length < 2) { noUsablePath++; continue; }
    const fullPath: [number, number][] = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0]);
    const samplePath = sampleEvenly(fullPath, MAX_SAMPLES_PER_ROUTE);

    const candidatesPerPoint: Array<Array<{ id: string; path: [number, number][]; lit: boolean }>> = [];
    for (const [lng, lat] of samplePath) {
      const bounds = geohashQueryBounds([lat, lng], SEGMENT_QUERY_RADIUS_METERS);
      const seen = new Set<string>();
      const candidates: Array<{ id: string; path: [number, number][]; lit: boolean }> = [];
      for (const [start, end] of bounds) {
        const segSnap = await db.collection('street_segments').orderBy('geohash').startAt(start).endAt(end).get();
        for (const s of segSnap.docs) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          const seg = s.data();
          const rawSegPath = Array.isArray(seg.path) ? seg.path : null;
          const path: [number, number][] = rawSegPath
            ? rawSegPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0])
            : seg.midpoint ? [[Number(seg.midpoint.lng) || 0, Number(seg.midpoint.lat) || 0]] : [];
          if (path.length === 0) continue;
          candidates.push({ id: s.id, path, lit: seg.tags?.lit === 'yes' });
        }
      }
      candidatesPerPoint.push(candidates);
    }

    const coverage = computeLitCoverage(samplePath, candidatesPerPoint, LIT_TAG_PROXIMITY_METERS);
    if (shouldSuggestNightLighting(coverage, LIT_TAG_COVERAGE_THRESHOLD)) {
      suggested.push({ id: d.id, name: data.name, coverage });
    }
    console.log(`  [${d.id}] "${data.name}" — lit coverage ${(coverage * 100).toFixed(0)}% (${samplePath.length} samples)${coverage >= LIT_TAG_COVERAGE_THRESHOLD ? '  → SUGGEST night_lighting' : ''}`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ROUTES TO TAG — night_lighting                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (suggested.length === 0) {
    console.log('  (none found)');
  } else {
    for (const s of suggested) console.log(`  [${s.id}] "${s.name}"  coverage=${(s.coverage * 100).toFixed(0)}%`);
  }
  console.log(`\n(${alreadyTagged} route(s) already tagged, skipped. ${noUsablePath} route(s) had no usable path.)`);

  console.log(`\n${isApply ? 'Applying' : '[dry-run] would apply'} ${suggested.length} tag addition(s).`);

  if (isApply && suggested.length > 0) {
    const CHUNK = 500;
    let applied = 0;
    for (let i = 0; i < suggested.length; i += CHUNK) {
      const chunk = suggested.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const s of chunk) {
        batch.update(db.collection('official_routes').doc(s.id), {
          featureTags: admin.firestore.FieldValue.arrayUnion('night_lighting'),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      applied += chunk.length;
      console.log(`  ✔ committed ${applied}/${suggested.length}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Routes suggested:        ${String(suggested.length).padEnd(31)}║`);
  console.log(`║  Already tagged (skipped):${String(alreadyTagged).padEnd(31)}║`);
  console.log(`║  ${isApply ? 'Tagged this run:           ' + String(suggested.length).padEnd(31) : 'Run with --apply to tag' + ' '.padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
