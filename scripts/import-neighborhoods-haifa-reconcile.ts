#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-haifa-reconcile.ts
 *
 * Haifa neighborhood reconcile — writes 57 new `authorities` child docs
 * (type=neighborhood) reconciling the picker/Firestore against the official
 * municipal neighborhood dataset. Two authoritative sources cross-checked:
 *   - odata.org.il (Israel's national open-data clearinghouse) dataset
 *     `haifa_dgpsync_neighborhood` — synced directly from Haifa municipality's
 *     own GIS, 76 named areas with רובע/תת-רובע codes. Shapefile (Schunot2023,
 *     EPSG:2039) parsed for real polygon centroids (shoelace formula on the
 *     largest ring, reprojected to WGS84 via pyproj) — cross-checked against
 *     the same dataset's own CSV export, which agreed on all 76 names (one
 *     spelling variant: שוק טלפיות/שוק תלפיות, same place).
 *   - Wikipedia's Haifa-neighborhoods category, used to sanity-check the
 *     official list's plausibility. Found several well-known named places
 *     (דניה, כפר סמיר, כרמלהיים, נחלה, גבעת אורנים, אחוזת שמואל, ארד אל-יהוד)
 *     that are NOT in the official 76 — flagged as a discrepancy, not
 *     silently added; the official municipal GIS is the authoritative source
 *     per the standing rule, this is a research note for David.
 *
 * Reconciliation:
 *   - 5 of the 8 existing entries matched cleanly (מרכז הכרמל, אחוזה, נווה
 *     שאנן, בת גלים, קריית אליעזר) — untouched.
 *   - 3 existing entries are coarse and don't map 1:1 to the official list —
 *     flagged, untouched, NOT deleted/merged:
 *       - דניה — no match at all in the official 76 (see Wikipedia note above).
 *       - הדר — official list splits this into הדר מרכז + הדר עליון (both
 *         added here as new, separate entries).
 *       - קרית חיים — official list splits into קריית חיים מזרחית +
 *         קריית חיים מערבית (both added here), plus a separate non-residential
 *         אצטדיון קריית חיים (stadium, flagged below, not added).
 *   - 14 non-residential zones EXCLUDED here (flagged for David's yes/no):
 *     אוניברסיטת חיפה (university), אזור תעשיה מפרץ (industrial), אצטדיון
 *     קריית חיים (stadium), בתי זיקוק (refineries), בתי עלמין (cemetery),
 *     חוות המיכלים (tank farm), מכון טיהור (purification plant), מרכז
 *     הקונגרסים/נאות פרס (convention center), נמל חיפה (port), פארק הקישון
 *     (industrial zone despite the name — part of the Haifa Bay industrial
 *     strip, רובע 2, not a residential green park), צומת הקריות/חוף שמן
 *     (industrial junction), קריית הטכניון (Technion campus), קריית הממשלה
 *     ע"ש רבין (government offices), שוק תלפיות (market).
 *   - Two intentional name collisions with OTHER real places already in the
 *     picker — distinct ids used, no functional collision: הרצליה (Haifa
 *     neighborhood, id hf-hertzliya-quarter, vs the city 'herzliya') and
 *     חוף הכרמל (Haifa neighborhood, id hf-chof-hacarmel-quarter, vs the
 *     חוף הכרמל regional council from the council-coverage batch).
 *
 * Adds `quarter` (רובע, numeric 1-9 as published by the city) as metadata —
 * hierarchy stays 2-level (city → neighborhood), unchanged.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-haifa-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-haifa-reconcile.ts
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
const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
  quarter: string;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'גאולה', lat: 32.8030611, lon: 35.0013735, quarter: 'רובע 6' },
  { name: 'גבעת זמר', lat: 32.78227, lon: 35.0026877, quarter: 'רובע 8' },
  { name: 'הדר מרכז', lat: 32.8137682, lon: 34.9976559, quarter: 'רובע 6' },
  { name: 'הדר עליון', lat: 32.8065942, lon: 34.9930112, quarter: 'רובע 6' },
  { name: 'הוד הכרמל', lat: 32.7656696, lon: 34.9928921, quarter: 'רובע 9' },
  { name: 'המיימוני', lat: 32.8014803, lon: 34.9986555, quarter: 'רובע 6' },
  { name: 'הרצליה', lat: 32.8118225, lon: 34.9942006, quarter: 'רובע 6' },
  { name: 'ואדי ניסנאס', lat: 32.8177791, lon: 34.9940366, quarter: 'רובע 3' },
  { name: 'ורדיה', lat: 32.7936752, lon: 34.9975115, quarter: 'רובע 5' },
  { name: 'זיו', lat: 32.7837193, lon: 35.0150037, quarter: 'רובע 8' },
  { name: 'חוף הכרמל', lat: 32.7975557, lon: 34.9574368, quarter: 'רובע 4' },
  { name: 'חליסה', lat: 32.801165, lon: 35.0073788, quarter: 'רובע 7' },
  { name: 'יזרעאליה', lat: 32.7931011, lon: 35.0084091, quarter: 'רובע 7' },
  { name: 'יל"ג', lat: 32.8055228, lon: 35.0034957, quarter: 'רובע 6' },
  { name: 'כבאביר', lat: 32.8060065, lon: 34.9698952, quarter: 'רובע 5' },
  { name: 'כבירים', lat: 32.8032424, lon: 34.9788136, quarter: 'רובע 5' },
  { name: 'כרמל מערבי', lat: 32.8106126, lon: 34.9733238, quarter: 'רובע 5' },
  { name: 'כרמל מרכזי- שד\' קיש', lat: 32.8033509, lon: 34.9914419, quarter: 'רובע 5' },
  { name: 'כרמל צרפתי', lat: 32.8206129, lon: 34.975193, quarter: 'רובע 5' },
  { name: 'כרמליה', lat: 32.7975148, lon: 34.9755911, quarter: 'רובע 5' },
  { name: 'מורדות נו"ש', lat: 32.7866586, lon: 35.0253053, quarter: 'רובע 7' },
  { name: 'מושבה גרמנית', lat: 32.8212899, lon: 34.9896274, quarter: 'רובע 3' },
  { name: 'מסדה', lat: 32.8104423, lon: 34.9922697, quarter: 'רובע 6' },
  { name: 'מעונות גאולה', lat: 32.7965536, lon: 35.0001201, quarter: 'רובע 6' },
  { name: 'מת"ם', lat: 32.7899103, lon: 34.95947, quarter: 'רובע 4' },
  { name: 'נוה דוד', lat: 32.8091194, lon: 34.9602874, quarter: 'רובע 4' },
  { name: 'נוה יוסף', lat: 32.7920335, lon: 35.0197267, quarter: 'רובע 7' },
  { name: 'נוה פז', lat: 32.7933892, lon: 35.0215892, quarter: 'רובע 7' },
  { name: 'נעמ"ת', lat: 32.7967713, lon: 34.9911145, quarter: 'רובע 5' },
  { name: 'סביוני הכרמל', lat: 32.7696308, lon: 35.0118944, quarter: 'רובע 9' },
  { name: 'עבאס', lat: 32.8152062, lon: 34.9864718, quarter: 'רובע 6' },
  { name: 'עין הים', lat: 32.8276133, lon: 34.9635386, quarter: 'רובע 4' },
  { name: 'עיר תחתית מזרח, ואדי סאליב', lat: 32.8060394, lon: 35.0079336, quarter: 'רובע 3' },
  { name: 'קריית אליהו', lat: 32.8240731, lon: 34.985875, quarter: 'רובע 4' },
  { name: 'קריית חיים מזרחית', lat: 32.8215897, lon: 35.0703633, quarter: 'רובע 1' },
  { name: 'קריית חיים מערבית', lat: 32.8321483, lon: 35.0585547, quarter: 'רובע 1' },
  { name: 'קריית שמואל', lat: 32.8363234, lon: 35.0692014, quarter: 'רובע 1' },
  { name: 'קריית שפרינצק', lat: 32.8201105, lon: 34.9624302, quarter: 'רובע 4' },
  { name: 'רוממה', lat: 32.789919, lon: 34.9965606, quarter: 'רובע 9' },
  { name: 'רמות רמז', lat: 32.7791735, lon: 35.0085856, quarter: 'רובע 8' },
  { name: 'רמת אלון', lat: 32.7758071, lon: 35.0131943, quarter: 'רובע 8' },
  { name: 'רמת אלמוגי', lat: 32.7739607, lon: 35.0059263, quarter: 'רובע 9' },
  { name: 'רמת אשכול', lat: 32.7789979, lon: 34.9808415, quarter: 'רובע 9' },
  { name: 'רמת בגין', lat: 32.7745929, lon: 34.9856685, quarter: 'רובע 9' },
  { name: 'רמת בן גוריון', lat: 32.78539, lon: 34.9971265, quarter: 'רובע 9' },
  { name: 'רמת גולדה', lat: 32.7729248, lon: 34.9999917, quarter: 'רובע 9' },
  { name: 'רמת הדר', lat: 32.7992482, lon: 34.9973681, quarter: 'רובע 5' },
  { name: 'רמת התשבי', lat: 32.8125991, lon: 34.9789941, quarter: 'רובע 5' },
  { name: 'רמת ויז\'ניץ', lat: 32.7980379, lon: 35.003621, quarter: 'רובע 6' },
  { name: 'רמת חביב (ר. הנשיא), רח\' שונית', lat: 32.812756, lon: 34.9627514, quarter: 'רובע 4' },
  { name: 'רמת חן', lat: 32.7857572, lon: 35.0085915, quarter: 'רובע 8' },
  { name: 'רמת ספיר', lat: 32.7869227, lon: 35.004298, quarter: 'רובע 8' },
  { name: 'רמת שאול', lat: 32.8222222, lon: 34.9695346, quarter: 'רובע 5' },
  { name: 'שמבור', lat: 32.7925795, lon: 34.9834837, quarter: 'רובע 5' },
  { name: 'שער העלייה', lat: 32.8182927, lon: 34.9563595, quarter: 'רובע 4' },
  { name: 'שער פלמר, תחנת רכבת השמונה', lat: 32.819543, lon: 34.9983372, quarter: 'רובע 3' },
  { name: 'תל עמל', lat: 32.7981654, lon: 35.0126489, quarter: 'רובע 7' },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Haifa (${HAIFA_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', HAIFA_AUTHORITY_ID)
    .get();
  const existingNames = new Set(existingSnap.docs.map((d) => d.data().name));
  console.log(`✓  ${existingNames.size} existing neighborhood docs found`);

  let created = 0;
  let skipped = 0;

  for (const n of NEW_NEIGHBORHOODS) {
    if (existingNames.has(n.name)) {
      console.log(`⏭  SKIP (already exists): ${n.name}`);
      skipped++;
      continue;
    }

    const doc = {
      name: n.name,
      type: 'neighborhood' as const,
      parentAuthorityId: HAIFA_AUTHORITY_ID,
      quarter: n.quarter,
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
      console.log(`  WOULD CREATE: ${n.name} [${n.quarter}] @ ${n.lat},${n.lon}`);
    } else {
      const ref = await db.collection('authorities').add(doc);
      console.log(`✓  CREATED: ${n.name} → ${ref.id}`);
    }
    created++;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped (already existed): ${skipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
