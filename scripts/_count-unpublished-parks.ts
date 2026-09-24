// Read-only investigation script (SPEC-07 stage 0). No writes.
// Counts parks docs by published/contentStatus, matching parks.service.ts's
// own normalizePark default: published ?? (contentStatus === 'published').
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('parks').get();

  let total = 0;
  let publishedTrue = 0;
  let publishedFalseExplicit = 0;
  let publishedMissingContentStatusPublished = 0;
  let publishedMissingContentStatusOther = 0;
  const contentStatusCounts: Record<string, number> = {};
  const unpublishedSamples: { id: string; name: string; published: unknown; contentStatus: unknown; createdAt: string }[] = [];

  for (const doc of snap.docs) {
    total++;
    const d = doc.data() as { published?: boolean; contentStatus?: string; name?: string; createdAt?: any };
    const cs = d.contentStatus ?? '(missing)';
    contentStatusCounts[cs] = (contentStatusCounts[cs] ?? 0) + 1;

    const effectivePublished = d.published ?? (d.contentStatus === 'published');

    if (d.published === true) {
      publishedTrue++;
    } else if (d.published === false) {
      publishedFalseExplicit++;
    } else if (d.contentStatus === 'published') {
      publishedMissingContentStatusPublished++;
    } else {
      publishedMissingContentStatusOther++;
    }

    if (!effectivePublished && unpublishedSamples.length < 15) {
      unpublishedSamples.push({
        id: doc.id,
        name: d.name ?? '(no name)',
        published: d.published,
        contentStatus: d.contentStatus,
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? '(no createdAt)',
      });
    }
  }

  const totalUnpublished = publishedFalseExplicit + publishedMissingContentStatusOther;

  console.log(JSON.stringify({
    total,
    publishedTrue,
    publishedFalseExplicit,
    publishedMissingButContentStatusPublished: publishedMissingContentStatusPublished,
    publishedMissingAndContentStatusNotPublished: publishedMissingContentStatusOther,
    totalEffectivelyUnpublished: totalUnpublished,
    contentStatusCounts,
    unpublishedSamples,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
