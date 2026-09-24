// Read-only. Verifies the just-applied Haifa official_routes batch: count, status,
// and a breakdown reconstructed from stored fields (mirrors geo-discovery-routes.ts's
// own kind/isLoop/isBicycle classification, since the live console log for this run
// got truncated by an upstream `tail` pipe).
import * as admin from 'firebase-admin';
function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}
const AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';
const BATCH_ID = 'haifa-geodiscovery-2026-08-19';

async function main() {
  const db = initFb();
  const snap = await db.collection('official_routes').where('authorityId', '==', AUTHORITY_ID).get();
  const docs = snap.docs.map(d => d.data());

  const statusCounts: Record<string, number> = {};
  const batchCounts: Record<string, number> = {};
  const publishedCounts: Record<string, number> = {};
  for (const d of docs) {
    statusCounts[d.status ?? '(none)'] = (statusCounts[d.status ?? '(none)'] || 0) + 1;
    batchCounts[d.importBatchId ?? '(none)'] = (batchCounts[d.importBatchId ?? '(none)'] || 0) + 1;
    publishedCounts[String(d.published)] = (publishedCounts[String(d.published)] || 0) + 1;
  }

  let cycling = 0, parkLoop = 0, trailRel = 0, plainLoop = 0, namedSegment = 0, other = 0;
  const otherNames: string[] = [];
  for (const d of docs) {
    const name: string = d.name || '';
    const extId: string = d.source?.externalId || '';
    if (d.activityType === 'cycling') { cycling++; continue; }
    if (name.startsWith('הקפת ')) { parkLoop++; continue; }
    if (extId.startsWith('osm:rel/')) { trailRel++; continue; }
    if (name.startsWith('לולאת ')) { plainLoop++; continue; }
    if (d.source?.externalId) { namedSegment++; continue; }
    other++; otherNames.push(name);
  }

  console.log(`=== Haifa official_routes — post-apply verification ===`);
  console.log(`Total docs (authorityId=${AUTHORITY_ID}): ${snap.size}`);
  console.log(`status breakdown:`, statusCounts);
  console.log(`published breakdown:`, publishedCounts);
  console.log(`importBatchId breakdown:`, batchCounts);
  console.log(`\nType breakdown (reconstructed from name/source fields):`);
  console.log(`  🥾 trail (OSM relation)     : ${trailRel}`);
  console.log(`  🌳 park loop ("הקפת ...")   : ${parkLoop}`);
  console.log(`  🔁 loop ("לולאת ...")       : ${plainLoop}`);
  console.log(`  · named segment             : ${namedSegment}`);
  console.log(`  🚲 cycling                  : ${cycling}`);
  console.log(`  (unclassified)              : ${other}${other ? ' — ' + otherNames.join(', ') : ''}`);
  console.log(`  sum: ${trailRel + parkLoop + plainLoop + namedSegment + cycling + other}`);

  const allPending = Object.keys(statusCounts).length === 1 && statusCounts['pending'] === snap.size;
  const allUnpublished = Object.keys(publishedCounts).length === 1 && publishedCounts['false'] === snap.size;
  console.log(`\n${allPending ? '✅' : '⚠️'} all status:pending`);
  console.log(`${allUnpublished ? '✅' : '⚠️'} all published:false`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
