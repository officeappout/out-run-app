#!/usr/bin/env npx tsx
/**
 * scripts/import-settlements-council-coverage-batch2.ts
 *
 * Council-coverage batch 2 — writes 72 new `authorities` child docs
 * (type=settlement) across 5 regional councils, all previously at 0
 * settlements in both picker and Firestore (location-coverage-reconciliation
 * report, bucket 4). Nominatim relation-ID → Overpass place=village/hamlet/
 * isolated_dwelling, cross-checked against each council's official member
 * list (official site wins over Wikipedia where they disagree).
 *
 * Full 74/74 official-list coverage was found via OSM. One duplicate-
 * across-council catch was excluded (confirmed via coordinate proximity —
 * same physical place, already correctly shipped elsewhere):
 *   - עין חצבה — matched "תמר" in research, but already exists under
 *     הערבה התיכונה (Phase B round 2, ~30m coordinate match)
 *
 * ורדון also matched "יואב" in this round's research, and already existed
 * under לכיש (Phase B round 2/3). Verified (yoav.org.il + gov planning
 * docs): it is officially a יואב member — the לכיש attribution was the
 * original error. Listed under יואב below; the existing doc is reparented
 * in place by fix-vardon-parent-council.ts (run that first), so this
 * script's idempotent skip picks it up as already-existing rather than
 * creating a duplicate.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch2.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-settlements-council-coverage-batch2.ts
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
    authorityId: 'd2ivpsWVtOys1NLBkhm3',
    councilName: 'תמר',
    settlements: [
      { name: 'עין גדי', lat: 31.4523959, lon: 35.3848241 },
      { name: 'נאות הכיכר', lat: 30.9330032, lon: 35.3772356 },
      { name: 'עין תמר', lat: 30.943309, lon: 35.3747349 },
      { name: 'נווה זוהר', lat: 31.1529016, lon: 35.365301 },
      { name: 'הר עמשא', lat: 31.3426169, lon: 35.1021887 },
      { name: 'דרור (חירן)', lat: 31.3203624, lon: 34.9975022 },
    ],
  },
  {
    authorityId: 'IfEHp2Qws1NaskZrctkK',
    councilName: 'מבואות החרמון',
    settlements: [
      { name: 'אליפלט', lat: 32.9480271, lon: 35.547389 },
      { name: 'אמנון', lat: 32.9043478, lon: 35.5705088 },
      { name: 'בית הלל', lat: 33.2083012, lon: 35.6069281 },
      { name: 'דישון', lat: 33.0813243, lon: 35.5175202 },
      { name: 'יובל', lat: 33.246719, lon: 35.597925 },
      { name: 'כורזים', lat: 32.9109804, lon: 35.5526611 },
      { name: 'כחל', lat: 32.8913179, lon: 35.5107113 },
      { name: 'כרכום', lat: 32.9293327, lon: 35.6085627 },
      { name: 'מרגליות', lat: 33.2148047, lon: 35.5444859 },
      { name: 'משמר הירדן', lat: 33.0055656, lon: 35.6002731 },
      { name: 'רמות נפתלי', lat: 33.1022971, lon: 35.5531168 },
      { name: 'שאר ישוב', lat: 33.2272088, lon: 35.6463364 },
      { name: 'שדה אליעזר', lat: 33.0458869, lon: 35.5641252 },
    ],
  },
  {
    authorityId: '2lbGe71GBJfYo2wWbMsj',
    councilName: 'יואב',
    settlements: [
      { name: 'אל עזי', lat: 31.7189244, lon: 34.8142702 },
      { name: 'בית גוברין', lat: 31.6123189, lon: 34.8964162 },
      { name: 'בית ניר', lat: 31.6472934, lon: 34.874131 },
      { name: 'גלאון', lat: 31.6340593, lon: 34.8490324 },
      { name: 'גת', lat: 31.6268616, lon: 34.7951088 },
      { name: 'כפר מנחם', lat: 31.7309768, lon: 34.8352311 },
      { name: 'נגבה', lat: 31.6623288, lon: 34.6827493 },
      { name: 'נחלה', lat: 31.657961, lon: 34.7949816 },
      { name: 'סגולה', lat: 31.6697258, lon: 34.7791534 },
      { name: 'קדמה', lat: 31.7007444, lon: 34.7751348 },
      { name: 'רבדים', lat: 31.7730474, lon: 34.8153077 },
      { name: 'שדה יואב', lat: 31.6457313, lon: 34.6769569 },
      { name: 'כפר הרי"ף', lat: 31.7463333, lon: 34.7924638 },
      { name: 'ורדון', lat: 31.663426, lon: 34.7804089 },
    ],
  },
  {
    authorityId: 'R6GOKtZpNo8CghcaHxiL',
    councilName: 'לב השרון',
    settlements: [
      { name: 'בני דרור', lat: 32.2618622, lon: 34.900238 },
      { name: 'גאולים', lat: 32.2962452, lon: 34.9474014 },
      { name: 'גנות הדר', lat: 32.3195061, lon: 34.9001402 },
      { name: 'חרות', lat: 32.2402969, lon: 34.9150051 },
      { name: 'ינוב', lat: 32.3060551, lon: 34.9504619 },
      { name: 'יעף', lat: 32.2683414, lon: 34.9659156 },
      { name: 'כפר הס', lat: 32.2457804, lon: 34.9339746 },
      { name: 'כפר יעבץ', lat: 32.2738189, lon: 34.966859 },
      { name: 'משמרת', lat: 32.2279787, lon: 34.9220495 },
      { name: 'נורדיה', lat: 32.31478, lon: 34.8961822 },
      { name: 'ניצני עוז', lat: 32.3054855, lon: 35.0048861 },
      { name: 'עזריאל', lat: 32.2629094, lon: 34.9712077 },
      { name: 'עין ורד', lat: 32.2653177, lon: 34.9317604 },
      { name: 'עין שריד', lat: 32.2741205, lon: 34.9353718 },
      { name: 'פורת', lat: 32.2762739, lon: 34.9494718 },
      { name: 'צור משה', lat: 32.2978073, lon: 34.9135462 },
      { name: 'שער אפרים', lat: 32.2889798, lon: 34.9974416 },
      { name: 'תנובות', lat: 32.305202, lon: 34.9620671 },
    ],
  },
  {
    authorityId: 'gUnk3Sy9UqgfWmUlw3Fd',
    councilName: 'מעלה יוסף',
    settlements: [
      { name: 'אבירים', lat: 33.0386467, lon: 35.2871399 },
      { name: 'אבן מנחם', lat: 33.0736105, lon: 35.2941382 },
      { name: 'אלקוש', lat: 33.0341637, lon: 35.3241745 },
      { name: 'גורן', lat: 33.0563927, lon: 35.2369919 },
      { name: 'גורנות הגליל', lat: 33.0592841, lon: 35.2502694 },
      { name: 'גיתה', lat: 32.9672482, lon: 35.249074 },
      { name: 'זרעית', lat: 33.0996431, lon: 35.2886449 },
      { name: 'חוסן', lat: 32.9975754, lon: 35.2979856 },
      { name: 'יערה', lat: 33.0674207, lon: 35.1858477 },
      { name: 'לפידות', lat: 32.9592382, lon: 35.2620596 },
      { name: 'מנות', lat: 33.0383637, lon: 35.1946918 },
      { name: 'מעונה', lat: 33.0167071, lon: 35.2597388 },
      { name: 'מצפה הילה', lat: 33.0358267, lon: 35.2443398 },
      { name: 'מתת', lat: 33.0415441, lon: 35.3598303 },
      { name: 'נווה זיו', lat: 33.0275858, lon: 35.1834948 },
      { name: 'נטועה', lat: 33.0649415, lon: 35.3233116 },
      { name: 'עבדון', lat: 33.0479451, lon: 35.1794373 },
      { name: 'עין יעקב', lat: 33.0095478, lon: 35.2292923 },
      { name: 'פקיעין החדשה', lat: 32.9830176, lon: 35.3227602 },
      { name: 'צוריאל', lat: 33.0059947, lon: 35.3141186 },
      { name: 'שומרה', lat: 33.0818094, lon: 35.2841818 },
      { name: 'שתולה', lat: 33.084763, lon: 35.3143141 },
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
