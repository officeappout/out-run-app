#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-tier2-fullbuild-6cities.ts
 *
 * Tier-2 full-build create script — Rahat, Umm al-Fahm, Nazareth, Akko,
 * Tiberias, Givatayim. All 6 city-level authority docs already exist in
 * Firestore with 0 children (verified before writing this script) — pure
 * create, no reconciliation needed. Names/coordinates match
 * israel-locations.ts + location-constants.ts exactly (commit 98f30cf5).
 *
 * Idempotent — checks for an existing doc by (parentAuthorityId, name)
 * before creating. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-tier2-fullbuild-6cities.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-tier2-fullbuild-6cities.ts
 */

import * as admin from 'firebase-admin';

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');

interface Neighborhood {
  name: string;
  lat: number;
  lon: number;
}

const CITIES: { authorityId: string; label: string; neighborhoods: Neighborhood[] }[] = [
  {
    authorityId: 'NjpenyP3FsmRynQ7ea56',
    label: 'רהט',
    neighborhoods: [
      { name: 'שכונה 2', lat: 31.4017513, lon: 34.7602840 },
      { name: 'שכונה 3', lat: 31.4012521, lon: 34.7658817 },
      { name: 'שכונה 4', lat: 31.3989695, lon: 34.7695120 },
      { name: 'שכונה 5', lat: 31.3960304, lon: 34.7710531 },
      { name: 'שכונה 7', lat: 31.3957893, lon: 34.7635444 },
      { name: 'שכונה 8', lat: 31.3949493, lon: 34.7681991 },
      { name: 'שכונה 9', lat: 31.4013850, lon: 34.7544526 },
      { name: 'שכונה 10', lat: 31.4029315, lon: 34.7517598 },
      { name: 'שכונה 12', lat: 31.3999784, lon: 34.7452008 },
      { name: 'שכונה 13', lat: 31.3941260, lon: 34.7462434 },
      { name: 'שכונה 14', lat: 31.3969076, lon: 34.7419702 },
      { name: 'שכונה 17', lat: 31.3919805, lon: 34.7388186 },
      { name: 'שכונה 18', lat: 31.3882195, lon: 34.7346500 },
      { name: 'שכונה 20', lat: 31.3912527, lon: 34.7508084 },
      { name: 'שכונה 21', lat: 31.3891602, lon: 34.7489317 },
      { name: 'שכונה 22', lat: 31.3889052, lon: 34.7456416 },
      { name: 'שכונה 24', lat: 31.3915983, lon: 34.7570412 },
      { name: 'שכונה 25', lat: 31.3923118, lon: 34.7624018 },
      { name: 'שכונה 26', lat: 31.3878567, lon: 34.7619486 },
      { name: 'שכונה 27', lat: 31.3886159, lon: 34.7563444 },
      { name: 'שכונה 29', lat: 31.3867955, lon: 34.7686681 },
      { name: 'שכונה 30', lat: 31.3853237, lon: 34.7609047 },
      { name: 'שכונה 31', lat: 31.3851747, lon: 34.7558334 },
      { name: 'שכונה 32', lat: 31.3859775, lon: 34.7514848 },
      { name: 'שכונה 33', lat: 31.3869342, lon: 34.7442009 },
      { name: 'שכונה 34', lat: 31.3860173, lon: 34.7411270 },
      { name: 'שכונה 38', lat: 31.3904954, lon: 34.7755886 },
      { name: 'א-זידאנה אל-נסאסרה', lat: 31.3683157, lon: 34.7396573 },
      { name: "ח'רבת זבאלה", lat: 31.4088561, lon: 34.7491824 },
    ],
  },
  {
    authorityId: 'TUOYvWWA9b8XetYfT6OA',
    label: 'אום אל-פחם',
    neighborhoods: [
      { name: 'עין איברהים', lat: 32.5356842, lon: 35.1441692 },
      { name: 'אבו סברי', lat: 32.5528092, lon: 35.1679012 },
      { name: 'קחאווש', lat: 32.5342107, lon: 35.1524495 },
      { name: 'אל-מועלקה', lat: 32.5039325, lon: 35.1242066 },
      { name: 'עקאדה', lat: 32.5416027, lon: 35.1703007 },
      { name: 'אל ביאר', lat: 32.5142892, lon: 35.1146224 },
    ],
  },
  {
    authorityId: 'WXGs7A6vN41zySjVmsBQ',
    label: 'נצרת',
    neighborhoods: [
      { name: 'الكروم · אל-כורום', lat: 32.706503, lon: 35.285207 },
      { name: 'أم قبي · אום קוביי', lat: 32.704913, lon: 35.284776 },
      { name: 'العمال العرب · אל-עומאל אל-ערב', lat: 32.702030, lon: 35.288120 },
      { name: 'البشارة · אל-בשארה', lat: 32.710803, lon: 35.294004 },
      { name: "الفاخورة · אל-פאח'ורה", lat: 32.684009, lon: 35.289002 },
      { name: "خلة الدير · ח'לת א-דיר", lat: 32.693988, lon: 35.292427 },
      { name: "وادي الحاج · ואדי אל-חאג'", lat: 32.689986, lon: 35.297590 },
      { name: 'الصفافرة · ספאפרה', lat: 32.712112, lon: 35.299468 },
      { name: 'النمساوي · נמסאווי', lat: 32.704900, lon: 35.306316 },
      { name: 'الروم · א-רום', lat: 32.707759, lon: 35.307306 },
      { name: "الخانوق · אל-ח'אנוק", lat: 32.710611, lon: 35.305625 },
      { name: 'الشرقية · הרובע המזרחי', lat: 32.698167, lon: 35.305582 },
    ],
  },
  {
    authorityId: 'eisEeoZnew1f74nfZfyd',
    label: 'עכו',
    neighborhoods: [
      { name: 'קרית וולפסון', lat: 32.9293909, lon: 35.0813912 },
      { name: 'מנחם בגין', lat: 32.9384719, lon: 35.0772494 },
      { name: 'נווה אלון', lat: 32.9306814, lon: 35.0919848 },
      { name: 'נווה אביב', lat: 32.9358892, lon: 35.0937893 },
      { name: 'אברהם דנינו', lat: 32.9256498, lon: 35.0936954 },
      { name: 'מוריה', lat: 32.9263343, lon: 35.0958626 },
      { name: 'בן גוריון', lat: 32.9231823, lon: 35.0954120 },
      { name: 'נווה יוני נתניהו', lat: 32.9248831, lon: 35.0897854 },
      { name: 'נאות ים', lat: 32.9297715, lon: 35.0874619 },
      { name: 'צפון הכרם', lat: 32.9441584, lon: 35.0786651 },
      { name: 'משכנות הכרם', lat: 32.9389467, lon: 35.0830284 },
      { name: 'העיר העתיקה', lat: 32.9220000, lon: 35.0697000 },
      { name: 'נווה ספיר', lat: 32.9202000, lon: 35.0929000 },
    ],
  },
  {
    authorityId: 'leV6uPoy1rV148F8BvCC',
    label: 'טבריה',
    neighborhoods: [
      { name: 'פאר', lat: 32.784457, lon: 35.512429 },
      { name: "שיכון ג'", lat: 32.783332, lon: 35.507373 },
      { name: 'רמת אגוז', lat: 32.778172, lon: 35.512538 },
      { name: 'בן גוריון', lat: 32.780578, lon: 35.515227 },
      { name: '200 פלוס', lat: 32.784981, lon: 35.517874 },
      { name: 'מורדות טבריה', lat: 32.783713, lon: 35.522840 },
      { name: 'טבריה עילית', lat: 32.783011, lon: 35.513839 },
      { name: 'נוף כנרת', lat: 32.786582, lon: 35.525224 },
      { name: 'רמת כנרת', lat: 32.794503, lon: 35.522458 },
      { name: 'רבי עקיבא · בית וגן', lat: 32.790123, lon: 35.524460 },
      { name: 'דוד רמז', lat: 32.799994, lon: 35.524245 },
      { name: 'דון יוסף הנשיא · שיכון ותיקים', lat: 32.794199, lon: 35.537219 },
      { name: 'גאולים', lat: 32.781234, lon: 35.537936 },
      { name: 'אחווה', lat: 32.782656, lon: 35.541232 },
      { name: 'העיר העתיקה', lat: 32.786206, lon: 35.542649 },
      { name: 'הרמב"ם · מימוניה', lat: 32.789920, lon: 35.539191 },
      { name: 'קריית שמואל', lat: 32.796909, lon: 35.531456 },
      { name: 'אחוזת כנרת מערב', lat: 32.789741, lon: 35.523632 },
    ],
  },
  {
    authorityId: '3DvasTJYUbIGGVvtg3ex',
    label: 'גבעתיים',
    neighborhoods: [
      { name: 'בורוכוב', lat: 32.0775747, lon: 34.8081818 },
      { name: 'שנקין · שיינקין', lat: 32.0740320, lon: 34.8100563 },
      { name: 'ארלוזורוב', lat: 32.0712815, lon: 34.8112931 },
      { name: 'גבעת רמב"ם', lat: 32.0668104, lon: 34.8043334 },
      { name: 'קריית יוסף', lat: 32.0756350, lon: 34.8037708 },
      { name: 'גבעת קוזלובסקי', lat: 32.0712146, lon: 34.8166130 },
      { name: 'פועלי הרכבת', lat: 32.0777065, lon: 34.8179752 },
      { name: 'תל גנים', lat: 32.0652509, lon: 34.8181405 },
      { name: 'שיכון חברת חשמל', lat: 32.0633253, lon: 34.8080207 },
      { name: 'שיכון קופת חולים', lat: 32.0652413, lon: 34.8053698 },
      { name: 'שטח 9 · בן צבי', lat: 32.0673352, lon: 34.8126793 },
    ],
  },
];

