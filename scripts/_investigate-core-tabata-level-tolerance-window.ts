/**
 * scripts/_investigate-core-tabata-level-tolerance-window.ts
 *
 * READ-ONLY. David's follow-up (22.09.2026, after field-test doc 34): the
 * regular strength engine uses a ±levelTolerance WINDOW (ContextualEngine.ts:113,
 * default ±3 — see resolveConsistentComparisonLevels/consistent.userLevel),
 * not an exact ceiling. buildTabataFromPool (tabata.block.ts:248-253) instead
 * uses a hard ONE-SIDED ceiling: poolLevelOf(ex) <= userLevel, no tolerance
 * at all. This script re-runs the real corePool count from doc 34, but with
 * the SAME ±3 window the strength engine already uses in production, to
 * answer: would enough core exercises become eligible for level-1/level-2
 * users to build a real 4-member (or 2-member) block?
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

const CORE_PROGRAM_ID = 'kDMpobbKsuVTByTIKUpe'; // resolved + verified in _investigate-core-tabata-corrected.ts

function hasExplicitCoreLevel(d: any): boolean {
  return (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).some(
    (tp: any) => tp?.programId === CORE_PROGRAM_ID && typeof tp?.level === 'number' && tp.level > 0,
  );
}
function coreLevel(d: any): number {
  const tp = (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).find((t: any) => t?.programId === CORE_PROGRAM_ID);
  return tp?.level ?? 0;
}

async function main() {
  const exSnap = await db.collection('exercises').get();
  const corePool = exSnap.docs
    .map((doc) => ({ id: doc.id, d: doc.data() as any }))
    .filter(({ d }) => (d.tags ?? []).includes('hiit_friendly') && hasExplicitCoreLevel(d))
    .map(({ id, d }) => ({ id, name: he(d.name), level: coreLevel(d) }));

  console.log(`corePool = ${corePool.length} exercises. Levels present: ${corePool.map((c) => c.level).sort((a, b) => a - b).join(',')}\n`);

  const TOLERANCE = 3; // ContextualEngine.ts:113 default
  console.log(`── With the strength engine's own ±${TOLERANCE} window (ContextualEngine.ts:113,180-181) ──`);
  console.log(`   minLevel = max(1, userLevel - ${TOLERANCE}), maxLevel = userLevel + ${TOLERANCE}\n`);
  for (const userLevel of [1, 2, 3, 4, 5]) {
    const minLevel = Math.max(1, userLevel - TOLERANCE);
    const maxLevel = userLevel + TOLERANCE;
    const eligible = corePool.filter((c) => c.level >= minLevel && c.level <= maxLevel);
    const flag = eligible.length >= 4 ? '✅ block of 4 possible' : eligible.length >= 2 ? '⚠️ only block of 2' : '❌ too thin — falls back';
    console.log(`   userCoreLevel=${userLevel} → window[${minLevel},${maxLevel}] → ${eligible.length} eligible  ${flag}`);
    if (userLevel <= 2) {
      for (const c of eligible) console.log(`       L${c.level}  ${c.name}`);
    }
  }

  console.log(`\n── For comparison: TODAY's one-sided ceiling (poolLevelOf(ex) <= userLevel, no tolerance) ──`);
  for (const userLevel of [1, 2, 3, 4, 5]) {
    const eligible = corePool.filter((c) => c.level <= userLevel);
    const flag = eligible.length >= 4 ? '✅ block of 4 possible' : eligible.length >= 2 ? '⚠️ only block of 2' : '❌ too thin — falls back';
    console.log(`   userCoreLevel=${userLevel} → ${eligible.length} eligible  ${flag}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
