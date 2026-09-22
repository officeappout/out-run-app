/**
 * David's follow-up (22.09.2026, doc 31): a brand-new user (default onboarding,
 * no history) — what's their levelDelta for core/isolation, and what rep range
 * do they get for these same 2 exercises? READ-ONLY. No writes.
 * Run: npx tsx scripts/_verify-new-user-levelDelta.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

async function main() {
  const db = initFb();
  const ids = [
    { id: '1OEFeykCym2378rgD4QK', label: 'כפיפות בטן' },
    { id: 'B0pnjy0oT9jTizikeLSb', label: 'עליות תאומים' },
    { id: 'wfgHCel9MyopaIXRQS8D', label: 'עליות תאומים על מדרגה' },
  ];

  // New-user domain level: workout-selection.utils.ts:682-684 — when no
  // domain-specific level exists (unassessed), rawDomainLevel is hardcoded to 1.
  const NEW_USER_DOMAIN_LEVEL = 1;
  console.log(`New-user (never-assessed) domain level, per workout-selection.utils.ts:683: ${NEW_USER_DOMAIN_LEVEL}`);

  for (const { id, label } of ids) {
    const doc = await db.collection('exercises').doc(id).get();
    if (!doc.exists) { console.log(`\n"${label}" (${id}) — NOT FOUND`); continue; }
    const data = doc.data()!;
    const targetPrograms = data.targetPrograms ?? [];
    const recommendedLevel = data.recommendedLevel;
    // Mirrors resolveExerciseLevelForDomains' no-targetPrograms fallback exactly
    // (workout-selection.utils.ts:289-291): exercise.recommendedLevel || 1.
    const exerciseLevel = (Array.isArray(targetPrograms) && targetPrograms.length > 0)
      ? targetPrograms
      : (recommendedLevel || 1);

    console.log(`\n"${label}" (${id})`);
    console.log(`  targetPrograms: ${JSON.stringify(targetPrograms)}`);
    console.log(`  recommendedLevel: ${JSON.stringify(recommendedLevel)}`);
    console.log(`  resolvedExerciseLevel (no-targetPrograms fallback): ${JSON.stringify(exerciseLevel)}`);

    if (Array.isArray(targetPrograms) && targetPrograms.length > 0) {
      for (const tp of targetPrograms) {
        const delta = (tp.level ?? 0) - NEW_USER_DOMAIN_LEVEL;
        const tier = delta >= 2 ? 'elite' : delta === 1 ? 'hard' : delta <= -3 ? 'flow' : delta <= -1 ? 'easy' : 'match';
        console.log(`    targetProgram ${JSON.stringify(tp)}: levelDelta=${delta} → tier=${tier}${(tier === 'hard' || tier === 'elite') ? ' → reps 1-3 ⚠️' : ''}`);
      }
    } else {
      const lvl = recommendedLevel || 1;
      const delta = lvl - NEW_USER_DOMAIN_LEVEL;
      const tier = delta >= 2 ? 'elite' : delta === 1 ? 'hard' : delta <= -3 ? 'flow' : delta <= -1 ? 'easy' : 'match';
      console.log(`  levelDelta (new user) = ${lvl} - ${NEW_USER_DOMAIN_LEVEL} = ${delta} → tier=${tier}${(tier === 'hard' || tier === 'elite') ? ' → reps 1-3 ⚠️' : ' → normal reps'}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
