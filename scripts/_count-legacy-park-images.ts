// Read-only investigation script (SPEC-05 image-heat, Q1). No writes.
// Counts parks docs whose resolved cover image (per resolveParkImage's own
// priority: imageUrl → image → images[0]) falls through to a legacy
// Firebase-Storage field instead of the Bunny-CDN imageUrl field.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

async function main() {
  const snap = await db.collection('parks').get();

  let total = 0;
  let hasImageUrl = 0;
  let noImageUrlButHasImage = 0;
  let noImageUrlButHasImagesArray = 0;
  let noImageAtAll = 0;
  let bunnyImageUrlCount = 0;
  let nonBunnyImageUrlCount = 0;

  for (const doc of snap.docs) {
    total++;
    const d = doc.data() as { imageUrl?: string; image?: string; images?: string[] };

    if (isNonEmpty(d.imageUrl)) {
      hasImageUrl++;
      if (d.imageUrl!.includes('b-cdn.net')) bunnyImageUrlCount++;
      else nonBunnyImageUrlCount++;
      continue;
    }

    if (isNonEmpty(d.image)) {
      noImageUrlButHasImage++;
      continue;
    }

    if (Array.isArray(d.images) && isNonEmpty(d.images[0])) {
      noImageUrlButHasImagesArray++;
      continue;
    }

    noImageAtAll++;
  }

  console.log(JSON.stringify({
    total,
    hasImageUrl,
    bunnyImageUrlCount,
    nonBunnyImageUrlCount_withinImageUrl: nonBunnyImageUrlCount,
    noImageUrlButHasImage,
    noImageUrlButHasImagesArray,
    noImageAtAll,
    totalFallingThroughToLegacyUnresized: noImageUrlButHasImage + noImageUrlButHasImagesArray,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
