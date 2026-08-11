#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-council-coverage-batch1.ts
 *
 * Council-coverage batch 1 — writes 55 new `authorities` child docs
 * (type=settlement) across 5 regional councils, all previously at 0
 * settlements in both picker and Firestore (location-coverage-reconciliation
 * report, bucket 4). Nominatim relation-ID → Overpass place=village/hamlet/
 * isolated_dwelling, cross-checked against each council's official member
 * list (official site wins over Wikipedia where they disagree).
 *
 * כפר חסידים א' / כפר חסידים ב' (זבולון) — official list has 2 settlements,
 * OSM only has 1 combined node. David-approved: include both, sharing the
 * one OSM coordinate (adjacent localities) — 11.08.2026.
 *
 * Held out of this batch (not written, not in this list):
 *   - בסיס תל נוף (ברנר) — military base, same category as גן רווה's
 *     already-excluded בסיס הילה. Not a civilian residential settlement.
 *
 * Note: אחווה (באר טוביה) uses the Achva College building's coordinate —
 * the settlement itself has no standalone OSM place-node, the college
 * sits within/adjacent to the moshav. Flagged for awareness, not held.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch1.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch1.ts
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

const COUNCILS: { authorityId: string; councilName: string; settlements: { name: string; lat: number; lon: number }[] }[] = [
  {
    authorityId: 'YzARcI38vk2CMH0Q4Wbc',
    councilName: 'ברנר',
    settlements: [
      { name: 'קדרון', lat: 31.8150988, lon: 34.7976591 },
      { name: 'בית אלעזרי', lat: 31.8460836, lon: 34.8030534 },
      { name: 'בניה', lat: 31.8434985, lon: 34.753611 },
      { name: 'גיבתון', lat: 31.8888206, lon: 34.7994843 },
      { name: 'גבעת ברנר', lat: 31.8675206, lon: 34.8004909 },
      { name: 'קבוצת שילר', lat: 31.8777084, lon: 34.7982712 },
    ],
  },
  {
    authorityId: 'aU1IcV3CKNXRwDvhLsjW',
    councilName: 'נווה מדבר',
    settlements: [
      { name: 'אבו קרינאת', lat: 31.1457309, lon: 34.9716296 },
      { name: 'אבו תלול', lat: 31.1861956, lon: 34.9128014 },
      { name: 'ביר הדאג\'', lat: 31.0262625, lon: 34.7031024 },
      { name: 'קסר א-סיר', lat: 31.0793738, lon: 34.9848798 },
    ],
  },
  {
    authorityId: 'n2nyLNCZAl92AQCe8hIs',
    councilName: 'מגילות ים המלח',
    settlements: [
      { name: 'קליה', lat: 31.7498072, lon: 35.4661484 },
      { name: 'בית הערבה', lat: 31.8086825, lon: 35.4774494 },
      { name: 'ורד יריחו', lat: 31.8261908, lon: 35.4324239 },
      { name: 'מצפה שלם', lat: 31.569667, lon: 35.400687 },
      { name: 'אבנת', lat: 31.6792556, lon: 35.4365531 },
      { name: 'אלמוג', lat: 31.790043, lon: 35.4615959 },
      { name: 'קדם ערבה', lat: 31.8070324, lon: 35.4995181 },
      { name: 'בית חגלה', lat: 31.8210977, lon: 35.5071506 },
    ],
  },
  {
    authorityId: 'rrplIfQbK0hT8HIrxYi8',
    councilName: 'זבולון',
    settlements: [
      { name: 'אושה', lat: 32.7955189, lon: 35.1144019 },
      { name: 'שער העמקים', lat: 32.7230505, lon: 35.1131062 },
      { name: 'רמת יוחנן', lat: 32.7925038, lon: 35.1213847 },
      { name: 'כפר המכבי', lat: 32.7910628, lon: 35.1149003 },
      { name: 'אורנים', lat: 32.7116768, lon: 35.1079584 },
      { name: 'יגור', lat: 32.7428565, lon: 35.0781325 },
      { name: 'כפר הנוער הדתי', lat: 32.7426708, lon: 35.1014038 },
      { name: 'כפר ביאליק', lat: 32.8203929, lon: 35.0869133 },
      { name: 'נופית', lat: 32.7586157, lon: 35.14735 },
      { name: 'ראס עלי', lat: 32.7712425, lon: 35.1548304 },
      { name: 'ח\'וואלד', lat: 32.7702405, lon: 35.1367106 },
      { name: 'איבטין', lat: 32.7607812, lon: 35.1131894 },
      { name: 'כפר חסידים א׳', lat: 32.7519478, lon: 35.0935521 },
      { name: 'כפר חסידים ב׳', lat: 32.7519478, lon: 35.0935521 },
    ],
  },
  {
    authorityId: 'NcTzjFkNxdfShnA9zvZ3',
    councilName: 'באר טוביה',
    settlements: [
      { name: 'כפר ורבורג', lat: 31.7199638, lon: 34.7241807 },
      { name: 'עזריקם', lat: 31.7537708, lon: 34.6949023 },
      { name: 'ינון', lat: 31.7429158, lon: 34.7795177 },
      { name: 'חצור אשדוד', lat: 31.7730925, lon: 34.7210185 },
      { name: 'ביצרון', lat: 31.7950527, lon: 34.7392791 },
      { name: 'נווה מבטח', lat: 31.8059239, lon: 34.7410254 },
      { name: 'אביגדור', lat: 31.7109457, lon: 34.7435754 },
      { name: 'ערוגות', lat: 31.7346866, lon: 34.7708779 },
      { name: 'תלמי יחיאל', lat: 31.753729, lon: 34.7639978 },
      { name: 'חצב', lat: 31.7792702, lon: 34.7693634 },
      { name: 'בית עזרא', lat: 31.7366309, lon: 34.6563769 },
      { name: 'שדה עוזיהו', lat: 31.7575803, lon: 34.6784685 },
      { name: 'כנות', lat: 31.8026404, lon: 34.752375 },
      { name: 'כפר אחים', lat: 31.7448291, lon: 34.7563983 },
      { name: 'באר טוביה', lat: 31.7338758, lon: 34.7262903 },
      { name: 'גבעתי', lat: 31.7340046, lon: 34.6793054 },
      { name: 'תימורים', lat: 31.7160922, lon: 34.7613397 },
      { name: 'אמונים', lat: 31.7453369, lon: 34.676988 },
      { name: 'ניר בנים', lat: 31.6717215, lon: 34.7542446 },
      { name: 'שתולים', lat: 31.7719562, lon: 34.683597 },
      { name: 'אורות', lat: 31.7407214, lon: 34.734914 },
      { name: 'עזר', lat: 31.7365072, lon: 34.6714475 },
      { name: 'אחווה', lat: 31.7442771, lon: 34.7742032 },
    ],
  },
];

