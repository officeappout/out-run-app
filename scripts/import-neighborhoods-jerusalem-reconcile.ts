#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-jerusalem-reconcile.ts
 *
 * Jerusalem neighborhood reconcile — writes 44 new `authorities` child docs
 * (type=neighborhood) reconciling the picker/Firestore against the official
 * municipal resident-facing neighborhood list. Two authoritative sources
 * cross-checked:
 *   - jerusalem.muni.il/he/neighborhoods/ — the municipality's own
 *     resident-facing "שכונות" page, 57 named neighborhoods. This is the
 *     level a resident actually recognizes (David's explicit choice, over
 *     the unverified ~85-95 "תת-רבע" statistical sub-quarter tier documented
 *     in the Jerusalem Institute for Policy Research's own map, and well
 *     below the hundreds of numbered "אזור סטטיסטי" census-tract units —
 *     neither of those two finer tiers is used here).
 *   - jerusalem.muni.il/he/city/statistical/dashboard/ — the municipality's
 *     own statistics dashboard, which has an independent "select a
 *     neighborhood" filter using essentially the same list — cross-checked
 *     as the second source.
 *
 * All 57 confirmed genuinely residential — 0 non-residential flags. Unlike
 * Tel Aviv/Haifa's all-inclusive GIS layers (which include universities,
 * ports, industrial zones, etc. as their own polygons), this resident-
 * services list is already curated to exclude institutional/industrial
 * areas — nothing in it reads as non-residential.
 *
 * Reconciliation:
 *   - 13 of 14 existing entries matched cleanly (spelling variants):
 *     רמות, פסגת זאב, גילה, הר חומה, תלפיות/ארנונה, גוננים(קטמונים),
 *     בית הכרם, קרית יובל, מלחה, רחביה, נחלאות, מרכז העיר, נווה יעקב.
 *   - 'העיר העתיקה' (Old City) flagged, untouched. The official source
 *     splits it into הרובע היהודי (Jewish Quarter) + הרובע המוסלמי (Muslim
 *     Quarter) as two separate neighborhoods — both added here. The
 *     official list does NOT separately list Christian/Armenian Quarters —
 *     flagged as a gap in the source, not fabricated here.
 *
 * communityAdmin (מינהל קהילתי) — sourced from the municipality's own
 * "מינהלים קהילתיים" dataset (jerusalem.datacity.org.il), a 46-row admin ->
 * neighborhood-coverage table, reverse-mapped per neighborhood name.
 * 47 of 57 neighborhoods mapped; 10 have no field set at all here — genuine
 * gaps in the source, not fabricated:
 *   ג'אבל מוכבר, המושבה האמריקאית, מאה שערים, ממילא, מעלות דפנה, סנהדריה,
 *   רסקו - גבעת הורדים, שועפט, שיח ג'ראח (David: flag rather than leave
 *   silently guessed — these are flagged in-code with a comment, not
 *   defaulted to a plausible-looking value).
 * Two neighborhoods have multiple covering admins (joined with " / "):
 * אבו תור (א-טור / בקעה רבתי).
 *
 * Coordinates: no Jerusalem municipal GIS boundary layer was found (unlike
 * Tel Aviv/Haifa) — resolved via OSM Nominatim per-neighborhood, with a
 * couple of individual corrections where the first-pass query mismatched
 * (המושבה האמריקאית via the American Colony Hotel landmark; רמת שרת ורמת
 * דניה via averaging the two sub-areas' individually-resolved points).
 *
 * 4 of the new ids (jr-givat-shaul, jr-har-nof, jr-kiryat-moshe, jr-baka)
 * turned out to already have coordinate entries in location-constants.ts
 * from an earlier, never-wired-up scaffolding pass — those pre-existing
 * coordinates are kept as-is (not overwritten) since this import only
 * touches Firestore, and the picker-side fix removed the newly-generated
 * duplicates in favor of the pre-existing ones (see the picker diff).
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-jerusalem-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-jerusalem-reconcile.ts
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
const JERUSALEM_AUTHORITY_ID = 'vxYpJ9HKm4fot5y1ahDA';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
  communityAdmin?: string;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'ג\'אבל מוכבר', lat: 31.7520029, lon: 35.2457204 }, // communityAdmin not found, flagged
  { name: 'גבעת מרדכי', lat: 31.762696, lon: 35.1968266, communityAdmin: 'מינהל קהילתי מיתרים' },
  { name: 'גבעת משואה', lat: 31.7487681, lon: 35.1696292, communityAdmin: 'מינהל קהילתי גנים' },
  { name: 'גבעת שאול', lat: 31.7911185, lon: 35.1931023, communityAdmin: 'מינהל קהילתי מיתרים' },
  { name: 'הבוכרים – בית ישראל', lat: 31.7910172, lon: 35.2206805, communityAdmin: 'מינהל קהילתי הבוכרים' },
  { name: 'הגבעה הצרפתית', lat: 31.8040234, lon: 35.2382763, communityAdmin: 'מינהל קהילתי הגבעה הצרפתית' },
  { name: 'המושבה האמריקאית', lat: 31.7900891, lon: 35.2295238 }, // communityAdmin not found, flagged
  { name: 'המושבה הגרמנית', lat: 31.7643906, lon: 35.2205513, communityAdmin: 'מינהל קהילתי גינות העיר' },
  { name: 'הר נוף', lat: 31.7858115, lon: 35.1741509, communityAdmin: 'מינהל קהילתי הר נוף' },
  { name: 'הרובע היהודי', lat: 31.7753539, lon: 35.2317629, communityAdmin: 'מינהל קהילתי הרובע היהודי' },
  { name: 'הרובע המוסלמי', lat: 31.7812961, lon: 35.2328865, communityAdmin: 'מינהל קהילתי הרובע המוסלמי' },
  { name: 'ואדי ג\'וז', lat: 31.7899912, lon: 35.2366923, communityAdmin: 'מינהל קהילתי ואדי אל גוז' },
  { name: 'טלביה – קוממיות', lat: 31.7708162, lon: 35.2176794, communityAdmin: 'מינהל קהילתי גינות העיר' },
  { name: 'ימין משה', lat: 31.7727868, lon: 35.2254538, communityAdmin: 'מינהל קהילתי גינות העיר' },
  { name: 'מאה שערים', lat: 31.7865608, lon: 35.2208052 }, // communityAdmin not found, flagged
  { name: 'מוסררה - מורשה', lat: 31.7820246, lon: 35.2260718, communityAdmin: 'מינהל קהילתי מורשה' },
  { name: 'ממילא', lat: 31.7775148, lon: 35.2251187 }, // communityAdmin not found, flagged
  { name: 'מעלות דפנה', lat: 31.7933736, lon: 35.2246764 }, // communityAdmin not found, flagged
  { name: 'ניות', lat: 31.7693712, lon: 35.2024424, communityAdmin: 'מינהל קהילתי גינות העיר' },
  { name: 'סילואן', lat: 31.7706028, lon: 35.2369571, communityAdmin: 'מינהל קהילתי אבו טור סילוואן' },
  { name: 'סנהדריה', lat: 31.800079, lon: 35.2201992 }, // communityAdmin not found, flagged
  { name: 'עין כרם', lat: 31.7676367, lon: 35.1639025, communityAdmin: 'מינהל קהילתי יובלים' },
  { name: 'עיסוויה', lat: 31.7990943, lon: 35.2496729, communityAdmin: 'מרכז שכונתי עיסוויה' },
  { name: 'עיר גנים', lat: 31.7556535, lon: 35.1731258, communityAdmin: 'מינהל קהילתי גנים' },
  { name: 'פת', lat: 31.7514864, lon: 35.2019339, communityAdmin: 'בית פאני קפלן' },
  { name: 'צור באחר – אום טובה', lat: 31.7379075, lon: 35.2314339, communityAdmin: 'מינהל קהילתי צור בהאר' },
  { name: 'קטמון', lat: 31.7660228, lon: 35.2093317, communityAdmin: 'מינהל קהילתי גינות העיר' },
  { name: 'קריית מנחם', lat: 31.7600147, lon: 35.1641262, communityAdmin: 'מינהל קהילתי גנים' },
  { name: 'קריית משה', lat: 31.7862381, lon: 35.198147, communityAdmin: 'מינהל קהילתי מיתרים' },
  { name: 'ראס אל עמוד', lat: 31.7701969, lon: 35.2439153, communityAdmin: 'מינהל קהילתי אבו טור סילוואן' },
  { name: 'רוממה', lat: 31.7916556, lon: 35.2036799, communityAdmin: 'מנהל קהילתי רוממה' },
  { name: 'רמת אשכול', lat: 31.8017893, lon: 35.2228759, communityAdmin: 'מינהל קהילתי הגבעה הצרפתית' },
  { name: 'רמת שלמה', lat: 31.8111253, lon: 35.2174861, communityAdmin: 'מינהל קהילתי רמת שלמה' },
  { name: 'רמת שרת ורמת דניה', lat: 31.7619546, lon: 35.1821845, communityAdmin: 'מינהל קהילתי יובלים' },
  { name: 'רסקו - גבעת הורדים', lat: 31.7636655, lon: 35.2025695 }, // communityAdmin not found, flagged
  { name: 'שועפט', lat: 31.8107643, lon: 35.2352104 }, // communityAdmin not found, flagged
  { name: 'שיח ג\'ראח', lat: 31.7947744, lon: 35.2309055 }, // communityAdmin not found, flagged
  { name: 'שמואל הנביא', lat: 31.7920372, lon: 35.2237606, communityAdmin: 'מינהל קהילתי אשכולות' },
  { name: 'תלפיות מזרח - ארמון הנציב', lat: 31.7529204, lon: 35.2360204, communityAdmin: 'מינהל קהילתי תלפ"ז וארנונה הצעירה' },
  { name: 'אבו תור', lat: 31.7645177, lon: 35.2324444, communityAdmin: 'מינהל קהילתי א-טור / מינהל קהילתי בקעה רבתי' },
  { name: 'בית וגן', lat: 31.7641422, lon: 35.1866879, communityAdmin: 'מינהל קהילתי בית וגן' },
  { name: 'בית חנינא', lat: 31.8248703, lon: 35.2277301, communityAdmin: 'מינהל קהילתי בית חנינא' },
  { name: 'בית צפאפא', lat: 31.7441489, lon: 35.2062517, communityAdmin: 'מינהל קהילתי בית צפאפא' },
  { name: 'בקעה', lat: 31.7595534, lon: 35.2196723, communityAdmin: 'מינהל קהילתי בקעה רבתי' },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Jerusalem (${JERUSALEM_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', JERUSALEM_AUTHORITY_ID)
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

    const doc: Record<string, unknown> = {
      name: n.name,
      type: 'neighborhood' as const,
      parentAuthorityId: JERUSALEM_AUTHORITY_ID,
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
    if (n.communityAdmin) {
      doc.communityAdmin = n.communityAdmin;
    }

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${n.name}${n.communityAdmin ? ` [${n.communityAdmin}]` : ' [no communityAdmin]'} @ ${n.lat},${n.lon}`);
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
