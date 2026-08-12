/** READ-ONLY probe: current prod state of the tabata rollout. */
import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

(async () => {
  console.log(`\nproject=${key.project_id}\n`);

  const progs = await db.collection('programs').get();
  const slugOf = (p: any): string =>
    p.slug ?? p.movementPattern ?? (p.name ?? '').toLowerCase().replace(/[\s-]+/g, '_');

  // 1. every programLevelSettings doc carrying tabata
  const plsSnap = await db.collection('programLevelSettings').get();
  const withTabata = plsSnap.docs.filter((d) =>
    ((d.data() as any).preferredProtocols ?? []).includes('tabata'),
  );
  console.log(`programLevelSettings with 'tabata' in preferredProtocols: ${withTabata.length}`);

  const byProb = new Map<number, number>();
  for (const d of withTabata) {
    const p = (d.data() as any).tabataProbability;
    byProb.set(p, (byProb.get(p) ?? 0) + 1);
  }
  console.log('tabataProbability distribution:');
  for (const [p, n] of Array.from(byProb.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`   ${p} → ${n} doc(s)${p >= 0.5 ? '   ⚠️  SMOKE OVERRIDE STILL LIVE' : ''}`);
  }

  // 2. anything above the band table (max legit = 0.22)
  const outliers = withTabata.filter((d) => ((d.data() as any).tabataProbability ?? 0) > 0.22);
  console.log(`\nOutliers > 0.22 (${outliers.length}):`);
  for (const d of outliers) {
    const progId = d.id.replace(/_level_\d+$/, '');
    const prog = progs.docs.find((p) => p.id === progId);
    console.log(
      `   ${d.id}  slug=${prog ? slugOf(prog.data()) : '?'}  ` +
      `tabataProbability=${(d.data() as any).tabataProbability}`,
    );
  }

  // 3. hiit_friendly tag population
  const exSnap = await db.collection('exercises').get();
  const tagged = exSnap.docs.filter((d) => ((d.data() as any).tags ?? []).includes('hiit_friendly'));
  console.log(`\nexercises total=${exSnap.size}  hiit_friendly tagged=${tagged.length}`);

  process.exit(0);
})();
