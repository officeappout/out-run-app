/**
 * scripts/_investigate-core-tabata-station-variety-and-level.ts
 *
 * READ-ONLY. David's item 2 (22.09.2026, field-test doc 33 follow-up), before
 * merging a602c8e5 (core/grass hybrid station → ab-Tabata engine):
 *
 *   (א) Does one core-station tabata block actually vary across several
 *       exercises (like the general finisher), or repeat one exercise?
 *   (ב) Is the level real per-domain data, or does an unassessed user get
 *       HARD exercises? If hard can enter — this is a launch blocker.
 *
 * Mirrors, on the REAL exercises collection: the exact corePool filter
 * dispatchStopContent's 'core' branch uses (hiit_friendly tag +
 * hasExplicitCoreLevel), and the exact level rule buildTabataFromPool uses
 * (poolLevelOf = min(targetPrograms[].level)).
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

/** Mirrors hasExplicitCoreLevel (workout-selection.utils.ts:854-864). */
function hasExplicitCoreLevel(d: any): boolean {
  return (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).some(
    (tp: any) => (tp?.programId === 'core' || String(tp?.programId ?? '').toLowerCase() === 'core')
      && typeof tp?.level === 'number' && tp.level > 0,
  );
}

/** Mirrors poolLevelOf (tabata.block.ts:187-192) — min across ALL targetPrograms, not just core. */
function poolLevelOf(d: any): number {
  const lv = (Array.isArray(d.targetPrograms) ? d.targetPrograms : [])
    .map((t: any) => t?.level).filter((n: any) => typeof n === 'number');
  return lv.length ? Math.min(...lv) : 1;
}

/** The 'core' program's own level specifically (what actually gates this exercise as a core member). */
function coreLevel(d: any): number | null {
  const tp = (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).find(
    (t: any) => (t?.programId === 'core' || String(t?.programId ?? '').toLowerCase() === 'core'),
  );
  return typeof tp?.level === 'number' ? tp.level : null;
}

async function main() {
  console.log(`\n🔎 core-tabata station: variety + level audit — project=${key.project_id}\n`);
  const snap = await db.collection('exercises').get();
  console.log(`Scanned ${snap.size} exercises.\n`);

  const corePool = snap.docs
    .map((doc) => ({ id: doc.id, d: doc.data() as any }))
    .filter(({ d }) => (d.tags ?? []).includes('hiit_friendly') && hasExplicitCoreLevel(d));

  console.log(`corePool (hiit_friendly ∧ hasExplicitCoreLevel) = ${corePool.length} exercises\n`);

  console.log('── All corePool members, sorted by level ──');
  for (const { id, d } of corePool.sort((a, b) => (coreLevel(a.d) ?? 0) - (coreLevel(b.d) ?? 0))) {
    console.log(`   core=L${String(coreLevel(d)).padEnd(2)} poolLevelOf=${poolLevelOf(d)}  ${he(d.name).padEnd(30)} (${id})`);
  }

  console.log(`\n── (ב) Level gate: how many eligible members (poolLevelOf ≤ userLevel) at each userCoreLevel ──`);
  console.log('  (mirrors buildTabataFromPool\'s atLevel filter; corePool has explicit core levels so');
  console.log('   poolLevelOf never defaults to the level-less "1" here — it is a real min() over targetPrograms)');
  for (const lvl of [1, 2, 3, 4, 5, 8, 12]) {
    const eligible = corePool.filter(({ d }) => poolLevelOf(d) <= lvl);
    const flag = eligible.length >= 4 ? '✅ block of 4 possible' : eligible.length >= 2 ? '⚠️ only block of 2' : '❌ too thin — falls back';
    console.log(`   userCoreLevel=${String(lvl).padEnd(2)} → ${String(eligible.length).padEnd(3)} eligible  ${flag}`);
  }

  console.log(`\n── (א) Variety at userCoreLevel=1 (the unassessed/brand-new fallback) ──`);
  const l1 = corePool.filter(({ d }) => poolLevelOf(d) <= 1);
  console.log(`   ${l1.length} exercises pass the level-1 gate:`);
  for (const { id, d } of l1) console.log(`     ${he(d.name).padEnd(30)} core=L${coreLevel(d)} (${id})`);
  if (l1.length === 0) {
    console.log('   ⚠️ ZERO level-1 members — a level-1 user gets NO tabata block at all (falls back to field pool).');
  } else if (l1.length < 4) {
    console.log(`   ⚠️ Fewer than 4 — a level-1 user's block (if built) gets a 2-member variant, not 4.`);
  } else {
    console.log('   ✅ 4+ available — a level-1 user gets real 4-exercise variety (A,B,C,D,A,B,C,D), never one repeat.');
  }

  console.log(`\n── Any core-level ≥2 exercise present at all (would confirm "hard" content exists to guard against) ──`);
  const hard = corePool.filter(({ d }) => (coreLevel(d) ?? 0) >= 2);
  console.log(`   ${hard.length} exercises at core level ≥2 — e.g.: ${hard.slice(0, 5).map(({ d }) => `${he(d.name)}(L${coreLevel(d)})`).join(', ')}`);
  console.log('   These are EXCLUDED for userCoreLevel=1 by the poolLevelOf<=userLevel filter above — verify the counts line up.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
