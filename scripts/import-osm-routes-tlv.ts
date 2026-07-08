/**
 * scripts/import-osm-routes-tlv.ts
 *
 * PILOT — writes the pre-enriched Tel Aviv walking/running routes
 * (produced by the OSM discovery+enrichment probe, /tmp/tlv_routes_final.json)
 * into the `official_routes` Firestore collection as status:'pending'.
 *
 * - Path is stored as {lng,lat} objects (matches inventory.service.ts saveRoutes).
 * - Idempotent: keyed on source.externalId — re-runs UPDATE, never duplicate.
 * - Does NOT broadcast to street_segments (pending routes must not enter the
 *   live generator before David approves them in the panel).
 *
 * Usage:
 *   npx tsx scripts/import-osm-routes-tlv.ts --dry-run   # print, no write
 *   npx tsx scripts/import-osm-routes-tlv.ts             # write pending docs
 *   npx tsx scripts/import-osm-routes-tlv.ts --delete    # remove this batch
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';

const DRY = process.argv.includes('--dry-run');
const DELETE = process.argv.includes('--delete');
const JSON_PATH = '/tmp/tlv_routes_final.json';
const BATCH_ID = 'tlv-pilot-2026-07-07';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();
  const col = db.collection('official_routes');

  if (DELETE) {
    const snap = await col.where('importBatchId', '==', BATCH_ID).get();
    console.log(`Deleting ${snap.size} routes from batch ${BATCH_ID} ...`);
    for (const d of snap.docs) await d.ref.delete();
    console.log('✅ deleted');
    return;
  }

  const routes = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as any[];
  console.log(`Loaded ${routes.length} enriched routes from ${JSON_PATH}`);

  let created = 0, updated = 0;
  for (const r of routes) {
    // strip probe-debug keys
    const { _segs, _hw, _maxgap, path, ...rest } = r;
    const transformedPath = (path as [number, number][]).map(p => ({ lng: p[0], lat: p[1] }));

    const doc: any = {
      ...rest,
      path: transformedPath,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // idempotent upsert by source.externalId
    const existing = await col.where('source.externalId', '==', r.source.externalId).limit(1).get();

    if (DRY) {
      console.log(`  [dry] ${existing.empty ? 'CREATE' : 'UPDATE'} ${r.distance}m ${r.name} (${r.features.environment}, gain ${r.elevationGain}m)`);
      continue;
    }

    if (existing.empty) {
      doc.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await col.add(doc);
      created++;
    } else {
      await existing.docs[0].ref.set(doc, { merge: true });
      updated++;
    }
    console.log(`  ${existing.empty ? '➕' : '♻️'} ${r.distance}m  ${r.name}`);
  }

  if (!DRY) console.log(`\n✅ official_routes: ${created} created, ${updated} updated. All status:'pending'. (no street_segments broadcast)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
