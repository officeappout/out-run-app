/**
 * scripts/_investigate-military-duplicates.ts — READ ONLY, throwaway.
 * Deep investigation of the חטיבה 810 duplicate-org finding + a full sweep
 * of all 43 military authorities for other duplicates. No writes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

function fmtTs(ts: any) {
  if (!ts || typeof ts._seconds !== 'number') return String(ts);
  return new Date(ts._seconds * 1000).toISOString();
}

async function main() {
  init();
  const db = admin.firestore();

  const ids810 = {
    'authorities/_810____cjo3': () => db.collection('authorities').doc('_810____cjo3').get(),
    'authorities/חטיבה_810': () => db.collection('authorities').doc('חטיבה_810').get(),
    'tenants/_810____cjo3': () => db.collection('tenants').doc('_810____cjo3').get(),
    'tenants/tenant_810_oq87sb': () => db.collection('tenants').doc('tenant_810_oq87sb').get(),
  };

  console.log('========== PART 1: full doc dumps for all 4 candidate 810 records ==========');
  for (const [label, fn] of Object.entries(ids810)) {
    const snap = await fn();
    console.log(`\n-- ${label} (exists=${snap.exists}) --`);
    if (snap.exists) {
      const d: any = snap.data();
      const out: any = { ...d };
      if (out.createdAt) out.createdAt = fmtTs(out.createdAt);
      if (out.updatedAt) out.updatedAt = fmtTs(out.updatedAt);
      console.log(JSON.stringify(out, null, 2));
    }
  }

  console.log('\n========== PART 2: full recursive units dump for both 810 tenants ==========');
  for (const orgId of ['_810____cjo3', 'tenant_810_oq87sb']) {
    console.log(`\n-- tenants/${orgId}/units (all docs) --`);
    const units = await db.collection('tenants').doc(orgId).collection('units').get();
    for (const u of units.docs) {
      const d: any = u.data();
      if (d.createdAt) d.createdAt = fmtTs(d.createdAt);
      console.log(`  ${u.id}:`, JSON.stringify(d));
    }
    // check for any children of children (a 3rd level under any unit found)
    for (const u of units.docs) {
      const children = await db.collection('tenants').doc(orgId).collection('units').where('parentUnitId', '==', u.id).get();
      if (!children.empty) {
        console.log(`    [children of ${u.id}]:`, children.docs.map((c) => c.id));
      }
    }
  }

  console.log('\n========== PART 3: who references these ids? (users, access_codes, readiness_configs) ==========');
  const candidateTenantIds = ['_810____cjo3', 'חטיבה_810', 'tenant_810_oq87sb'];
  const candidateUnitIds = ['9307_nhcj', '__0st2', 'unit_1810_whzx65', 'unit_9307_0pgbbd', 'unit_jdzofm'];

  const usersByTenant = await db.collection('users').where('core.tenantId', 'in', candidateTenantIds).get();
  console.log(`users with core.tenantId in candidate set: ${usersByTenant.size}`);
  usersByTenant.docs.forEach((d) => console.log('  uid=', d.id, 'core=', JSON.stringify(d.data()?.core)));

  const usersByUnit = await db.collection('users').where('core.unitId', 'in', candidateUnitIds).get();
  console.log(`users with core.unitId in candidate set: ${usersByUnit.size}`);
  usersByUnit.docs.forEach((d) => console.log('  uid=', d.id, 'core=', JSON.stringify(d.data()?.core)));

  try {
    const codes = await db.collection('access_codes').where('tenantId', 'in', candidateTenantIds).get();
    console.log(`access_codes referencing candidate tenantIds: ${codes.size}`);
    codes.docs.forEach((d) => console.log('  code=', d.id, JSON.stringify(d.data())));
  } catch (e: any) { console.log('access_codes query failed:', e.message); }

  try {
    const readiness = await db.collection('readiness_configs').get();
    const matching = readiness.docs.filter((d) => candidateUnitIds.includes(d.id) || candidateTenantIds.includes((d.data() as any)?.tenantId));
    console.log(`readiness_configs total=${readiness.size}, matching candidate set: ${matching.length}`);
    matching.forEach((d) => console.log('  id=', d.id, JSON.stringify(d.data())));
  } catch (e: any) { console.log('readiness_configs query failed:', e.message); }

  console.log('\n========== PART 4: full sweep of all 43 authorities (type=military_unit) ==========');
  const allOrgs = await db.collection('authorities').where('type', '==', 'military_unit').get();
  const rows: any[] = [];
  for (const doc of allOrgs.docs) {
    const d: any = doc.data();
    const tenantDoc = await db.collection('tenants').doc(doc.id).get();
    const unitsSnap = tenantDoc.exists ? await db.collection('tenants').doc(doc.id).collection('units').limit(1).get() : null;
    rows.push({
      id: doc.id,
      name: d.name,
      unitCount: d.unitCount,
      userCount: d.userCount,
      createdAt: fmtTs(d.createdAt),
      hasMatchingTenantDoc: tenantDoc.exists,
      tenantDocHasUnits: unitsSnap ? !unitsSnap.empty : false,
    });
  }
  rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  console.log(`total authorities(type=military_unit): ${rows.length}`);
  rows.forEach((r) => console.log(`  [${r.createdAt}] ${r.id} | ${r.name} | unitCount=${r.unitCount} | tenantDocExists=${r.hasMatchingTenantDoc} | tenantHasUnits=${r.tenantDocHasUnits}`));

  console.log('\n========== PART 5: name-collision check (same brigade number appearing twice) ==========');
  const byNumber: Record<string, string[]> = {};
  for (const r of rows) {
    const m = String(r.name).match(/חטיבה\s*(\d+)/) || String(r.name).match(/חטיבת\s*(\S+)/);
    const key = m ? m[1] : r.name;
    byNumber[key] = byNumber[key] || [];
    byNumber[key].push(`${r.id} ("${r.name}")`);
  }
  const dups = Object.entries(byNumber).filter(([, v]) => v.length > 1);
  console.log(`duplicate-by-number groups found: ${dups.length}`);
  dups.forEach(([k, v]) => console.log(`  brigade "${k}": ${v.join('  |  ')}`));

  console.log('\n========== PART 6: root tenants docs with a "type" or "authorityId" field set (orphan-candidate sweep) ==========');
  // full scan is expensive; rely on collectionGroup(units) parents we already know about, plus a bounded scan for 'type' field
  const knownOtherTenantIds = ['TUOYvWWA9b8XetYfT6OA', 'tenant_i07zcg', 'wix_iv5x'];
  for (const tid of knownOtherTenantIds) {
    const t = await db.collection('tenants').doc(tid).get();
    console.log(`  tenants/${tid}:`, JSON.stringify(t.data()));
    const matchingAuth = t.exists && (t.data() as any)?.authorityId ? await db.collection('authorities').doc((t.data() as any).authorityId).get() : null;
    if (matchingAuth) console.log(`    -> authorityId points to authorities/${(t.data() as any).authorityId} (exists=${matchingAuth.exists}, name=${matchingAuth.data()?.name})`);
  }

  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
