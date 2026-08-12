#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-netanya-reconcile.ts
 *
 * Netanya neighborhood reconcile — writes 18 new `authorities` child docs
 * (type=neighborhood) reconciling the picker/Firestore against the official
 * municipal open-data feed: "netanya_dgpsync_neighborhoods" on odata.org.il
 * (dgpsync = direct government-portal sync from the municipality's own
 * system). 27 named residential neighborhoods total (2 rows excluded: an
 * unnamed under-construction code, and an "אחר"/unclassified catch-all).
 * No ArcGIS polygon layer found for Netanya — coordinates below are
 * Nominatim geocode matches / landmark anchors, not polygon centroids.
 *
 * Reconciliation (additive, existing 6 kept, David's decisions):
 *   - 5 of 6 existing entries matched cleanly. נת-דורה (nt-dora) was
 *     reformatted from "רמת ידין (דורה)" to "רמת ידין · דורה" — David kept
 *     the דורה local-name reference for findability (picker-side rename
 *     only, not part of this script — see israel-locations.ts diff).
 *   - מרכז העיר: the official source splits it into 3 distinct
 *     neighborhoods (צפון מערב מרכז העיר, מרכז העיר דרום, צפון מזרח מרכז
 *     העיר). David's call: keep the legacy מרכז העיר entry untouched, add
 *     the 3 official sub-names alongside it (same non-destructive pattern
 *     as Petah Tikva's כפר גנים/אם המושבות splits).
 *
 * Coordinate confidence:
 *   - 12 high-confidence net-new: clean Nominatim place-level matches.
 *   - 3 medium-confidence (גלי הים, בן ציון, נווה איתמר) initially flagged
 *     by research — resolved via a manual pass: גלי הים anchored to the
 *     Alexandroni Brigade monument (a landmark explicitly named on the
 *     municipality's own Galei-HaYam page); בן ציון anchored to its own
 *     eponymous street ("אריאל בן ציון"); נווה איתמר anchored to its own
 *     eponymous road junction ("צומת נווה איתמר").
 *   - מרכז העיר דרום anchored to כיכר העצמאות (Independence Square,
 *     confirmed old-city-core landmark); צפון מערב anchored to Sderot
 *     Nitza (a real street inside that official neighborhood, per a
 *     municipal listing); צפון מזרח has NO landmark match — positioned
 *     per the municipality's own page describing it as bounded between
 *     Herzl St (south) and Rabbi Herzog St (north), lower-confidence than
 *     the rest of this batch (flagged in the picker-side coordinate
 *     comment, not silently treated as equally precise).
 *
 * 4 neighborhoods SKIPPED this round per David's decision (not in this
 * script): כוכב הצפון, כוכב הים, נוף השרון (genuinely under
 * construction/unpopulated per the source's own note) and נוף הטיילת (no
 * usable OSM match). Revisit when populated / resolvable.
 *
 * No non-residential zones were in the source (it's a population-based
 * feed) — Netanya's known industrial zone (אזור התעשייה פולג) is
 * correctly absent and not added here.
 *
 * No grouping/cluster metadata field for Netanya this round (David's
 * call) — the muni's own רובע A–E page grouping was too unreliable
 * (AI-summarized read, one inconsistency found) to ship as structured
 * data. Revisit with manual verification only if needed later.
 *
 * Idempotent — checks for an existing doc with the same name + parentAuthorityId
 * before writing, safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-netanya-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-netanya-reconcile.ts
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
const NETANYA_AUTHORITY_ID = 'mHF6LGPyKmsOh5PkXyhe';

interface NewNeighborhood {
  name: string;
  lat: number;
  lon: number;
}

const NEW_NEIGHBORHOODS: NewNeighborhood[] = [
  { name: 'צפון מערב מרכז העיר', lat: 32.3364, lon: 34.8518 },
  { name: 'מרכז העיר דרום', lat: 32.3304, lon: 34.8515 },
  { name: 'צפון מזרח מרכז העיר', lat: 32.3340, lon: 34.8620 },
  { name: 'קרית נורדאו', lat: 32.283953, lon: 34.856102 },
  { name: 'נאות שקד', lat: 32.295847, lon: 34.850560 },
  { name: 'נאות הרצל', lat: 32.335261, lon: 34.868679 },
  { name: 'נאות גנים', lat: 32.315237, lon: 34.886703 },
  { name: 'רמת אפרים', lat: 32.324062, lon: 34.864174 },
  { name: 'פרדס הגדוד', lat: 32.343448, lon: 34.866428 },
  { name: 'משכנות זבולון', lat: 32.309351, lon: 34.878845 },
  { name: 'קרית רבין', lat: 32.305753, lon: 34.882842 },
  { name: 'קריית צאנז', lat: 32.342733, lon: 34.861602 },
  { name: 'עין התכלת', lat: 32.350288, lon: 34.860677 },
  { name: 'רמת חן', lat: 32.311030, lon: 34.858325 },
  { name: 'גבעת האירוסים', lat: 32.285363, lon: 34.847771 },
  { name: 'גלי הים', lat: 32.302739, lon: 34.850035 },
  { name: 'בן ציון', lat: 32.316684, lon: 34.856443 },
  { name: 'נווה איתמר', lat: 32.323972, lon: 34.875854 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Importing up to ${NEW_NEIGHBORHOODS.length} neighborhoods for Netanya (${NETANYA_AUTHORITY_ID}) ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', NETANYA_AUTHORITY_ID)
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
      parentAuthorityId: NETANYA_AUTHORITY_ID,
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
