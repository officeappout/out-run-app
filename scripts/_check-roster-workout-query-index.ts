/**
 * READ-ONLY, PRODUCTION. No writes.
 *
 * Slice F's proposed query shape is where('userId','in',chunk).where(
 * 'date','>=',sevenDaysAgo) — an `in` filter combined with a range filter
 * on a DIFFERENT field, which Firestore requires an explicit composite
 * index for. firestore.indexes.json has no existing index matching this
 * shape (checked by inspection). Rather than guess the exact index
 * definition from memory, this runs the REAL query shape against
 * production with a throwaway uid list — if an index is missing, Firestore
 * itself returns a FAILED_PRECONDITION error that names the exact
 * composite required (often with a direct console link), which is more
 * authoritative than reasoning about it. The emulator does NOT reliably
 * enforce composite-index requirements (established precedent — see
 * unitPermissionScope.ts's own comment on its collection-group index),
 * so this has to run against production to mean anything.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // First pass: throwaway fake uids (zero real matches).
  const fakeUidChunk = Array.from({ length: 5 }, (_, i) => `throwaway-uid-${i}`);
  try {
    const snap = await db.collection('workouts')
      .where('userId', 'in', fakeUidChunk)
      .where('date', '>=', sevenDaysAgo)
      .select('userId', 'date')
      .get();
    console.log('✅ [fake uids, 0 expected matches] Query succeeded. Matched docs:', snap.size);
  } catch (err: any) {
    console.log('❌ [fake uids] Query FAILED:', err?.code, err?.message);
  }

  // Second pass: real uids with real recent-ish data, an unbounded start
  // date (all-time, not just 7 days) to maximize the chance of a non-empty
  // result set and fully exercise the query planner — ruling out a false
  // negative from a trivial zero-result short-circuit.
  const realUsersSnap = await db.collection('workouts').select('userId').limit(30).get();
  const realUidChunk = Array.from(new Set(realUsersSnap.docs.map((d) => d.data().userId as string))).slice(0, 30);
  console.log(`\nSecond pass: ${realUidChunk.length} REAL uids, unbounded start date`);
  try {
    const snap = await db.collection('workouts')
      .where('userId', 'in', realUidChunk)
      .where('date', '>=', new Date(0))
      .select('userId', 'date')
      .get();
    console.log('✅ [real uids, unbounded date] Query succeeded. Matched docs:', snap.size);
  } catch (err: any) {
    console.log('❌ [real uids, unbounded date] Query FAILED — authoritative index requirement:');
    console.log('code:', err?.code);
    console.log('message:', err?.message);
  }

  // Third pass: the ACTUAL proposed shape — real uids, real 7-day window.
  console.log(`\nThird pass: ${realUidChunk.length} REAL uids, real 7-day window`);
  try {
    const snap = await db.collection('workouts')
      .where('userId', 'in', realUidChunk)
      .where('date', '>=', sevenDaysAgo)
      .select('userId', 'date')
      .get();
    console.log('✅ [real uids, 7-day window] Query succeeded. Matched docs:', snap.size);
  } catch (err: any) {
    console.log('❌ [real uids, 7-day window] Query FAILED — authoritative index requirement:');
    console.log('code:', err?.code);
    console.log('message:', err?.message);
  }
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
