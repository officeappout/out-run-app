#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-hadera-reconcile.ts
 *
 * Hadera neighborhood reconcile — fifth city of the second autonomous
 * Tier-1/50k+ mapping run (same policy: ship confident items
 * automatically, park anything uncertain, never ship a guessed
 * coordinate). Population confirmed: 108,523 (CBS, 17th nationally).
 *
 * Source: official municipal ArcGIS web map "מפת שכונות חדרה" (36
 * polygon features, geometry-based, geographic extent matches Hadera
 * exactly, names cross-validate against Wikipedia). Owner account looks
 * like a GIS staffer's personal account rather than a branded org
 * account — flagged as a provenance nuance, but the layer's content/
 * extent/cross-source matches make it credible as the working municipal
 * dataset. This layer has a CLEAN structured cluster field (`מתחם` +
 * numeric `מס_מת`) — same tier as Petah Tikva's אשכול column — added
 * as `cluster` metadata on every entry, including the 5 pre-existing
 * ones (their cluster values are directly confirmed by this same
 * official source, not guessed).
 *
 * Reconciliation: עין הים, גבעת אולגה kept unchanged (clean matches).
 * שכונת ויצמן → וייצמן is a spelling variant only (single/double yod),
 * not renamed. בית אליעזר and מרכז העיר both confirmed as genuine
 * umbrellas — kept as legacy, real sub-polygons added alongside (מרכז
 * העיר covers a 4-sub-cluster, 19-neighborhood super-group).
 *
 * 26 net-new entries shipped, all real GIS polygon centroids (no
 * Nominatim fallback needed anywhere in this city).
 *
 * Excluded as non-residential (PARKED): אזור תעשיה (industrial zone),
 * מרכז רפואי הלל יפה (Hillel Yaffe Medical Center — hospital campus).
 *
 * PARKED — construction/readiness uncertain, not shipped: מתחם 24
 * (~5,000-unit approved district, pre-occupancy per real-estate
 * sources); רובע הים (flagship coastal quarter already in the GIS
 * layer, but one 2026 source explicitly states the detailed plan is
 * "not yet available for construction" — conflicting readiness
 * signal); בילו הרחבה / פרדס ביל״ו (~550-unit new neighborhood,
 * unclear if residents have moved in).
 *
 * שיכון עובדים / חדרה הצעירה shipped at medium confidence — one source
 * tags a similarly-named "שיכון עובדים" as still in planning, while
 * another independently describes "חדרה הצעירה" as an established
 * ~12,000-resident area; the GIS polygon has a solid 558-dunam
 * footprint suggesting it's the established area, but the name-duality
 * itself is flagged in the final consolidated report for awareness.
 *
 * A pre-existing whole-section key-prefix mismatch was found (the
 * file's original HADERA block uses an 'hdr-' prefix that matches none
 * of the real 'hd-' picker ids — same recurring pattern this run).
 * Left untouched, flagged for the later cleanup commit.
 *
 * Idempotent — checks for an existing doc by name before creating; the
 * cluster-field backfill on the 5 existing docs is a separate, explicit
 * step (safe to re-run).
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-hadera-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-hadera-reconcile.ts
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
const HADERA_AUTHORITY_ID = 'ZpoGRWQwTVBy1oxt5ghS';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
  cluster: string;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'אפריים', lat: 32.438912, lon: 34.931282, cluster: 'מרכז העיר' },
  { name: 'גבעת בוסל', lat: 32.435025, lon: 34.931240, cluster: 'מרכז העיר' },
  { name: 'יוספטל', lat: 32.435906, lon: 34.927952, cluster: 'מרכז העיר' },
  { name: 'רמב״ם', lat: 32.439920, lon: 34.912627, cluster: 'מרכז העיר' },
  { name: 'ביאליק', lat: 32.432760, lon: 34.910381, cluster: 'מרכז העיר דרום' },
  { name: 'ברנדייס', lat: 32.423406, lon: 34.920527, cluster: 'מרכז העיר דרום' },
  { name: 'ניסן', lat: 32.428124, lon: 34.924240, cluster: 'מרכז העיר דרום' },
  { name: 'פאר', lat: 32.430260, lon: 34.918177, cluster: 'מרכז העיר דרום' },
  { name: 'שיכון עובדים / חדרה הצעירה', lat: 32.423733, lon: 34.913095, cluster: 'מרכז העיר דרום' },
  { name: 'שלמה', lat: 32.432253, lon: 34.913406, cluster: 'מרכז העיר דרום' },
  { name: 'שמשון', lat: 32.428723, lon: 34.912056, cluster: 'מרכז העיר דרום' },
  { name: 'בית״ר', lat: 32.436641, lon: 34.907623, cluster: 'מרכז העיר מערב' },
  { name: 'גני אלון', lat: 32.442433, lon: 34.909346, cluster: 'מרכז העיר מערב' },
  { name: 'הזיתים', lat: 32.440506, lon: 34.907225, cluster: 'מרכז העיר מערב' },
  { name: 'גבעת ביל״ו', lat: 32.445425, lon: 34.923789, cluster: 'מרכז העיר צפון' },
  { name: 'האוצר', lat: 32.444263, lon: 34.918670, cluster: 'מרכז העיר צפון' },
  { name: 'נווה עובד', lat: 32.440789, lon: 34.928953, cluster: 'מרכז העיר צפון' },
  { name: 'נחליאל', lat: 32.444161, lon: 34.927158, cluster: 'מרכז העיר צפון' },
  { name: 'רח׳ הנשיא צפון', lat: 32.441564, lon: 34.919466, cluster: 'מרכז העיר צפון' },
  { name: 'יצחק', lat: 32.452444, lon: 34.902360, cluster: 'נווה חיים רבתי' },
  { name: 'נווה חיים', lat: 32.446068, lon: 34.904756, cluster: 'נווה חיים רבתי' },
  { name: 'הפועל המזרחי', lat: 32.445055, lon: 34.908069, cluster: 'נווה חיים רבתי' },
  { name: 'חפציבה', lat: 32.459707, lon: 34.899184, cluster: 'חפציבה' },
  { name: 'אחוזת דניה', lat: 32.435056, lon: 34.940315, cluster: 'בית אליעזר' },
  { name: 'הפארק', lat: 32.427132, lon: 34.935228, cluster: 'הפארק' },
  { name: 'הפארק - צפון ותיק', lat: 32.432142, lon: 34.930625, cluster: 'הפארק' },
];

