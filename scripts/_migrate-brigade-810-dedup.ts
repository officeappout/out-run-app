/**
 * scripts/_migrate-brigade-810-dedup.ts — throwaway.
 *
 * Resolves the חטיבה 810 duplicate-org finding (see
 * docs/research/military-persona-unified-architecture.md §ג.1):
 *   - Identity A (old, 05.04.2026): authorities/חטיבה_810 + tenants/tenant_810_oq87sb
 *     - has one REAL live user bound to it with a broken unitId
 *     - has one unused access code with a wrong tenantType
 *   - Identity B (new, canonical, 08.04.2026): authorities/_810____cjo3 + tenants/_810____cjo3
 *     - matches the other 42 clean bulk-imported brigades' id scheme
 *     - clean unit nesting (9307 -> פלוגה א), no broken references
 *
 * Plan: re-point the live user + the used access code onto Identity B,
 * disable (not delete) the unused/mistagged access code, then delete
 * Identity A's docs. Everything backed up to a local JSON file first.
 *
 * SAFE BY DEFAULT: running this script with no flags only prints a full
 * backup + a dry-run plan. It performs ZERO writes unless you pass
 * --confirm explicitly. Idempotent: safe to re-run after a successful
 * migration (it will detect the target state and no-op).
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

const OLD_AUTHORITY_ID = 'חטיבה_810';
const OLD_TENANT_ID = 'tenant_810_oq87sb';
const NEW_AUTHORITY_ID = '_810____cjo3';
const NEW_TENANT_ID = '_810____cjo3';
const AFFECTED_USER_UID = 'SvDlkHnYMteRyik1Ae76GVFjNjD3';
const USED_ACCESS_CODE = 'MIL-9CFQUR';
const UNUSED_ACCESS_CODE = 'MUN-KHPUEK';
// The correct new home for the affected user: "פלוגה א" under battalion "9307"
// in the canonical tenant, matching her original "פלוגה_א" self-description.
const NEW_UNIT_ID = '__0st2';
const NEW_UNIT_PATH = ['9307', 'פלוגה א'];
// Unrelated orphan tenant found during the sweep: no name/type/authorityId,
// zero users, zero access codes (verified 01.09.2026 — re-verified below
// before every run, not assumed). Safe to delete alongside this cleanup.
const ORPHAN_TENANT_ID = 'TUOYvWWA9b8XetYfT6OA';

async function dumpDoc(label: string, ref: admin.firestore.DocumentReference) {
  const snap = await ref.get();
  return { label, path: ref.path, exists: snap.exists, data: snap.exists ? snap.data() : null };
}

async function backup(db: admin.firestore.Firestore) {
  const out: any[] = [];
  out.push(await dumpDoc('authorities/OLD', db.collection('authorities').doc(OLD_AUTHORITY_ID)));
  out.push(await dumpDoc('authorities/NEW', db.collection('authorities').doc(NEW_AUTHORITY_ID)));
  out.push(await dumpDoc('tenants/OLD', db.collection('tenants').doc(OLD_TENANT_ID)));
  out.push(await dumpDoc('tenants/NEW', db.collection('tenants').doc(NEW_TENANT_ID)));
  const oldUnits = await db.collection('tenants').doc(OLD_TENANT_ID).collection('units').get();
  for (const u of oldUnits.docs) out.push({ label: 'tenants/OLD/units', path: u.ref.path, exists: true, data: u.data() });
  const newUnits = await db.collection('tenants').doc(NEW_TENANT_ID).collection('units').get();
  for (const u of newUnits.docs) out.push({ label: 'tenants/NEW/units', path: u.ref.path, exists: true, data: u.data() });
  out.push(await dumpDoc('affected user', db.collection('users').doc(AFFECTED_USER_UID)));
  out.push(await dumpDoc('used access code', db.collection('access_codes').doc(USED_ACCESS_CODE)));
  out.push(await dumpDoc('unused access code', db.collection('access_codes').doc(UNUSED_ACCESS_CODE)));
  out.push(await dumpDoc('orphan tenant', db.collection('tenants').doc(ORPHAN_TENANT_ID)));
  const orphanUnits = await db.collection('tenants').doc(ORPHAN_TENANT_ID).collection('units').get();
  for (const u of orphanUnits.docs) out.push({ label: 'orphan tenant/units', path: u.ref.path, exists: true, data: u.data() });

  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `brigade-810-dedup-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return file;
}

async function plan(db: admin.firestore.Firestore) {
  const user = await db.collection('users').doc(AFFECTED_USER_UID).get();
  const core: any = user.data()?.core ?? {};
  const alreadyMigrated = core.tenantId === NEW_AUTHORITY_ID && core.unitId === NEW_UNIT_ID;
  const oldAuthorityGone = !(await db.collection('authorities').doc(OLD_AUTHORITY_ID).get()).exists;
  const oldTenantGone = !(await db.collection('tenants').doc(OLD_TENANT_ID).get()).exists;

  console.log('\n=== MIGRATION PLAN (dry-run unless --confirm is passed) ===');
  console.log(`1. user ${AFFECTED_USER_UID}: core.tenantId "${core.tenantId}" -> "${NEW_AUTHORITY_ID}", core.unitId "${core.unitId}" -> "${NEW_UNIT_ID}", core.unitPath -> ${JSON.stringify(NEW_UNIT_PATH)}`);
  console.log(`2. access_codes/${USED_ACCESS_CODE}: tenantId -> "${NEW_AUTHORITY_ID}", unitId -> "${NEW_UNIT_ID}", unitPath -> ${JSON.stringify(NEW_UNIT_PATH)} (historical record only, maxUses already reached)`);
  console.log(`3. access_codes/${UNUSED_ACCESS_CODE}: set isActive=false (soft-disable, not deleted — never used, wrong tenantType, kept for audit trail)`);
  console.log(`4. DELETE tenants/${OLD_TENANT_ID}/units/* (3 docs), then DELETE tenants/${OLD_TENANT_ID}`);
  console.log(`5. DELETE authorities/${OLD_AUTHORITY_ID}`);

  // Re-verify the orphan is still dependency-free right before we act on it —
  // never trust a decision made from an earlier read when about to delete.
  const orphanUsers = await db.collection('users').where('core.tenantId', '==', ORPHAN_TENANT_ID).get();
  const orphanCodes = await db.collection('access_codes').where('tenantId', '==', ORPHAN_TENANT_ID).get();
  const orphanTenantDoc = await db.collection('tenants').doc(ORPHAN_TENANT_ID).get();
  const orphanSafeToDelete = orphanUsers.empty && orphanCodes.empty;
  console.log(`6. tenants/${ORPHAN_TENANT_ID} (unrelated orphan, no name/type/authorityId): exists=${orphanTenantDoc.exists}, users=${orphanUsers.size}, access_codes=${orphanCodes.size} -> ${orphanSafeToDelete ? 'DELETE it + its units subcollection' : 'SKIP — has dependents, leaving as-is'}`);

  console.log(`\nalready-migrated check: user=${alreadyMigrated}, old-authority-gone=${oldAuthorityGone}, old-tenant-gone=${oldTenantGone}`);
  return { alreadyMigrated, oldAuthorityGone, oldTenantGone, orphanSafeToDelete, orphanExists: orphanTenantDoc.exists };
}

async function execute(db: admin.firestore.Firestore, orphanSafeToDelete: boolean, orphanExists: boolean) {
  const batch = db.batch();
  batch.update(db.collection('users').doc(AFFECTED_USER_UID), {
    'core.tenantId': NEW_AUTHORITY_ID,
    'core.unitId': NEW_UNIT_ID,
    'core.unitPath': NEW_UNIT_PATH,
  });
  batch.update(db.collection('access_codes').doc(USED_ACCESS_CODE), {
    tenantId: NEW_AUTHORITY_ID,
    unitId: NEW_UNIT_ID,
    unitPath: NEW_UNIT_PATH,
  });
  batch.update(db.collection('access_codes').doc(UNUSED_ACCESS_CODE), { isActive: false });
  const oldUnits = await db.collection('tenants').doc(OLD_TENANT_ID).collection('units').get();
  oldUnits.docs.forEach((u) => batch.delete(u.ref));
  batch.delete(db.collection('tenants').doc(OLD_TENANT_ID));
  batch.delete(db.collection('authorities').doc(OLD_AUTHORITY_ID));

  if (orphanExists && orphanSafeToDelete) {
    const orphanUnits = await db.collection('tenants').doc(ORPHAN_TENANT_ID).collection('units').get();
    orphanUnits.docs.forEach((u) => batch.delete(u.ref));
    batch.delete(db.collection('tenants').doc(ORPHAN_TENANT_ID));
  }

  await batch.commit();
  console.log(`\n✅ migration committed.${orphanExists && orphanSafeToDelete ? ' (including orphan tenant cleanup)' : ''}`);

  // Post-write sanity check — not a full audit (test data, per David), just
  // confirm the batch didn't leave a dangling reference.
  const user = await db.collection('users').doc(AFFECTED_USER_UID).get();
  const core: any = user.data()?.core;
  const targetUnitDoc = await db.collection('tenants').doc(core.tenantId).collection('units').doc(core.unitId).get();
  const targetAuthorityDoc = await db.collection('authorities').doc(core.tenantId).get();
  console.log(`\nsanity check: user.core.tenantId="${core.tenantId}" resolves to an authority doc: ${targetAuthorityDoc.exists}; user.core.unitId="${core.unitId}" resolves to a real unit doc: ${targetUnitDoc.exists} (name="${targetUnitDoc.data()?.name}")`);
  if (!targetAuthorityDoc.exists || !targetUnitDoc.exists) {
    console.error('❌ SANITY CHECK FAILED — migration left a dangling reference. Investigate before trusting this data.');
  }
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  const backupFile = await backup(db);
  console.log(`\n✅ backup written: ${backupFile}`);

  const { alreadyMigrated, oldAuthorityGone, oldTenantGone, orphanSafeToDelete, orphanExists } = await plan(db);

  if (alreadyMigrated && oldAuthorityGone && oldTenantGone && !orphanExists) {
    console.log('\nAlready migrated — nothing to do.');
    process.exit(0);
  }

  if (!confirm) {
    console.log('\nDRY RUN ONLY — no writes performed. Re-run with --confirm to execute.');
    process.exit(0);
  }

  console.log('\n--confirm passed — executing migration now.');
  await execute(db, orphanSafeToDelete, orphanExists);
  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
