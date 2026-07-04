/**
 * Fix brand inversion: the original CSV import mapped companyid 8→Ludos, 9→Urbanics.
 * The correct mapping is 8→Urbanics, 9→Ludos.
 *
 * Scope: parks.gymEquipment[].brandName ONLY.
 * gym_equipment.brands[] is intentionally excluded — those slots were filled manually
 * with correct per-brand media (Urbanics slot = UBX video/image, Ludos slot = LA).
 * Touching gym_equipment would break media references.
 *
 * "אורבניקס" (2 parks, manually tagged) is flagged for manual review — NOT auto-swapped.
 *
 * Usage:
 *   npx tsx scripts/fix-brand-inversion.ts            # dry-run (default)
 *   npx tsx scripts/fix-brand-inversion.ts --write    # apply to Firestore
 *
 * Output:
 *   scripts/corpus/brand-inversion-report.json
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

function swapBrandName(name: string): string | null {
  if (name === 'Ludos') return 'Urbanics';
  if (name === 'Urbanics') return 'Ludos';
  return null; // not an import brand — don't touch
}

async function main() {
  const isDryRun = !process.argv.includes('--write');
  initFirebase();
  const db = admin.firestore();

  console.log(`\n=== fix-brand-inversion — ${isDryRun ? 'DRY RUN' : 'WRITE MODE'} ===\n`);

  // gym_equipment.brands[] is excluded — slots were filled manually with correct media.
  // ── parks only ─────────────────────────────────────────────────────────────
  console.log('Loading parks...');
  const parksSnap = await db.collection('parks').get();

  interface ParkChange {
    parkId: string;
    parkName: string;
    city: string;
    beforeBrandNames: string[]; // for report only
    newGymEquipment: any[];     // full array ready to write
  }
  const parkChanges: ParkChange[] = [];
  const manualTagParks: Array<{ parkId: string; parkName: string; brandName: string }> = [];
  let parksUnchanged = 0;

  let skippedByGuard = 0;
  for (const d of parksSnap.docs) {
    const data = d.data() as any;
    // Idempotency: skip parks already processed by a previous --write run.
    if (data.brandInversionFixed === true) { skippedByGuard++; continue; }
    const gymEquipment: any[] = Array.isArray(data.gymEquipment) ? data.gymEquipment : [];
    if (!gymEquipment.length) continue;

    let changed = false;
    const newGymEquipment = gymEquipment.map((eq: any) => {
      const bn = eq.brandName ?? '';
      const swapped = swapBrandName(bn);
      if (swapped) {
        changed = true;
        return { ...eq, brandName: swapped };
      }
      if (bn && bn !== 'Ludos' && bn !== 'Urbanics' && bn !== '') {
        // Flag non-standard brand names for manual review
        manualTagParks.push({
          parkId: d.id,
          parkName: typeof data.name === 'string' ? data.name : (data.name?.he ?? d.id),
          brandName: bn,
        });
      }
      return eq;
    });

    if (changed) {
      parkChanges.push({
        parkId: d.id,
        parkName: typeof data.name === 'string' ? data.name : (data.name?.he ?? d.id),
        city: data.city ?? '',
        beforeBrandNames: gymEquipment.map((eq: any) => eq.brandName ?? ''),
        newGymEquipment,
      });
    } else {
      parksUnchanged++;
    }
  }

  // Deduplicate manual tags (a park may have multiple non-standard brands)
  const seen = new Set<string>();
  const uniqueManualTags = manualTagParks.filter((p) => {
    const key = `${p.parkId}:${p.brandName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n── SUMMARY ──────────────────────────────────────────────────────`);
  console.log(`  gym_equipment: NOT TOUCHED (media slots correct)`);
  console.log(`  skipped (already fixed): ${skippedByGuard}`);
  console.log(`  park changes:          ${parkChanges.length}`);
  console.log(`  parks unchanged:       ${parksUnchanged}`);
  console.log(`  manual-tag parks:      ${uniqueManualTags.length}  ← NOT auto-swapped`);
  if (uniqueManualTags.length) {
    uniqueManualTags.forEach((p) =>
      console.log(`    [${p.parkId}] ${p.parkName} — "${p.brandName}"`));
  }
  console.log(`─────────────────────────────────────────────────────────────────\n`);

  // ── Write ──────────────────────────────────────────────────────────────────
  if (!isDryRun) {
    // parks — batch writes of 200
    console.log(`── WRITING parks (${parkChanges.length} docs)...`);
    const BATCH_SIZE = 200;
    let written = 0;
    for (let i = 0; i < parkChanges.length; i += BATCH_SIZE) {
      const slice = parkChanges.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const ch of slice) {
        batch.update(db.collection('parks').doc(ch.parkId), {
          gymEquipment: ch.newGymEquipment,
          brandInversionFixed: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      written += slice.length;
      console.log(`  ${written}/${parkChanges.length} parks written`);
    }
    console.log(`  Done.\n`);
    console.log('Next: re-run infer-park-primary-brand.ts to set primaryBrand from corrected data.');
  }

  // ── JSON Report ────────────────────────────────────────────────────────────
  const corpusDir = path.join(process.cwd(), 'scripts', 'corpus');
  if (!fs.existsSync(corpusDir)) fs.mkdirSync(corpusDir, { recursive: true });
  const outPath = path.join(corpusDir, 'brand-inversion-report.json');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'write',
    note: 'gym_equipment excluded — media slots correct and manually curated',
    summary: {
      gymEquipmentTouched: 0,
      skippedAlreadyFixed: skippedByGuard,
      parksToChange: parkChanges.length,
      parksUnchanged,
      manualTagParksNotSwapped: uniqueManualTags.length,
    },
    manualTagParks: uniqueManualTags,
    // Park changes: sample only (full list would be very large)
    parkChangesSample: parkChanges.slice(0, 20).map((ch) => ({
      parkId: ch.parkId,
      name: ch.parkName,
      city: ch.city,
      uniqueBrandsBefore: [...new Set(ch.beforeBrandNames)].join(', '),
      uniqueBrandsAfter: [...new Set(ch.newGymEquipment.map((eq: any) => eq.brandName))].join(', '),
      equipmentCount: ch.newGymEquipment.length,
    })),
    parkChangesTotal: parkChanges.length,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report written → ${outPath}`);
  console.log(isDryRun
    ? '\nNo Firestore writes made. Review report and re-run with --write to apply.'
    : '\nComplete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
