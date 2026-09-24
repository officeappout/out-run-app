/**
 * scripts/_verify-military-units.ts — READ ONLY, throwaway.
 * Verifies a claim about live data: are there already ~43 military
 * organizations (brigades) seeded under `authorities`/`tenants`, each with
 * a units subcollection (battalions/companies)? Read-only, no writes.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  init();
  const db = admin.firestore();

  console.log('=== authorities where tenantType == "military" ===');
  const byTenantType = await db.collection('authorities').where('tenantType', '==', 'military').get();
  console.log(`count: ${byTenantType.size}`);
  byTenantType.docs.slice(0, 50).forEach((d) => {
    const v = d.data();
    console.log(`  - ${d.id} | name=${v.name} | type=${v.type} | unitCount=${v.unitCount}`);
  });

  console.log('\n=== authorities where type == "military_unit" ===');
  const byType = await db.collection('authorities').where('type', '==', 'military_unit').get();
  console.log(`count: ${byType.size}`);
  byType.docs.slice(0, 50).forEach((d) => {
    const v = d.data();
    console.log(`  - ${d.id} | name=${v.name} | tenantType=${v.tenantType} | unitCount=${v.unitCount}`);
  });

  console.log('\n=== top-level tenants collection (if it exists as its own root collection) ===');
  const tenantsRoot = await db.collection('tenants').limit(60).get();
  console.log(`count (capped at 60): ${tenantsRoot.size}`);
  tenantsRoot.docs.forEach((d) => {
    const v = d.data();
    console.log(`  - ${d.id} | name=${v.name} | tenantType=${v.tenantType}`);
  });

  // Drill into a sample of orgs found via either query, check their units subcollection.
  const orgIds = new Set<string>([...byTenantType.docs.map((d) => d.id), ...byType.docs.map((d) => d.id), ...tenantsRoot.docs.map((d) => d.id)]);
  console.log(`\n=== drilling into units subcollection for ${Math.min(orgIds.size, 8)} sample org(s) ===`);
  let i = 0;
  for (const orgId of orgIds) {
    if (i++ >= 8) break;
    const unitsSnap = await db.collection('tenants').doc(orgId).collection('units').limit(10).get();
    console.log(`\n  org ${orgId}: ${unitsSnap.size} unit doc(s) (capped 10)`);
    unitsSnap.docs.forEach((u) => {
      const uv = u.data();
      console.log(`    - ${u.id} | name=${uv.name} | parentUnitId=${uv.parentUnitId} | unitPath=${JSON.stringify(uv.unitPath)} | type=${uv.type ?? uv.unitType}`);
    });
  }

  console.log('\n=== direct check: authorities/_810____cjo3/units (known unitCount=2 sample) ===');
  const direct = await db.collection('authorities').doc('_810____cjo3').collection('units').get();
  direct.docs.forEach((d) => console.log(`  - ${d.id} | ${JSON.stringify(d.data())}`));

  console.log('\n=== authorities/_810____cjo3 doc fields ===');
  const orgDoc = await db.collection('authorities').doc('_810____cjo3').get();
  console.log(JSON.stringify(orgDoc.data(), null, 2));

  console.log('\n=== collectionGroup("units") where parentUnitId references org, or any doc mentioning _810____cjo3 ===');
  try {
    const cg = await db.collectionGroup('units').where('orgId', '==', '_810____cjo3').limit(10).get();
    console.log(`by orgId: ${cg.size}`);
    cg.docs.forEach((d) => console.log('  path=', d.ref.path, JSON.stringify(d.data())));
  } catch (e: any) { console.log('orgId query failed:', e.message); }
  try {
    const cg2 = await db.collectionGroup('units').where('tenantId', '==', '_810____cjo3').limit(10).get();
    console.log(`by tenantId: ${cg2.size}`);
    cg2.docs.forEach((d) => console.log('  path=', d.ref.path, JSON.stringify(d.data())));
  } catch (e: any) { console.log('tenantId query failed:', e.message); }
  try {
    const cgAll = await db.collectionGroup('units').limit(20).get();
    console.log(`\nany "units" collectionGroup docs at all (sample up to 20): ${cgAll.size}`);
    cgAll.docs.forEach((d) => console.log('  path=', d.ref.path));
  } catch (e: any) { console.log('collectionGroup all query failed:', e.message); }

  console.log('\n=== full contents: tenants/_810____cjo3/units ===');
  const u1 = await db.collection('tenants').doc('_810____cjo3').collection('units').get();
  u1.docs.forEach((d) => console.log(`  ${d.id}:`, JSON.stringify(d.data())));

  console.log('\n=== full contents: tenants/tenant_810_oq87sb/units ===');
  const u2 = await db.collection('tenants').doc('tenant_810_oq87sb').collection('units').get();
  u2.docs.forEach((d) => console.log(`  ${d.id}:`, JSON.stringify(d.data())));

  console.log('\n=== tenants/tenant_810_oq87sb doc itself (is it mirrored in authorities?) ===');
  const tDoc = await db.collection('tenants').doc('tenant_810_oq87sb').get();
  console.log(JSON.stringify(tDoc.data(), null, 2));
  const aDoc = await db.collection('authorities').doc('tenant_810_oq87sb').get();
  console.log('matching authorities/tenant_810_oq87sb exists:', aDoc.exists);

  console.log('\n=== authorities doc named exactly "חטיבה_810" (dup?) ===');
  const dupDoc = await db.collection('authorities').doc('חטיבה_810').get();
  console.log(JSON.stringify(dupDoc.data(), null, 2));

  console.log('\n=== any live user with core.unitId in the known unit id set? ===');
  const knownUnitIds = ['9307_nhcj', '__0st2', 'unit_1810_whzx65', 'unit_9307_0pgbbd', 'unit_jdzofm'];
  for (const uid of knownUnitIds) {
    const q = await db.collection('users').where('core.unitId', '==', uid).limit(3).get();
    console.log(`  unitId=${uid}: ${q.size} user(s)`);
  }

  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