async function main() {
  let totalCreated = 0;
  let totalSkipped = 0;

  for (const city of CITIES) {
    console.log(`\n── ${DRY_RUN ? 'DRY RUN — ' : ''}${city.label} (${city.authorityId}): ${city.neighborhoods.length} to create ──`);

    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', city.authorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map((d) => d.data().name));

    for (const n of city.neighborhoods) {
      if (existingNames.has(n.name)) {
        console.log(`⏭  SKIP (already exists): ${n.name}`);
        totalSkipped++;
        continue;
      }

      const doc: Record<string, unknown> = {
        name: n.name,
        type: 'neighborhood' as const,
        parentAuthorityId: city.authorityId,
        logoUrl: null,
        managerIds: [] as string[],
        userCount: 0,
        status: 'inactive' as const,
        isActiveClient: false,
        coordinates: { lat: n.lat, lng: n.lon },
        pipelineStatus: 'draft' as const,
        unitCount: 0,
        hierarchyLevel: 2,
        vertical: 'municipal' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (DRY_RUN) {
        console.log(`  WOULD CREATE: ${n.name} @ ${n.lat},${n.lon}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`✓  CREATED: ${n.name} → ${ref.id}`);
      }
      totalCreated++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${totalCreated}, Skipped: ${totalSkipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
