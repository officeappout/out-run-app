// LIVE WRITE — authorized by explicit "GO" from David, 23.08.2026. Deletes exactly the
// 28 previewed, safety-checked docs (re-verified immediately before deleting). Nothing
// else touched.
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';

const TARGET_IDS = [
  'bQlFfeGDl86EySQOxb8s', 'hWywdb5fNfmjr7xdFw7l', 'pWIlO6TTKAAaPZqs0Qf5', '4za4RCaciDSNPCihnNb3',
  'JdWvHXYxxVmQAjcHgzy4', 'mUk1QIlEfKlasT2akTaX', 'NQN5S7YcU3tjnOQbKypk', 'kONJx1Ao2U6KH3B5etCZ',
  'XXJXwFhIaKMzHvCOvesk', 'BK0n29kVIyCUnlspRnES', 'fKlpjIRnQZCjq0Pn8Eva', 'NcXz6DL57NgKHT9oNPkv',
  'PgAMUqRtoJHSZibQujUc', '0pEQZ8VW5ZCLF9FDOtMm', 'g7STMJm3jLS9i2GAELoc', 'Ah5VGWdEqzaO9gLZDFox',
  '9V2nIZeVEsZYtl18YY83', 'V6qLvoNk0nTi7iaUHWEm', '4Q0bnjPvx70r3SuKPf0Q', 'RhtmqMAIBpza5VDWQKvh',
  'K0dULDSZDYgKUAjv5YIY', '1IJo8wbnxbI8VmHXgwew', 'hLuEGJnWXgMlgxgFNl8w', 'CajCNVvwFkgdmgL2UQrm',
  'gthjBJwnly9WHLoi1gk1', 'UktDEqaknAWV3SgEBQXU', 'aF6KxVhgZaL8Wr372uo4', '9adiSBUa2jpVWChAquJT',
];

function classify(d: any): string {
  if (d.routeShape === 'loop' && typeof d.name === 'string' && d.name.startsWith('הקפת ')) return 'park loop';
  if (d.routeShape === 'loop') return 'other loop';
  if (d.source?.externalId?.startsWith('osm:rel/')) return 'trail';
  if (d.activityType === 'cycling') return 'cycling';
  return 'named segment';
}

async function main() {
  const db = initFb();
  console.log(`=== Haifa recreational-quality cleanup — LIVE APPLY (authorized) ===\n`);
  console.log(`Re-verifying all 28 targets immediately before deleting …`);
  const docs = await Promise.all(TARGET_IDS.map(id => db.collection('official_routes').doc(id).get()));
  const problems: string[] = [];
  for (let i = 0; i < docs.length; i++) {
    const snap = docs[i];
    if (!snap.exists) { problems.push(`${TARGET_IDS[i]} does not exist`); continue; }
    const d = snap.data()!;
    if (d.status !== 'pending' || d.published === true) problems.push(`${TARGET_IDS[i]} (${d.name}) is NOT pending/unpublished: status=${d.status} published=${d.published}`);
  }
  if (problems.length) {
    console.log(`🛑 STOP — re-verification found problems, aborting before any delete:`);
    for (const p of problems) console.log(`   ${p}`);
    process.exit(1);
  }
  console.log(`✅ all 28 re-confirmed pending/unpublished. Proceeding.\n`);

  let batch = db.batch(), n = 0;
  for (const id of TARGET_IDS) { batch.delete(db.collection('official_routes').doc(id)); if (++n % 450 === 0) { await batch.commit(); batch = db.batch(); } }
  await batch.commit();
  console.log(`✅ deleted ${TARGET_IDS.length} docs.\n`);

  // ─── Independent fresh verification ───
  console.log(`=== Independent re-verification ===`);
  const snap = await db.collection('official_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const remaining = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  console.log(`Total Haifa official_routes now: ${remaining.length} (expected 77)`);

  const stillPresent = TARGET_IDS.filter(id => remaining.some(d => d.id === id));
  console.log(`Deleted IDs still present (expected 0): ${stillPresent.length}`);
  if (stillPresent.length) for (const id of stillPresent) console.log(`   STILL PRESENT: ${id}`);

  const breakdown: Record<string, number> = {};
  for (const d of remaining) { const c = classify(d); breakdown[c] = (breakdown[c] || 0) + 1; }
  console.log(`\nFinal per-type breakdown:`);
  console.log(JSON.stringify(breakdown, null, 2));

  console.log(`\n=== APPLY COMPLETE ===`);
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
