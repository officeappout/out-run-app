#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-petah-tikva-reconcile.ts
 *
 * Petah Tikva neighborhood reconcile — writes 34 new `authorities` child docs
 * (type=neighborhood) reconciling the picker/Firestore against the official
 * municipal GIS source: the "ADM_Neighborhoods" (שכונות) layer hosted under
 * the municipality's own ArcGIS Online org (petah-tikva.maps.arcgis.com),
 * companion to the "שכונות ואשכולות" web map. Real polygon geometry — every
 * coordinate below is a computed centroid, not a geocode result. 41 official
 * neighborhood polygons total.
 *
 * Reconciliation (additive, existing 7 kept untouched per David's decision):
 *   - 4 of the existing 7 entries matched cleanly (spelling variant only for
 *     נווה גן / נוה גן): הדר גנים, עין גנים, שעריה, נווה גן.
 *   - מרכז העיר: the GIS layer's closest analog is לב המושבה ("heart of the
 *     moshava"), but that mapping is unconfirmed by any external source —
 *     David's call: do NOT rename, keep מרכז העיר as-is, add לב המושבה as
 *     its own separate neighborhood. Both flagged as legacy candidates for
 *     a later hide/merge pass.
 *   - כפר גנים / אם המושבות: the GIS layer splits each into official
 *     sub-names (כפר גנים א/ב/ג; הדר המושבות הותיקה/החדשה). David's call:
 *     add the sub-names as new entries, keep the umbrella entries untouched
 *     (legacy bucket, not deleted/renamed).
 *
 * 3 zones excluded as non-residential (each is its own singleton GIS
 * cluster, unlike every real residential neighborhood which belongs to a
 * shared tree-named cluster — a reliable tell in this dataset): פארק עסקים
 * ירקון, סטארטסיב, פארקטק פתח תקווה.
 *
 * cluster (אשכול) — the GIS layer's own grouping field, stored per
 * neighborhood same pattern as TLV `quarter` / Jerusalem `communityAdmin`.
 * גני אקליפטוס has no cluster assignment in the source (flagged, omitted).
 *
 * Two ids (pt-kiryat-matalon, pt-neve-ganim) already existed as orphaned
 * DEFAULT_COORDINATES keys with different, less accurate values from an
 * earlier pass — overwritten in the picker diff with the real GIS
 * centroids (this script only touches Firestore, unaffected either way).
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-petah-tikva-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-petah-tikva-reconcile.ts
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
const PETAH_TIKVA_AUTHORITY_ID = 'gdfypEG6O9UaiXNgGX8X';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
  cluster?: string;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'לב המושבה', lat: 32.090057, lon: 34.884270, cluster: 'אלה' },
  { name: 'כפר גנים א', lat: 32.081049, lon: 34.876034, cluster: 'אשל' },
  { name: 'כפר גנים ב', lat: 32.075293, lon: 34.881912, cluster: 'אשל' },
  { name: 'כפר גנים ג', lat: 32.074281, lon: 34.869911, cluster: 'אשל' },
  { name: 'הדר המושבות הותיקה', lat: 32.102994, lon: 34.873360, cluster: 'רותם' },
  { name: 'הדר המושבות החדשה', lat: 32.103790, lon: 34.881268, cluster: 'רותם' },
  { name: 'משכנות הגנים', lat: 32.101648, lon: 34.899728, cluster: 'שקד' },
  { name: 'שיכון הפועל המזרחי ותיקים', lat: 32.098505, lon: 34.901573, cluster: 'שקד' },
  { name: 'יוספטל', lat: 32.093850, lon: 34.904458, cluster: 'שקד' },
  { name: 'כפר אברהם', lat: 32.095016, lon: 34.898860, cluster: 'שקד' },
  { name: 'קרית דוד אלעזר', lat: 32.086397, lon: 34.905407, cluster: 'שקד' },
  { name: 'תקומה', lat: 32.092236, lon: 34.896983, cluster: 'שקד' },
  { name: 'קרית אליעזר פרי', lat: 32.085969, lon: 34.899209, cluster: 'שקד' },
  { name: 'צמרת גנים', lat: 32.079913, lon: 34.901016, cluster: 'ארז' },
  { name: 'אחדות', lat: 32.073464, lon: 34.892260, cluster: 'ארז' },
  { name: 'שיכון מפ"ם', lat: 32.075073, lon: 34.888408, cluster: 'ארז' },
  { name: 'בת גנים', lat: 32.072502, lon: 34.881845, cluster: 'אשל' },
  { name: 'המרכז השקט', lat: 32.081995, lon: 34.885369, cluster: 'אלון' },
  { name: 'נוה גנים', lat: 32.087198, lon: 34.866304, cluster: 'זית' },
  { name: 'בר יהודה', lat: 32.083434, lon: 34.870779, cluster: 'זית' },
  { name: 'רמת ורבר', lat: 32.087825, lon: 34.873202, cluster: 'זית' },
  { name: 'קרול', lat: 32.095272, lon: 34.883207, cluster: 'תמר' },
  { name: 'האחים ישראלית', lat: 32.099373, lon: 34.877672, cluster: 'רותם' },
  { name: 'קרית מטלון', lat: 32.090041, lon: 34.849794, cluster: 'זית' },
  { name: 'עמישב', lat: 32.072778, lon: 34.913903, cluster: 'הדס' },
  { name: 'קרית אלון', lat: 32.088383, lon: 34.903818, cluster: 'שקד' },
  { name: 'קרית הרב סלומון', lat: 32.098582, lon: 34.898433, cluster: 'שקד' },
  { name: 'נווה דקלים', lat: 32.098950, lon: 34.889696, cluster: 'תמר' },
  { name: 'פסגת הדר', lat: 32.082049, lon: 34.857924, cluster: 'זית' },
  { name: 'גני אקליפטוס', lat: 32.082979, lon: 34.910828 }, // no cluster assigned, flagged
  { name: 'שיפר', lat: 32.096974, lon: 34.892011, cluster: 'תמר' },
  { name: 'נוה עוז', lat: 32.080455, lon: 34.863753, cluster: 'זית' },
  { name: 'בילינסון', lat: 32.080300, lon: 34.917306, cluster: 'הדס' },
  { name: 'מחנה יהודה', lat: 32.080659, lon: 34.894248, cluster: 'ארז' },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Petah Tikva (${PETAH_TIKVA_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', PETAH_TIKVA_AUTHORITY_ID)
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
      parentAuthorityId: PETAH_TIKVA_AUTHORITY_ID,
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
    if (n.cluster) {
      doc.cluster = n.cluster;
    }

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${n.name}${n.cluster ? ` [${n.cluster}]` : ' [no cluster]'} @ ${n.lat},${n.lon}`);
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
