/**
 * INVESTIGATION (22.09.2026, coverflow-redesign scoping) — read-only.
 * Answers: does visual_assessment_content already hold a per-level thumbnail?
 *   1. How many docs, how many have exerciseId set (→ auto Bunny thumbnail via
 *      resolveImageForLocation), how many videoVariants have thumbnailUrl set
 *      directly (should be ~0 — no admin UI writes it).
 *   2. For exerciseId-linked docs, does the linked exercise actually resolve
 *      to a real Bunny videoId (so buildBunnyThumbnailUrl produces a real image)?
 * Run: npx tsx scripts/_investigate-slider-thumbnail-coverage.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('visual_assessment_content').get();
  let total = 0;
  let withExerciseId = 0;
  let withVariantThumbnailUrl = 0;
  let withNoExerciseIdAndNoVariantThumbnail = 0;
  const categoryCounts: Record<string, number> = {};
  const sampleNoThumb: any[] = [];

  let onboardingTotal = 0;
  let onboardingWithExerciseId = 0;
  let onboardingWithExIdAndImageUrl = 0;

  for (const doc of snap.docs) {
    total++;
    const d = doc.data();
    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
    const hasExerciseId = !!d.exerciseId;
    if (hasExerciseId) withExerciseId++;
    const variants = Array.isArray(d.videoVariants) ? d.videoVariants : [];
    const hasVariantThumb = variants.some((v: any) => v?.thumbnailUrl?.trim());
    if (hasVariantThumb) withVariantThumbnailUrl++;
    if (!hasExerciseId && !hasVariantThumb) {
      withNoExerciseIdAndNoVariantThumbnail++;
      if (sampleNoThumb.length < 8) {
        sampleNoThumb.push({
          id: doc.id,
          category: d.category,
          level: d.level,
          variantCount: variants.length,
          hasVideoUrl: variants.some((v: any) => v?.videoUrl?.trim() || v?.videoUrlMov?.trim() || v?.videoUrlWebm?.trim()),
          showInOnboarding: d.showInOnboarding === true,
        });
      }
    }
    if (d.showInOnboarding === true) {
      onboardingTotal++;
      if (hasExerciseId) onboardingWithExerciseId++;
    }
  }

  // For onboarding-visible + exerciseId-linked docs, check the real exercise image coverage.
  const onboardingExerciseLinked = snap.docs.filter(dd => dd.data().showInOnboarding === true && dd.data().exerciseId);
  for (const doc of onboardingExerciseLinked) {
    const exId = doc.data().exerciseId;
    const exDoc = await db.collection('exercises').doc(exId).get();
    if (!exDoc.exists) continue;
    const ex = exDoc.data() as any;
    const methods = ex.execution_methods || ex.executionMethods || [];
    const hasAnyImage = methods.some((m: any) => m?.media?.imageUrl?.trim())
      || !!ex.media?.imageUrl?.trim()
      || methods.some((m: any) => m?.media?.previewVideo?.he?.videoId || m?.media?.previewVideo?.en?.videoId);
    if (hasAnyImage) onboardingWithExIdAndImageUrl++;
  }

  // For a sample of exerciseId-linked docs, check the exercise actually has a Bunny videoId.
  const exerciseLinkedDocs = snap.docs.filter(d => d.data().exerciseId).slice(0, 10);
  const exerciseSamples: any[] = [];
  for (const doc of exerciseLinkedDocs) {
    const exId = doc.data().exerciseId;
    const exDoc = await db.collection('exercises').doc(exId).get();
    if (!exDoc.exists) { exerciseSamples.push({ contentDocId: doc.id, exerciseId: exId, exerciseExists: false }); continue; }
    const ex = exDoc.data() as any;
    const methods = ex.execution_methods || ex.executionMethods || [];
    const videoIds = methods.map((m: any) => m?.media?.previewVideo?.he?.videoId || m?.media?.previewVideo?.en?.videoId).filter(Boolean);
    exerciseSamples.push({
      contentDocId: doc.id,
      exerciseId: exId,
      exerciseExists: true,
      exerciseName: ex.name?.he,
      methodCount: methods.length,
      bunnyVideoIdsFound: videoIds.length,
      legacyImageUrl: methods[0]?.media?.imageUrl || ex.media?.imageUrl || null,
    });
  }

  console.log(JSON.stringify({
    total,
    withExerciseId,
    withVariantThumbnailUrl,
    withNoExerciseIdAndNoVariantThumbnail,
    pctWithExerciseId: total ? Math.round((withExerciseId / total) * 100) : 0,
    onboardingVisible: {
      total: onboardingTotal,
      withExerciseId: onboardingWithExerciseId,
      withExerciseIdAndRealImage: onboardingWithExIdAndImageUrl,
      pctWithExerciseId: onboardingTotal ? Math.round((onboardingWithExerciseId / onboardingTotal) * 100) : 0,
      pctWithRealImage: onboardingTotal ? Math.round((onboardingWithExIdAndImageUrl / onboardingTotal) * 100) : 0,
    },
    categoryCounts,
    sampleNoThumb,
    exerciseSamples,
  }, null, 2));
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