const EXISTING_CLUSTER_BACKFILL: Record<string, string> = {
  'עין הים': 'אולגה',
  'גבעת אולגה': 'אולגה',
  'בית אליעזר': 'בית אליעזר',
  'מרכז העיר': 'מרכז העיר',
  'שכונת ויצמן': 'נווה חיים רבתי',
};

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Hadera (${HADERA_AUTHORITY_ID}): ${NEW_NEIGHBORHOODS.length} new + cluster backfill on 5 existing ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', HADERA_AUTHORITY_ID)
    .get();
  const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d]));
  console.log(`✓  ${existingByName.size} existing neighborhood docs found`);

  for (const [name, cluster] of Object.entries(EXISTING_CLUSTER_BACKFILL)) {
    const doc = existingByName.get(name);
    if (!doc) {
      console.log(`⚠️  ${name} not found — skipping cluster backfill`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  WOULD UPDATE (cluster only): ${name} → [${cluster}]`);
    } else {
      await doc.ref.update({ cluster, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`✓  UPDATED cluster: ${name} → [${cluster}]`);
    }
  }

  let created = 0;
  let skipped = 0;

  for (const n of NEW_NEIGHBORHOODS) {
    if (existingByName.has(n.name)) {
      console.log(`⏭  SKIP (already exists): ${n.name}`);
      skipped++;
      continue;
    }

    const doc: Record<string, unknown> = {
      name: n.name,
      type: 'neighborhood' as const,
      parentAuthorityId: HADERA_AUTHORITY_ID,
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
      cluster: n.cluster,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (DRY_RUN) {
      console.log(`  WOULD CREATE: ${n.name} [${n.cluster}] @ ${n.lat},${n.lon}`);
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
