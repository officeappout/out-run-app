#!/usr/bin/env npx tsx
/**
 * migrate-hebrew-ids.ts
 *
 * One-time migration script to rename Firestore documents that have
 * Hebrew characters in their IDs to clean English-only IDs.
 *
 * Affected collections:
 *   - tenants/{hebrewId}            → tenants/{englishId}
 *   - tenants/{id}/units/{hebrewId} → tenants/{id}/units/{englishId}
 *   - access_codes (updates tenantId / unitId fields)
 *   - users (updates core.tenantId / core.unitId fields)
 *
 * Usage:
 *   npx tsx scripts/migrate-hebrew-ids.ts --dry-run   # preview
 *   npx tsx scripts/migrate-hebrew-ids.ts              # execute
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account key
 *   - OR run from a machine already authenticated with `gcloud auth application-default login`
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize with application default credentials
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const HEBREW_REGEX = /[\u0590-\u05FF]/;

function hasHebrew(s: string): boolean {
  return HEBREW_REGEX.test(s);
}

function toEnglishId(hebrewId: string, prefix: string): string {
  const stripped = hebrewId
    .replace(/[\u0590-\u05FF]+/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  const suffix = Math.random().toString(36).substring(2, 8);
  return stripped ? `${prefix}_${stripped}_${suffix}` : `${prefix}_${suffix}`;
}

interface Migration {
  type: string;
  oldId: string;
  newId: string;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '\n=== DRY RUN (no writes) ===' : '\n=== LIVE MIGRATION ===');

  const log: Migration[] = [];

  // ─── 1. Migrate tenant doc IDs ────────────────────────────────────
  console.log('\n📦 Scanning tenants collection...');
  const tenantsSnap = await db.collection('tenants').get();
  console.log(`   Found ${tenantsSnap.size} tenant(s) total.`);

  for (const tenantDoc of tenantsSnap.docs) {
    if (!hasHebrew(tenantDoc.id)) {
      continue;
    }

    const newTenantId = toEnglishId(tenantDoc.id, 'tenant');
    console.log(`\n  ✏️  tenant "${tenantDoc.id}" → "${newTenantId}"`);
    log.push({ type: 'tenant', oldId: tenantDoc.id, newId: newTenantId });

    if (dryRun) continue;

    // Copy tenant doc to new ID
    const tenantData = tenantDoc.data();
    await db.collection('tenants').doc(newTenantId).set(tenantData);

    // Copy sub-collection: units (and rename Hebrew unit IDs)
    const unitsSnap = await db.collection('tenants').doc(tenantDoc.id).collection('units').get();
    for (const unitDoc of unitsSnap.docs) {
      let unitNewId = unitDoc.id;
      if (hasHebrew(unitDoc.id)) {
        unitNewId = toEnglishId(unitDoc.id, 'unit');
        console.log(`    ✏️  unit "${unitDoc.id}" → "${unitNewId}"`);
        log.push({ type: 'unit', oldId: unitDoc.id, newId: unitNewId });
      }

      const unitData = { ...unitDoc.data() };

      // Fix parentUnitId if it references a Hebrew ID
      if (unitData.parentUnitId && hasHebrew(unitData.parentUnitId)) {
        const oldParent = unitData.parentUnitId;
        unitData.parentUnitId = toEnglishId(oldParent, 'unit');
        console.log(`      🔗 parentUnitId "${oldParent}" → "${unitData.parentUnitId}"`);
      }

      await db.collection('tenants').doc(newTenantId).collection('units').doc(unitNewId).set(unitData);

      // Update access_codes referencing old unitId
      if (hasHebrew(unitDoc.id)) {
        const codesSnap = await db.collection('access_codes')
          .where('unitId', '==', unitDoc.id).get();
        for (const codeDoc of codesSnap.docs) {
          console.log(`      🔑 access_code "${codeDoc.id}" unitId → "${unitNewId}"`);
          await codeDoc.ref.update({ unitId: unitNewId });
        }

        // Update users referencing old unitId
        const usersSnap = await db.collection('users')
          .where('core.unitId', '==', unitDoc.id).get();
        for (const userDoc of usersSnap.docs) {
          console.log(`      👤 user "${userDoc.id}" unitId → "${unitNewId}"`);
          await userDoc.ref.update({ 'core.unitId': unitNewId });
        }
      }
    }

    // Update access_codes referencing old tenantId
    const tenantCodesSnap = await db.collection('access_codes')
      .where('tenantId', '==', tenantDoc.id).get();
    for (const codeDoc of tenantCodesSnap.docs) {
      console.log(`    🔑 access_code "${codeDoc.id}" tenantId → "${newTenantId}"`);
      await codeDoc.ref.update({ tenantId: newTenantId });
    }

    // Update users referencing old tenantId
    const tenantUsersSnap = await db.collection('users')
      .where('core.tenantId', '==', tenantDoc.id).get();
    for (const userDoc of tenantUsersSnap.docs) {
      console.log(`    👤 user "${userDoc.id}" tenantId → "${newTenantId}"`);
      await userDoc.ref.update({ 'core.tenantId': newTenantId });
    }

    // Update authorities that reference this tenant
    const authSnap = await db.collection('authorities')
      .where('tenantId', '==', tenantDoc.id).get();
    for (const authDoc of authSnap.docs) {
      console.log(`    🏛️  authority "${authDoc.id}" tenantId → "${newTenantId}"`);
      await authDoc.ref.update({ tenantId: newTenantId });
    }

    // Delete old tenant doc + its units sub-collection
    const oldUnitsSnap = await db.collection('tenants').doc(tenantDoc.id).collection('units').get();
    for (const oldUnit of oldUnitsSnap.docs) {
      await oldUnit.ref.delete();
    }
    await tenantDoc.ref.delete();
    console.log(`  ✅ Deleted old tenant doc "${tenantDoc.id}"`);
  }

  // ─── 2. Scan units inside non-Hebrew tenants ──────────────────────
  console.log('\n📦 Scanning units within English-ID tenants...');
  const freshTenantsSnap = await db.collection('tenants').get();
  for (const tenantDoc of freshTenantsSnap.docs) {
    const unitsSnap = await db.collection('tenants').doc(tenantDoc.id).collection('units').get();
    for (const unitDoc of unitsSnap.docs) {
      if (!hasHebrew(unitDoc.id)) continue;

      const newUnitId = toEnglishId(unitDoc.id, 'unit');
      console.log(`  ✏️  ${tenantDoc.id}/units/"${unitDoc.id}" → "${newUnitId}"`);
      log.push({ type: 'unit', oldId: unitDoc.id, newId: newUnitId });

      if (dryRun) continue;

      const data = { ...unitDoc.data() };
      if (data.parentUnitId && hasHebrew(data.parentUnitId)) {
        data.parentUnitId = toEnglishId(data.parentUnitId, 'unit');
      }
      await db.collection('tenants').doc(tenantDoc.id).collection('units').doc(newUnitId).set(data);

      const codesSnap = await db.collection('access_codes')
        .where('unitId', '==', unitDoc.id).get();
      for (const codeDoc of codesSnap.docs) {
        await codeDoc.ref.update({ unitId: newUnitId });
      }

      const usersSnap = await db.collection('users')
        .where('core.unitId', '==', unitDoc.id).get();
      for (const userDoc of usersSnap.docs) {
        await userDoc.ref.update({ 'core.unitId': newUnitId });
      }

      await unitDoc.ref.delete();
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log(`${dryRun ? 'Preview' : 'Migration'} complete.`);
  console.log(`  Tenants renamed: ${log.filter(m => m.type === 'tenant').length}`);
  console.log(`  Units renamed:   ${log.filter(m => m.type === 'unit').length}`);
  if (log.length > 0) {
    console.log('\nRename log:');
    log.forEach(m => console.log(`  ${m.type}: "${m.oldId}" → "${m.newId}"`));
  } else {
    console.log('\n  No Hebrew IDs found — nothing to migrate.');
  }
  if (dryRun && log.length > 0) {
    console.log('\nRun WITHOUT --dry-run to apply changes.');
  }
}

run().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
