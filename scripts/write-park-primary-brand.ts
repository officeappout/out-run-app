/**
 * Write park.primaryBrand from the authoritative OUT_park_primaryBrand.csv manifest.
 *
 * Source: CSV derived from companyid of original installation (8=Urbanics, 9=Ludos).
 * 543 Urbanics (incl. 15 ties defaulted to Urbanics), 39 Ludos = 582 total CSV entries.
 *
 * Match key: park.externalSourceId === String(old_parkid).
 * Only parks with importedFrom === 'csv_bulk_import' use the manifest.
 * Parks without externalSourceId (~3, added post-export) → majority of current brandNames.
 *
 * Usage:
 *   npx tsx scripts/write-park-primary-brand.ts            # dry-run (default)
 *   npx tsx scripts/write-park-primary-brand.ts --write    # apply to Firestore
 *
 * Output: scripts/corpus/write-primary-brand-report.json
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const c = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
    return;
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'appout-1' });
}

// ── Manifest — Ludos old_parkids extracted from OUT_park_primaryBrand.csv ──────
// All other CSV-imported parks (importedFrom=csv_bulk_import) default to Urbanics.
// Verified count: 39 parks. Source: companyid 9 = Ludos dominant.
const LUDOS_OLD_PARK_IDS = new Set([
  '95',   '130',  '269',  '595',  '605',  '622',  '625',  '626',
  '628',  '632',  '635',  '636',  '645',  '658',  '671',  '677',
  '683',  '688',  '690',  '698',  '707',  '708',  '883',  '958',
  '990',  '1012', '1025', '1069', '1112', '1114', '1115', '1120',
  '1197', '1217', '1254', '1261', '1311', '1315', '1333',
]);

/** For a non-CSV park, infer primaryBrand from majority of gymEquipment[].brandName */
function majorityBrand(gymEquipment: any[]): string | null {
  const counts: Record<string, number> = {};
  for (const eq of gymEquipment) {
    const b = eq.brandName ?? '';
    if (b) counts[b] = (counts[b] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? null;
}

async function main() {
  const isDryRun = !process.argv.includes('--write');
  initFirebase();
  const db = admin.firestore();

  console.log(`\n=== write-park-primary-brand — ${isDryRun ? 'DRY RUN' : 'WRITE MODE'} ===\n`);

  const parksSnap = await db.collection('parks').get();
  console.log(`Loaded ${parksSnap.size} parks.\n`);

  interface ParkUpdate {
    docId: string;
    parkName: string;
    city: string;
    externalSourceId: string | null;
    source: 'manifest-urbanics' | 'manifest-ludos' | 'fallback-majority' | 'fallback-no-equipment';
    primaryBrand: string;
  }

  const updates: ParkUpdate[] = [];
  let skipped = 0; // parks with no equipment and not imported

  for (const d of parksSnap.docs) {
    const data = d.data() as any;
    const gymEquipment: any[] = Array.isArray(data.gymEquipment) ? data.gymEquipment : [];
    const extId: string | null = data.externalSourceId ? String(data.externalSourceId) : null;
    const isImported = data.importedFrom === 'csv_bulk_import';
    const parkName = typeof data.name === 'string' ? data.name : (data.name?.he ?? d.id);

    let primaryBrand: string | null = null;
    let source: ParkUpdate['source'];

    if (isImported && extId) {
      // Source of truth: manifest
      if (LUDOS_OLD_PARK_IDS.has(extId)) {
        primaryBrand = 'Ludos';
        source = 'manifest-ludos';
      } else {
        primaryBrand = 'Urbanics';
        source = 'manifest-urbanics';
      }
    } else if (gymEquipment.length > 0) {
      // Post-export or manually-added park → fallback to majority
      primaryBrand = majorityBrand(gymEquipment);
      source = 'fallback-majority';
    } else {
      // No equipment, no manifest → skip
      skipped++;
      continue;
    }

    if (!primaryBrand) { skipped++; continue; }

    updates.push({
      docId: d.id,
      parkName,
      city: data.city ?? '',
      externalSourceId: extId,
      source,
      primaryBrand,
    });
  }

  // ── Tally ───────────────────────────────────────────────────────────────────
  const manifestUrbanics = updates.filter((u) => u.source === 'manifest-urbanics').length;
  const manifestLudos    = updates.filter((u) => u.source === 'manifest-ludos').length;
  const fallback         = updates.filter((u) => u.source.startsWith('fallback')).length;
  const fallbackDetail   = updates.filter((u) => u.source.startsWith('fallback'));

  console.log('── SUMMARY ──────────────────────────────────────────────────────');
  console.log(`  From manifest → Urbanics: ${manifestUrbanics}`);
  console.log(`  From manifest → Ludos:    ${manifestLudos}`);
  console.log(`  Fallback (no manifest):   ${fallback}`);
  console.log(`  Skipped (no equipment):   ${skipped}`);
  console.log(`  Total to write:           ${updates.length}`);
  console.log('─────────────────────────────────────────────────────────────────\n');

  if (fallbackDetail.length) {
    console.log('── FALLBACK PARKS (not in manifest) ────────────────────────────');
    fallbackDetail.forEach((u) => {
      console.log(`  [${u.docId}] ${u.parkName} (${u.city}) → ${u.primaryBrand} (extId: ${u.externalSourceId ?? 'none'})`);
    });
    console.log();
  }

  const ludosParks = updates.filter((u) => u.source === 'manifest-ludos');
  if (ludosParks.length) {
    console.log('── MANIFEST LUDOS PARKS (39 expected) ──────────────────────────');
    ludosParks.forEach((u) => {
      console.log(`  extId ${u.externalSourceId?.padEnd(5)} [${u.docId}] ${u.parkName} (${u.city})`);
    });
    console.log();
  }

  // ── Write ───────────────────────────────────────────────────────────────────
  if (!isDryRun) {
    console.log(`── WRITING ${updates.length} parks in batches of 200...`);
    const BATCH_SIZE = 200;
    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const slice = updates.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const u of slice) {
        batch.update(db.collection('parks').doc(u.docId), {
          primaryBrand: u.primaryBrand,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      written += slice.length;
      console.log(`  ${written}/${updates.length} written`);
    }
    console.log(`  Done.\n`);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const corpusDir = path.join(process.cwd(), 'scripts', 'corpus');
  if (!fs.existsSync(corpusDir)) fs.mkdirSync(corpusDir, { recursive: true });
  const outPath = path.join(corpusDir, 'write-primary-brand-report.json');

  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'write',
    summary: { manifestUrbanics, manifestLudos, fallback, skipped, total: updates.length },
    fallbackParks: fallbackDetail,
    ludosParks: ludosParks.map((u) => ({ extId: u.externalSourceId, docId: u.docId, name: u.parkName, city: u.city })),
  }, null, 2));

  console.log(`Report → ${outPath}`);
  console.log(isDryRun
    ? '\nNo writes made. Review and re-run with --write to apply.'
    : '\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
