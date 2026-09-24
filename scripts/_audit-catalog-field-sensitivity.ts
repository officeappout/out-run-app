// Read-only investigation script (SPEC-07 stage 1, pre-merge security check).
// Field-by-field audit of what the /api/catalog/parks response actually
// contains across real production data — specifically checking imageUrl
// for embedded Firebase Storage access tokens vs plain Bunny CDN URLs.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('secrets/firebase-admin.json', 'utf-8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function resolveImage(d: any): string | null {
  return d.imageUrl || d.image || (Array.isArray(d.images) ? d.images[0] : null) || null;
}

async function main() {
  const snap = await db.collection('parks').get();

  let bunnyCount = 0;
  let firebaseStorageWithToken = 0;
  let firebaseStorageNoToken = 0;
  let otherHost = 0;
  let noImage = 0;
  const otherHostSamples: string[] = [];
  const firebaseTokenSamples: string[] = [];

  const urbanTypeValues = new Set<string>();
  const facilityTypeValues = new Set<string>();
  const nameSamples: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const published = d.published ?? (d.contentStatus === 'published');
    if (!published) continue;

    const img = resolveImage(d);
    if (!img) {
      noImage++;
    } else if (img.includes('b-cdn.net')) {
      bunnyCount++;
    } else if (img.includes('firebasestorage.googleapis.com') || img.includes('storage.googleapis.com')) {
      if (img.includes('token=')) {
        firebaseStorageWithToken++;
        if (firebaseTokenSamples.length < 3) firebaseTokenSamples.push(img);
      } else {
        firebaseStorageNoToken++;
      }
    } else {
      otherHost++;
      if (otherHostSamples.length < 5) otherHostSamples.push(img);
    }

    if (d.urbanType) urbanTypeValues.add(String(d.urbanType));
    if (d.facilityType) facilityTypeValues.add(String(d.facilityType));
    if (nameSamples.length < 5 && d.name) nameSamples.push(d.name);
  }

  console.log(JSON.stringify({
    imageHostBreakdown: {
      bunnyCount,
      firebaseStorageWithToken,
      firebaseStorageNoToken,
      otherHost,
      noImage,
    },
    otherHostSamples,
    firebaseTokenSamples,
    urbanTypeValues: [...urbanTypeValues],
    facilityTypeValues: [...facilityTypeValues],
    nameSamples,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
