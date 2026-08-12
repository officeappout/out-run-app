#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-kfar-saba-reconcile.ts
 *
 * Kfar Saba neighborhood reconcile — third city of the second
 * autonomous Tier-1/50k+ mapping run (same policy: ship confident
 * items automatically, park anything uncertain, never ship a guessed
 * coordinate). Population confirmed: 99,004 (CBS, end of June 2026,
 * ~19th-20th largest Israeli authority) — used over the municipal
 * site's own registry figure (112,388), which is a raw population-
 * registry count that lags behind actual residency (doesn't
 * automatically remove residents who moved away); an independent
 * real-estate press article confirms the city dropped below 100,000
 * in September 2025 due to sustained negative migration.
 *
 * Source: official municipal ArcGIS layer ("שכונות וגבול שיפוט
 * ספטמבר 2024", kfar-saba.maps.arcgis.com, confirmed via portal
 * metadata as the real municipal org) — 34 polygon features, real GIS
 * centroids, no cluster/grouping field in the schema. Haversine
 * proximity check across all 34 raw centroids: no pair closer than
 * 80m — no city-center-fallback signature.
 *
 * Reconciliation: שכונת הדרים → הדרים and שכונת עלייה → עליה both
 * clean matches (spelling variants only), kept unchanged. השכונה
 * הירוקה confirmed as a genuine umbrella — the GIS layer shows two
 * distinct, separately-planned developments (different street-naming
 * themes) both colloquially called "the green neighborhood" — kept as
 * the umbrella, 2 real sub-entries added alongside (הזמר העברי,
 * שכונה ירוקה). מרכז העיר: no direct GIS polygon match exists for
 * this umbrella name, and which of the many small central
 * neighborhoods (if any) should nest under it is genuinely ambiguous
 * in the source — left completely untouched, no sub-mapping attempted
 * or guessed, flagged for David's review.
 *
 * 27 net-new entries shipped, all real GIS polygon centroids (no
 * Nominatim fallback needed — the authoritative source had full
 * geometry): אליעזר, סירקין, ותיקים, אלי כהן, תקומה, גאולים, גני
 * השרון, גבעת אשכול, קפלן, יוספטל, חלוצים, דגניה, פרחים, למפרט, עובד
 * בן ציון, מעוז, גרין, מוצקין, פרוגרסיבים, מזרחי א, כסופים, עלומים,
 * העוגן, בית ונוף, סביוני הכפר, and the 2 green-umbrella subs
 * (הזמר העברי, שכונה ירוקה).
 *
 * Excluded — not real citizen-facing neighborhoods (PARKED): "כפר
 * סבא" (OBJECTID 40, History field literally says "שטח ללא שם
 * שכונה" — area without a neighborhood name, a residual/unassigned
 * polygon); "כ״ס/מק/1/א/1" (an internal city-plan reference code, no
 * real name).
 *
 * PARKED — under construction (per the source's own History field,
 * "שכונה ההולכת ונבנית"): הפארק.
 *
 * PARKED — real GIS polygons, but a naming-format question rather
 * than an identity/coordinate question: "א" and "ב" (terse
 * single-letter official names, no descriptive History text). Not
 * auto-reformatted with a "שכונה" prefix (that would be an
 * interpretive addition beyond the raw source label) and not shipped
 * as bare single letters either — flagged for David's call on the
 * right display form, consistent with how Ashkelon's "הרצוג ו" naming
 * question was handled (park rather than self-correct).
 *
 * No cluster/grouping field — confirmed structurally absent from the
 * layer's schema, none added.
 *
 * A pre-existing set of orphaned coordinate keys was found
 * (ks-neve-yarko, ks-north, ks-south — none match a real picker id) —
 * left untouched, flagged for the later cleanup commit. ks-center IS
 * a real, correctly-wired existing match, untouched.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-kfar-saba-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-kfar-saba-reconcile.ts
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
const KFAR_SABA_AUTHORITY_ID = 'LaNDfhqss3MiSqYy7TYz';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'אליעזר', lat: 32.187817, lon: 34.907754 },
  { name: 'סירקין', lat: 32.184176, lon: 34.899687 },
  { name: 'ותיקים', lat: 32.179622, lon: 34.891938 },
  { name: 'אלי כהן', lat: 32.173200, lon: 34.921472 },
  { name: 'תקומה', lat: 32.171734, lon: 34.920198 },
  { name: 'גאולים', lat: 32.168083, lon: 34.925406 },
  { name: 'גני השרון', lat: 32.184981, lon: 34.929609 },
  { name: 'גבעת אשכול', lat: 32.180703, lon: 34.938618 },
  { name: 'קפלן', lat: 32.188912, lon: 34.937894 },
  { name: 'יוספטל', lat: 32.183227, lon: 34.941772 },
  { name: 'חלוצים', lat: 32.169300, lon: 34.922031 },
  { name: 'דגניה', lat: 32.172689, lon: 34.895174 },
  { name: 'פרחים', lat: 32.175623, lon: 34.894657 },
  { name: 'למפרט', lat: 32.178814, lon: 34.897581 },
  { name: 'עובד בן ציון', lat: 32.172621, lon: 34.900280 },
  { name: 'מעוז', lat: 32.181499, lon: 34.899440 },
  { name: 'גרין', lat: 32.183512, lon: 34.903560 },
  { name: 'מוצקין', lat: 32.180526, lon: 34.920385 },
  { name: 'פרוגרסיבים', lat: 32.181118, lon: 34.902214 },
  { name: 'מזרחי א', lat: 32.178845, lon: 34.913926 },
  { name: 'כסופים', lat: 32.180563, lon: 34.914477 },
  { name: 'עלומים', lat: 32.176861, lon: 34.918675 },
  { name: 'העוגן', lat: 32.181939, lon: 34.908310 },
  { name: 'בית ונוף', lat: 32.185125, lon: 34.933627 },
  { name: 'סביוני הכפר', lat: 32.185744, lon: 34.897532 },
  { name: 'הזמר העברי', lat: 32.187356, lon: 34.892902 },
  { name: 'שכונה ירוקה', lat: 32.196285, lon: 34.891574 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Kfar Saba (${KFAR_SABA_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', KFAR_SABA_AUTHORITY_ID)
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
      parentAuthorityId: KFAR_SABA_AUTHORITY_ID,
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
    created++;
  }

  console.log(`\n${DRY_RUN ? 'Would create' : 'Created'}: ${created}, Skipped (already existed): ${skipped}`);
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
