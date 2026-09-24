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

  console.log('=== old identity fully gone? ===');
  console.log('authorities/חטיבה_810 exists:', (await db.collection('authorities').doc('חטיבה_810').get()).exists);
  console.log('tenants/tenant_810_oq87sb exists:', (await db.collection('tenants').doc('tenant_810_oq87sb').get()).exists);
  console.log('tenants/TUOYvWWA9b8XetYfT6OA exists:', (await db.collection('tenants').doc('TUOYvWWA9b8XetYfT6OA').get()).exists);

  console.log('\n=== exact query the admin unit-drilldown page runs for roster (units/[unitId]/page.tsx) ===');
  const roster = await db.collection('users').where('core.unitId', '==', '__0st2').get();
  console.log(`where('core.unitId','==','__0st2') -> ${roster.size} user(s)`);
  roster.docs.forEach(d => console.log('  uid=', d.id, 'name=', d.data().name, 'core=', JSON.stringify(d.data().core)));

  console.log('\n=== access codes final state ===');
  const mil = await db.collection('access_codes').doc('MIL-9CFQUR').get();
  const mun = await db.collection('access_codes').doc('MUN-KHPUEK').get();
  console.log('MIL-9CFQUR:', JSON.stringify(mil.data()));
  console.log('MUN-KHPUEK:', JSON.stringify(mun.data()));

  console.log('\n=== brigade 810 canonical doc final state ===');
  const auth = await db.collection('authorities').doc('_810____cjo3').get();
  console.log(JSON.stringify(auth.data()));

  console.log('\n=== re-run full 43-org name-collision sweep (confirm no dupes remain) ===');
  const allOrgs = await db.collection('authorities').where('type', '==', 'military_unit').get();
  console.log(`total authorities(type=military_unit) now: ${allOrgs.size}`);
  const byNumber: Record<string, string[]> = {};
  allOrgs.docs.forEach(d => {
    const name = d.data().name;
    const m = String(name).match(/חטיבה\s*(\d+)/) || String(name).match(/חטיבת\s*(\S+)/);
    const key = m ? m[1] : name;
    (byNumber[key] ??= []).push(d.id);
  });
  const dups = Object.entries(byNumber).filter(([, v]) => v.length > 1);
  console.log(`duplicate groups remaining: ${dups.length}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
