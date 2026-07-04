/**
 * DRY-RUN: Infer park.primaryBrand from the majority brand across each park's
 * gymEquipment items.
 *
 * Does NOT write to Firestore. Outputs a JSON report for David's approval.
 * After approval, run with --write to apply.
 *
 * Usage:
 *   npx tsx scripts/infer-park-primary-brand.ts             # dry-run (default)
 *   npx tsx scripts/infer-park-primary-brand.ts --write     # apply to Firestore
 *
 * Output:
 *   scripts/corpus/primary-brand-report.json
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

interface ParkRow {
  parkId: string;
  parkName: string;
  city: string;
  currentPrimaryBrand: string | null;
  inferredPrimaryBrand: string | null;
  brandCounts: Record<string, number>;
  totalEquipment: number;
  isMixed: boolean;
  minorityRatio: number; // 0 = single-brand; >0 = mixed (minority / total)
}

async function main() {
  const isDryRun = !process.argv.includes('--write');
  initFirebase();
  const db = admin.firestore();

  console.log(`\n=== infer-park-primary-brand — ${isDryRun ? 'DRY RUN' : 'WRITE MODE'} ===\n`);

  const snap = await db.collection('parks').get();
  console.log(`Loaded ${snap.size} parks.\n`);

  const rows: ParkRow[] = [];
  let noEquipment = 0;
  let alreadySet = 0;

  for (const doc of snap.docs) {
    const park = doc.data() as any;
    const gymEquipment: Array<{ equipmentId: string; brandName?: string }> =
      park.gymEquipment ?? [];

    if (!gymEquipment.length) {
      noEquipment++;
      continue;
    }

    // Count brand occurrences across equipment items
    const brandCounts: Record<string, number> = {};
    for (const item of gymEquipment) {
      const brand = (item.brandName ?? '').trim();
      if (brand) {
        brandCounts[brand] = (brandCounts[brand] ?? 0) + 1;
      }
    }

    const entries = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
    const inferredPrimaryBrand = entries[0]?.[0] ?? null;
    const totalEquipment = gymEquipment.length;
    const isMixed = entries.length > 1;

    // Minority ratio = second-most-common brand count / total (0 for single-brand)
    const minorityRatio = isMixed ? (entries[1][1] / totalEquipment) : 0;

    if (park.primaryBrand) alreadySet++;

    rows.push({
      parkId: doc.id,
      parkName: typeof park.name === 'string' ? park.name : (park.name?.he ?? park.name?.en ?? doc.id),
      city: park.city ?? '',
      currentPrimaryBrand: park.primaryBrand ?? null,
      inferredPrimaryBrand,
      brandCounts,
      totalEquipment,
      isMixed,
      minorityRatio,
    });
  }

  // Sort: mixed parks first (by minority ratio desc), then single-brand
  rows.sort((a, b) => b.minorityRatio - a.minorityRatio);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const mixed = rows.filter((r) => r.isMixed);
  const singleBrand = rows.filter((r) => !r.isMixed && r.inferredPrimaryBrand);
  const noBrand = rows.filter((r) => !r.inferredPrimaryBrand);

  console.log('── SUMMARY ─────────────────────────────────────────────────────');
  console.log(`  Total parks:          ${snap.size}`);
  console.log(`  No gymEquipment:      ${noEquipment}`);
  console.log(`  Already have primaryBrand: ${alreadySet}`);
  console.log(`  Single-brand parks:   ${singleBrand.length}`);
  console.log(`  Mixed-brand parks:    ${mixed.length}  ← require manual review`);
  console.log(`  No brand found:       ${noBrand.length}`);
  console.log('─────────────────────────────────────────────────────────────────\n');

  // ── Mixed parks detail ───────────────────────────────────────────────────────
  if (mixed.length) {
    console.log('── MIXED PARKS (needs manual review) ───────────────────────────');
    for (const r of mixed) {
      const countsStr = Object.entries(r.brandCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([brand, n]) => `${brand}:${n}`)
        .join(', ');
      console.log(
        `  [${r.parkId}] ${r.parkName} (${r.city}) → inferred: ${r.inferredPrimaryBrand ?? 'none'} | ${countsStr} | minority ${Math.round(r.minorityRatio * 100)}%`,
      );
    }
    console.log();
  }

  // ── Write mode ───────────────────────────────────────────────────────────────
  if (!isDryRun) {
    console.log('── WRITING TO FIRESTORE ────────────────────────────────────────');
    let written = 0;
    for (const r of rows) {
      if (!r.inferredPrimaryBrand) continue;
      if (r.currentPrimaryBrand === r.inferredPrimaryBrand) continue; // already correct
      await db.collection('parks').doc(r.parkId).update({
        primaryBrand: r.inferredPrimaryBrand,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      written++;
      if (written % 50 === 0) console.log(`  ${written} parks updated...`);
    }
    console.log(`  Done. ${written} parks written.\n`);
  }

  // ── Write JSON report ────────────────────────────────────────────────────────
  const corpusDir = path.join(process.cwd(), 'scripts', 'corpus');
  if (!fs.existsSync(corpusDir)) fs.mkdirSync(corpusDir, { recursive: true });
  const outPath = path.join(corpusDir, 'primary-brand-report.json');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: isDryRun ? 'dry-run' : 'write',
    summary: {
      totalParks: snap.size,
      noEquipment,
      alreadyHavePrimaryBrand: alreadySet,
      singleBrand: singleBrand.length,
      mixed: mixed.length,
      noBrand: noBrand.length,
    },
    mixed: mixed.map((r) => ({
      ...r,
      minorityRatioPercent: Math.round(r.minorityRatio * 100),
    })),
    singleBrand,
    noBrand,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report written → ${outPath}`);
  console.log(isDryRun ? '\nNo Firestore writes made. Review the report and re-run with --write to apply.' : '\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
