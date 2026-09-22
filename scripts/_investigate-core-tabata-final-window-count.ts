/**
 * scripts/_investigate-core-tabata-final-window-count.ts
 *
 * READ-ONLY. David's approved window (22.09.2026, field-test doc 35 follow-up):
 * asymmetric, below=3 / above=2 (DEFAULT_TABATA_LEVEL_WINDOW, tabata.constants.ts),
 * NOT the earlier symmetric ±3 exploration. Recounts the real corePool at
 * levels 1, 2, 3 with this exact window, and also shows the before/after
 * eligible set for a level-6 user (David's requirement #3 — what changes for
 * an already-well-served user).
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();
const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));

const CORE_PROGRAM_ID = 'kDMpobbKsuVTByTIKUpe'; // resolved in _investigate-core-tabata-corrected.ts

function hasExplicitCoreLevel(d: any): boolean {
  return (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).some(
    (tp: any) => tp?.programId === CORE_PROGRAM_ID && typeof tp?.level === 'number' && tp.level > 0,
  );
}
function coreLevel(d: any): number {
  const tp = (Array.isArray(d.targetPrograms) ? d.targetPrograms : []).find((t: any) => t?.programId === CORE_PROGRAM_ID);
  return tp?.level ?? 0;
}

const BELOW = 3;
const ABOVE = 2;

async function main() {
  const exSnap = await db.collection('exercises').get();
  const corePool = exSnap.docs
    .map((doc) => ({ id: doc.id, d: doc.data() as any }))
    .filter(({ d }) => (d.tags ?? []).includes('hiit_friendly') && hasExplicitCoreLevel(d))
    .map(({ id, d }) => ({ id, name: he(d.name), level: coreLevel(d) }));

  console.log(`corePool = ${corePool.length}. David's approved window: below=${BELOW}, above=${ABOVE}\n`);

  console.log(`── Requirement 1: recount at levels 1, 2, 3 ──`);
  for (const userLevel of [1, 2, 3]) {
    const minLevel = Math.max(1, userLevel - BELOW);
    const maxLevel = userLevel + ABOVE;
    const eligible = corePool.filter((c) => c.level >= minLevel && c.level <= maxLevel);
    const flag = eligible.length >= 4 ? '✅ enough for a 4-member block' : eligible.length >= 2 ? '⚠️ only a 2-member block' : '❌ too thin — falls back';
    console.log(`   userCoreLevel=${userLevel} → window[${minLevel},${maxLevel}] → ${eligible.length} eligible  ${flag}`);
    for (const c of eligible) console.log(`       L${c.level}  ${c.name}`);
    console.log('');
  }

  console.log(`── Requirement 3: before/after for a level-6 (well-assessed) user ──`);
  const oldEligible = corePool.filter((c) => c.level <= 6); // today's one-sided ceiling
  const newMin = Math.max(1, 6 - BELOW), newMax = 6 + ABOVE;
  const newEligible = corePool.filter((c) => c.level >= newMin && c.level <= newMax);
  console.log(`   TODAY (ceiling <=6): ${oldEligible.length} eligible — levels: ${oldEligible.map((c) => c.level).sort((a, b) => a - b).join(',')}`);
  console.log(`   NEW (window [${newMin},${newMax}]): ${newEligible.length} eligible — levels: ${newEligible.map((c) => c.level).sort((a, b) => a - b).join(',')}`);
  const droppedOut = oldEligible.filter((c) => !newEligible.some((n) => n.id === c.id));
  const newlyIn = newEligible.filter((c) => !oldEligible.some((o) => o.id === c.id));
  console.log(`   DROPPED (was eligible, no longer): ${droppedOut.map((c) => `${c.name}(L${c.level})`).join(', ') || '(none)'}`);
  console.log(`   NEWLY IN (wasn't eligible before, is now): ${newlyIn.map((c) => `${c.name}(L${c.level})`).join(', ') || '(none)'}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