async function main() {
  const totalPlanned = COUNCILS.reduce((sum, c) => sum + c.settlements.length, 0);
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${totalPlanned} settlements across ${COUNCILS.length} regional councils ──`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const council of COUNCILS) {
    const existingSnap = await db.collection('authorities')
      .where('parentAuthorityId', '==', council.authorityId)
      .get();
    const existingNames = new Set(existingSnap.docs.map((d) => d.data().name));
    console.log(`\n${council.councilName} (${council.authorityId}) — ${existingNames.size} existing children`);

    for (const s of council.settlements) {
      if (existingNames.has(s.name)) {
        console.log(`  ⏭  SKIP (already exists): ${s.name}`);
        totalSkipped++;
        continue;
      }

      const doc = {
        name: s.name,
        type: 'settlement' as const,
        parentAuthorityId: council.authorityId,
        logoUrl: null,
        managerIds: [] as string[],
        userCount: 0,
        status: 'inactive' as const,
        isActiveClient: false,
        coordinates: { lat: s.lat, lng: s.lon },
        pipelineStatus: 'draft' as const,
        unitCount: 0,
        hierarchyLevel: 2,
        vertical: 'municipal' as const,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (DRY_RUN) {
        console.log(`  WOULD CREATE: ${s.name} @ ${s.lat},${s.lon}`);
      } else {
        const ref = await db.collection('authorities').add(doc);
        console.log(`  ✓  CREATED: ${s.name} → ${ref.id}`);
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
