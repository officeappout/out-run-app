// Read-only. Reports what a clean-slate Haifa delete would remove — counts +
// status breakdown for official_routes/curated_routes matching authorityId
// or city="חיפה". Deletes nothing.
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';
const CITY = 'חיפה';

async function reportCollection(db: FirebaseFirestore.Firestore, name: string) {
  const col = db.collection(name);
  const [byAuthority, byCity] = await Promise.all([
    col.where('authorityId', '==', AUTHORITY_ID).get(),
    col.where('city', '==', CITY).get(),
  ]);
  const docs = new Map<string, FirebaseFirestore.DocumentData>();
  for (const d of byAuthority.docs) docs.set(d.id, d.data());
  for (const d of byCity.docs) docs.set(d.id, d.data());

  const statusCounts: Record<string, number> = {};
  const batchCounts: Record<string, number> = {};
  const missingBoth: string[] = [];
  for (const [id, data] of docs) {
    const status = data.status ?? '(no status field)';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const batch = data.importBatchId ?? '(no importBatchId)';
    batchCounts[batch] = (batchCounts[batch] || 0) + 1;
    if (!data.authorityId && !data.city) missingBoth.push(id);
  }

  console.log(`\n=== ${name} — total matched: ${docs.size} (by authorityId: ${byAuthority.size}, by city: ${byCity.size}) ===`);
  console.log('status breakdown:', statusCounts);
  console.log('importBatchId breakdown:', batchCounts);
  if (missingBoth.length) console.log(`⚠️ ${missingBoth.length} docs matched but have neither authorityId nor city set (shouldn't happen): ${missingBoth.join(', ')}`);
  return { total: docs.size, statusCounts };
}

async function main() {
  const db = initFb();
  console.log(`Haifa delete-preview — authorityId=${AUTHORITY_ID}, city="${CITY}". READ-ONLY, deletes nothing.`);
  const official = await reportCollection(db, 'official_routes');
  const curated = await reportCollection(db, 'curated_routes');

  const allStatuses = new Set([...Object.keys(official.statusCounts), ...Object.keys(curated.statusCounts)]);
  const allPending = allStatuses.size === 0 || (allStatuses.size === 1 && allStatuses.has('pending'));
  console.log(`\n=== SUMMARY ===`);
  console.log(`Would delete: ${official.total} official_routes + ${curated.total} curated_routes = ${official.total + curated.total} total docs`);
  console.log(allPending ? '✅ ALL matched docs are status:pending — nothing published/live.' : `⚠️ NON-PENDING docs found — statuses present: ${[...allStatuses].join(', ')}. Do NOT treat as a safe clean-slate delete without review.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
