/**
 * INVESTIGATION (23.09.2026, wishlist-vs-skill-slider dedup scoping) — read-only.
 *
 * Goal: every exerciseId that appears in one of the 6 SKILL sliders
 * (planche, front_lever, one_arm_pullup, muscle_up, handstand, handstand_pushup/hspu),
 * so a future "wishlist" curated list can guarantee it never duplicates one.
 *
 * Doc shape (confirmed via sample read before writing this):
 *  - `programs/{programId}` has a `slug` field (e.g. "planche", "front_lever").
 *    There is no separate "hspu" program — handstand push-up is `handstand_pushup`.
 *  - `visual_assessment_content` docs are keyed `{programId}_{level}` and carry a
 *    `category` field equal to `linkedProgramId` (the programId) — NOT an id-prefix
 *    match on the readable slug. `exerciseId` is `null` or simply absent on ~16% of
 *    onboarding-visible docs (confirmed in an earlier investigation this session) —
 *    those are skipped here, not an error.
 *  - `exercises/{exerciseId}.name` is a locale object `{he, en, es}`; `he` is used
 *    as the human-readable name (mirrors the convention in sibling _investigate-*
 *    scripts, which use `boldTitle.he.neutral`).
 *
 * Run: npx tsx scripts/_investigate-skill-exercise-ids.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

const SKILL_SLUGS = [
  'planche',
  'front_lever',
  'one_arm_pullup',
  'muscle_up',
  'handstand',
  'handstand_pushup', // covers "hspu"
];

async function main() {
  // 1. Resolve the 6 skill slugs to their program doc ids + confirm none are missing.
  const programsSnap = await db.collection('programs').get();
  const slugToProgramId: Record<string, string> = {};
  for (const p of programsSnap.docs) {
    const slug = p.data().slug;
    if (slug && SKILL_SLUGS.includes(slug)) slugToProgramId[slug] = p.id;
  }
  const missingSlugs = SKILL_SLUGS.filter((s) => !slugToProgramId[s]);
  const programIdToSlug: Record<string, string> = Object.fromEntries(
    Object.entries(slugToProgramId).map(([slug, id]) => [id, slug]),
  );
  const programIds = Object.values(slugToProgramId);

  // 2. Pull every visual_assessment_content doc for those 6 programs (Firestore 'in' caps at 10 — fine, we have 6).
  const vacSnap = await db
    .collection('visual_assessment_content')
    .where('category', 'in', programIds)
    .get();

  let totalDocs = 0;
  let skippedNoExerciseId = 0;
  const exerciseIdToCategories: Record<string, Set<string>> = {};
  for (const doc of vacSnap.docs) {
    totalDocs++;
    const d = doc.data();
    const exerciseId = d.exerciseId;
    if (!exerciseId) {
      skippedNoExerciseId++;
      continue;
    }
    const slug = programIdToSlug[d.category] || d.category;
    if (!exerciseIdToCategories[exerciseId]) exerciseIdToCategories[exerciseId] = new Set();
    exerciseIdToCategories[exerciseId].add(slug);
  }

  const uniqueExerciseIds = Object.keys(exerciseIdToCategories);

  // 3. Resolve each unique exerciseId -> exercises/{id}.name.he (batched via getAll).
  const exerciseRefs = uniqueExerciseIds.map((id) => db.collection('exercises').doc(id));
  const exerciseDocs = exerciseRefs.length ? await db.getAll(...exerciseRefs) : [];
  const idToName: Record<string, string | null> = {};
  const missingExerciseDocs: string[] = [];
  for (const snap of exerciseDocs) {
    if (!snap.exists) {
      idToName[snap.id] = null;
      missingExerciseDocs.push(snap.id);
      continue;
    }
    const name = snap.data()?.name;
    idToName[snap.id] = (name && (name.he || name.en)) || null;
  }

  // 4. Build the final deduplicated report.
  const report = uniqueExerciseIds
    .map((exerciseId) => ({
      exerciseId,
      exerciseName: idToName[exerciseId],
      skillCategories: Array.from(exerciseIdToCategories[exerciseId]).sort(),
    }))
    .sort((a, b) => (a.exerciseName || '').localeCompare(b.exerciseName || '', 'he'));

  console.log(
    JSON.stringify(
      {
        resolvedProgramIds: slugToProgramId,
        missingSlugs, // should be [] — if not, a requested skill category doesn't exist as a program
        totalVisualAssessmentContentDocsScanned: totalDocs,
        skippedNoExerciseId,
        uniqueExerciseCount: uniqueExerciseIds.length,
        missingExerciseDocs, // exerciseId referenced but exercises/{id} doc doesn't exist (dangling ref)
        exercises: report,
      },
      null,
      2,
    ),
  );
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
