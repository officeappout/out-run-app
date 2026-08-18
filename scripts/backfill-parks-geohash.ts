/**
 * parks → geohash Backfill
 *
 * Adds a `geohash` field (geofire-common's geohashForLocation, computed
 * from each doc's `location.{lat,lng}`, falling back to the deprecated
 * top-level `lat`/`lng` fields for older docs — park.types.ts:250-251) to
 * every `parks` document that doesn't already have one.
 *
 * Prerequisite for the garden-dedup gate (route-enrichment-pipeline plan,
 * Stage 5, 17.08.2026): matching a new OSM-sourced point (bench, fitness
 * station, etc.) against the ~1000 existing curated gardens needs a
 * geohash-bounded proximity query — `parks` has never had a geohash field
 * at all (confirmed via grep before writing this script — only
 * climb_segments/street_segments/route_adjacency carry one today). This
 * script is what makes that query possible; the actual point-vs-point
 * radius-match function is a separate, pure module
 * (garden-dedup.service.ts) that consumes this field once it exists.
 *
 * Idempotent: docs that already carry a geohash are skipped, so re-running
 * is always safe and cheap. Same BatchWriter/report shape as
 * backfill-street-segments-geohash.ts — established convention, not
 * reinvented here.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints the live collection count +
 *   planned-write delta):
 *     npx tsx scripts/backfill-parks-geohash.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-parks-geohash.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so .env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';

const BATCH_SIZE = 400;
const SAMPLE_LIMIT = 10;

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

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

class BatchWriter {
  private batch = db.batch();
  private count = 0;
  private totalWrites = 0;

  async update(ref: admin.firestore.DocumentReference, data: Record<string, unknown>) {
    if (isApply) {
      this.batch.update(ref, data);
      this.count++;
      if (this.count >= BATCH_SIZE) await this.flush();
    }
    this.totalWrites++;
  }

  async flush() {
    if (this.count > 0 && isApply) {
      await this.batch.commit();
      console.log(`   ✓ flushed batch (${this.count} writes)`);
      this.batch = db.batch();
      this.count = 0;
    }
  }

  get total() { return this.totalWrites; }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  parks → geohash Backfill              [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after review).\n');
  }

  console.log('📊 Counting parks (live)...');
  const countSnap = await db.collection('parks').count().get();
  const totalDocs = countSnap.data().count;
  console.log(`   ${totalDocs} total document(s) in parks.\n`);

  console.log('🌍 Scanning parks...');
  const snap = await db.collection('parks').get();

  const stats = {
    total: snap.size,
    alreadyHasGeohash: 0,
    migrated: 0,
    missingLocation: 0,
    invalidLocation: 0,
  };
  const migratedSamples: string[] = [];
  const skippedSamples: string[] = [];

  const writer = new BatchWriter();

  for (const doc of snap.docs) {
    const d = doc.data();

    if (typeof d.geohash === 'string' && d.geohash.length > 0) {
      stats.alreadyHasGeohash++;
      continue;
    }

    // location.{lat,lng} preferred; deprecated top-level lat/lng as fallback
    // for older docs (park.types.ts:250-251).
    const lat = d.location?.lat ?? d.lat;
    const lng = d.location?.lng ?? d.lng;

    if (lat == null || lng == null) {
      stats.missingLocation++;
      if (skippedSamples.length < SAMPLE_LIMIT) {
        skippedSamples.push(`${doc.id}: no location field (name="${d.name ?? ''}")`);
      }
      continue;
    }
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      stats.invalidLocation++;
      if (skippedSamples.length < SAMPLE_LIMIT) {
        skippedSamples.push(`${doc.id}: invalid location (${JSON.stringify({ lat, lng })})`);
      }
      continue;
    }

    const geohash = geohashForLocation([lat, lng]);
    await writer.update(doc.ref, { geohash });
    stats.migrated++;
    if (migratedSamples.length < SAMPLE_LIMIT) {
      migratedSamples.push(`${doc.id}: name="${d.name ?? ''}" → geohash=${geohash}`);
    }
  }

  await writer.flush();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              GEOHASH BACKFILL REPORT                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                       ${mode.padEnd(27)}║`);
  console.log(`║  Live collection count:      ${String(totalDocs).padEnd(27)}║`);
  console.log(`║  Scanned:                    ${String(stats.total).padEnd(27)}║`);
  console.log(`║  Already had geohash:        ${String(stats.alreadyHasGeohash).padEnd(27)}║`);
  console.log(`║  Migrated (planned writes):  ${String(stats.migrated).padEnd(27)}║`);
  console.log(`║  Missing location (skipped): ${String(stats.missingLocation).padEnd(27)}║`);
  console.log(`║  Invalid location (skipped): ${String(stats.invalidLocation).padEnd(27)}║`);
  console.log(`║  Actual writes:              ${String(writer.total).padEnd(27)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (migratedSamples.length > 0) {
    console.log(`\n🔧 Migration samples (first ${migratedSamples.length}):`);
    migratedSamples.forEach((s) => console.log(`   • ${s}`));
  }
  if (skippedSamples.length > 0) {
    console.log(`\n⚠️  Skipped samples (first ${skippedSamples.length}):`);
    skippedSamples.forEach((s) => console.log(`   • ${s}`));
  }

  if (!isApply) {
    console.log('\n✅ Dry run complete. Review the report above.');
    console.log('   To apply changes, run:');
    console.log('   npx tsx scripts/backfill-parks-geohash.ts --apply\n');
  } else {
    console.log('\n✅ Backfill committed successfully!\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
