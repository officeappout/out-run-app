/**
 * scripts/_investigate-core-tabata-corrected.ts
 *
 * CORRECTION of _investigate-core-tabata-station-variety-and-level.ts: that
 * script's hasExplicitCoreLevel mirror checked `tp.programId === 'core'`
 * literally, but real targetPrograms.programId values are Firestore HASH
 * ids (e.g. "kDMpobbKsuVTByTIKUpe") — the real hasExplicitCoreLevel resolves
 * these via resolveToSlug against the programs collection. This script does
 * that resolution properly before re-running the same variety/level audit.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

async function main() {
  const progSnap = await db.collection('programs').get();
  const idToSlug = new Map<string, string>();
  for (const doc of progSnap.docs) {
    const d = doc.data() as any;
    const slug = d.slug ?? d.id ?? doc.id;
    idToSlug.set(doc.id, slug);
  }
  const coreProgramDoc = progSnap.docs.find((doc) => {
    const d = doc.data() as any;
    return (d.slug ?? '').toLowerCase() === 'core' || doc.id === 'core';
  });
  console.log(`programs collection: ${progSnap.size} docs`);
  console.log(`core program doc: ${coreProgramDoc ? `${coreProgramDoc.id} (slug=${(coreProgramDoc.data() as any).slug})` : 'NOT FOUND BY SLUG — will fall back to name match'}`);

  // Fallback: also try matching by name containing "בטן"/"core" if slug lookup failed.
  let coreProgramId = coreProgramDoc?.id;
  if (!coreProgramId) {
    const byName = progSnap.docs.find((doc) => {
      const d = doc.data() as any;
      const name = he(d.name ?? d.title);
      return /core|בטן/i.test(name) || /core|בטן/i.test(d.slug ?? '');
    });
    coreProgramId = byName?.id;
    if (byName) console.log(`  matched by name instead: ${byName.id} → ${JSON.stringify(byName.data())}`);
  }
  if (!coreProgramId) {
    console.log('❌ Could not resolve a "core" program id at all — printing all programs for manual inspection:');
    for (const doc of progSnap.docs) console.log(`   ${doc.id}: ${JSON.stringify(doc.data())}`);
    return;
  }

  function hasExplicitCoreLevel(d: any): boolean {
    return (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).some(
      (tp: any) => tp?.programId === coreProgramId && typeof tp?.level === 'number' && tp.level > 0,
    );
  }
  function coreLevel(d: any): number | null {
    const tp = (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).find((t: any) => t?.programId === coreProgramId);
    return typeof tp?.level === 'number' ? tp.level : null;
  }
  function poolLevelOf(d: any): number {
    const lv = (Array.isArray(d.targetPrograms) ? d.targetPrograms : [])
      .map((t: any) => t?.level).filter((n: any) => typeof n === 'number');
    return lv.length ? Math.min(...lv) : 1;
  }

  const exSnap = await db.collection('exercises').get();
  const all = exSnap.docs.map((doc) => ({ id: doc.id, d: doc.data() as any }));
  const corePool = all.filter(({ d }) => (d.tags ?? []).includes('hiit_friendly') && hasExplicitCoreLevel(d));

  console.log(`\ncorePool (hiit_friendly ∧ real hasExplicitCoreLevel via id='${coreProgramId}') = ${corePool.length}\n`);
  for (const { id, d } of corePool.sort((a, b) => (coreLevel(a.d) ?? 0) - (coreLevel(b.d) ?? 0))) {
    console.log(`   core=L${String(coreLevel(d)).padEnd(2)} poolLevelOf=${poolLevelOf(d)}  ${he(d.name).padEnd(30)} (${id})`);
  }

  console.log(`\n── (ב) Level gate: eligible members (poolLevelOf ≤ userCoreLevel) ──`);
  for (const lvl of [1, 2, 3, 4, 5, 8, 12]) {
    const eligible = corePool.filter(({ d }) => poolLevelOf(d) <= lvl);
    const flag = eligible.length >= 4 ? '✅ block of 4 possible' : eligible.length >= 2 ? '⚠️ only block of 2' : '❌ too thin — falls back';
    console.log(`   userCoreLevel=${String(lvl).padEnd(2)} → ${String(eligible.length).padEnd(3)} eligible  ${flag}`);
  }

  console.log(`\n── (א) Variety at userCoreLevel=1 ──`);
  const l1 = corePool.filter(({ d }) => poolLevelOf(d) <= 1);
  console.log(`   ${l1.length} exercises pass:`);
  for (const { id, d } of l1) console.log(`     ${he(d.name).padEnd(30)} core=L${coreLevel(d)} (${id})`);

  const hard = corePool.filter(({ d }) => (coreLevel(d) ?? 0) >= 2);
  console.log(`\n── core-level ≥2 exercises present (${hard.length}) — must be EXCLUDED for userCoreLevel=1 ──`);
  for (const { id, d } of hard) console.log(`     ${he(d.name).padEnd(30)} core=L${coreLevel(d)} (${id})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
