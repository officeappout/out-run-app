/**
 * David asked (24.09.2026): how many real users can actually hit the
 * ContextualEngine.passesFieldMode crash on doc qHy5Te1jSPSi5jA3W9d6 today?
 * READ-ONLY. Confirms empirically whether the REAL production fetch path
 * (getAllExercises, which orders by the `name` MAP field) actually returns
 * this doc at all — Firestore excludes documents missing an orderBy field
 * from the result set entirely, which would make this doc structurally
 * unreachable via the real generation pipeline regardless of the crash.
 */
import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

async function main() {
  const TARGET = 'qHy5Te1jSPSi5jA3W9d6';

  // 1. Confirm the doc's full raw content (every field) — is it a real exercise or an orphan stub?
  const doc = await db.collection('exercises').doc(TARGET).get();
  console.log(`Doc exists: ${doc.exists}`);
  console.log(`Full raw content: ${JSON.stringify(doc.data(), null, 2)}`);

  // 2. The REAL production query shape: orderBy('name', 'asc') — used by
  // getAllExercises() (exercise.service.ts:76-86), the fetch every hybrid/
  // home/park generation path uses. If Firestore excludes the malformed doc
  // (no `name` field at all) from this result set, it's structurally
  // unreachable via generation regardless of the crash.
  const orderedSnap = await db.collection('exercises').orderBy('name', 'asc').get();
  const inOrderedResults = orderedSnap.docs.some((d) => d.id === TARGET);
  console.log(`\nTotal docs via orderBy('name','asc') (= getAllExercises, the REAL production fetch): ${orderedSnap.size}`);
  console.log(`Target doc present in orderBy('name') results: ${inOrderedResults}`);

  // 3. Compare to the raw unordered count (what my own verification script used).
  const rawSnap = await db.collection('exercises').get();
  console.log(`Total docs via raw .get() (no orderBy, what getAllExercisesNoOrder + my own verify script used): ${rawSnap.size}`);
  console.log(`Difference (docs excluded by orderBy('name') because they lack a 'name' field): ${rawSnap.size - orderedSnap.size}`);

  // 4. List every doc excluded by orderBy('name') — is qHy5Te1jSPSi5jA3W9d6 the ONLY one, or are there others with the same class of gap?
  const orderedIds = new Set(orderedSnap.docs.map((d) => d.id));
  const excluded = rawSnap.docs.filter((d) => !orderedIds.has(d.id));
  console.log(`\nAll docs excluded from orderBy('name') results (${excluded.length}):`);
  excluded.forEach((d) => {
    const data = d.data() as any;
    console.log(`  id=${d.id} name=${JSON.stringify(data.name)} createdAt=${data.createdAt?.toDate?.() ?? data.createdAt} tags=${JSON.stringify(data.tags)}`);
  });

  // 5. getAllExercisesNoOrder's real callers are client-side Exercise Library
  // browse hooks (useExerciseLibraryFilters/useExerciseMasterData) — confirm
  // whether THAT query path would surface the doc to an end user directly
  // (e.g. would it render as a blank/broken card, separate from the
  // ContextualEngine crash which is a workout-GENERATION-time concern only).
  console.log(`\nnormalizeExercise would receive this doc via getAllExercisesNoOrder (Exercise Library browse UI) — doc.name=${JSON.stringify((doc.data() as any)?.name)}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
