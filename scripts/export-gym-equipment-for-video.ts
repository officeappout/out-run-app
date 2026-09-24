/**
 * scripts/export-gym-equipment-for-video.ts
 *
 * Exports all gym_equipment documents from Firestore to a local JSON file.
 * Run this first, before build-equipment-video-matches.ts.
 *
 * Usage: npx tsx scripts/export-gym-equipment-for-video.ts
 * Output: scripts/corpus/gym-equipment-export.json
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

interface EquipmentBrand {
  brandName: string;
  brandId?: string;
  imageUrl?: string;
  videoUrl?: string;
}

interface GymEquipmentExport {
  id: string;
  name: string;
  brands: EquipmentBrand[];
  hasVideo: boolean;
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  const snap = await db.collection('gym_equipment').orderBy('name', 'asc').get();
  console.log(`Fetched ${snap.docs.length} gym_equipment documents`);

  const items: GymEquipmentExport[] = snap.docs.map(d => {
    const data = d.data();
    const brands: (EquipmentBrand & { brand_index: number })[] =
      (Array.isArray(data.brands) ? data.brands : []).map(
        (b: EquipmentBrand, i: number) => ({ brand_index: i, ...b }),
      );
    return {
      id: d.id,
      name: data.name ?? '',
      brands,
      hasVideo: brands.some(b => !!b.videoUrl),
    };
  });

  const withVideo    = items.filter(i => i.hasVideo).length;
  const withoutVideo = items.filter(i => !i.hasVideo).length;

  console.log(`\n  With videoUrl:    ${withVideo}`);
  console.log(`  Without videoUrl: ${withoutVideo}`);

  console.log('\n  Equipment list:');
  for (const item of items) {
    const brandsStr = item.brands
      .map((b, i) => `[${i}]${b.brandName}${b.videoUrl ? '✓' : ''}`)
      .join(' ');
    console.log(`    ${item.id.padEnd(22)}  "${item.name}"  ${brandsStr || '(no brands)'}`);
  }

  const outPath = path.join(process.cwd(), 'scripts/corpus/gym-equipment-export.json');
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2) + '\n');
  console.log(`\n✅  Saved ${items.length} items → ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
