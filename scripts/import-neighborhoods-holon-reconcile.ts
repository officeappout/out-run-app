#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-holon-reconcile.ts
 *
 * Holon neighborhood reconcile — part of the autonomous Tier-1 city
 * mapping run (policy approved by David 12.08.2026: ship confident items
 * automatically, park anything uncertain in the consolidated final
 * report, never ship a guessed coordinate).
 *
 * Source: no GIS/data.gov.il/ArcGIS/DataCity dataset exists for Holon
 * (all checked, ruled out — an ArcGIS "שכונות" FeatureServer that
 * surfaces in search is actually Tel Aviv's layer, mislabeled generically;
 * do not reuse it). Primary source: the municipality's own official
 * "City Map 2024" PDF (holon.muni.il/HolonCity/Documents), read directly
 * off the rendered artwork (300dpi, tiled) for every red-bold area label.
 * Cross-validated against OSM/Nominatim place=suburb nodes for
 * coordinates. 27 residential + 1 industrial/business zone total.
 *
 * Reconciliation: all 5 existing entries matched cleanly (2 are
 * spelling-only variants — קרית/קריית — not renamed, since it's the same
 * word not a real alias situation). No umbrella/split situations.
 *
 * 19 net-new entries added:
 *   - 16 HIGH confidence: direct Nominatim place=suburb/neighbourhood
 *     node hit, cross-validated against the map's own label position.
 *   - 3 landmark-anchored (still shipped — a named-landmark geocode is
 *     an acceptable coordinate source per policy, not a guess):
 *     מרכז העיר → Holon City Hall; שכונת גרין → OSM's own alt-name node
 *     "חולון הירוקה" for the identical spot; מגדלים בשדרה → the
 *     Mediatheque landmark inside that neighborhood.
 *
 * PARKED — genuinely unresolved, not shipped (every bounding-street trace
 * resolved into a *neighboring* suburb's polygon, not the target's own):
 * שיכון ותיקים, נאות בן גוריון, מפדה אזרחי (the last one independently
 * confirmed as real via yad2.co.il + local Tama-38 press coverage, but
 * sits at a 3-way seam with no independent centroid).
 *
 * Excluded as non-residential (PARKED): אזור תעשייה ועסקים (industrial
 * & business zone, purple-shaded on the official map, auto dealerships +
 * municipal warehousing + business park signage confirmed on the ground).
 *
 * No cluster/grouping field found in either source — none added.
 *
 * A pre-existing whole-section key-prefix mismatch was found (the file's
 * original HOLON block uses a 'holon-' prefix that matches none of the
 * real 'ho-' picker ids — same pattern as the Ashdod asd-/ad- mismatch
 * found earlier in this run). Left untouched, flagged for the later
 * cleanup commit — does not affect this script's fresh 'ho-' keys.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-holon-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-holon-reconcile.ts
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
const HOLON_AUTHORITY_ID = 'lSaF0rbEx8D0kABe5r1L';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'קריית עבודה', lat: 32.0204142, lon: 34.7716412 },
  { name: 'שכונת עם', lat: 32.0256120, lon: 34.7727383 },
  { name: 'שיכון עממי', lat: 32.0262631, lon: 34.7765121 },
  { name: 'רסקו א׳', lat: 32.0201270, lon: 34.7821582 },
  { name: 'רסקו ב׳', lat: 32.0114240, lon: 34.7903233 },
  { name: 'רסקו ג׳', lat: 32.0184312, lon: 34.7850415 },
  { name: 'נווה ארזים', lat: 32.0187457, lon: 34.7954408 },
  { name: 'נאות יהודית', lat: 32.0158535, lon: 34.7920646 },
  { name: 'נווה פנחס', lat: 32.0128045, lon: 34.7956321 },
  { name: 'נאות שושנים', lat: 32.0132126, lon: 34.7824663 },
  { name: 'נווה רמז', lat: 32.0102217, lon: 34.7708269 },
  { name: 'קריית מיכה', lat: 32.0057270, lon: 34.7586859 },
  { name: 'ג׳סי כהן', lat: 32.0046469, lon: 34.7648419 },
  { name: 'קריית פנחס אילון', lat: 32.0082506, lon: 34.7798849 },
  { name: 'קריית יצחק רבין', lat: 32.0027281, lon: 34.7706063 },
  { name: 'מולדת', lat: 32.0003908, lon: 34.7884081 },
  { name: 'מרכז העיר', lat: 32.0171486, lon: 34.7702776 },
  { name: 'שכונת גרין', lat: 32.0337615, lon: 34.7653633 },
  { name: 'מגדלים בשדרה', lat: 32.0118153, lon: 34.7774368 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Holon (${HOLON_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', HOLON_AUTHORITY_ID)
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
      parentAuthorityId: HOLON_AUTHORITY_ID,
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
