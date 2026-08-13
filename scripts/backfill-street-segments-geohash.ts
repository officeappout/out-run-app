/**
 * street_segments → geohash Backfill
 *
 * Adds a `geohash` field (geofire-common's geohashForLocation, computed
 * from each doc's existing `midpoint.{lat,lng}`) to every street_segments
 * document that doesn't already have one. Required before
 * route-generator.service.ts's fetchScoredWaypointsByProximity
 * (IS_PROXIMITY_SEGMENT_QUERY_ENABLED) can find ANY existing segment — the
 * geohash bounding-box query is blind to docs without this field.
 *
 * Idempotent: docs that already carry a geohash are skipped, so re-running
 * is always safe and cheap.
 *
 * All THREE street_segments writers (osm-segment-importer.ts's
 * commitSegmentsToFirestore, src/scripts/import-osm-segments.ts's
 * buildSegmentFields, official-route-broadcaster.ts's buildSegmentDoc)
 * already write geohash on every NEW doc as of this same change — this
 * script only needs to run ONCE, covering docs written before that.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints the live collection count +
 *   planned-write delta):
 *     npx tsx scripts/backfill-street-segments-geohash.ts
 *
 *   LIVE RUN (commits changes):
 *     npx tsx scripts/backfill-street-segments-geohash.ts --commit
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local (same as other scripts)
 *   - firebase-admin + dotenv + geofire-common installed
 *   - Run from the repo root so .env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';

// ── Config ────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;
const SAMPLE_LIMIT = 10;

const isCommit = process.argv.includes('--commit');
const mode = isCommit ? 'COMMIT' : 'DRY-RUN';

// ── Init Admin SDK ────────────────────────────────────────────────────

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
const db = admin.firestore();

// ── Batch Writer (same shape as scripts/backfill-park-neighborhoods.ts) ──

class BatchWriter {
  private batch = db.batch();
  private count = 0;
  private totalWrites = 0;

  async update(ref: admin.firestore.DocumentReference, data: Record<string, unknown>) {
    if (isCommit) {
      this.batch.update(ref, data);
      this.count++;
      if (this.count >= BATCH_SIZE) await this.flush();
    }
    this.totalWrites++;
  }

  async flush() {
    if (this.count > 0 && isCommit) {
      await this.batch.commit();
      console.log(`   ✓ flushed batch (${this.count} writes)`);
      this.batch = db.batch();
      this.count = 0;
    }
  }

  get total() { return this.totalWrites; }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  street_segments → geohash Backfill   [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isCommit) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --commit to apply changes.\n');
  }

  // 1. Live count FIRST — sizes the actual scope instead of trusting the
  //    scattered-comment inference (~8-12k for Tel Aviv alone).
  console.log('📊 Counting street_segments (live)...');
  const countSnap = await db.collection('street_segments').count().get();
  const totalDocs = countSnap.data().count;
  console.log(`   ${totalDocs} total document(s) in street_segments.\n`);

  // 2. Scan + backfill
  console.log('🌍 Scanning street_segments...');
  const snap = await db.collection('street_segments').get();

  const stats = {
    total: snap.size,
    alreadyHasGeohash: 0,
    migrated: 0,
    missingMidpoint: 0,
    invalidMidpoint: 0,
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

    const midpoint = d.midpoint;
    if (!midpoint || typeof midpoint !== 'object') {
      stats.missingMidpoint++;
      if (skippedSamples.length < SAMPLE_LIMIT) {
        skippedSamples.push(`${doc.id}: no midpoint field`);
      }
      continue;
    }

    const lat = midpoint.lat;
    const lng = midpoint.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      stats.invalidMidpoint++;
      if (skippedSamples.length < SAMPLE_LIMIT) {
        skippedSamples.push(`${doc.id}: invalid midpoint (${JSON.stringify(midpoint)})`);
      }
      continue;
    }

    const geohash = geohashForLocation([lat, lng]);
    await writer.update(doc.ref, { geohash });
    stats.migrated++;
    if (migratedSamples.length < SAMPLE_LIMIT) {
      migratedSamples.push(`${doc.id}: cityName=${JSON.stringify(d.cityName)} → geohash=${geohash}`);
    }
  }

  await writer.flush();

  // 3. Report
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              GEOHASH BACKFILL REPORT                    ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                       ${mode.padEnd(27)}║`);
  console.log(`║  Live collection count:      ${String(totalDocs).padEnd(27)}║`);
  console.log(`║  Scanned:                    ${String(stats.total).padEnd(27)}║`);
  console.log(`║  Already had geohash:        ${String(stats.alreadyHasGeohash).padEnd(27)}║`);
  console.log(`║  Migrated (planned writes):  ${String(stats.migrated).padEnd(27)}║`);
  console.log(`║  Missing midpoint (skipped): ${String(stats.missingMidpoint).padEnd(27)}║`);
  console.log(`║  Invalid midpoint (skipped): ${String(stats.invalidMidpoint).padEnd(27)}║`);
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

  if (!isCommit) {
    console.log('\n✅ Dry run complete. Review the report above.');
    console.log('   To apply changes, run:');
    console.log('   npx tsx scripts/backfill-street-segments-geohash.ts --commit\n');
  } else {
    console.log('\n✅ Backfill committed successfully!\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
