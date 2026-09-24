import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  // 1. Get all outdoorBrands
  console.log('\n=== outdoorBrands collection ===');
  const brandsSnap = await db.collection('outdoorBrands').get();
  const brands: any[] = [];
  for (const d of brandsSnap.docs) {
    const data = d.data();
    brands.push({ id: d.id, ...data });
    console.log(JSON.stringify({ id: d.id, name: data.name, brandColor: data.brandColor, createdAt: data.createdAt?.toDate?.()?.toISOString() }));
  }

  // 2. Get all gym_equipment with brand details
  console.log('\n=== gym_equipment brands summary ===');
  const eqSnap = await db.collection('gym_equipment').orderBy('name').get();
  const equipment: any[] = [];
  let count1Brand = 0, count2Brand = 0, count0Brand = 0;
  let noVideo = 0, noImage = 0;

  for (const d of eqSnap.docs) {
    const data = d.data();
    const brandsArr = Array.isArray(data.brands) ? data.brands : [];
    if (brandsArr.length === 0) count0Brand++;
    else if (brandsArr.length === 1) count1Brand++;
    else count2Brand++;

    const hasVideo = brandsArr.some((b: any) => !!b.videoUrl);
    const hasImage = brandsArr.some((b: any) => !!b.imageUrl);
    if (!hasVideo) noVideo++;
    if (!hasImage) noImage++;

    const row: any = {
      id: d.id,
      name: data.name,
      brandsCount: brandsArr.length,
      brands: brandsArr.map((b: any, i: number) => ({
        index: i,
        brandName: b.brandName,
        brandId: b.brandId ?? null,
        hasVideo: !!b.videoUrl,
        hasImage: !!b.imageUrl,
        videoUrl: b.videoUrl ?? null,
        imageUrl: b.imageUrl ?? null,
      })),
    };
    equipment.push(row);
    console.log(JSON.stringify(row));
  }

  console.log(`\n--- Counts ---`);
  console.log(`0 brands: ${count0Brand}, 1 brand: ${count1Brand}, 2+ brands: ${count2Brand}`);
  console.log(`No video (any brand): ${noVideo}/${eqSnap.docs.length}`);
  console.log(`No image (any brand): ${noImage}/${eqSnap.docs.length}`);

  // 3. Check exercises for brandId field
  console.log('\n=== exercises — brandId check (sample 10) ===');
  const exSnap = await db.collection('exercises').limit(10).get();
  for (const d of exSnap.docs) {
    const data = d.data();
    if (data.brandId !== undefined) {
      console.log(`exercises/${d.id}: brandId=${data.brandId}`);
    } else {
      console.log(`exercises/${d.id}: no brandId field`);
    }
  }

  // 4. Count exercises per brand by looking at brandId field
  console.log('\n=== exercises — brandId distribution (ALL) ===');
  const exAllSnap = await db.collection('exercises').get();
  const brandCounts: Record<string, number> = {};
  let noBrandId = 0;
  for (const d of exAllSnap.docs) {
    const data = d.data();
    if (data.brandId) {
      brandCounts[data.brandId] = (brandCounts[data.brandId] || 0) + 1;
    } else {
      noBrandId++;
    }
  }
  console.log('brandId counts:', JSON.stringify(brandCounts, null, 2));
  console.log('No brandId:', noBrandId);
  console.log('Total exercises:', exAllSnap.docs.length);

  // 5. gym_equipment — brandId distribution
  console.log('\n=== gym_equipment — brandId in brands[] ===');
  const brandIdCounts: Record<string, number> = {};
  let noBrandIdEq = 0;
  for (const row of equipment) {
    for (const b of row.brands) {
      if (b.brandId) {
        brandIdCounts[b.brandId] = (brandIdCounts[b.brandId] || 0) + 1;
      } else {
        noBrandIdEq++;
      }
    }
  }
  console.log('brandId usage in gym_equipment.brands[]:', JSON.stringify(brandIdCounts, null, 2));
  console.log('Missing brandId in brands[]:', noBrandIdEq);
}

main().catch(e => { console.error(e); process.exit(1); });
