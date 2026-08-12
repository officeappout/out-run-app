#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-ashkelon-reconcile.ts
 *
 * Ashkelon neighborhood reconcile — part of the autonomous Tier-1 city
 * mapping run (policy approved by David 12.08.2026: ship confident
 * items automatically, park anything uncertain in the consolidated
 * final report, never ship a guessed coordinate).
 *
 * NOTE: Ashkelon's `authorities` doc has isActiveClient: true (paying
 * client, per axioms.md §6). This script does NOT touch that field or
 * any field on the parent authority doc — it only creates new CHILD
 * neighborhood docs (hierarchyLevel: 2, isActiveClient: false, the same
 * draft/inactive template used for every other city this run). Flagged
 * explicitly in the final consolidated report for David's awareness
 * given the city's business sensitivity, even though the technical
 * action here is identical and non-destructive to every other city.
 *
 * Source: municipality's own neighborhood-boundary GIS layer, found via
 * an ArcGIS Online web map ("שמות שכונות אשקלון", org in42zcldT1VQF5FU),
 * corroborated by a same-titled govmap.gov.il national-portal layer.
 * Live FeatureServer queried directly — 21 real polygon features,
 * WGS84 centroids computed via shoelace formula (area-weighted for
 * MultiPolygons), not geocoded/guessed. Layer dated June 2020 (a
 * snapshot, not live-updated) — the muni's own resident-facing
 * neighborhoods page has since migrated/broken, so this could not be
 * cross-confirmed against a live muni.il citation. Confidence:
 * MEDIUM-HIGH (strong org/portal corroboration, not 100% live-verified).
 *
 * Reconciliation: ברנע, אפרידר, הסיטי kept fully unchanged (clean
 * matches). המרינה and אגמים have NO standalone official GIS polygon
 * (Marina falls inside the excluded national-park polygon; Agamim
 * overlaps two generically-named planning zones) — both left completely
 * untouched, flagged for David's manual review rather than silently
 * renamed or merged.
 *
 * 10 net-new entries shipped, using each GIS polygon's own combined
 * Name field AS-IS (several combine 2-3 informally-known sub-area names
 * sharing one official boundary — e.g. "גני ברנע, מצפה ברנע, נאות
 * ברנע"). Deliberately NOT split into separate entries per sub-name:
 * doing so would give multiple picker entries the exact same
 * coordinate (the shared polygon centroid), which reads identically to
 * a city-center-fallback bug on spot-check and isn't genuine
 * distinctness — so the raw official multi-name label is shipped as one
 * entry instead.
 *
 * Excluded as non-residential (PARKED): אזור תעשייה הדרומי, אזור תעשייה
 * הצפוני, פארק תעשייה היי טק, פארק לאומי וחופים (national park &
 * beaches — also where the Marina complex sits).
 *
 * PARKED — not shipped (see final consolidated report): דרום מזרח
 * (an 11,500-unit district approved only in 2024, largely unbuilt at
 * this layer's 2020 snapshot date — under construction); מ-7 (reads as
 * an internal planning-zone code, not a public name, hand-traced
 * metadata, could not independently corroborate); הרצוג ו (the real
 * documented neighborhood is simply "הרצוג" — the "ו" suffix looks like
 * an internal sub-phase label, but renaming it would itself be an
 * unconfirmed guess, so parked rather than auto-corrected).
 *
 * No cluster/grouping field found — the only extra GIS field
 * (SourceFile) is trace/lineage metadata populated for just 3 of 21
 * features, not a structured taxonomy — none added.
 *
 * A pre-existing whole-section key-prefix mismatch was found (the
 * file's original ASHKELON block uses an 'ask-' prefix that matches
 * none of the real 'as-' picker ids — same pattern as several other
 * cities this run). Left untouched, flagged for the later cleanup
 * commit.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-ashkelon-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-ashkelon-reconcile.ts
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
const ASHKELON_AUTHORITY_ID = 'dRk9LUrVnTlNc7EbOdvq';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'רמת כרמים, שקד', lat: 31.695697, lon: 34.582783 },
  { name: 'גני ברנע, מצפה ברנע, נאות ברנע', lat: 31.684161, lon: 34.578454 },
  { name: 'נווה דקלים, נווה הדרים', lat: 31.676997, lon: 34.582935 },
  { name: 'נאות אשקלון, נווה אילן', lat: 31.665354, lon: 34.579032 },
  { name: 'מגדל, רמת אשכול, כוכב הצפון', lat: 31.667493, lon: 34.588811 },
  { name: 'גבעת ציון', lat: 31.651372, lon: 34.578816 },
  { name: 'שמשון מערב - נווה אלונים, נווה ים', lat: 31.656912, lon: 34.555478 },
  { name: 'שמשון צפון - בן גוריון, גן הורדים', lat: 31.659426, lon: 34.566767 },
  { name: 'שמשון מזרח - זיבוטינסקי, שקמים', lat: 31.653341, lon: 34.560828 },
  { name: 'עיר ימים', lat: 31.703772, lon: 34.578055 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Ashkelon (${ASHKELON_AUTHORITY_ID}) ──`);
  console.log(`   NOTE: parent authority isActiveClient=true (paying client) — this script only touches child neighborhood docs, never the parent.`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', ASHKELON_AUTHORITY_ID)
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
      parentAuthorityId: ASHKELON_AUTHORITY_ID,
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
