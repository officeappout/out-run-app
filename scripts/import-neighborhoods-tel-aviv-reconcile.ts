#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-tel-aviv-reconcile.ts
 *
 * Tel Aviv-Yafo neighborhood reconcile — writes 63 new `authorities` child docs
 * (type=neighborhood) reconciling the picker/Firestore against the official
 * ~76-name municipal neighborhood list. Two authoritative sources cross-checked:
 *   - TLV GIS opendata "שכונות" layer (IView2 MapServer, layer 511) — polygon
 *     centroids computed via shoelace formula on the largest ring per feature.
 *   - The city's own official neighborhoods statistical booklet (רשימת השכונות,
 *     tel-aviv.gov.il/Transparency), which independently confirms the same
 *     combined-polygon groupings found in the GIS layer.
 *
 * Reconciliation:
 *   - 7 already existed with clean 1:1 name matches (נווה צדק, רמת אביב, שפירא,
 *     בבלי, פלורנטין, יד אליהו, שכונת התקווה→התקווה) — untouched.
 *   - 5 non-residential zones EXCLUDED — David confirmed residential-only:
 *     אוניברסיטת ת"א, מרכז הירידים, אזור שדה דב, אזור המלאכה יפו, אזור
 *     התעסוקה "צומת חולון".
 *   - 'לב העיר' == 'לב תל אביב' (David-confirmed, same place) — no duplicate
 *     created; the existing doc's `name` field is renamed to the official
 *     'לב תל אביב' by a separate one-doc fix script (same pattern as the
 *     רמת נגב → רמת הנגב spelling fix), run alongside this import.
 *   - 4 existing docs are coarse legacy placeholders that don't 1:1 match any
 *     single official name (יפו, הצפון הישן, הצפון החדש, צהלה / המשתלה) — left
 *     untouched, flagged separately for David, NOT auto-merged/renamed/deleted.
 *   - Same-name/one-node pattern (2+ official names sharing one polygon,
 *     confirmed by BOTH sources): גבעת הרצל + אזור המלאכה יפו; יפו העתיקה +
 *     נמל יפו; נווה ברבור + כפר שלם מערב; תל כביר + נווה עופר + יפו ב' (the
 *     official booklet's row 70 groups all three under one combined entry).
 *
 * Adds `quarter` (רובע) as a new metadata field on each doc — hierarchy stays
 * 2-level (city → neighborhood), unchanged, per the Rishon LeZion pilot pattern.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-tel-aviv-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-tel-aviv-reconcile.ts
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
const TEL_AVIV_AUTHORITY_ID = 't9hiRkDnJtgZESlNCBp8';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
  quarter: string;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'גלילות', lat: 32.1404244, lon: 34.7951423, quarter: 'צפון (מצפון לירקון)' },
  { name: 'צוקי אביב', lat: 32.1294186, lon: 34.7907665, quarter: 'צפון (מצפון לירקון)' },
  { name: 'נופי ים', lat: 32.1174459, lon: 34.7895775, quarter: 'צפון (מצפון לירקון)' },
  { name: 'תוכנית ל\'', lat: 32.1071225, lon: 34.7876065, quarter: 'צפון (מצפון לירקון)' },
  { name: 'כוכב הצפון', lat: 32.1008951, lon: 34.7877661, quarter: 'צפון (מצפון לירקון)' },
  { name: 'רמת אביב ג\'', lat: 32.1262625, lon: 34.802281, quarter: 'צפון (מצפון לירקון)' },
  { name: 'אפקה', lat: 32.1205928, lon: 34.8061473, quarter: 'צפון (מצפון לירקון)' },
  { name: 'נווה אביבים וסביבתה', lat: 32.1174756, lon: 34.797375, quarter: 'צפון (מצפון לירקון)' },
  { name: 'פארק הירקון', lat: 32.1031189, lon: 34.8169522, quarter: 'צפון (מצפון לירקון)' },
  { name: 'תל ברוך צפון', lat: 32.1229717, lon: 34.8173352, quarter: 'תיכון' },
  { name: 'תל ברוך', lat: 32.1184285, lon: 34.8143418, quarter: 'תיכון' },
  { name: 'מעוז אביב', lat: 32.1110713, lon: 34.8138268, quarter: 'תיכון' },
  { name: 'נאות אפקה ב\'', lat: 32.1191988, lon: 34.8226663, quarter: 'תיכון' },
  { name: 'נאות אפקה א\'', lat: 32.1149614, lon: 34.8211415, quarter: 'תיכון' },
  { name: 'הדר יוסף', lat: 32.1093905, lon: 34.8209259, quarter: 'תיכון' },
  { name: 'קרית שאול', lat: 32.1280103, lon: 34.8237679, quarter: 'תיכון' },
  { name: 'המשתלה', lat: 32.1268857, lon: 34.8321328, quarter: 'תיכון' },
  { name: 'גני צהלה ורמות צהלה', lat: 32.1224375, lon: 34.8281603, quarter: 'תיכון' },
  { name: 'צהלה', lat: 32.1223328, lon: 34.8356312, quarter: 'תיכון' },
  { name: 'נווה שרת', lat: 32.1187598, lon: 34.8408403, quarter: 'תיכון' },
  { name: 'רביבים', lat: 32.1166607, lon: 34.8294291, quarter: 'תיכון' },
  { name: 'נווה דן', lat: 32.1114217, lon: 34.8288976, quarter: 'תיכון' },
  { name: 'רמת החייל', lat: 32.1126011, lon: 34.835191, quarter: 'תיכון' },
  { name: 'עתידים', lat: 32.1110164, lon: 34.840597, quarter: 'תיכון' },
  { name: 'נמל ת"א', lat: 32.0990712, lon: 34.7753257, quarter: 'תיכון' },
  { name: 'הצפון הישן – החלק הצפוני', lat: 32.0897203, lon: 34.7762529, quarter: 'צפון ישן' },
  { name: 'הצפון הישן – החלק הדרומי', lat: 32.0787785, lon: 34.774847, quarter: 'צפון ישן' },
  { name: 'הצפון החדש – החלק הצפוני', lat: 32.0938806, lon: 34.7891197, quarter: 'צפון חדש' },
  { name: 'הצפון החדש – סביבת ככר המדינה', lat: 32.0873921, lon: 34.7892505, quarter: 'צפון חדש' },
  { name: 'הצפון החדש – החלק הדרומי', lat: 32.0803573, lon: 34.7867957, quarter: 'צפון חדש' },
  { name: 'צמרות איילון', lat: 32.0855037, lon: 34.7973671, quarter: 'צפון חדש' },
  { name: 'כרם התימנים', lat: 32.0703402, lon: 34.7661645, quarter: 'מרכז' },
  { name: 'גני שרונה', lat: 32.0727057, lon: 34.786311, quarter: 'מרכז' },
  { name: 'מונטיפיורי', lat: 32.0680004, lon: 34.7886697, quarter: 'מרכז' },
  { name: 'צפון יפו', lat: 32.0532954, lon: 34.7597803, quarter: 'יפו' },
  { name: 'גבעת הרצל', lat: 32.0514348, lon: 34.7690161, quarter: 'יפו' },
  { name: 'יפו העתיקה', lat: 32.0530294, lon: 34.7514903, quarter: 'יפו' },
  { name: 'נמל יפו', lat: 32.0530294, lon: 34.7514903, quarter: 'יפו' },
  { name: 'עג\'מי וגבעת העלייה', lat: 32.0424657, lon: 34.7481244, quarter: 'יפו' },
  { name: 'צהלון ושיכוני חיסכון', lat: 32.0440406, lon: 34.7546479, quarter: 'יפו' },
  { name: 'יפו ג\' ונווה גולן', lat: 32.0340042, lon: 34.7497243, quarter: 'יפו' },
  { name: 'מכללת יפו-ת"א ודקר', lat: 32.0432543, lon: 34.7597616, quarter: 'יפו' },
  { name: 'יפו ד\' (גבעת התמרים)', lat: 32.0341629, lon: 34.755348, quarter: 'יפו' },
  { name: 'תל כביר', lat: 32.0412101, lon: 34.7656292, quarter: 'יפו' },
  { name: 'נווה עופר', lat: 32.0412101, lon: 34.7656292, quarter: 'יפו' },
  { name: 'יפו ב\'', lat: 32.0412101, lon: 34.7656292, quarter: 'יפו' },
  { name: 'נווה שאנן', lat: 32.0577653, lon: 34.7792759, quarter: 'דרום' },
  { name: 'פארק החורשות', lat: 32.0471198, lon: 34.77074, quarter: 'דרום' },
  { name: 'קרית שלום', lat: 32.0442048, lon: 34.7777858, quarter: 'דרום' },
  { name: 'נחלת יצחק', lat: 32.0750145, lon: 34.7982228, quarter: 'דרום' },
  { name: 'ביצרון ורמת ישראל', lat: 32.0677773, lon: 34.7968784, quarter: 'דרום' },
  { name: 'תל חיים', lat: 32.0628388, lon: 34.802281, quarter: 'דרום' },
  { name: 'רמת הטייסים', lat: 32.0583902, lon: 34.807783, quarter: 'דרום' },
  { name: 'אורות', lat: 32.0563272, lon: 34.8025689, quarter: 'דרום' },
  { name: 'עזרא והארגזים', lat: 32.045255, lon: 34.7934445, quarter: 'דרום' },
  { name: 'לבנה וידידיה', lat: 32.0443394, lon: 34.8061397, quarter: 'דרום' },
  { name: 'פארק דרום', lat: 32.0405463, lon: 34.8021652, quarter: 'דרום' },
  { name: 'כפיר', lat: 32.0478201, lon: 34.8031494, quarter: 'דרום' },
  { name: 'נווה ברבור', lat: 32.051534, lon: 34.8027813, quarter: 'דרום' },
  { name: 'כפר שלם מערב', lat: 32.051534, lon: 34.8027813, quarter: 'דרום' },
  { name: 'נווה אליעזר וכפר שלם מזרח', lat: 32.0498783, lon: 34.8075341, quarter: 'דרום' },
  { name: 'נווה חן', lat: 32.0527666, lon: 34.8100259, quarter: 'דרום' },
  { name: 'ניר אביב', lat: 32.04716, lon: 34.8119103, quarter: 'דרום' },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Tel Aviv-Yafo (${TEL_AVIV_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', TEL_AVIV_AUTHORITY_ID)
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
      parentAuthorityId: TEL_AVIV_AUTHORITY_ID,
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
