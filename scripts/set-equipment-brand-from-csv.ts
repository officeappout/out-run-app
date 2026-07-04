/**
 * set-equipment-brand-from-csv.ts
 *
 * Sets park.gymEquipment[].brandName from the authoritative per-equipment CSV.
 *
 * Source:  scripts/corpus/park-equipment-brand.csv
 * Columns: old_parkid,equipmentid,brand   (header row optional)
 *
 * Mapping:
 *   park.externalSourceId        = old_parkid  (string)
 *   gym_equipment.externalSourceId = equipmentid (string of numeric legacy type-id)
 *   park.gymEquipment[].equipmentId = gym_equipment Firestore docId
 *
 * Logic per equipment item in a park:
 *   1. Resolve gym_equipment.externalSourceId via the docId lookup map.
 *   2. Look up (park.externalSourceId, gym_equipment.externalSourceId) in the CSV map.
 *   3. If found → use CSV brand.
 *   4. If NOT found (equipment added post-export) → use park.primaryBrand.
 *   5. If park has no externalSourceId (manually added park) → use park.primaryBrand.
 *
 * Validation target (dry-run):
 *   park externalSourceId=737 (גן כושר החשמל)
 *   Expected: 16 × Urbanics + 1 × Ludos (CSV equipmentid 59 = TRX / straps)
 *
 * Usage:
 *   npx tsx scripts/set-equipment-brand-from-csv.ts           # dry-run (default)
 *   npx tsx scripts/set-equipment-brand-from-csv.ts --write   # apply to Firestore
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';

// ── Firebase init ─────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface GymEquipmentItem {
  equipmentId: string;
  brandName?: string;
  [key: string]: unknown;
}

interface EquipmentChange {
  equipmentId: string;         // gym_equipment Firestore docId
  gymExtId: string;            // gym_equipment.externalSourceId (legacy numeric type id)
  csvKey: string;              // "parkExtId:gymExtId" looked up in CSV map
  oldBrand: string;
  newBrand: string;
  source: 'csv' | 'primaryBrand-fallback' | 'primaryBrand-no-extId';
}

interface ParkUpdate {
  docId: string;
  parkName: string;
  parkExtId: string;
  totalItems: number;
  changes: EquipmentChange[];
  newGymEquipment: GymEquipmentItem[];
}

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * Returns Map: "${old_parkid}:${equipmentid}" → brand
 * Handles: comma-separated or pipe-separated, with or without header row.
 */
