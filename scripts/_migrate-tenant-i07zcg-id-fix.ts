/**
 * scripts/_migrate-tenant-i07zcg-id-fix.ts — throwaway.
 *
 * Fixes the tenant/authority id-mismatch found for "בית ספר ראשונים"
 * (see docs/research/military-persona-unified-architecture.md and the
 * plan at ~/.claude/plans/polymorphic-stargazing-sunrise.md, חלק א׳.1):
 *   authorities/בית_ספר_ראשונים  (correct, canonical id)
 *   tenants/tenant_i07zcg        (WRONG id — points back via authorityId)
 *
 * Unlike the חטיבה 810 case, this is NOT a duplicate-identity merge —
 * there is only one authority doc. It's a pure id realignment: recreate
 * the tenant doc (and its units) under the id that matches the
 * authority doc, re-point any users/access_codes, delete the old one.
 *
 * SAFE BY DEFAULT: no flags = backup + dry-run plan only, zero writes.
 * --confirm executes. Idempotent: detects already-migrated state.
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

const OLD_TENANT_ID = 'tenant_i07zcg';
const CANONICAL_ID = 'בית_ספר_ראשונים'; // matches authorities/{CANONICAL_ID}

async function dumpDoc(label: string, ref: admin.firestore.DocumentReference) {
  const snap = await ref.get();
  return { label, path: ref.path, exists: snap.exists, data: snap.exists ? snap.data() : null };
}

async function backup(db: admin.firestore.Firestore) {
  const out: any[] = [];
  out.push(await dumpDoc('authority (canonical)', db.collection('authorities').doc(CANONICAL_ID)));
  out.push(await dumpDoc('tenant (old id)', db.collection('tenants').doc(OLD_TENANT_ID)));
  out.push(await dumpDoc('tenant (canonical id, pre-fix)', db.collection('tenants').doc(CANONICAL_ID)));

  const oldUnits = await db.collection('tenants').doc(OLD_TENANT_ID).collection('units').get();
  for (const u of oldUnits.docs) out.push({ label: 'old tenant units', path: u.ref.path, exists: true, data: u.data() });

  const users = await db.collection('users').where('core.tenantId', '==', OLD_TENANT_ID).get();
  for (const u of users.docs) out.push({ label: 'affected user', path: u.ref.path, exists: true, data: u.data() });

  const codes = await db.collection('access_codes').where('tenantId', '==', OLD_TENANT_ID).get();
  for (const c of codes.docs) out.push({ label: 'affected access code', path: c.ref.path, exists: true, data: c.data() });

  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `tenant-i07zcg-id-fix-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return { file, oldUnitsCount: oldUnits.size, userCount: users.size, codeCount: codes.size };
}

async function plan(db: admin.firestore.Firestore) {
  const oldTenant = await db.collection('tenants').doc(OLD_TENANT_ID).get();
  const canonicalTenant = await db.collection('tenants').doc(CANONICAL_ID).get();
  const canonicalAuthority = await db.collection('authorities').doc(CANONICAL_ID).get();
  const users = await db.collection('users').where('core.tenantId', '==', OLD_TENANT_ID).get();
  const codes = await db.collection('access_codes').where('tenantId', '==', OLD_TENANT_ID).get();
  const oldUnits = await db.collection('tenants').doc(OLD_TENANT_ID).collection('units').get();

  console.log('\n=== MIGRATION PLAN (dry-run unless --confirm) ===');
  console.log(`authority exists (canonical, unaffected): ${canonicalAuthority.exists}`);
  console.log(`1. CREATE tenants/${CANONICAL_ID} (copy of tenants/${OLD_TENANT_ID}'s fields)`);
  console.log(`2. CREATE ${oldUnits.size} unit doc(s) under tenants/${CANONICAL_ID}/units/* (same ids/fields)`);
  console.log(`3. RE-POINT ${users.size} user(s): core.tenantId "${OLD_TENANT_ID}" -> "${CANONICAL_ID}"`);
  console.log(`4. RE-POINT ${codes.size} access code(s): tenantId "${OLD_TENANT_ID}" -> "${CANONICAL_ID}"`);
  console.log(`5. DELETE tenants/${OLD_TENANT_ID}/units/* (${oldUnits.size} docs), then DELETE tenants/${OLD_TENANT_ID}`);

  const alreadyMigrated = canonicalTenant.exists && !oldTenant.exists;
  console.log(`\nalready-migrated check: canonical-tenant-exists=${canonicalTenant.exists}, old-tenant-gone=${!oldTenant.exists}`);
  return { alreadyMigrated, oldUnits, users, codes, oldTenant, canonicalAuthority };
}

async function execute(
  db: admin.firestore.Firestore,
  oldTenant: admin.firestore.DocumentSnapshot,
  oldUnits: admin.firestore.QuerySnapshot,
  users: admin.firestore.QuerySnapshot,
  codes: admin.firestore.QuerySnapshot,
) {
  const batch = db.batch();
  const oldTenantData = oldTenant.data() || {};
  batch.set(db.collection('tenants').doc(CANONICAL_ID), oldTenantData);
  oldUnits.docs.forEach((u) => {
    batch.set(db.collection('tenants').doc(CANONICAL_ID).collection('units').doc(u.id), u.data());
    batch.delete(u.ref);
  });
  users.docs.forEach((u) => batch.update(u.ref, { 'core.tenantId': CANONICAL_ID }));
  codes.docs.forEach((c) => batch.update(c.ref, { tenantId: CANONICAL_ID }));
  batch.delete(db.collection('tenants').doc(OLD_TENANT_ID));
  await batch.commit();
  console.log('\n✅ migration committed.');

  const newTenant = await db.collection('tenants').doc(CANONICAL_ID).get();
  const newUnits = await db.collection('tenants').doc(CANONICAL_ID).collection('units').get();
  const oldGone = !(await db.collection('tenants').doc(OLD_TENANT_ID).get()).exists;
  console.log(`\nsanity check: tenants/${CANONICAL_ID} exists=${newTenant.exists}, authorityId="${newTenant.data()?.authorityId}", unit count=${newUnits.size} (expected ${oldUnits.size}), old tenant gone=${oldGone}`);
  if (!newTenant.exists || newUnits.size !== oldUnits.size || !oldGone) {
    console.error('❌ SANITY CHECK FAILED — investigate before trusting this data.');
  }
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  const { file, oldUnitsCount, userCount, codeCount } = await backup(db);
  console.log(`\n✅ backup written: ${file} (${oldUnitsCount} unit(s), ${userCount} user(s), ${codeCount} access code(s))`);

  const { alreadyMigrated, oldUnits, users, codes, oldTenant, canonicalAuthority } = await plan(db);

  if (!canonicalAuthority.exists) {
    console.error(`❌ authorities/${CANONICAL_ID} does not exist — refusing to proceed, premise has changed.`);
    process.exit(1);
  }

  if (alreadyMigrated) {
    console.log('\nAlready migrated — nothing to do.');
    process.exit(0);
  }

  if (!confirm) {
    console.log('\nDRY RUN ONLY — no writes performed. Re-run with --confirm to execute.');
    process.exit(0);
  }

  console.log('\n--confirm passed — executing migration now.');
  await execute(db, oldTenant, oldUnits, users, codes);
  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
