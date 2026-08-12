/** READ-ONLY: what signals can classify conditioning vs slow-strength? */
import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

(async () => {
  const snap = await db.collection('exercises').get();
  const pool = snap.docs.filter((d) => ((d.data() as any).tags ?? []).includes('hiit_friendly'));
  console.log(`\ncurrent hiit_friendly pool = ${pool.length}\n`);

  // field coverage across the pool
  const cov: Record<string, number> = {};
  const tagCount: Record<string, number> = {};
  const typeCount: Record<string, number> = {};
  const sweatCount: Record<string, number> = {};
  for (const d of pool) {
    const x = d.data() as any;
    for (const f of ['movementGroup', 'mechanicalType', 'primaryMuscle', 'sweatLevel', 'type', 'secondsPerRep', 'movementType', 'isFollowAlong']) {
      if (x[f] !== undefined && x[f] !== null && x[f] !== '') cov[f] = (cov[f] ?? 0) + 1;
    }
    for (const t of (x.tags ?? [])) tagCount[t] = (tagCount[t] ?? 0) + 1;
    typeCount[String(x.type)] = (typeCount[String(x.type)] ?? 0) + 1;
    sweatCount[String(x.sweatLevel)] = (sweatCount[String(x.sweatLevel)] ?? 0) + 1;
  }
  console.log('field coverage in pool:', cov);
  console.log('tags in pool:', tagCount);
  console.log('type in pool:', typeCount);
  console.log('sweatLevel in pool:', sweatCount);

  // the exercises David named as WRONG, and as RIGHT
  const NAMED = /ישיבת L|גוד מורנינג|דדליפט רומני|מטפס הרים|סקוואט קפיצה|סמוך קום|אופניים|כפיפות בטן/;
  console.log('\n── David-named exemplars (in current pool) ──');
  for (const d of pool) {
    const x = d.data() as any;
    const n = he(x.name);
    if (!NAMED.test(n)) continue;
    console.log(
      `  ${n.padEnd(34)} mg=${(x.movementGroup ?? '—').padEnd(16)} mech=${(x.mechanicalType ?? '—').padEnd(10)} ` +
      `type=${String(x.type ?? '—').padEnd(6)} sweat=${x.sweatLevel ?? '—'} tags=[${(x.tags ?? []).join(',')}]`,
    );
  }
  process.exit(0);
})();