function parseCsv(csvPath: string): Map<string, string> {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const map = new Map<string, string>();

  const SEP = raw.includes('|') ? '|' : ',';

  for (const line of lines) {
    const parts = line.split(SEP).map((p) => p.trim());
    if (parts.length < 3) continue;
    const [col0, col1, col2] = parts;
    // Skip header row
    if (col0.toLowerCase() === 'old_parkid' || col0.toLowerCase() === 'parkid') continue;
    const oldParkId  = col0;
    const equipmentId = col1;
    const brand      = col2;
    if (!oldParkId || !equipmentId || !brand) continue;
    const key = `${oldParkId}:${equipmentId}`;
    map.set(key, brand);
  }
  return map;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = !process.argv.includes('--write');
  initFirebase();
  const db = admin.firestore();

  console.log(`\n=== set-equipment-brand-from-csv — ${isDryRun ? 'DRY RUN' : 'WRITE MODE'} ===\n`);

  // 1. Load CSV
  const csvPath = path.join(process.cwd(), 'scripts', 'corpus', 'OUT_park_equipment_brand.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }
  const csvMap = parseCsv(csvPath);
  console.log(`Loaded ${csvMap.size} equipment-brand entries from CSV.`);

  // 2. Load gym_equipment → build docId↔externalSourceId maps
  console.log('Loading gym_equipment collection...');
  const gymSnap = await db.collection('gym_equipment').get();
  const docIdToExtId = new Map<string, string>(); // docId → externalSourceId
  let gymWithExtId = 0;
  for (const d of gymSnap.docs) {
    const extId = d.data().externalSourceId;
    if (extId != null) {
      docIdToExtId.set(d.id, String(extId));
      gymWithExtId++;
    }
  }
  console.log(`gym_equipment: ${gymSnap.size} docs total, ${gymWithExtId} with externalSourceId.\n`);

  if (gymWithExtId === 0) {
    console.error('ERROR: No gym_equipment docs have externalSourceId — cannot build equipment mapping.');
    console.error('Check that gym_equipment docs were imported with externalSourceId set.');
    process.exit(1);
  }

  // 3. Process parks
  console.log('Loading parks...');
  const parksSnap = await db.collection('parks').get();
  console.log(`Loaded ${parksSnap.size} parks.\n`);

  const updates: ParkUpdate[] = [];
  let noChangeCount = 0;
  let noEquipmentCount = 0;

  // For park 737 validation — capture even if no changes
  let park737Summary: { parkExtId: string; items: Array<{ gymExtId: string; brand: string; source: string }> } | null = null;

  for (const d of parksSnap.docs) {
    const data = d.data() as any;
    const gymEquipment: GymEquipmentItem[] = Array.isArray(data.gymEquipment) ? data.gymEquipment : [];

    if (!gymEquipment.length) {
      noEquipmentCount++;
      continue;
    }

    const parkExtId: string | null = data.externalSourceId ? String(data.externalSourceId) : null;
    const primaryBrand: string     = data.primaryBrand ?? 'Urbanics';
    const parkName: string         = typeof data.name === 'string'
      ? data.name
      : (data.name?.he ?? d.id);

    const changes: EquipmentChange[] = [];
    const parkItemSummary: Array<{ gymExtId: string; brand: string; source: string }> = [];

    const newGymEquipment: GymEquipmentItem[] = gymEquipment.map((eq) => {
      const equipDocId  = eq.equipmentId ?? '';
      const gymExtId    = docIdToExtId.get(equipDocId) ?? null;
      const oldBrand    = eq.brandName ?? '';

      let newBrand: string;
      let source: EquipmentChange['source'];

      if (parkExtId && gymExtId) {
        const csvKey  = `${parkExtId}:${gymExtId}`;
        const csvBrand = csvMap.get(csvKey);
        if (csvBrand) {
          newBrand = csvBrand;
          source   = 'csv';
        } else {
          // Equipment installed after the CSV export
          newBrand = primaryBrand;
          source   = 'primaryBrand-fallback';
        }
      } else {
        // Park added manually (no externalSourceId) or gym_equipment without extId
        newBrand = primaryBrand;
        source   = 'primaryBrand-no-extId';
      }

      if (parkExtId === '737') {
        parkItemSummary.push({ gymExtId: gymExtId ?? '?', brand: newBrand, source });
      }

      if (newBrand !== oldBrand) {
        changes.push({
          equipmentId: equipDocId,
          gymExtId:    gymExtId ?? '?',
          csvKey:      parkExtId && gymExtId ? `${parkExtId}:${gymExtId}` : '?',
          oldBrand,
          newBrand,
          source,
        });
      }

      return { ...eq, brandName: newBrand };
    });

    if (parkExtId === '737') {
      park737Summary = { parkExtId: '737', items: parkItemSummary };
    }

    if (changes.length > 0) {
      updates.push({ docId: d.id, parkName, parkExtId: parkExtId ?? '', totalItems: gymEquipment.length, changes, newGymEquipment });
    } else {
      noChangeCount++;
    }
  }

  // ── Park 737 validation ───────────────────────────────────────────────────
  console.log('── VALIDATION: Park 737 (גן כושר החשמל) ────────────────────────────');
  if (!park737Summary) {
    console.log('  ⚠️  Park with externalSourceId=737 NOT FOUND in Firestore.');
  } else {
    const u737 = updates.find((u) => u.parkExtId === '737');
    const urbanicsCount = park737Summary.items.filter((i) => i.brand === 'Urbanics').length;
    const ludosCount    = park737Summary.items.filter((i) => i.brand === 'Ludos').length;
    const otherCount    = park737Summary.items.filter((i) => i.brand !== 'Urbanics' && i.brand !== 'Ludos').length;

    const pass = urbanicsCount === 16 && ludosCount === 1 && otherCount === 0;
    console.log(`  Total items : ${park737Summary.items.length}`);
    console.log(`  Urbanics    : ${urbanicsCount}  (expected 16)`);
    console.log(`  Ludos       : ${ludosCount}   (expected 1)`);
    if (otherCount) console.log(`  Other       : ${otherCount}   (expected 0) ⚠️`);
    console.log(`  Result      : ${pass ? '✅ PASS' : '❌ FAIL — review before --write'}`);

    console.log('\n  Per-item breakdown:');
    for (const item of park737Summary.items.sort((a, b) => parseInt(a.gymExtId) - parseInt(b.gymExtId))) {
      const flag = item.brand === 'Ludos' ? ' ← Ludos' : '';
      console.log(`    equipmentid ${item.gymExtId.padEnd(4)} → ${item.brand}  [${item.source}]${flag}`);
    }

    if (u737) {
      console.log(`\n  Changes in this park: ${u737.changes.length} items will be updated`);
      for (const c of u737.changes) {
        console.log(`    equipmentid ${c.gymExtId.padEnd(4)} : ${c.oldBrand} → ${c.newBrand}  [${c.source}]`);
      }
    } else {
      console.log('\n  No changes needed for this park (already correct).');
    }
  }
  console.log();

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalChangedEquipment = updates.reduce((s, u) => s + u.changes.length, 0);
  const csvChanges             = updates.reduce((s, u) => s + u.changes.filter((c) => c.source === 'csv').length, 0);
  const fallbackChanges        = updates.reduce((s, u) => s + u.changes.filter((c) => c.source !== 'csv').length, 0);

  console.log('── SUMMARY ──────────────────────────────────────────────────────────');
  console.log(`  Parks with changes      : ${updates.length}`);
  console.log(`  Parks unchanged         : ${noChangeCount}`);
  console.log(`  Parks with no equipment : ${noEquipmentCount}`);
  console.log(`  Equipment items changed : ${totalChangedEquipment}`);
  console.log(`    ↳ from CSV map        : ${csvChanges}`);
  console.log(`    ↳ from primaryBrand   : ${fallbackChanges}  (equipment added post-export)`);
  console.log('─────────────────────────────────────────────────────────────────────\n');

  // ── Sample of parks with changes (first 20) ───────────────────────────────
  if (updates.length > 0) {
    console.log(`── FIRST 20 PARKS WITH CHANGES ──────────────────────────────────────`);
    for (const u of updates.slice(0, 20)) {
      const ludosItems = u.changes.filter((c) => c.newBrand === 'Ludos').length;
      const urbItems   = u.changes.filter((c) => c.newBrand === 'Urbanics').length;
      console.log(`  extId ${u.parkExtId.padEnd(6)} [${u.docId}] "${u.parkName}" — ${u.changes.length} changes (→Urbanics:${urbItems}, →Ludos:${ludosItems})`);
    }
    if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more`);
    console.log();
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  if (isDryRun) {
    console.log('DRY RUN complete. No writes made.');
    console.log('Review the validation above, then run with --write to apply.\n');
    return;
  }

  // Confirm park 737 validation passes before writing
  if (park737Summary) {
    const urbanicsCount = park737Summary.items.filter((i) => i.brand === 'Urbanics').length;
    const ludosCount    = park737Summary.items.filter((i) => i.brand === 'Ludos').length;
    if (!(urbanicsCount === 16 && ludosCount === 1)) {
      console.error('ERROR: Park 737 validation FAILED. Aborting write. Fix the mapping before proceeding.');
      process.exit(1);
    }
  }

  console.log(`Writing ${updates.length} parks (batches of 200)...`);
  const BATCH_SIZE = 200;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const slice = updates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const u of slice) {
      batch.update(db.collection('parks').doc(u.docId), {
        gymEquipment: u.newGymEquipment,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += slice.length;
    console.log(`  ${written}/${updates.length} written`);
  }
  console.log('\nDone.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
