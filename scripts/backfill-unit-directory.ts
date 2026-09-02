/**
 * scripts/backfill-unit-directory.ts — one-time backfill, committed (writes
 * real production data, per the project convention that data-mutating
 * migration scripts stay committed).
 *
 * Phase 3b Step 0 (docs/research/military-persona-unified-architecture.md
 * §3ב, plan §ה׳): populates `unitDirectory` for every EXISTING military
 * authority + its existing sub-units. The onAuthorityWrite/onUnitWrite
 * Cloud Functions (deployed 02.09.2026, part of Phase 3a) only sync on
 * NEW writes going forward — the 42 brigades and their real sub-units
 * were last written before that deploy, so unitDirectory is empty for
 * all of them except the one brigade/unit touched during 3a's live
 * verification. Without this, `HierarchySearchStep` (Phase 3b) would
 * show an empty list with no way to tell a bug from missing data.
 *
 * Mirrors onAuthorityWrite.ts's classification (`isMilitaryAuthority`)
 * and onUnitWrite.ts's directory-entry shape (`directoryIdForUnit`,
 * `levelForUnitPath`) exactly — hand-duplicated here since this script
 * cannot import from functions/src (separate tsconfig root, same
 * cross-project boundary noted throughout this work).
 *
 * SAFE BY DEFAULT: no flags = backup + dry-run plan only, zero writes.
 * --confirm executes. Idempotent: re-running after success finds nothing
 * left to backfill (a plain set() with identical data is a no-op in
 * effect, though it does still bump updatedAt — acceptable for a
 * one-time backfill script, unlike the live triggers which need the
 * idempotency GUARD to avoid infinite retrigger loops on themselves).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// Mirrors functions/src/onAuthorityWrite.ts's isMilitaryAuthority() exactly.
function isMilitaryAuthority(data: FirebaseFirestore.DocumentData): boolean {
  const tenantType = typeof data.tenantType === 'string' ? data.tenantType : null;
  if (tenantType) return tenantType === 'military';
  const vertical = typeof data.vertical === 'string' ? data.vertical : null;
  if (vertical) return vertical === 'military';
  const type = typeof data.type === 'string' ? data.type.toLowerCase() : '';
  return (
    type === 'military' ||
    type === 'military_unit' ||
    type.includes('military') ||
    type.includes('army') ||
    type.includes('צבא')
  );
}

// Mirrors functions/src/onUnitWrite.ts's directoryIdForUnit()/levelForUnitPath() exactly.
function directoryIdForUnit(tenantId: string, unitId: string): string {
  return `${tenantId}__${unitId}`;
}
function levelForUnitPath(unitPath: unknown): 'battalion' | 'company' | 'platoon' {
  const depth = Array.isArray(unitPath) ? unitPath.length : 1;
  if (depth <= 1) return 'battalion';
  if (depth === 2) return 'company';
  return 'platoon';
}

interface PlannedEntry {
  directoryId: string;
  data: Record<string, unknown>;
}

async function backup(label: string, docs: { path: string; data: unknown }[]) {
  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `unit-directory-backfill-${label}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf-8');
  return file;
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  // Backup current unitDirectory state (should be near-empty) before touching it.
  const currentDirSnap = await db.collection('unitDirectory').get();
  const currentDirDump = currentDirSnap.docs.map((d) => ({ path: d.ref.path, data: d.data() }));
  const dirBackupFile = await backup('current-state', currentDirDump);
  console.log(`✅ backup of current unitDirectory (${currentDirDump.length} doc(s)) written: ${dirBackupFile}`);

  const authoritiesSnap = await db.collection('authorities').get();
  const militaryAuthorities = authoritiesSnap.docs.filter((d) => isMilitaryAuthority(d.data()));
  console.log(`\nfound ${militaryAuthorities.length} military authority doc(s) out of ${authoritiesSnap.size} total`);

  const authBackupFile = await backup('source-authorities', militaryAuthorities.map((d) => ({ path: d.ref.path, data: d.data() })));
  console.log(`✅ backup of source authorities written: ${authBackupFile}`);

  const planned: PlannedEntry[] = [];
  const skippedNoName: string[] = [];
  let totalUnitsScanned = 0;
  const sourceUnitDocs: { path: string; data: unknown }[] = [];

  for (const authDoc of militaryAuthorities) {
    const authData = authDoc.data();
    const orgId = authDoc.id;
    const name = typeof authData.name === 'string' ? authData.name.trim() : '';
    const armType = typeof authData.armType === 'string' ? authData.armType : null;
    const statusCategory = typeof authData.statusCategory === 'string' ? authData.statusCategory : null;

    if (!name) {
      skippedNoName.push(`authorities/${orgId}`);
    } else {
      planned.push({
        directoryId: orgId,
        data: { name, parentId: null, level: 'brigade', orgId, unitId: null, armType, statusCategory },
      });
    }

    const unitsSnap = await db.collection('tenants').doc(orgId).collection('units').get();
    totalUnitsScanned += unitsSnap.size;
    for (const unitDoc of unitsSnap.docs) {
      sourceUnitDocs.push({ path: unitDoc.ref.path, data: unitDoc.data() });
      const unitData = unitDoc.data();
      const unitName = typeof unitData.name === 'string' ? unitData.name.trim() : '';
      if (!unitName) {
        skippedNoName.push(unitDoc.ref.path);
        continue;
      }
      const parentUnitId = typeof unitData.parentUnitId === 'string' ? unitData.parentUnitId : null;
      planned.push({
        directoryId: directoryIdForUnit(orgId, unitDoc.id),
        data: {
          name: unitName,
          parentId: parentUnitId ? directoryIdForUnit(orgId, parentUnitId) : orgId,
          level: levelForUnitPath(unitData.unitPath),
          orgId,
          unitId: unitDoc.id,
          armType,
          statusCategory,
        },
      });
    }
  }

  const unitsBackupFile = await backup('source-units', sourceUnitDocs);
  console.log(`✅ backup of source units (${sourceUnitDocs.length} doc(s)) written: ${unitsBackupFile}`);

  console.log(`\n=== BACKFILL PLAN (dry-run unless --confirm) ===`);
  console.log(`${militaryAuthorities.length} brigade(s) scanned, ${totalUnitsScanned} sub-unit doc(s) scanned across all of them.`);
  console.log(`${planned.length} unitDirectory entr(y/ies) to write.`);
  planned.forEach((p) => console.log(`  ${p.directoryId}: level=${p.data.level} name="${p.data.name}" armType=${JSON.stringify(p.data.armType)} statusCategory=${JSON.stringify(p.data.statusCategory)}`));

  if (skippedNoName.length > 0) {
    console.log(`\n⚠️  ${skippedNoName.length} doc(s) skipped — no name (never published to unitDirectory, matching the live triggers' skip-rule):`);
    skippedNoName.forEach((p) => console.log(`    ${p}`));
  }

  if (!confirm) {
    console.log('\nDRY RUN ONLY — no writes performed. Re-run with --confirm to execute.');
    process.exit(0);
  }

  console.log('\n--confirm passed — executing backfill now.');
  const BATCH_SIZE = 400;
  for (let i = 0; i < planned.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = planned.slice(i, i + BATCH_SIZE);
    for (const entry of chunk) {
      batch.set(db.collection('unitDirectory').doc(entry.directoryId), {
        ...entry.data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`  committed batch ${i / BATCH_SIZE + 1} (${chunk.length} entries)`);
  }
  console.log('\n✅ backfill committed.');

  // Sanity check: re-read every planned entry, confirm it persisted correctly.
  let sanityFailures = 0;
  let peopleFieldsFound = 0;
  const ALLOWED_KEYS = new Set(['name', 'parentId', 'level', 'orgId', 'unitId', 'armType', 'statusCategory', 'updatedAt']);
  for (const entry of planned) {
    const fresh = await db.collection('unitDirectory').doc(entry.directoryId).get();
    if (!fresh.exists) {
      console.error(`❌ SANITY CHECK FAILED — ${entry.directoryId} does not exist after write`);
      sanityFailures++;
      continue;
    }
    const freshData = fresh.data() ?? {};
    for (const key of Object.keys(freshData)) {
      if (!ALLOWED_KEYS.has(key)) {
        console.error(`❌ UNEXPECTED FIELD "${key}" on ${entry.directoryId} — unitDirectory must contain only name/level/parentId/orgId/unitId/armType/statusCategory, zero people-fields`);
        peopleFieldsFound++;
      }
    }
    if (freshData.name !== entry.data.name || freshData.level !== entry.data.level) {
      console.error(`❌ SANITY CHECK FAILED — ${entry.directoryId} data mismatch`);
      sanityFailures++;
    }
  }
  console.log(`\nsanity check: ${sanityFailures} doc(s) failed to persist correctly, ${peopleFieldsFound} unexpected field(s) found (expect 0, 0).`);

  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
