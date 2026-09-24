// READ-ONLY. Safety check before any park-loop replacement operation. Deletes/writes
// NOTHING. Reports: (1) full Haifa batch status distribution, (2) the 21 "הקפת" subset's
// status distribution specifically — STOP condition if ANY Haifa route (park-loop or not)
// is anything other than status:'pending'.
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw'; // חיפה
const BATCH_ID = 'haifa-geodiscovery-2026-08-19';

async function main() {
  const db = initFb();
  const snap = await db.collection('official_routes').where('authorityId', '==', AUTHORITY_ID).get();
  const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const batchDocs = docs.filter(d => d.importBatchId === BATCH_ID);
  const parkLoops = batchDocs.filter(d => typeof d.name === 'string' && d.name.startsWith('הקפת '));
  const nonParkLoops = batchDocs.filter(d => !(typeof d.name === 'string' && d.name.startsWith('הקפת ')));

  const statusCounts = (list: any[]) => {
    const c: Record<string, number> = {};
    for (const d of list) c[d.status ?? '(none)'] = (c[d.status ?? '(none)'] || 0) + 1;
    return c;
  };
  const publishedCounts = (list: any[]) => {
    const c: Record<string, number> = {};
    for (const d of list) c[String(d.published)] = (c[String(d.published)] || 0) + 1;
    return c;
  };

  console.log(`=== Haifa batch ${BATCH_ID} — safety check (read-only) ===`);
  console.log(`Total docs for authorityId=${AUTHORITY_ID} (any batch): ${docs.length}`);
  console.log(`Docs in THIS batch: ${batchDocs.length}`);
  console.log(`  status breakdown: ${JSON.stringify(statusCounts(batchDocs))}`);
  console.log(`  published breakdown: ${JSON.stringify(publishedCounts(batchDocs))}`);
  console.log(`\n"הקפת" park-loop subset: ${parkLoops.length} docs`);
  console.log(`  status breakdown: ${JSON.stringify(statusCounts(parkLoops))}`);
  console.log(`  published breakdown: ${JSON.stringify(publishedCounts(parkLoops))}`);
  console.log(`\nNon-park-loop subset: ${nonParkLoops.length} docs`);
  console.log(`  status breakdown: ${JSON.stringify(statusCounts(nonParkLoops))}`);

  const anyApprovedInBatch = batchDocs.some(d => d.status !== 'pending' || d.published === true);
  console.log(`\n${anyApprovedInBatch ? '🛑 STOP — at least one Haifa batch route is NOT pending/unpublished. Do not proceed with any delete/apply.' : '✅ SAFE — every Haifa batch route (park-loop and non-park-loop) is status:pending, published:false.'}`);

  console.log(`\n=== The 21 "הקפת" doc IDs (for the delete preview) ===`);
  for (const d of parkLoops) console.log(`  ${d.id}  ${d.name}  status=${d.status} published=${d.published} distance=${d.distance}m`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
