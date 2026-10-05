/**
 * scripts/backfill-authority-population-2024.ts — 04.10.2026.
 *
 * Writes population/populationSource/populationYear to 98 authorities,
 * approved after two voided attempts:
 *   1. CBS Table A1 (Socio-Economic Index 2021) — voided: "Index Population"
 *      excludes institutional residents, is from 2021, and its regional-
 *      council code namespace (small 1-80 range) collides with unpadded
 *      city codes (Ofakim "31" silently matched a regional council's row).
 *   2. CBS's canonical "קובץ יישובים 2024" (Localities File) — approved.
 *      Verified against the exact failure above (נחל שורק: independent
 *      5531 lookup landed within 5% of the old collision value, confirming
 *      the bug rather than the source) plus a full top-10/bottom-10 sanity
 *      check (docs/audit-2026-09/population-import-2024-report.md).
 *
 * 96 authorities get population from this source (cities/local_councils:
 * their own row; regional_councils: sum of every locality whose own
 * "סמל רשות מקומית" equals our authorityCode — docs/audit-2026-09/
 * population-import-2024-source.json carries the already-computed sums).
 * ירושלים + תל אביב-יפו additionally get authorityCode (3000 / 5000) —
 * manually eyeballed and approved by David, NOT a name-match fallback;
 * this script does not extend that pattern to any other authority.
 *
 * מגדל תפן + נאות חובב matched their row but the source's population cell
 * is empty (not written as 0 or null in this round) — deliberately
 * excluded from WRITE_TARGETS, not touched by this script at all.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

interface WriteTarget {
  id: string;
  name: string;
  type: string;
  population: number;
  populationSource: string;
  populationYear: number;
  authorityCode?: string;
}

const SOURCE_FILE = path.join(__dirname, '..', 'docs', 'audit-2026-09', 'population-import-2024-source.json');

async function main() {
  const isApply = process.argv.includes('--apply');
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  const targets: WriteTarget[] = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  console.log(`Loaded ${targets.length} write targets (${targets.filter((t) => t.authorityCode).length} also get authorityCode).`);

  if (!isApply) {
    console.log('Dry run only (pass --apply to write). No Firestore writes made.');
    process.exit(0);
  }

  // ── Snapshot BEFORE any write ──
  console.log('\n=== Pre-write snapshots ===');
  const before: Record<string, number> = {};
  for (const t of targets) {
    const doc = await db.collection('authorities').doc(t.id).get();
    if (!doc.exists) { console.log(`🔴 ${t.name} (${t.id}) — doc does not exist, skipping snapshot.`); continue; }
    before[t.id] = Object.keys(doc.data() || {}).length;
  }
  console.log(`Snapshotted ${Object.keys(before).length}/${targets.length}.`);

  // ── Write ──
  console.log('\n=== Writing ===');
  let written = 0, rejected = 0, skipped = 0;
  for (const t of targets) {
    if (!(t.id in before)) { skipped++; continue; }
    if (typeof t.population !== 'number' || !Number.isFinite(t.population)) {
      console.log(`🔴 ${t.name} — invalid population value, rejected (no write).`);
      rejected++;
      continue;
    }
    const update: Record<string, unknown> = {
      population: t.population,
      populationSource: t.populationSource,
      populationYear: t.populationYear,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (t.authorityCode) update.authorityCode = t.authorityCode;
    try {
      await db.collection('authorities').doc(t.id).update(update);
      written++;
      console.log(`💾 ${t.name} (${t.id}) — population=${t.population}${t.authorityCode ? `, authorityCode=${t.authorityCode}` : ''}`);
    } catch (e) {
      rejected++;
      console.log(`🔴 ${t.name} — write threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n=== Write summary ===`);
  console.log(`Written: ${written}. Rejected: ${rejected}. Skipped (doc missing): ${skipped}. Total targets: ${targets.length}.`);

  // ── Field-count delta on 3 samples ──
  console.log('\n=== Field-count delta (3 samples) ===');
  for (const name of ['אשקלון', 'אופקים', 'ירושלים']) {
    const t = targets.find((x) => x.name === name);
    if (!t) continue;
    const after = await db.collection('authorities').doc(t.id).get();
    const fieldsAfter = Object.keys(after.data() || {}).length;
    console.log(`${name}: fields before=${before[t.id]}, after=${fieldsAfter}, delta=${fieldsAfter - before[t.id]}`);
  }

  // ── Live re-read verification — the value that comes back, not the value sent ──
  console.log('\n=== Live re-read verification (אשקלון, אופקים, נחל שורק) ===');
  const verifyNames = ['אשקלון', 'אופקים', 'נחל שורק'];
  for (const name of verifyNames) {
    const t = targets.find((x) => x.name === name);
    if (!t) { console.log(`${name}: not in write targets`); continue; }
    const doc = await db.collection('authorities').doc(t.id).get();
    const data = doc.data() || {};
    console.log(`${name} (${t.id}): population=${data.population}, populationSource=${JSON.stringify(data.populationSource)}, populationYear=${data.populationYear}, authorityCode=${JSON.stringify(data.authorityCode)}`);
  }

  console.log('\n=== Confirm untouched: מגדל תפן, נאות חובב ===');
  for (const [id, name] of [['YgE7NylgPulYmhoYj5Mn', 'מגדל תפן'], ['wSombLCFnVImPU0E1UDP', 'נאות חובב']] as const) {
    const doc = await db.collection('authorities').doc(id).get();
    const data = doc.data() || {};
    console.log(`${name} (${id}): population=${JSON.stringify(data.population)}, populationSource=${JSON.stringify(data.populationSource)}, populationYear=${JSON.stringify(data.populationYear)} (all should be undefined)`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
