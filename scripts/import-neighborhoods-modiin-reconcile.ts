#!/usr/bin/env npx tsx
/**
 * scripts/import-neighborhoods-modiin-reconcile.ts
 *
 * Modi'in-Maccabim-Re'ut neighborhood reconcile — Tier 2 (resumed build
 * run, first city after the coordinate-completeness bug fix). Population
 * confirmed: 102,883 (CBS estimate, recommended over higher municipal-
 * registry figures which use a different, inflated methodology).
 *
 * Source: the municipality's own public ArcGIS Server
 * (webgis.modiin.muni.il), service "GeoTabaareasNeighborhood"
 * (MapServer/0, owner ModiinGeoDB.MODIINGEODBADMIN) — 18 polygon
 * features with full-precision ring geometry, real centroids computed
 * locally (shoelace formula), not geocoded guesses. No cluster/grouping
 * field exists in this layer.
 *
 * Reconciliation: all 6 existing entries (מוריה/בוכמן, המגינים/שמשוני,
 * אבני חן/קייזר, נופים, רעות, מכבים) matched 1:1 cleanly, no umbrella/
 * split situations — the "official (developer nickname)" naming
 * pattern reflects the municipality's own 2010 naming history (areas
 * were known by architect/developer names during initial occupancy,
 * given official names later). מכבים and רעות are each a SINGLE GIS
 * polygon — Wikipedia's informal internal sub-area naming (מכבים א/ב/ג,
 * רעות א/ב) does not appear as separate polygons in the official
 * layer, so not split.
 *
 * BUG FOUND AND FIXED: 5 of the 6 existing Firestore docs
 * (מוריה/המגינים/אבני חן/נופים/רעות) shared an identical placeholder
 * coordinate (31.7683, 35.2137) that is actually near JERUSALEM, not
 * Modi'in — this script updates all 6 existing docs with their real
 * GIS centroids as part of this pass, not just the 8 net-new creates.
 *
 * 8 net-new residential entries added: משואה, הכרמים, הנביאים, הנחלים,
 * השבטים, הציפורים, מורשת, הפרחים — all real GIS polygon centroids.
 *
 * Excluded as non-residential (PARKED, never candidates): מרכז עינב
 * (commercial/crafts zone), הפארק הטכנולוגי (employment/tech park,
 * ~4,300 dunam).
 *
 * PARKED — under construction (literally "תכנון בעתיד" / future
 * planning in the GIS name itself): גבעת שר תכנון בעתיד (L).
 *
 * PARKED — genuinely mixed-use, not auto-included or auto-excluded:
 * מע"ר (Primary Business Center) — GIS-coded alongside the two
 * non-residential zones, but likely overlaps the municipality's own
 * "מרכז העיר" concept (a real downtown with residential towers, opened
 * Dec 2019, on שדרות דם המכבים). Flagged for David's explicit call.
 *
 * The "K1-K15" official-numbering premise mentioned in early research
 * was NOT confirmed by any source (muni site, GIS fields, Wikipedia) —
 * not used, not built around.
 *
 * A pre-existing whole-section key-prefix mismatch was found (the
 * file's original MODIIN block uses a 'mod-' prefix that matches none
 * of the real 'md-' picker ids — same recurring pattern this project).
 * Left untouched, flagged for the later cleanup commit.
 *
 * Idempotent — checks for an existing doc by name; updates coordinates
 * on existing docs (fixing the Jerusalem-placeholder bug) and creates
 * the 8 new ones. Safe to re-run.
 *
 * Usage:
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-modiin-reconcile.ts --dry-run
 *   node --env-file=.env.local ./node_modules/.bin/tsx scripts/import-neighborhoods-modiin-reconcile.ts
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
const MODIIN_AUTHORITY_ID = 'lPzF3aqyJEhnZl6YSYlf';

interface Neighborhood {
  name: string;
  lat: number;
  lon: number;
}

const EXISTING_COORD_FIX: Neighborhood[] = [
  { name: 'מוריה (בוכמן)', lat: 31.881972, lon: 35.006392 },
  { name: 'המגינים (שמשוני)', lat: 31.909047, lon: 35.000556 },
  { name: 'אבני חן (קייזר)', lat: 31.904017, lon: 34.995441 },
  { name: 'נופים', lat: 31.896466, lon: 34.983789 },
  { name: 'רעות', lat: 31.887845, lon: 35.017836 },
  { name: 'מכבים', lat: 31.890021, lon: 35.033702 },
];

const NEW_NEIGHBORHOODS: Neighborhood[] = [
  { name: 'משואה', lat: 31.894607, lon: 35.009301 },
  { name: 'הכרמים', lat: 31.915545, lon: 35.009474 },
  { name: 'הנביאים', lat: 31.912832, lon: 35.004967 },
  { name: 'הנחלים', lat: 31.898771, lon: 35.016395 },
  { name: 'השבטים', lat: 31.887323, lon: 35.003098 },
  { name: 'הציפורים', lat: 31.896457, lon: 34.996981 },
  { name: 'מורשת', lat: 31.902784, lon: 34.983197 },
  { name: 'הפרחים', lat: 31.906292, lon: 35.012294 },
];

async function main() {
  console.log(`── ${DRY_RUN ? 'DRY RUN — ' : ''}Modi'in-Maccabim-Re'ut (${MODIIN_AUTHORITY_ID}): 6 coord fixes + ${NEW_NEIGHBORHOODS.length} new ──`);

  const existingSnap = await db.collection('authorities')
    .where('parentAuthorityId', '==', MODIIN_AUTHORITY_ID)
    .get();
  const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d]));
  console.log(`✓  ${existingByName.size} existing neighborhood docs found`);

  for (const n of EXISTING_COORD_FIX) {
    const doc = existingByName.get(n.name);
    if (!doc) {
      console.log(`⚠️  ${n.name} not found — skipping coordinate fix`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  WOULD FIX coordinates: ${n.name} → ${n.lat},${n.lon}`);
    } else {
      await doc.ref.update({
        coordinates: { lat: n.lat, lng: n.lon },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✓  FIXED coordinates: ${n.name}`);
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
      parentAuthorityId: MODIIN_AUTHORITY_ID,
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
